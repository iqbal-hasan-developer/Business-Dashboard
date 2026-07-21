-- ALREADY EXECUTED SUCCESSFULLY IN NEXANOTION BUSINESS DASHBOARD DEV.
-- HISTORICAL EVIDENCE ONLY — DO NOT RUN OR RERUN THIS FILE.
-- This one-time development cleanup originally required 202607210000 to report
-- cleanup_allowed = true for all three exact targets.
-- Replace the placeholder only when the visible SQL Editor breadcrumb reads:
-- NexaNotion Business Dashboard Dev
begin;
set transaction isolation level serializable;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $development_gate$
begin
  if '__CONFIRM_VISIBLE_DEVELOPMENT_BREADCRUMB__'
     is distinct from 'NexaNotion Business Dashboard Dev' then
    raise exception 'Development breadcrumb confirmation is missing.';
  end if;
end
$development_gate$;

create temporary table cleanup_expected_orders (
  order_id uuid primary key,
  order_number text not null unique
) on commit drop;

insert into pg_temp.cleanup_expected_orders (order_id, order_number) values
  ('b77e4763-c619-4df4-a5d4-229e07ca3b28', '272315039'),
  ('f269db91-59ec-4e8e-85ee-50d9a2eb95f0', '271964410'),
  ('f78a7e99-3ae4-4aa5-b16d-cdff104bd8fa', '272189783');

create temporary table cleanup_audit_keys (
  table_name text not null,
  record_id text not null,
  primary key (table_name, record_id)
) on commit drop;

insert into pg_temp.cleanup_audit_keys (table_name, record_id)
select 'orders', expected.order_id::text
from pg_temp.cleanup_expected_orders as expected
union
select 'order_items', item.id::text
from public.order_items as item
join pg_temp.cleanup_expected_orders as expected on expected.order_id = item.order_id
union
select 'order_financial_snapshots', snapshot.order_id::text
from public.order_financial_snapshots as snapshot
join pg_temp.cleanup_expected_orders as expected on expected.order_id = snapshot.order_id
union
select 'order_financial_adjustments', adjustment.id::text
from public.order_financial_adjustments as adjustment
join pg_temp.cleanup_expected_orders as expected on expected.order_id = adjustment.order_id
union
select 'order_item_financial_allocations', allocation.id::text
from public.order_item_financial_allocations as allocation
join pg_temp.cleanup_expected_orders as expected on expected.order_id = allocation.order_id
union
select 'order_item_refund_allocations', refund.id::text
from public.order_item_refund_allocations as refund
join pg_temp.cleanup_expected_orders as expected on expected.order_id = refund.order_id
union
select 'order_return_events', return_event.id::text
from public.order_return_events as return_event
join pg_temp.cleanup_expected_orders as expected on expected.order_id = return_event.order_id
union
select 'order_item_return_allocations', returned.id::text
from public.order_item_return_allocations as returned
join pg_temp.cleanup_expected_orders as expected on expected.order_id = returned.order_id
union
select 'order_return_inspections', inspection.id::text
from public.order_return_inspections as inspection
join public.order_return_events as return_event on return_event.id = inspection.return_event_id
join pg_temp.cleanup_expected_orders as expected on expected.order_id = return_event.order_id
union
select 'inventory_restoration_movements', movement.id::text
from public.inventory_restoration_movements as movement
join pg_temp.cleanup_expected_orders as expected on expected.order_id = movement.order_id
union
select 'settlement_order_allocations', allocation.order_id::text
from public.settlement_order_allocations as allocation
join pg_temp.cleanup_expected_orders as expected on expected.order_id = allocation.order_id;

create temporary table cleanup_preserved_fingerprints (
  relation_name text primary key,
  row_count bigint not null,
  content_hash text not null
) on commit drop;

insert into pg_temp.cleanup_preserved_fingerprints
select 'products', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.products as row_data
union all
select 'product_business_data', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.product_id)::text, '[]'))
from public.product_business_data as row_data
union all
select 'expenses', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.expenses as row_data
union all
select 'campaigns', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.campaigns as row_data
union all
select 'daily_ad_spend', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.daily_ad_spend as row_data
union all
select 'cash_movements', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.cash_movements as row_data
union all
select 'settlement_records', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.settlement_records as row_data
union all
select 'dashboard_user_profiles', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.user_id)::text, '[]'))
from public.dashboard_user_profiles as row_data
union all
select 'schema_migrations', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.version)::text, '[]'))
from supabase_migrations.schema_migrations as row_data;

do $pre_delete_guards$
declare
  locked_order_count integer;
begin
  perform orders.id
  from public.orders as orders
  join pg_temp.cleanup_expected_orders as expected
    on expected.order_id = orders.id
   and expected.order_number = orders.order_number
  order by orders.id
  for update of orders;

  select count(*)::integer into locked_order_count
  from public.orders as orders
  join pg_temp.cleanup_expected_orders as expected
    on expected.order_id = orders.id
   and expected.order_number = orders.order_number;

  if locked_order_count <> 3
     or (select count(*) from public.orders) <> 3 then
    raise exception 'Cleanup stopped: the exact three-order identity guard failed.';
  end if;

  if exists (
    select 1
    from public.orders as orders
    join pg_temp.cleanup_expected_orders as expected on expected.order_id = orders.id
    where orders.order_number <> expected.order_number
       or orders.dashboard_order_status <> 'Delivered'
       or orders.dashboard_payment_status <> 'Paid'
       or orders.settlement_status <> 'Settled'
  ) then
    raise exception 'Cleanup stopped: an operational status or order number changed.';
  end if;

  if (select count(*) from public.dashboard_order_financials as financial
      join pg_temp.cleanup_expected_orders as expected on expected.order_id = financial.order_id) <> 3
     or (select coalesce(sum(financial.recognized_product_revenue), 0)
         from public.dashboard_order_financials as financial
         join pg_temp.cleanup_expected_orders as expected on expected.order_id = financial.order_id)
        <> 3150.00::numeric
     or (select coalesce(sum(financial.net_revenue), 0)
         from public.dashboard_order_financials as financial
         join pg_temp.cleanup_expected_orders as expected on expected.order_id = financial.order_id)
        <> 3150.00::numeric
     or (select coalesce(sum(financial.recognized_cogs), 0)
         from public.dashboard_order_financials as financial
         join pg_temp.cleanup_expected_orders as expected on expected.order_id = financial.order_id)
        <> 1500.00::numeric
     or (select coalesce(sum(financial.contribution_profit), 0)
         from public.dashboard_order_financials as financial
         join pg_temp.cleanup_expected_orders as expected on expected.order_id = financial.order_id)
        <> 1305.00::numeric
     or (select coalesce(sum(financial.net_revenue) filter (
           where lower(financial.payment_method) = 'cod'
             and financial.settlement_status <> 'Settled'
         ), 0)
         from public.dashboard_order_financials as financial
         join pg_temp.cleanup_expected_orders as expected on expected.order_id = financial.order_id)
        <> 1050.00::numeric then
    raise exception 'Cleanup stopped: recognized financial totals no longer reconcile.';
  end if;

  if exists (
    select 1
    from pg_temp.cleanup_expected_orders as expected
    where (select count(*) from public.order_items as item
           where item.order_id = expected.order_id) <> 1
       or (select count(*) from public.order_financial_snapshots as snapshot
           where snapshot.order_id = expected.order_id) <> 1
       or (select count(*) from public.order_item_financial_allocations as allocation
           where allocation.order_id = expected.order_id) <> 1
       or (select count(*) from public.cash_movements as movement
           where movement.order_id = expected.order_id) <> 0
  ) then
    raise exception 'Cleanup stopped: dependent-row counts differ from the audited acceptance scope.';
  end if;

  if (select count(*) from public.products where slug = 'gym-bag-black' and stock = 0) <> 1
     or (select count(*) from public.product_business_data as business
         join public.products as product on product.id = business.product_id
         where product.slug = 'gym-bag-black') <> 1
     or (select count(*) from public.expenses where category_key = 'operations') <> 1
     or (select coalesce(sum(amount), 0) from public.expenses
         where category_key = 'operations') <> 6840.00::numeric
     or (select count(*) from public.campaigns
         where name = 'NN – Hero Gym Bag – Messenger Carousel – July 2026') <> 1
     or (select count(*) from public.daily_ad_spend as spend
         join public.campaigns as campaign on campaign.id = spend.campaign_id
         where campaign.name = 'NN – Hero Gym Bag – Messenger Carousel – July 2026'
           and spend.spend_date = date '2026-07-20'
           and spend.amount = 354.20::numeric) <> 1 then
    raise exception 'Cleanup stopped: preserved MVP records do not match the approved state.';
  end if;

  if exists (
    select 1
    from public.dashboard_data_quality_checks as quality
    cross join lateral jsonb_each_text(to_jsonb(quality)) as field(key, value)
    where field.value::bigint <> 0
  ) or exists (
    select 1
    from public.dashboard_product_allocation_data_quality as quality
    cross join lateral jsonb_each_text(to_jsonb(quality)) as field(key, value)
    where field.value::bigint <> 0
  ) then
    raise exception 'Cleanup stopped: a data-quality check failed before deletion.';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_trigger as trigger
    where trigger.tgrelid in (
      'public.order_financial_snapshots'::regclass,
      'public.order_financial_adjustments'::regclass,
      'public.order_item_financial_allocations'::regclass,
      'public.order_item_refund_allocations'::regclass,
      'public.order_return_events'::regclass,
      'public.order_item_return_allocations'::regclass,
      'public.order_return_inspections'::regclass,
      'public.inventory_restoration_movements'::regclass
    ) and trigger.tgname in (
      'order_financial_snapshots_immutable',
      'order_financial_adjustments_immutable',
      'order_item_financial_allocations_immutable',
      'order_item_refund_allocations_immutable',
      'order_return_events_immutable',
      'order_item_return_allocations_immutable',
      'order_return_inspections_immutable',
      'inventory_restoration_movements_immutable'
    ) and trigger.tgenabled = 'O'
  ) <> 8 then
    raise exception 'Cleanup stopped: immutable trigger metadata is not exact.';
  end if;
end
$pre_delete_guards$;

-- The immutable-ledger triggers are the only permanent-schema objects touched.
-- Each exact trigger is disabled transactionally, then re-enabled and verified
-- before COMMIT. Any error rolls back both the data work and trigger state.
alter table public.inventory_restoration_movements
  disable trigger inventory_restoration_movements_immutable;
alter table public.order_return_inspections
  disable trigger order_return_inspections_immutable;
alter table public.order_item_return_allocations
  disable trigger order_item_return_allocations_immutable;
alter table public.order_return_events
  disable trigger order_return_events_immutable;
alter table public.order_item_refund_allocations
  disable trigger order_item_refund_allocations_immutable;
alter table public.order_financial_adjustments
  disable trigger order_financial_adjustments_immutable;
alter table public.order_item_financial_allocations
  disable trigger order_item_financial_allocations_immutable;
alter table public.order_financial_snapshots
  disable trigger order_financial_snapshots_immutable;

delete from public.inventory_restoration_movements as movement
using pg_temp.cleanup_expected_orders as expected
where movement.order_id = expected.order_id;

delete from public.order_return_inspections as inspection
using public.order_return_events as return_event,
  pg_temp.cleanup_expected_orders as expected
where inspection.return_event_id = return_event.id
  and return_event.order_id = expected.order_id;

delete from public.order_item_return_allocations as returned
using pg_temp.cleanup_expected_orders as expected
where returned.order_id = expected.order_id;

delete from public.order_return_events as return_event
using pg_temp.cleanup_expected_orders as expected
where return_event.order_id = expected.order_id;

delete from public.order_item_refund_allocations as refund
using pg_temp.cleanup_expected_orders as expected
where refund.order_id = expected.order_id;

delete from public.settlement_order_allocations as allocation
using pg_temp.cleanup_expected_orders as expected
where allocation.order_id = expected.order_id;

delete from public.order_financial_adjustments as adjustment
using pg_temp.cleanup_expected_orders as expected
where adjustment.order_id = expected.order_id;

delete from public.order_item_financial_allocations as allocation
using pg_temp.cleanup_expected_orders as expected
where allocation.order_id = expected.order_id;

delete from public.order_financial_snapshots as snapshot
using pg_temp.cleanup_expected_orders as expected
where snapshot.order_id = expected.order_id;

delete from public.order_items as item
using pg_temp.cleanup_expected_orders as expected
where item.order_id = expected.order_id;

delete from public.orders as orders
using pg_temp.cleanup_expected_orders as expected
where orders.id = expected.order_id
  and orders.order_number = expected.order_number;

-- Remove only audit rows whose record keys were captured from the exact target
-- graph. This also removes the DELETE audit rows created above; unrelated audit
-- history is left intact.
delete from public.audit_history as audit
using pg_temp.cleanup_audit_keys as target
where audit.table_name = target.table_name
  and audit.record_id = target.record_id;

alter table public.order_financial_snapshots
  enable trigger order_financial_snapshots_immutable;
alter table public.order_item_financial_allocations
  enable trigger order_item_financial_allocations_immutable;
alter table public.order_financial_adjustments
  enable trigger order_financial_adjustments_immutable;
alter table public.order_item_refund_allocations
  enable trigger order_item_refund_allocations_immutable;
alter table public.order_return_events
  enable trigger order_return_events_immutable;
alter table public.order_item_return_allocations
  enable trigger order_item_return_allocations_immutable;
alter table public.order_return_inspections
  enable trigger order_return_inspections_immutable;
alter table public.inventory_restoration_movements
  enable trigger inventory_restoration_movements_immutable;

do $post_delete_guards$
begin
  if exists (
    select 1 from public.orders as orders
    join pg_temp.cleanup_expected_orders as expected on expected.order_id = orders.id
  ) or (select count(*) from public.orders) <> 0 then
    raise exception 'Cleanup stopped: an order remains after deletion.';
  end if;

  if exists (
    select 1 from public.order_items as item
    join pg_temp.cleanup_expected_orders as expected on expected.order_id = item.order_id
  ) or exists (
    select 1 from public.order_financial_snapshots as snapshot
    join pg_temp.cleanup_expected_orders as expected on expected.order_id = snapshot.order_id
  ) or exists (
    select 1 from public.order_financial_adjustments as adjustment
    join pg_temp.cleanup_expected_orders as expected on expected.order_id = adjustment.order_id
  ) or exists (
    select 1 from public.order_item_financial_allocations as allocation
    join pg_temp.cleanup_expected_orders as expected on expected.order_id = allocation.order_id
  ) or exists (
    select 1 from public.order_item_refund_allocations as refund
    join pg_temp.cleanup_expected_orders as expected on expected.order_id = refund.order_id
  ) or exists (
    select 1 from public.order_return_events as return_event
    join pg_temp.cleanup_expected_orders as expected on expected.order_id = return_event.order_id
  ) or exists (
    select 1 from public.order_item_return_allocations as returned
    join pg_temp.cleanup_expected_orders as expected on expected.order_id = returned.order_id
  ) or exists (
    select 1 from public.inventory_restoration_movements as movement
    join pg_temp.cleanup_expected_orders as expected on expected.order_id = movement.order_id
  ) or exists (
    select 1 from public.settlement_order_allocations as allocation
    join pg_temp.cleanup_expected_orders as expected on expected.order_id = allocation.order_id
  ) or exists (
    select 1 from public.cash_movements as movement
    join pg_temp.cleanup_expected_orders as expected on expected.order_id = movement.order_id
  ) then
    raise exception 'Cleanup stopped: a dependent target row remains.';
  end if;

  if exists (
    select 1
    from public.audit_history as audit
    join pg_temp.cleanup_audit_keys as target
      on target.table_name = audit.table_name
     and target.record_id = audit.record_id
  ) then
    raise exception 'Cleanup stopped: target-only audit history remains.';
  end if;

  if (select count(*) from public.dashboard_order_financials) <> 0
     or (select coalesce(sum(recognized_product_revenue), 0)
         from public.dashboard_order_financials) <> 0
     or (select coalesce(sum(net_revenue), 0)
         from public.dashboard_order_financials) <> 0
     or (select coalesce(sum(recognized_cogs), 0)
         from public.dashboard_order_financials) <> 0
     or (select coalesce(sum(gross_profit), 0)
         from public.dashboard_order_financials) <> 0
     or (select coalesce(sum(contribution_profit), 0)
         from public.dashboard_order_financials) <> 0 then
    raise exception 'Cleanup stopped: post-delete financial totals are not zero.';
  end if;

  if (select count(*) from public.products where slug = 'gym-bag-black' and stock = 0) <> 1
     or (select count(*) from public.product_business_data as business
         join public.products as product on product.id = business.product_id
         where product.slug = 'gym-bag-black') <> 1
     or (select count(*) from public.expenses where category_key = 'operations') <> 1
     or (select coalesce(sum(amount), 0) from public.expenses
         where category_key = 'operations') <> 6840.00::numeric
     or (select count(*) from public.campaigns
         where name = 'NN – Hero Gym Bag – Messenger Carousel – July 2026') <> 1
     or (select count(*) from public.daily_ad_spend as spend
         join public.campaigns as campaign on campaign.id = spend.campaign_id
         where campaign.name = 'NN – Hero Gym Bag – Messenger Carousel – July 2026'
           and spend.spend_date = date '2026-07-20'
           and spend.amount = 354.20::numeric) <> 1 then
    raise exception 'Cleanup stopped: a preserved MVP record changed.';
  end if;

  if exists (
    with current_fingerprints as (
      select 'products' as relation_name, count(*)::bigint as row_count,
        md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]')) as content_hash
      from public.products as row_data
      union all select 'product_business_data', count(*)::bigint,
        md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.product_id)::text, '[]'))
      from public.product_business_data as row_data
      union all select 'expenses', count(*)::bigint,
        md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
      from public.expenses as row_data
      union all select 'campaigns', count(*)::bigint,
        md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
      from public.campaigns as row_data
      union all select 'daily_ad_spend', count(*)::bigint,
        md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
      from public.daily_ad_spend as row_data
      union all select 'cash_movements', count(*)::bigint,
        md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
      from public.cash_movements as row_data
      union all select 'settlement_records', count(*)::bigint,
        md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
      from public.settlement_records as row_data
      union all select 'dashboard_user_profiles', count(*)::bigint,
        md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.user_id)::text, '[]'))
      from public.dashboard_user_profiles as row_data
      union all select 'schema_migrations', count(*)::bigint,
        md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.version)::text, '[]'))
      from supabase_migrations.schema_migrations as row_data
    )
    select 1
    from pg_temp.cleanup_preserved_fingerprints as before_cleanup
    full join current_fingerprints as after_cleanup using (relation_name)
    where before_cleanup.row_count is distinct from after_cleanup.row_count
       or before_cleanup.content_hash is distinct from after_cleanup.content_hash
  ) then
    raise exception 'Cleanup stopped: a preserved table or migration history changed.';
  end if;

  if exists (
    select 1
    from public.dashboard_data_quality_checks as quality
    cross join lateral jsonb_each_text(to_jsonb(quality)) as field(key, value)
    where field.value::bigint <> 0
  ) or exists (
    select 1
    from public.dashboard_product_allocation_data_quality as quality
    cross join lateral jsonb_each_text(to_jsonb(quality)) as field(key, value)
    where field.value::bigint <> 0
  ) then
    raise exception 'Cleanup stopped: a post-delete data-quality check failed.';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_trigger as trigger
    where trigger.tgrelid in (
      'public.order_financial_snapshots'::regclass,
      'public.order_financial_adjustments'::regclass,
      'public.order_item_financial_allocations'::regclass,
      'public.order_item_refund_allocations'::regclass,
      'public.order_return_events'::regclass,
      'public.order_item_return_allocations'::regclass,
      'public.order_return_inspections'::regclass,
      'public.inventory_restoration_movements'::regclass
    ) and trigger.tgname in (
      'order_financial_snapshots_immutable',
      'order_financial_adjustments_immutable',
      'order_item_financial_allocations_immutable',
      'order_item_refund_allocations_immutable',
      'order_return_events_immutable',
      'order_item_return_allocations_immutable',
      'order_return_inspections_immutable',
      'inventory_restoration_movements_immutable'
    ) and trigger.tgenabled = 'O'
  ) <> 8 then
    raise exception 'Cleanup stopped: immutable triggers were not restored.';
  end if;
end
$post_delete_guards$;

commit;

select
  (select count(*) from public.orders) = 0 as total_orders_zero,
  (select count(*) from public.dashboard_order_financials) = 0
    as recognized_financial_rows_zero,
  (select count(*) from public.products
    where slug = 'gym-bag-black' and stock = 0) = 1
    as product_and_zero_stock_preserved,
  (select coalesce(sum(amount), 0) from public.expenses
    where category_key = 'operations') = 6840.00::numeric
    as operating_expense_preserved,
  (select coalesce(sum(amount), 0) from public.daily_ad_spend)
    = 354.20::numeric as ad_spend_preserved,
  true as cleanup_committed;
