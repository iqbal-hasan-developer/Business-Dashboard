-- READ ONLY. DEVELOPMENT SQL EDITOR ONLY.
-- Visually confirm the breadcrumb says: NexaNotion Business Dashboard Dev.

with stock_function as (
  select procedure.oid, procedure.proowner, procedure.proacl,
    procedure.prosecdef
  from pg_catalog.pg_proc as procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.decrement_product_stock(uuid,integer)'
  )
), stock_public_execute as (
  select coalesce(bool_or(
    privilege.grantee = 0
    and privilege.privilege_type = 'EXECUTE'
  ), false) as allowed
  from stock_function as function_record
  cross join lateral pg_catalog.aclexplode(
    coalesce(
      function_record.proacl,
      pg_catalog.acldefault('f'::"char", function_record.proowner)
    )
  ) as privilege
), checks as (
  select 'exact_five_storefront_tables'::text as check_name,
    (
      select pg_catalog.array_agg(class.relname order by class.relname)
      from pg_catalog.pg_class as class
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = class.relnamespace
      where namespace.nspname = 'public' and class.relkind in ('r', 'p')
    ) = array[
      'categories', 'contact_messages', 'order_items', 'orders', 'products'
    ]::name[] as passed
  union all
  select 'exact_two_application_functions', (
    select count(*) = 2
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
  )
  union all
  select 'exact_two_catalog_policies', (
    select count(*) = 2
    from pg_catalog.pg_policy as policy
    join pg_catalog.pg_class as class on class.oid = policy.polrelid
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
  )
  union all
  select 'exact_three_update_triggers', (
    select count(*) = 3
    from pg_catalog.pg_trigger as trigger
    join pg_catalog.pg_class as class on class.oid = trigger.tgrelid
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public' and not trigger.tgisinternal
  )
  union all
  select 'stock_function_is_security_definer',
    coalesce((select prosecdef from stock_function), false)
  union all
  select 'stock_function_acl_is_service_role_only',
    not coalesce((select allowed from stock_public_execute), true)
    and not pg_catalog.has_function_privilege(
      'anon', 'public.decrement_product_stock(uuid,integer)', 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'authenticated',
      'public.decrement_product_stock(uuid,integer)',
      'EXECUTE'
    )
    and pg_catalog.has_function_privilege(
      'service_role',
      'public.decrement_product_stock(uuid,integer)',
      'EXECUTE'
    )
  union all
  select 'set_updated_at_is_security_invoker', coalesce((
    select not procedure.prosecdef
    from pg_catalog.pg_proc as procedure
    where procedure.oid = pg_catalog.to_regprocedure('public.set_updated_at()')
  ), false)
  union all
  select 'storefront_tables_contain_no_rows',
    (select count(*) from public.categories) = 0
    and (select count(*) from public.contact_messages) = 0
    and (select count(*) from public.order_items) = 0
    and (select count(*) from public.orders) = 0
    and (select count(*) from public.products) = 0
)
select check_name, passed
from checks
order by check_name;
