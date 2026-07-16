-- READ ONLY. DEVELOPMENT SQL EDITOR ONLY.
-- Visually confirm the breadcrumb says: NexaNotion Business Dashboard Dev.

with stock_function as (
  select procedure.oid, procedure.proowner, procedure.proacl
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
  select 'all_private_tables_have_rls'::text as check_name,
    (
      select count(*) = 18 and pg_catalog.bool_and(class.relrowsecurity)
      from pg_catalog.pg_class as class
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = class.relnamespace
      where namespace.nspname = 'public'
        and class.relname = any(array[
          'categories', 'products', 'orders', 'order_items',
          'contact_messages', 'dashboard_user_profiles',
          'product_business_data', 'business_settings',
          'business_lookup_values', 'campaigns', 'daily_ad_spend',
          'order_financial_snapshots', 'order_financial_adjustments',
          'settlement_records', 'settlement_order_allocations', 'expenses',
          'cash_movements', 'audit_history'
        ])
    ) as passed
  union all
  select 'buying_cost_isolated_from_public_products',
    pg_catalog.to_regclass('public.product_business_data') is not null
    and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'products'
        and column_name in ('buying_price', 'buying_cost', 'unit_cost')
    )
  union all
  select 'stock_acl_remains_service_role_only',
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
  select 'security_definer_functions_have_fixed_search_path', not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prosecdef
      and not exists (
        select 1
        from pg_catalog.unnest(
          coalesce(procedure.proconfig, '{}'::text[])
        ) as setting(value)
        where setting.value like 'search_path=%'
      )
  )
  union all
  select 'set_updated_at_is_invoker_with_pg_catalog_path', coalesce((
    select not procedure.prosecdef
      and procedure.proconfig @> array['search_path=pg_catalog']::text[]
    from pg_catalog.pg_proc as procedure
    where procedure.oid = pg_catalog.to_regprocedure('public.set_updated_at()')
  ), false)
  union all
  select 'five_payment_methods_are_allowed', coalesce((
    select pg_catalog.pg_get_constraintdef(constraint_record.oid)
      like all(array[
        '%cod%', '%bkash%', '%nagad%', '%cash%', '%bank_transfer%'
      ])
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid = 'public.orders'::regclass
      and constraint_record.conname = 'orders_payment_method_allowed'
  ), false)
  union all
  select 'required_reporting_indexes_exist', (
    select count(*) = 8
    from pg_catalog.pg_class as class
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relkind = 'i'
      and class.relname = any(array[
        'products_category_id_idx', 'products_sku_ci_uidx',
        'orders_dashboard_date_status_idx',
        'order_financial_snapshots_order_date_idx',
        'order_financial_snapshots_channel_campaign_idx',
        'daily_ad_spend_date_campaign_idx', 'expenses_date_category_idx',
        'audit_history_record_idx'
      ])
  )
  union all
  select 'required_dashboard_triggers_exist', (
    select count(distinct trigger.tgname) = 6
    from pg_catalog.pg_trigger as trigger
    join pg_catalog.pg_class as class on class.oid = trigger.tgrelid
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public' and not trigger.tgisinternal
      and trigger.tgname = any(array[
        'dashboard_sync_order_compatibility',
        'dashboard_snapshot_new_order_item',
        'dashboard_capture_delivered_snapshot',
        'dashboard_capture_refund_adjustment',
        'order_financial_snapshots_immutable',
        'dashboard_audit_change'
      ])
  )
  union all
  select 'authenticated_has_no_direct_financial_writes',
    not pg_catalog.has_table_privilege(
      'authenticated', 'public.orders', 'INSERT'
    )
    and not pg_catalog.has_table_privilege(
      'authenticated', 'public.orders', 'UPDATE'
    )
    and not pg_catalog.has_table_privilege(
      'authenticated', 'public.orders', 'DELETE'
    )
    and not pg_catalog.has_table_privilege(
      'authenticated',
      'public.order_financial_snapshots',
      'INSERT'
    )
    and not pg_catalog.has_table_privilege(
      'authenticated',
      'public.order_financial_snapshots',
      'UPDATE'
    )
    and not pg_catalog.has_table_privilege(
      'authenticated',
      'public.order_financial_snapshots',
      'DELETE'
    )
    and not pg_catalog.has_table_privilege(
      'authenticated', 'public.audit_history', 'INSERT'
    )
    and not pg_catalog.has_table_privilege(
      'authenticated', 'public.audit_history', 'UPDATE'
    )
    and not pg_catalog.has_table_privilege(
      'authenticated', 'public.audit_history', 'DELETE'
    )
  union all
  select 'financial_views_are_security_invoker', (
    select count(*) = 4
    from pg_catalog.pg_class as class
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = any(array[
        'dashboard_order_financials', 'dashboard_reconciliation',
        'dashboard_daily_financials', 'dashboard_data_quality_checks'
      ])
      and class.reloptions @> array['security_invoker=true']::text[]
  )
)
select check_name, passed
from checks
order by check_name;
