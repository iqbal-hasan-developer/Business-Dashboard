begin;
set local search_path = public, extensions, pg_catalog;

do $test$
declare
  actor_id uuid;
  v_product_id uuid;
  v_order_id uuid := gen_random_uuid();
  settlement_key uuid := gen_random_uuid();
  v_settlement_id uuid;
  duplicate_id uuid;
  reversal_id uuid;
  order_updated_at timestamptz;
  rifat_due_before numeric;
  nasim_due_before numeric;
  cash_before numeric;
  capital_before numeric;
  snapshot_hash text;
  adjustment_hash text;
begin
  select user_id into actor_id from public.dashboard_user_profiles
  where role='owner' and is_active order by created_at limit 1;
  select id into v_product_id from public.products order by created_at limit 1;
  if actor_id is null or v_product_id is null then
    raise exception 'Runtime test requires one active owner and one product.';
  end if;
  perform set_config('request.jwt.claim.sub',actor_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);

  insert into public.orders(
    id,order_number,customer_name,customer_phone,customer_address,
    delivery_area,payment_method,payment_status,order_status,subtotal,
    delivery_charge,total,sales_channel,dashboard_order_status,
    dashboard_payment_status,settlement_status,discount_amount,refund_amount,
    courier_cost_snapshot,packaging_cost_snapshot
  ) values (
    v_order_id,'SPLIT-RUNTIME-' || v_order_id,'Rollback customer','00000000000','Rollback address',
    'Inside Dhaka','cod','unpaid','pending',12940,0,12940,'Dashboard','Pending',
    'Unpaid','Awaiting',0,0,0,0
  );
  insert into public.order_items(
    order_id,product_id,product_name,product_slug,unit_price,quantity,line_total,
    actual_unit_selling_price,buying_cost_snapshot
  ) values (
    v_order_id,v_product_id,'Rollback split fixture','rollback-split-' || v_order_id,12940,1,12940,12940,1
  );
  update public.orders set order_status='delivered',dashboard_order_status='Delivered' where id=v_order_id;
  set constraints dashboard_capture_delivered_snapshot immediate;
  select updated_at into order_updated_at from public.orders where id=v_order_id;
  if not exists (select 1 from public.dashboard_steadfast_settlement_eligible_orders where order_id=v_order_id and gross_cod_receivable=12940) then
    raise exception 'Isolated Delivered COD fixture was not settlement-eligible at 12,940.';
  end if;

  select ledger_due into rifat_due_before from public.dashboard_owner_held_balances where owner_label='Rifat';
  select ledger_due into nasim_due_before from public.dashboard_owner_held_balances where owner_label='Nasim';
  select coalesce(sum(signed_amount),0) into cash_before from public.dashboard_cash_ledger;
  select coalesce(sum(current_contributed_capital),0) into capital_before from public.dashboard_owner_capital_positions;
  select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.order_id)::text,'[]')) into snapshot_hash from public.order_financial_snapshots row_data;
  select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text,'[]')) into adjustment_hash from public.order_financial_adjustments row_data;

  begin
    perform public.record_steadfast_cod_settlement_v3(current_date,'owner_held_business_funds',null,
      '[{"owner_label":"Rifat","amount":10000},{"owner_label":"Nasim","amount":1062}]'::jsonb,
      12940,1877,11063,jsonb_build_array(jsonb_build_object('order_id',v_order_id,'expected_updated_at',order_updated_at)),gen_random_uuid(),
      'ROLLBACK-UNDER',null,null,null,'Rollback-only under-allocation');
    raise exception 'Under-allocation was accepted.';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.record_steadfast_cod_settlement_v3(current_date,'owner_held_business_funds',null,
      '[{"owner_label":"Rifat","amount":10000},{"owner_label":"Nasim","amount":1064}]'::jsonb,
      12940,1877,11063,jsonb_build_array(jsonb_build_object('order_id',v_order_id,'expected_updated_at',order_updated_at)),gen_random_uuid(),
      'ROLLBACK-OVER',null,null,null,'Rollback-only over-allocation');
    raise exception 'Over-allocation was accepted.';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.record_steadfast_cod_settlement_v3(current_date,'owner_held_business_funds',null,
      '[{"owner_label":"Rifat","amount":10000},{"owner_label":"Rifat","amount":1063}]'::jsonb,
      12940,1877,11063,jsonb_build_array(jsonb_build_object('order_id',v_order_id,'expected_updated_at',order_updated_at)),gen_random_uuid(),
      'ROLLBACK-DUPLICATE',null,null,null,'Rollback-only duplicate owner');
    raise exception 'Duplicate owner was accepted.';
  exception when sqlstate '22023' then null; end;

  v_settlement_id := public.record_steadfast_cod_settlement_v3(current_date,'owner_held_business_funds',null,
    '[{"owner_label":"Rifat","amount":10000},{"owner_label":"Nasim","amount":1063}]'::jsonb,
    12940,1877,11063,jsonb_build_array(jsonb_build_object('order_id',v_order_id,'expected_updated_at',order_updated_at)),settlement_key,
    'ROLLBACK-SPLIT',null,null,'ROLLBACK-TX','Rollback-only split settlement');
  duplicate_id := public.record_steadfast_cod_settlement_v3(current_date,'owner_held_business_funds',null,
    '[{"owner_label":"Rifat","amount":10000},{"owner_label":"Nasim","amount":1063}]'::jsonb,
    12940,1877,11063,jsonb_build_array(jsonb_build_object('order_id',v_order_id,'expected_updated_at',order_updated_at)),settlement_key,
    'ROLLBACK-SPLIT',null,null,'ROLLBACK-TX','Rollback-only split settlement');

  if duplicate_id <> v_settlement_id
    or (select count(*) from public.settlement_records where id=v_settlement_id) <> 1
    or (select count(*) from public.settlement_receipt_allocations where settlement_id=v_settlement_id and allocation_type='receipt') <> 2
    or (select sum(amount) from public.settlement_receipt_allocations where settlement_id=v_settlement_id and allocation_type='receipt') <> 11063
    or (select count(*) from public.settlement_order_allocations where settlement_id=v_settlement_id) <> 1 then
    raise exception 'Split settlement was not atomic or idempotent.';
  end if;
  if (select ledger_due from public.dashboard_owner_held_balances where owner_label='Rifat') <> rifat_due_before+10000
    or (select ledger_due from public.dashboard_owner_held_balances where owner_label='Nasim') <> nasim_due_before+1063 then
    raise exception 'Split settlement did not increase exact per-owner Due-from-Owner balances.';
  end if;
  if (select coalesce(sum(signed_amount),0) from public.dashboard_cash_ledger) <> cash_before
    or (select coalesce(sum(current_contributed_capital),0) from public.dashboard_owner_capital_positions) <> capital_before then
    raise exception 'Split owner receipt changed business cash or owner investment.';
  end if;

  reversal_id := public.reverse_steadfast_cod_settlement(v_settlement_id,current_date,'Rollback-only exact split reversal',gen_random_uuid());
  if reversal_id is null
    or (select count(*) from public.settlement_receipt_allocations where settlement_id=v_settlement_id and allocation_type='reversal') <> 2
    or (select sum(amount) from public.settlement_receipt_allocations where settlement_id=v_settlement_id and allocation_type='reversal') <> 11063
    or (select ledger_due from public.dashboard_owner_held_balances where owner_label='Rifat') <> rifat_due_before
    or (select ledger_due from public.dashboard_owner_held_balances where owner_label='Nasim') <> nasim_due_before
    or (select settlement_status from public.orders where id=v_order_id) <> 'Awaiting' then
    raise exception 'Split settlement reversal did not append exact per-owner reversals.';
  end if;
  if snapshot_hash <> (select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.order_id)::text,'[]')) from public.order_financial_snapshots row_data)
    or adjustment_hash <> (select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text,'[]')) from public.order_financial_adjustments row_data) then
    raise exception 'Settlement posting or reversal changed Delivered snapshots, COGS, or refunds.';
  end if;
end
$test$;

select 'split owner settlement runtime contract passed' as result;
rollback;
