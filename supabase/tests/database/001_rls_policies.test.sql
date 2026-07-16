begin;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_table(
  'public', 'dashboard_user_profiles', 'dashboard profiles table exists'
);
select has_table(
  'public', 'product_business_data', 'private product data table exists'
);
select has_table(
  'public', 'order_financial_snapshots',
  'immutable recognition snapshots table exists'
);
select has_table(
  'public', 'order_financial_adjustments',
  'append-only financial adjustments table exists'
);

select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.product_business_data'::regclass),
  'private product data has RLS'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.orders'::regclass),
  'orders have RLS'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.order_items'::regclass),
  'order items have RLS'
);
select ok(
  (select relrowsecurity from pg_class
   where oid = 'public.audit_history'::regclass),
  'audit history has RLS'
);

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
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_history'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  'audit history has no direct write policy'
);
select ok(
  not has_table_privilege('authenticated', 'public.orders', 'INSERT')
    and not has_table_privilege('authenticated', 'public.orders', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.orders', 'DELETE'),
  'authenticated clients cannot write orders directly'
);
select ok(
  has_table_privilege('anon', 'public.products', 'SELECT')
    and not has_table_privilege(
      'anon', 'public.product_business_data', 'SELECT'
    ),
  'public catalog remains readable while buying costs stay private'
);

select * from finish();
rollback;
