begin;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_table('public','rejected_cod_courier_adjustments','rejected COD evidence has a dedicated append-only table');
select has_table('public','rejected_cod_adjustment_settlement_allocations','settlement confirmation has an immutable allocation table');
select has_view('public','dashboard_rejected_cod_adjustments','order pages have a private rejected COD read model');
select has_view('public','dashboard_rejected_cod_adjustment_financials','confirmed adjustments have an authoritative financial read model');
select has_function('public','record_rejected_cod_courier_adjustment',array['uuid','date','text','text','text','numeric','numeric','uuid'],'provisional evidence is recorded atomically');
select has_function('public','record_steadfast_cod_settlement_v4',array['date','text','text','jsonb','numeric','numeric','numeric','jsonb','jsonb','uuid','text','text','text','text','text'],'settlement confirmation accepts rejected COD adjustments');

select ok(
  (select relrowsecurity from pg_class where oid='public.rejected_cod_courier_adjustments'::regclass)
  and (select relrowsecurity from pg_class where oid='public.rejected_cod_adjustment_settlement_allocations'::regclass)
  and not has_table_privilege('anon','public.rejected_cod_courier_adjustments','SELECT')
  and not has_table_privilege('authenticated','public.rejected_cod_courier_adjustments','INSERT')
  and not has_table_privilege('authenticated','public.rejected_cod_courier_adjustments','UPDATE')
  and not has_table_privilege('authenticated','public.rejected_cod_courier_adjustments','DELETE'),
  'RLS and grants allow authenticated reads but deny direct evidence mutation'
);
select ok(
  has_function_privilege('authenticated','public.record_rejected_cod_courier_adjustment(uuid,date,text,text,text,numeric,numeric,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.record_rejected_cod_courier_adjustment(uuid,date,text,text,text,numeric,numeric,uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.record_steadfast_cod_settlement_v4(date,text,text,jsonb,numeric,numeric,numeric,jsonb,jsonb,uuid,text,text,text,text,text)','EXECUTE')
  and not has_function_privilege('anon','public.record_steadfast_cod_settlement_v4(date,text,text,jsonb,numeric,numeric,numeric,jsonb,jsonb,uuid,text,text,text,text,text)','EXECUTE'),
  'only authenticated dashboard callers can record or confirm rejected COD evidence'
);

do $test$
declare
  actor_id uuid;
  product_id uuid;
  rejected_order_id uuid := gen_random_uuid();
  delivered_order_id uuid := gen_random_uuid();
  adjustment_key uuid := gen_random_uuid();
  settlement_key uuid := gen_random_uuid();
  recorded_adjustment_id uuid;
  duplicate_id uuid;
  settlement_id uuid;
  reversal_id uuid;
  delivered_updated_at timestamptz;
  adjustment_created_at timestamptz;
  cash_before numeric;
  cash_after_provisional numeric;
  product_revenue_before numeric;
  net_revenue_before numeric;
  cogs_before numeric;
  contribution_before numeric;
  net_profit_before numeric;
  product_revenue_after numeric;
  net_revenue_after numeric;
  cogs_after numeric;
  contribution_after numeric;
  net_profit_after numeric;
  stock_hash text;
begin
  select user_id into actor_id from public.dashboard_user_profiles
  where role='owner' and is_active order by created_at limit 1;
  select id into product_id from public.products order by created_at limit 1;
  if actor_id is null or product_id is null then
    raise exception 'Runtime test requires one active owner and one product.';
  end if;
  perform set_config('request.jwt.claim.sub',actor_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);

  insert into public.orders(
    id,order_number,customer_name,customer_phone,customer_address,delivery_area,
    payment_method,payment_status,order_status,subtotal,delivery_charge,total,
    order_date,courier,sales_channel,dashboard_order_status,dashboard_payment_status,
    settlement_status,discount_amount,refund_amount,courier_cost_snapshot,packaging_cost_snapshot
  ) values (
    rejected_order_id,'REJECTED-RUNTIME-'||rejected_order_id,'Rollback rejected customer','00000000000','Rollback address','Outside Dhaka',
    'cod','unpaid','cancelled',1050,0,1050,current_date,'Steadfast','Dashboard','Cancelled','Unpaid',
    'Awaiting',0,0,115,0
  );
  insert into public.order_items(
    order_id,product_id,product_name,product_slug,unit_price,quantity,line_total,
    actual_unit_selling_price,buying_cost_snapshot
  ) values (
    rejected_order_id,product_id,'Rollback rejected fixture','rollback-rejected-'||rejected_order_id,1050,1,1050,1050,500
  );

  insert into public.orders(
    id,order_number,customer_name,customer_phone,customer_address,delivery_area,
    payment_method,payment_status,order_status,subtotal,delivery_charge,total,
    order_date,courier,sales_channel,dashboard_order_status,dashboard_payment_status,
    settlement_status,discount_amount,refund_amount,courier_cost_snapshot,packaging_cost_snapshot
  ) values (
    delivered_order_id,'DELIVERED-RUNTIME-'||delivered_order_id,'Rollback delivered customer','00000000000','Rollback address','Inside Dhaka',
    'cod','unpaid','pending',1000,0,1000,current_date,'Steadfast','Dashboard','Pending','Unpaid',
    'Awaiting',0,0,0,0
  );
  insert into public.order_items(
    order_id,product_id,product_name,product_slug,unit_price,quantity,line_total,
    actual_unit_selling_price,buying_cost_snapshot
  ) values (
    delivered_order_id,product_id,'Rollback delivered fixture','rollback-delivered-'||delivered_order_id,1000,1,1000,1000,400
  );
  update public.orders set order_status='delivered',dashboard_order_status='Delivered' where id=delivered_order_id;
  set constraints dashboard_capture_delivered_snapshot immediate;
  select updated_at into delivered_updated_at from public.orders where id=delivered_order_id;

  select coalesce(sum(case when movement_type in('inflow','transfer_in') then amount else -amount end),0)
    into cash_before from public.cash_movements;
  select md5(coalesce(jsonb_agg(jsonb_build_object('id',id,'stock',stock) order by id)::text,'[]'))
    into stock_hash from public.products;

  recorded_adjustment_id := public.record_rejected_cod_courier_adjustment(
    rejected_order_id,current_date,'SFR' || upper(substr(replace(rejected_order_id::text,'-',''),1,20)),
    'Partial Delivered','Customer rejected',100,115,adjustment_key
  );
  duplicate_id := public.record_rejected_cod_courier_adjustment(
    rejected_order_id,current_date,'SFR' || upper(substr(replace(rejected_order_id::text,'-',''),1,20)),
    'Partial Delivered','Customer rejected',100,115,adjustment_key
  );
  if duplicate_id<>recorded_adjustment_id or (select count(*) from public.rejected_cod_courier_adjustments where order_id=rejected_order_id)<>1 then
    raise exception 'Idempotent provisional replay created a duplicate.';
  end if;
  begin
    perform public.record_rejected_cod_courier_adjustment(
      rejected_order_id,current_date,'SFR' || upper(substr(replace(rejected_order_id::text,'-',''),1,20)),
      'Partial Delivered','Customer rejected',100,115,gen_random_uuid()
    );
    raise exception 'Duplicate rejected COD evidence was accepted.';
  exception when unique_violation then null; end;

  select coalesce(sum(case when movement_type in('inflow','transfer_in') then amount else -amount end),0)
    into cash_after_provisional from public.cash_movements;
  if cash_after_provisional<>cash_before
    or exists(select 1 from public.order_financial_snapshots where order_id=rejected_order_id)
    or exists(select 1 from public.order_item_financial_allocations where order_id=rejected_order_id)
    or exists(select 1 from public.cash_movements where order_id=rejected_order_id)
    or (select dashboard_order_status from public.orders where id=rejected_order_id)<>'Cancelled'
    or (select dashboard_payment_status from public.orders where id=rejected_order_id)<>'Unpaid'
    or (select settlement_status from public.orders where id=rejected_order_id)<>'Awaiting'
    or (select return_disposition from public.orders where id=rejected_order_id) is not null then
    raise exception 'Provisional evidence changed cash, sale recognition, order state, or physical-return state.';
  end if;

  select created_at into adjustment_created_at from public.rejected_cod_courier_adjustments where id=recorded_adjustment_id;
  select product_revenue,net_revenue,cogs,contribution_profit,net_profit
    into product_revenue_before,net_revenue_before,cogs_before,contribution_before,net_profit_before
  from public.get_dashboard_financial_summary(null,null,null,null);

  settlement_id := public.record_steadfast_cod_settlement_v4(
    current_date,'business_account','bkash','[]'::jsonb,
    1100,115,985,
    jsonb_build_array(jsonb_build_object('order_id',delivered_order_id,'expected_updated_at',delivered_updated_at)),
    jsonb_build_array(jsonb_build_object('adjustment_id',recorded_adjustment_id,'expected_created_at',adjustment_created_at)),
    settlement_key,'ROLLBACK-REJECTED',null,'1234','ROLLBACK-REJECTED-TX','Rollback-only rejected COD confirmation'
  );
  duplicate_id := public.record_steadfast_cod_settlement_v4(
    current_date,'business_account','bkash','[]'::jsonb,
    1100,115,985,
    jsonb_build_array(jsonb_build_object('order_id',delivered_order_id,'expected_updated_at',delivered_updated_at)),
    jsonb_build_array(jsonb_build_object('adjustment_id',recorded_adjustment_id,'expected_created_at',adjustment_created_at)),
    settlement_key,'ROLLBACK-REJECTED',null,'1234','ROLLBACK-REJECTED-TX','Rollback-only rejected COD confirmation'
  );
  if duplicate_id<>settlement_id
    or (select count(*) from public.rejected_cod_adjustment_settlement_allocations where adjustment_id=recorded_adjustment_id)<>1
    or not exists(
      select 1 from public.dashboard_rejected_cod_adjustment_financials
      where order_id=rejected_order_id and delivery_charge_recovery=100 and courier_cost=115 and net_adjustment=-15
    ) then
    raise exception 'Settlement confirmation was not atomic, idempotent, or exact.';
  end if;

  select product_revenue,net_revenue,cogs,contribution_profit,net_profit
    into product_revenue_after,net_revenue_after,cogs_after,contribution_after,net_profit_after
  from public.get_dashboard_financial_summary(null,null,null,null);
  if product_revenue_after<>product_revenue_before
    or cogs_after<>cogs_before
    or net_revenue_after<>net_revenue_before+100
    or contribution_after<>contribution_before-15
    or net_profit_after<>net_profit_before-15 then
    raise exception 'Confirmed rejected COD accounting did not produce 0 product revenue/COGS and exact -15 profit effect.';
  end if;
  if stock_hash<>(select md5(coalesce(jsonb_agg(jsonb_build_object('id',id,'stock',stock) order by id)::text,'[]')) from public.products) then
    raise exception 'Rejected COD confirmation changed inventory.';
  end if;

  reversal_id := public.reverse_steadfast_cod_settlement(settlement_id,current_date,'Rollback-only rejected COD reversal',gen_random_uuid());
  if reversal_id is null
    or exists(select 1 from public.dashboard_rejected_cod_adjustment_financials where order_id=rejected_order_id)
    or not exists(select 1 from public.dashboard_steadfast_settlement_eligible_rejected_adjustments where adjustment_id=recorded_adjustment_id)
    or (select settlement_status from public.orders where id=delivered_order_id)<>'Awaiting' then
    raise exception 'Linked settlement reversal did not remove recognition and restore eligibility.';
  end if;
  select product_revenue,net_revenue,cogs,contribution_profit,net_profit
    into product_revenue_after,net_revenue_after,cogs_after,contribution_after,net_profit_after
  from public.get_dashboard_financial_summary(null,null,null,null);
  if product_revenue_after<>product_revenue_before or net_revenue_after<>net_revenue_before
    or cogs_after<>cogs_before or contribution_after<>contribution_before or net_profit_after<>net_profit_before then
    raise exception 'Settlement reversal did not restore every confirmed financial total.';
  end if;
end
$test$;

select * from finish();
rollback;
