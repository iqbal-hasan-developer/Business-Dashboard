-- DEVELOPMENT SQL EDITOR ONLY.
-- Visually confirm the breadcrumb says: NexaNotion Business Dashboard Dev.
-- SQL Editor runner for supabase/tests/database/001_rls_policies.test.sql.
-- Buffers every pgTAP line so all assertions and the final plan are returned
-- in one visible result set. The transaction is always rolled back.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = public, extensions, pg_catalog;

create temporary table pg_temp.pgtap_results (
  result_order bigint generated always as identity primary key,
  tap_result text not null
) on commit drop;

do $setup_plan$
begin
  perform no_plan();
end
$setup_plan$;

insert into pg_temp.pgtap_results (tap_result)
select has_table(
  'public', 'dashboard_user_profiles', 'dashboard profiles table exists'
);
insert into pg_temp.pgtap_results (tap_result)
select has_table(
  'public', 'product_business_data', 'private product data table exists'
);
insert into pg_temp.pgtap_results (tap_result)
select has_table(
  'public', 'order_financial_snapshots',
  'immutable recognition snapshots table exists'
);
insert into pg_temp.pgtap_results (tap_result)
select has_table(
  'public', 'order_financial_adjustments',
  'append-only financial adjustments table exists'
);

insert into pg_temp.pgtap_results (tap_result)
select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.product_business_data'::regclass),
  'private product data has RLS'
);
insert into pg_temp.pgtap_results (tap_result)
select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.orders'::regclass),
  'orders have RLS'
);
insert into pg_temp.pgtap_results (tap_result)
select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.order_items'::regclass),
  'order items have RLS'
);
insert into pg_temp.pgtap_results (tap_result)
select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.audit_history'::regclass),
  'audit history has RLS'
);

insert into pg_temp.pgtap_results (tap_result)
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'orders'
      and policyname = 'Dashboard owners and admins read orders'
      and cmd = 'SELECT'
      and qual like '%owner%'
      and qual like '%admin%'
      and qual not like '%viewer%'
      and qual not like '%data_entry%'
  ),
  'only owner/admin policy roles can read customer orders directly'
);
insert into pg_temp.pgtap_results (tap_result)
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in (
        'orders', 'order_items', 'product_business_data',
        'order_financial_snapshots', 'expenses', 'cash_movements'
      )
      and roles && array['anon']::name[]
  ),
  'anon has no policy on private operational or financial tables'
);
insert into pg_temp.pgtap_results (tap_result)
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_history'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  'audit history has no direct write policy'
);
insert into pg_temp.pgtap_results (tap_result)
select ok(
  not has_table_privilege('authenticated', 'public.orders', 'INSERT')
    and not has_table_privilege('authenticated', 'public.orders', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.orders', 'DELETE'),
  'authenticated clients cannot write orders directly'
);
insert into pg_temp.pgtap_results (tap_result)
select ok(
  has_table_privilege('anon', 'public.products', 'SELECT')
    and not has_table_privilege(
      'anon', 'public.product_business_data', 'SELECT'
    ),
  'public catalog remains readable while buying costs stay private'
);

insert into pg_temp.pgtap_results (tap_result)
select finish_result
from finish() as finish_result;

select tap_result
from pg_temp.pgtap_results
order by result_order;

rollback;
