begin;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select ok(
  has_function_privilege('authenticated','public.record_owner_delivery_held_settlement(uuid,timestamptz,date,text,uuid,text)','EXECUTE')
  and not has_function_privilege('anon','public.record_owner_delivery_held_settlement(uuid,timestamptz,date,text,uuid,text)','EXECUTE')
  and not has_function_privilege('service_role','public.record_owner_delivery_held_settlement(uuid,timestamptz,date,text,uuid,text)','EXECUTE'),
  'only authenticated callers can reach the guarded direct-collection RPC'
);
select ok(
  not has_table_privilege('authenticated','public.settlement_records','INSERT')
  and not has_table_privilege('authenticated','public.owner_held_fund_events','INSERT')
  and (select relrowsecurity from pg_class where oid='public.settlement_records'::regclass)
  and (select relrowsecurity from pg_class where oid='public.owner_held_fund_events'::regclass),
  'direct writes remain denied and private ledger RLS remains enabled'
);

-- Isolated fixtures and every receipt/reversal below are rolled back.
do $test$
declare
  actor uuid;
  product uuid;
  oid uuid := gen_random_uuid();
  request_key uuid := gen_random_uuid();
  updated timestamptz;
  sid uuid;
  rid uuid;
  amount_due numeric;
  before_state jsonb;
  after_state jsonb;
  denied boolean;
begin
  select user_id into actor from public.dashboard_user_profiles where role='owner' and is_active order by created_at limit 1;
  select id into product from public.products order by created_at limit 1;
  if actor is null or product is null then raise exception 'Tests require one active owner and product.'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  insert into public.orders(
    id,order_number,customer_name,customer_phone,customer_address,delivery_area,
    payment_method,payment_status,order_status,subtotal,delivery_charge,total,
    order_date,courier,sales_channel,dashboard_order_status,dashboard_payment_status,
    settlement_status,discount_amount,refund_amount,courier_cost_snapshot,packaging_cost_snapshot
  ) values (
    oid,'OWNER-TEST-'||oid,'Rollback owner collection','00000000000','Rollback address','Inside Dhaka',
    'cod','unpaid','pending',1050,0,600,(now() at time zone 'Asia/Dhaka')::date,
    'Steadfast','Dashboard','Pending','Unpaid','Awaiting',450,0,0,0
  );
  insert into public.order_items(order_id,product_id,product_name,product_slug,sku_snapshot,
    unit_price,quantity,line_total,actual_unit_selling_price,buying_cost_snapshot)
  values(oid,product,'Rollback fixture','rollback-owner-'||oid,'OWNER-TEST-SKU',1050,1,1050,1050,500);
  select updated_at into updated from public.orders where id=oid;
  denied := false;
  begin
    perform public.record_owner_delivery_held_settlement(oid,updated,(now() at time zone 'Asia/Dhaka')::date,'Ikbal',request_key);
  exception when invalid_parameter_value then denied := true; end;
  if not denied then raise exception 'Steadfast order accepted as direct collection.'; end if;
  update public.orders set courier='Owner delivery' where id=oid;
  select updated_at into updated from public.orders where id=oid;
  denied := false;
  begin
    perform public.record_owner_delivery_held_settlement(oid,updated,(now() at time zone 'Asia/Dhaka')::date,'Ikbal',request_key);
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'Pending order accepted.'; end if;
  update public.orders set order_status='delivered',dashboard_order_status='Delivered' where id=oid;
  set constraints dashboard_capture_delivered_snapshot immediate;
  select updated_at into updated from public.orders where id=oid;
  select ledger_due into amount_due from public.dashboard_owner_held_balances where owner_label='Ikbal';
  select jsonb_build_object(
    'snapshots',(select md5(jsonb_agg(to_jsonb(t) order by order_id)::text) from public.order_financial_snapshots t),
    'items',(select md5(jsonb_agg(to_jsonb(t) order by id)::text) from public.order_items t),
    'products',(select md5(jsonb_agg(to_jsonb(t) order by id)::text) from public.products t),
    'cash',(select md5(jsonb_agg(to_jsonb(t) order by id)::text) from public.cash_movements t)
  ) into before_state;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  denied := false;
  begin
    perform public.record_owner_delivery_held_settlement(oid,updated,(now() at time zone 'Asia/Dhaka')::date,'Ikbal',request_key);
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Unapproved user accepted.'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  denied := false;
  begin
    perform public.record_owner_delivery_held_settlement(oid,updated-interval '1 second',(now() at time zone 'Asia/Dhaka')::date,'Ikbal',request_key);
  exception when serialization_failure then denied := true; end;
  if not denied then raise exception 'Stale order accepted.'; end if;
  sid := public.record_owner_delivery_held_settlement(oid,updated,(now() at time zone 'Asia/Dhaka')::date,'Ikbal',request_key,'Direct customer collection test');
  if sid is distinct from public.record_owner_delivery_held_settlement(oid,updated,(now() at time zone 'Asia/Dhaka')::date,'Ikbal',request_key,'Direct customer collection test') then
    raise exception 'Idempotent replay failed.';
  end if;
  denied := false;
  begin
    perform public.record_owner_delivery_held_settlement(oid,updated,(now() at time zone 'Asia/Dhaka')::date,'Nasim',request_key,'Direct customer collection test');
  exception when unique_violation then denied := true; end;
  if not denied then raise exception 'Request key accepted changed owner.'; end if;
  if not exists(select 1 from public.settlement_records where id=sid and courier='Owner delivery' and amount_received=600 and fees_withheld=0 and confirmed_at is not null)
    or (select count(*) from public.settlement_order_allocations where settlement_id=sid and order_id=oid and allocated_amount=600) <> 1
    or (select ledger_due from public.dashboard_owner_held_balances where owner_label='Ikbal') is distinct from amount_due+600
    or (select settlement_status from public.orders where id=oid) <> 'Settled'
    or exists(select 1 from public.dashboard_steadfast_settlement_eligible_orders where order_id=oid) then
    raise exception 'Receipt, allocation, owner balance or status did not reconcile.';
  end if;
  denied := false;
  begin
    perform public.record_owner_delivery_held_settlement(oid,(select updated_at from public.orders where id=oid),(now() at time zone 'Asia/Dhaka')::date,'Ikbal',gen_random_uuid());
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'Already settled order accepted again.'; end if;
  denied := false;
  begin
    update public.settlement_records set amount_received=1 where id=sid;
  exception when raise_exception then denied := true; end;
  if not denied then raise exception 'Confirmed settlement mutation accepted.'; end if;
  rid := public.reverse_steadfast_cod_settlement(sid,(now() at time zone 'Asia/Dhaka')::date,'Rollback test reversal',gen_random_uuid());
  if rid is null or (select ledger_due from public.dashboard_owner_held_balances where owner_label='Ikbal') is distinct from amount_due
    or not exists(select 1 from public.dashboard_steadfast_settlement_eligible_orders where order_id=oid)
    or (select count(*) from public.settlement_receipt_allocations where settlement_id=sid and allocation_type='reversal') <> 1 then
    raise exception 'Append-only reversal failed.';
  end if;
  select jsonb_build_object(
    'snapshots',(select md5(jsonb_agg(to_jsonb(t) order by order_id)::text) from public.order_financial_snapshots t),
    'items',(select md5(jsonb_agg(to_jsonb(t) order by id)::text) from public.order_items t),
    'products',(select md5(jsonb_agg(to_jsonb(t) order by id)::text) from public.products t),
    'cash',(select md5(jsonb_agg(to_jsonb(t) order by id)::text) from public.cash_movements t)
  ) into after_state;
  if before_state is distinct from after_state then raise exception 'Receipt/reversal changed historical economics, products or cash.'; end if;
end
$test$;
select pass('direct collection validates access, freshness, eligibility, exact amounts, idempotency, immutable evidence and append-only reversal');
select * from finish();
rollback;
