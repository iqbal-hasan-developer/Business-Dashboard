-- ALREADY EXECUTED SUCCESSFULLY IN NEXANOTION BUSINESS DASHBOARD DEV.
-- HISTORICAL EVIDENCE ONLY - DO NOT RUN OR RERUN THIS FILE.
-- One-time, development-only cleanup for the duplicate historical-order rows.
-- Apply only to the linked project verified externally as:
-- NexaNotion Business Dashboard Dev
--
-- Canonical records are the 43 owner-approved SF-* rows imported on 2026-08-09.
-- This transaction removes 15 older numeric-number duplicates and one later
-- non-baseline Confirmed order. Exact identity, dependency, financial, status,
-- trigger, and preservation checks fail closed before COMMIT.

begin;
set transaction isolation level serializable;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

lock table public.orders in share row exclusive mode;

create temporary table cleanup_duplicate_orders (
  order_id uuid primary key,
  order_number text not null unique
) on commit drop;

insert into pg_temp.cleanup_duplicate_orders (order_id, order_number) values
  ('95d80968-bf36-4232-aeca-88b37edd225b', '270337199'),
  ('cb5fc034-c612-4a9a-b6ce-be923fd3aa88', '270340813'),
  ('5d0ec3e7-8475-4a21-b4e5-f547a1f60caf', '270343416'),
  ('8f0f25fb-5e7d-468a-b914-25e77398bed5', '270515411'),
  ('2b12fac7-81e4-41bc-ade1-a3ba65013c9b', '270577822'),
  ('22f630bf-88f3-4a41-8b7d-8d97dced81aa', '270666794'),
  ('6237dab8-c357-4564-bfae-2746105754a9', '270829330'),
  ('bd21a077-3bd8-411d-9009-e00ca7d73835', '271098801'),
  ('4e5132ee-08a4-43ae-ba6a-17566d2db101', '271100572'),
  ('3a2a0671-270b-4aef-9891-0224ca8f22f5', '271102086'),
  ('7fedd96e-6664-4b8b-bdcf-db3d851e4a81', '271103285'),
  ('55874b47-4ae2-488d-959a-28b49d8b58fd', '271104882'),
  ('b7b6ee9c-b27d-432d-b481-1af0c75a460a', '271154705'),
  ('ee23a924-5c7f-462a-ab87-8faf44d2bc49', '271157271'),
  ('ffcb4011-a4a8-42fe-a793-ecb7552c7e63', '271247366'),
  ('8b4a44ae-0518-401a-a465-0d3482295537', '281869589');

create temporary table cleanup_audit_keys (
  table_name text not null,
  record_id text not null,
  primary key (table_name, record_id)
) on commit drop;

insert into pg_temp.cleanup_audit_keys (table_name, record_id)
select 'orders', target.order_id::text
from pg_temp.cleanup_duplicate_orders target
union
select 'order_items', item.id::text
from public.order_items item
join pg_temp.cleanup_duplicate_orders target on target.order_id = item.order_id
union
select 'order_financial_snapshots', snapshot.order_id::text
from public.order_financial_snapshots snapshot
join pg_temp.cleanup_duplicate_orders target on target.order_id = snapshot.order_id
union
select 'order_item_financial_allocations', allocation.id::text
from public.order_item_financial_allocations allocation
join pg_temp.cleanup_duplicate_orders target on target.order_id = allocation.order_id;

create temporary table cleanup_preserved_fingerprints (
  relation_name text primary key,
  row_count bigint not null,
  content_hash text not null
) on commit drop;

insert into pg_temp.cleanup_preserved_fingerprints
select 'canonical_orders', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.orders row_data where row_data.order_number ~* '^SF-'
union all
select 'canonical_order_items', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.order_items row_data
join public.orders orders on orders.id = row_data.order_id
where orders.order_number ~* '^SF-'
union all
select 'canonical_financial_snapshots', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.order_id)::text, '[]'))
from public.order_financial_snapshots row_data
join public.orders orders on orders.id = row_data.order_id
where orders.order_number ~* '^SF-'
union all
select 'canonical_item_allocations', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.order_item_financial_allocations row_data
join public.orders orders on orders.id = row_data.order_id
where orders.order_number ~* '^SF-'
union all
select 'products', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.products row_data
union all
select 'product_business_data', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.product_id)::text, '[]'))
from public.product_business_data row_data
union all
select 'expenses', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.expenses row_data
union all
select 'campaigns', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.campaigns row_data
union all
select 'daily_ad_spend', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.daily_ad_spend row_data
union all
select 'cash_movements', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.cash_movements row_data
union all
select 'settlement_records', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.settlement_records row_data
union all
select 'settlement_order_allocations', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.settlement_id, row_data.order_id)::text, '[]'))
from public.settlement_order_allocations row_data
union all
select 'settlement_reversals', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.settlement_reversals row_data
union all
select 'business_settings', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.setting_key)::text, '[]'))
from public.business_settings row_data
union all
select 'business_lookup_values', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.lookup_type, row_data.lookup_key)::text, '[]'))
from public.business_lookup_values row_data
union all
select 'schema_migrations', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.version)::text, '[]'))
from supabase_migrations.schema_migrations row_data;

do $pre_delete_guards$
declare
  matched_targets integer;
  matched_pairs integer;
begin
  perform orders.id
  from public.orders orders
  join pg_temp.cleanup_duplicate_orders target
    on target.order_id = orders.id
   and target.order_number = orders.order_number
  order by orders.id
  for update of orders;

  select count(*)::integer into matched_targets
  from public.orders orders
  join pg_temp.cleanup_duplicate_orders target
    on target.order_id = orders.id
   and target.order_number = orders.order_number;

  if matched_targets <> 16
     or (select count(*) from public.orders) <> 59 then
    raise exception 'Cleanup stopped: exact 59-row/16-target identity guard failed.';
  end if;

  if (select count(*) from public.orders
      where coalesce(dashboard_order_status, order_status) = 'Delivered') <> 49
     or (select count(*) from public.orders
         where coalesce(dashboard_order_status, order_status) = 'Pending') <> 1
     or (select count(*) from public.orders
         where coalesce(dashboard_order_status, order_status) = 'Cancelled') <> 8
     or (select count(*) from public.orders
         where coalesce(dashboard_order_status, order_status) = 'Confirmed') <> 1 then
    raise exception 'Cleanup stopped: pre-cleanup order-status totals changed.';
  end if;

  if (select count(*) from public.orders where order_number ~* '^SF-') <> 43
     or (select count(*) from public.orders where order_number ~* '^SF-'
         and coalesce(dashboard_order_status, order_status) = 'Delivered') <> 36
     or (select count(*) from public.orders where order_number ~* '^SF-'
         and coalesce(dashboard_order_status, order_status) = 'Pending') <> 1
     or (select count(*) from public.orders where order_number ~* '^SF-'
         and coalesce(dashboard_order_status, order_status) = 'Cancelled') <> 6 then
    raise exception 'Cleanup stopped: canonical 43-order baseline changed.';
  end if;

  select count(*)::integer into matched_pairs
  from pg_temp.cleanup_duplicate_orders target
  join public.orders duplicate
    on duplicate.id = target.order_id
   and duplicate.order_number = target.order_number
  join public.orders canonical
    on canonical.order_number = 'SF-' || target.order_number
  where target.order_number <> '281869589'
    and duplicate.order_date = canonical.order_date
    and coalesce(duplicate.dashboard_order_status, duplicate.order_status)
      = coalesce(canonical.dashboard_order_status, canonical.order_status)
    and (select count(*) from public.order_items item
         where item.order_id = duplicate.id) = 1
    and (select count(*) from public.order_items item
         where item.order_id = canonical.id) = 1;

  if matched_pairs <> 15 then
    raise exception 'Cleanup stopped: the 15 numeric/SF duplicate pairs changed.';
  end if;

  if (select count(*) from public.orders orders
      join pg_temp.cleanup_duplicate_orders target on target.order_id = orders.id
      where target.order_number = '281869589'
        and orders.order_number = '281869589'
        and coalesce(orders.dashboard_order_status, orders.order_status) = 'Confirmed'
        and not exists (select 1 from public.orders canonical
          where canonical.order_number = 'SF-281869589')) <> 1 then
    raise exception 'Cleanup stopped: the non-baseline Confirmed target changed.';
  end if;

  if (select count(*) from public.order_items item
      join pg_temp.cleanup_duplicate_orders target on target.order_id = item.order_id) <> 16
     or (select count(*) from public.order_financial_snapshots snapshot
         join pg_temp.cleanup_duplicate_orders target on target.order_id = snapshot.order_id) <> 13
     or (select count(*) from public.order_item_financial_allocations allocation
         join pg_temp.cleanup_duplicate_orders target on target.order_id = allocation.order_id) <> 13
     or exists (
       select 1 from public.order_financial_adjustments row_data
       join pg_temp.cleanup_duplicate_orders target on target.order_id = row_data.order_id
       union all
       select 1 from public.order_item_refund_allocations row_data
       join pg_temp.cleanup_duplicate_orders target on target.order_id = row_data.order_id
       union all
       select 1 from public.order_return_events row_data
       join pg_temp.cleanup_duplicate_orders target on target.order_id = row_data.order_id
       union all
       select 1 from public.order_item_return_allocations row_data
       join pg_temp.cleanup_duplicate_orders target on target.order_id = row_data.order_id
       union all
       select 1 from public.inventory_restoration_movements row_data
       join pg_temp.cleanup_duplicate_orders target on target.order_id = row_data.order_id
       union all
       select 1 from public.settlement_order_allocations row_data
       join pg_temp.cleanup_duplicate_orders target on target.order_id = row_data.order_id
       union all
       select 1 from public.cash_movements row_data
       join pg_temp.cleanup_duplicate_orders target on target.order_id = row_data.order_id
     ) then
    raise exception 'Cleanup stopped: target dependency graph changed.';
  end if;

  if (select count(*) from public.order_financial_snapshots) <> 49
     or (select count(*) from public.order_item_financial_allocations) <> 49
     or (select count(*) from public.order_items) <> 59
     or (select count(*) from public.order_financial_snapshots snapshot
         join public.orders orders on orders.id = snapshot.order_id
         where orders.order_number ~* '^SF-') <> 36
     or (select coalesce(sum(snapshot.product_revenue), 0)
         from public.order_financial_snapshots snapshot
         join public.orders orders on orders.id = snapshot.order_id
         where orders.order_number ~* '^SF-') <> 25900.00::numeric
     or (select coalesce(sum(snapshot.cogs), 0)
         from public.order_financial_snapshots snapshot
         join public.orders orders on orders.id = snapshot.order_id
         where orders.order_number ~* '^SF-') <> 14380.00::numeric then
    raise exception 'Cleanup stopped: canonical financial baseline changed.';
  end if;

  if (select count(*) from pg_catalog.pg_trigger trigger
      where trigger.tgrelid in (
        'public.order_financial_snapshots'::regclass,
        'public.order_item_financial_allocations'::regclass
      )
      and trigger.tgname in (
        'order_financial_snapshots_immutable',
        'order_item_financial_allocations_immutable'
      )
      and trigger.tgenabled = 'O') <> 2 then
    raise exception 'Cleanup stopped: immutable trigger state changed.';
  end if;
end
$pre_delete_guards$;

alter table public.order_item_financial_allocations
  disable trigger order_item_financial_allocations_immutable;
alter table public.order_financial_snapshots
  disable trigger order_financial_snapshots_immutable;

delete from public.order_item_financial_allocations allocation
using pg_temp.cleanup_duplicate_orders target
where allocation.order_id = target.order_id;

delete from public.order_financial_snapshots snapshot
using pg_temp.cleanup_duplicate_orders target
where snapshot.order_id = target.order_id;

delete from public.order_items item
using pg_temp.cleanup_duplicate_orders target
where item.order_id = target.order_id;

delete from public.orders orders
using pg_temp.cleanup_duplicate_orders target
where orders.id = target.order_id
  and orders.order_number = target.order_number;

delete from public.audit_history audit
using pg_temp.cleanup_audit_keys target
where (audit.table_name = target.table_name and audit.record_id = target.record_id)
   or audit.old_values ->> 'order_id' in (
     select order_id::text from pg_temp.cleanup_duplicate_orders
   )
   or audit.new_values ->> 'order_id' in (
     select order_id::text from pg_temp.cleanup_duplicate_orders
   );

alter table public.order_financial_snapshots
  enable trigger order_financial_snapshots_immutable;
alter table public.order_item_financial_allocations
  enable trigger order_item_financial_allocations_immutable;

create temporary table cleanup_current_fingerprints (
  relation_name text primary key,
  row_count bigint not null,
  content_hash text not null
) on commit drop;

insert into pg_temp.cleanup_current_fingerprints
select 'canonical_orders', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.orders row_data where row_data.order_number ~* '^SF-'
union all
select 'canonical_order_items', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.order_items row_data
join public.orders orders on orders.id = row_data.order_id
where orders.order_number ~* '^SF-'
union all
select 'canonical_financial_snapshots', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.order_id)::text, '[]'))
from public.order_financial_snapshots row_data
join public.orders orders on orders.id = row_data.order_id
where orders.order_number ~* '^SF-'
union all
select 'canonical_item_allocations', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.order_item_financial_allocations row_data
join public.orders orders on orders.id = row_data.order_id
where orders.order_number ~* '^SF-'
union all
select 'products', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.products row_data
union all
select 'product_business_data', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.product_id)::text, '[]'))
from public.product_business_data row_data
union all
select 'expenses', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.expenses row_data
union all
select 'campaigns', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.campaigns row_data
union all
select 'daily_ad_spend', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.daily_ad_spend row_data
union all
select 'cash_movements', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.cash_movements row_data
union all
select 'settlement_records', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.settlement_records row_data
union all
select 'settlement_order_allocations', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.settlement_id, row_data.order_id)::text, '[]'))
from public.settlement_order_allocations row_data
union all
select 'settlement_reversals', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text, '[]'))
from public.settlement_reversals row_data
union all
select 'business_settings', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.setting_key)::text, '[]'))
from public.business_settings row_data
union all
select 'business_lookup_values', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.lookup_type, row_data.lookup_key)::text, '[]'))
from public.business_lookup_values row_data
union all
select 'schema_migrations', count(*)::bigint,
  md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.version)::text, '[]'))
from supabase_migrations.schema_migrations row_data;

do $post_delete_guards$
begin
  if exists (
    select 1 from public.orders orders
    join pg_temp.cleanup_duplicate_orders target on target.order_id = orders.id
  )
  or exists (
    select 1 from public.order_items row_data
    join pg_temp.cleanup_duplicate_orders target on target.order_id = row_data.order_id
    union all
    select 1 from public.order_financial_snapshots row_data
    join pg_temp.cleanup_duplicate_orders target on target.order_id = row_data.order_id
    union all
    select 1 from public.order_item_financial_allocations row_data
    join pg_temp.cleanup_duplicate_orders target on target.order_id = row_data.order_id
  ) then
    raise exception 'Cleanup stopped: target rows remain after deletion.';
  end if;

  if (select count(*) from public.orders) <> 43
     or (select count(*) from public.orders
         where coalesce(dashboard_order_status, order_status) = 'Delivered') <> 36
     or (select count(*) from public.orders
         where coalesce(dashboard_order_status, order_status) = 'Pending') <> 1
     or (select count(*) from public.orders
         where coalesce(dashboard_order_status, order_status) = 'Cancelled') <> 6
     or (select count(*) from public.orders where order_number !~* '^SF-') <> 0 then
    raise exception 'Cleanup stopped: required 43/36/1/6 baseline was not reached.';
  end if;

  if (select count(*) from public.order_items) <> 43
     or (select count(*) from public.order_financial_snapshots) <> 36
     or (select count(*) from public.order_item_financial_allocations) <> 36
     or (select coalesce(sum(product_revenue), 0)
         from public.order_financial_snapshots) <> 25900.00::numeric
     or (select coalesce(sum(cogs), 0)
         from public.order_financial_snapshots) <> 14380.00::numeric then
    raise exception 'Cleanup stopped: post-cleanup financial totals do not reconcile.';
  end if;

  if exists (
    select 1
    from pg_temp.cleanup_preserved_fingerprints expected
    full join pg_temp.cleanup_current_fingerprints actual using (relation_name)
    where expected.row_count is distinct from actual.row_count
       or expected.content_hash is distinct from actual.content_hash
  ) then
    raise exception 'Cleanup stopped: a preserved canonical/business relation changed.';
  end if;

  if (select count(*) from pg_catalog.pg_trigger trigger
      where trigger.tgrelid in (
        'public.order_financial_snapshots'::regclass,
        'public.order_item_financial_allocations'::regclass
      )
      and trigger.tgname in (
        'order_financial_snapshots_immutable',
        'order_item_financial_allocations_immutable'
      )
      and trigger.tgenabled = 'O') <> 2 then
    raise exception 'Cleanup stopped: immutable triggers were not restored.';
  end if;

  if exists (
    select 1
    from public.dashboard_data_quality_checks quality
    cross join lateral jsonb_each_text(to_jsonb(quality)) field(key, value)
    where field.value::bigint <> 0
  ) or exists (
    select 1
    from public.dashboard_product_allocation_data_quality quality
    cross join lateral jsonb_each_text(to_jsonb(quality)) field(key, value)
    where field.value::bigint <> 0
  ) then
    raise exception 'Cleanup stopped: a data-quality check failed.';
  end if;
end
$post_delete_guards$;

commit;

select
  (select count(*)::bigint from public.orders) as total_orders,
  (select count(*)::bigint from public.orders
    where coalesce(dashboard_order_status, order_status) = 'Delivered') as delivered,
  (select count(*)::bigint from public.orders
    where coalesce(dashboard_order_status, order_status) = 'Pending') as pending,
  (select count(*)::bigint from public.orders
    where coalesce(dashboard_order_status, order_status) = 'Cancelled') as cancelled,
  (select count(*)::bigint from public.order_financial_snapshots) as financial_snapshots,
  (select coalesce(sum(product_revenue), 0)::numeric(14,2)
    from public.order_financial_snapshots) as product_revenue,
  (select coalesce(sum(cogs), 0)::numeric(14,2)
    from public.order_financial_snapshots) as cogs;
