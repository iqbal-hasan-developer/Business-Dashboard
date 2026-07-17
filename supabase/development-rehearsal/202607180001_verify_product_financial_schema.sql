-- READ ONLY. DEVELOPMENT SQL EDITOR ONLY.
-- Metadata/RLS/ACL verifier for canonical candidate 202607170000.
-- Replace the sentinel only after confirming the visible development breadcrumb.

with gate as (
  select '__CONFIRM_VISIBLE_DEVELOPMENT_BREADCRUMB__'
    = 'NexaNotion Business Dashboard Dev' as confirmed
), expected_functions(signature) as (
  values
    ('public.dashboard_money_to_poisha(numeric)'::text),
    ('public.dashboard_poisha_to_money(bigint)'),
    ('public.dashboard_allocate_poisha(bigint,uuid[],bigint[])'),
    ('public.dashboard_build_item_allocations(uuid)'),
    ('public.dashboard_capture_delivered_snapshot()'),
    ('public.dashboard_validate_refund_adjustment()'),
    ('public.dashboard_allocate_refund_adjustment()'),
    ('public.dashboard_validate_return_event()'),
    ('public.dashboard_allocate_return_event()'),
    ('public.dashboard_capture_refund_adjustment()'),
    ('public.record_dashboard_refund(uuid,numeric,text,text,date,jsonb)'),
    ('public.record_dashboard_return(uuid,text,text,date,jsonb)'),
    ('public.inspect_dashboard_return(uuid,text,text,date)'),
    ('public.dashboard_reject_financial_history_mutation()'),
    ('public.dashboard_write_audit_history()'),
    ('public.get_dashboard_product_financials(date,date,text,uuid,text,uuid,text,integer,integer)')
), function_oids as (
  select signature, to_regprocedure(signature) as function_oid
  from expected_functions
), expected_indexes(index_name) as (
  values
    ('order_financial_adjustments_idempotency_uidx'::text),
    ('order_item_financial_allocations_order_idx'),
    ('order_item_financial_allocations_product_idx'),
    ('order_item_refund_allocations_recognition_idx'),
    ('order_item_refund_allocations_order_idx'),
    ('order_item_return_allocations_recognition_idx'),
    ('order_item_return_allocations_order_idx'),
    ('order_return_events_order_idx'),
    ('order_return_events_created_by_idx'),
    ('order_return_inspections_event_idx'),
    ('order_return_inspections_inspected_by_idx'),
    ('inventory_restoration_movements_inspection_idx'),
    ('inventory_restoration_movements_order_idx'),
    ('inventory_restoration_movements_product_idx')
), checks(check_name, passed) as (
  values
    ('development_breadcrumb_confirmed', (select confirmed from gate)),
    ('six_private_tables_exist',
      to_regclass('public.order_item_financial_allocations') is not null
      and to_regclass('public.order_item_refund_allocations') is not null
      and to_regclass('public.order_return_events') is not null
      and to_regclass('public.order_item_return_allocations') is not null
      and to_regclass('public.order_return_inspections') is not null
      and to_regclass('public.inventory_restoration_movements') is not null),
    ('reporting_views_exist',
      to_regclass('public.dashboard_order_financials') is not null
      and to_regclass(
        'public.dashboard_product_allocation_reconciliation'
      ) is not null
      and to_regclass(
        'public.dashboard_product_allocation_data_quality'
      ) is not null),
    ('all_expected_functions_exist',
      (select count(*) from function_oids where function_oid is not null) = 16),
    ('all_functions_have_fixed_search_paths',
      not exists (
        select 1
        from function_oids as expected
        left join pg_proc as procedure on procedure.oid = expected.function_oid
        where procedure.oid is null
           or not exists (
             select 1
             from unnest(coalesce(procedure.proconfig, array[]::text[]))
               as configuration
             where configuration like 'search_path=%'
           )
      )),
    ('private_tables_have_rls',
      (select count(*)
       from pg_class
       where oid in (
         'public.order_item_financial_allocations'::regclass,
         'public.order_item_refund_allocations'::regclass,
         'public.order_return_events'::regclass,
         'public.order_item_return_allocations'::regclass,
         'public.order_return_inspections'::regclass,
         'public.inventory_restoration_movements'::regclass
       ) and relrowsecurity) = 6),
    ('six_owner_admin_read_policies_exist',
      (select count(*) from pg_policies
       where schemaname = 'public'
         and tablename in (
           'order_item_financial_allocations',
           'order_item_refund_allocations', 'order_return_events',
           'order_item_return_allocations', 'order_return_inspections',
           'inventory_restoration_movements'
         )
         and cmd = 'SELECT'
         and roles = array['authenticated']::name[]
         and qual like '%owner%'
         and qual like '%admin%') = 6),
    ('anon_has_no_financial_access',
      not has_table_privilege(
        'anon', 'public.order_item_financial_allocations', 'SELECT'
      )
      and not has_table_privilege(
        'anon', 'public.order_item_refund_allocations', 'SELECT'
      )
      and not has_table_privilege(
        'anon', 'public.order_return_events', 'SELECT'
      )
      and not has_table_privilege(
        'anon', 'public.inventory_restoration_movements', 'SELECT'
      )
      and not has_table_privilege(
        'anon', 'public.dashboard_product_allocation_reconciliation', 'SELECT'
      )
      and not has_table_privilege(
        'anon', 'public.product_business_data', 'SELECT'
      )
      and not has_function_privilege(
        'anon',
        'public.get_dashboard_product_financials(date,date,text,uuid,text,uuid,text,integer,integer)',
        'EXECUTE'
      )),
    ('authenticated_has_read_only_ledger_access',
      has_table_privilege(
        'authenticated', 'public.order_item_financial_allocations', 'SELECT'
      )
      and not has_table_privilege(
        'authenticated', 'public.order_item_financial_allocations', 'INSERT'
      )
      and not has_table_privilege(
        'authenticated', 'public.order_item_refund_allocations', 'INSERT'
      )
      and not has_table_privilege(
        'authenticated', 'public.order_return_events', 'INSERT'
      )
      and not has_table_privilege(
        'authenticated', 'public.inventory_restoration_movements', 'INSERT'
      )),
    ('authenticated_public_rpcs_only',
      has_function_privilege(
        'authenticated',
        'public.record_dashboard_refund(uuid,numeric,text,text,date,jsonb)',
        'EXECUTE'
      )
      and has_function_privilege(
        'authenticated',
        'public.record_dashboard_return(uuid,text,text,date,jsonb)', 'EXECUTE'
      )
      and has_function_privilege(
        'authenticated',
        'public.inspect_dashboard_return(uuid,text,text,date)', 'EXECUTE'
      )
      and has_function_privilege(
        'authenticated',
        'public.get_dashboard_product_financials(date,date,text,uuid,text,uuid,text,integer,integer)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'authenticated',
        'public.dashboard_build_item_allocations(uuid)', 'EXECUTE'
      )
      and not has_function_privilege(
        'authenticated',
        'public.dashboard_allocate_refund_adjustment()', 'EXECUTE'
      )),
    ('service_role_has_no_direct_financial_access',
      not has_table_privilege(
        'service_role', 'public.order_financial_snapshots', 'SELECT'
      )
      and not has_table_privilege(
        'service_role', 'public.order_financial_adjustments', 'INSERT'
      )
      and not has_table_privilege(
        'service_role', 'public.order_item_financial_allocations', 'SELECT'
      )
      and not has_table_privilege(
        'service_role', 'public.inventory_restoration_movements', 'INSERT'
      )
      and not has_function_privilege(
        'service_role',
        'public.record_dashboard_refund(uuid,numeric,text,text,date,jsonb)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'service_role',
        'public.get_dashboard_product_financials(date,date,text,uuid,text,uuid,text,integer,integer)',
        'EXECUTE'
      )),
    ('website_trigger_path_preserved',
      has_table_privilege('service_role', 'public.orders', 'INSERT')
      and has_table_privilege('service_role', 'public.orders', 'UPDATE')
      and has_table_privilege('service_role', 'public.order_items', 'INSERT')
      and has_function_privilege(
        'service_role',
        'public.dashboard_capture_delivered_snapshot()', 'EXECUTE'
      )
      and has_function_privilege(
        'service_role',
        'public.dashboard_capture_refund_adjustment()', 'EXECUTE'
      )),
    ('reporting_views_are_security_invoker',
      (select count(*) from pg_class
       where oid in (
         'public.dashboard_order_financials'::regclass,
         'public.dashboard_product_allocation_reconciliation'::regclass,
         'public.dashboard_product_allocation_data_quality'::regclass
       )
       and coalesce(reloptions, array[]::text[])
         @> array['security_invoker=true']) = 3),
    ('required_indexes_exist',
      (select count(*)
       from expected_indexes as expected
       join pg_indexes as installed
         on installed.schemaname = 'public'
        and installed.indexname = expected.index_name) = 14),
    ('refund_and_return_locking_present',
      position('for update' in lower(pg_get_functiondef(
        'public.dashboard_validate_refund_adjustment()'::regprocedure
      ))) > 0
      and position('for update' in lower(pg_get_functiondef(
        'public.dashboard_validate_return_event()'::regprocedure
      ))) > 0
      and exists (
        select 1 from pg_indexes
        where schemaname = 'public'
          and indexname = 'order_financial_adjustments_idempotency_uidx'
          and indexdef ilike '%unique%'
      )),
    ('no_inventory_mutation_in_financial_functions',
      not exists (
        select 1
        from function_oids as expected
        join pg_proc as procedure on procedure.oid = expected.function_oid
        where pg_get_functiondef(procedure.oid)
          ~* 'decrement_product_stock\s*\('
           or pg_get_functiondef(procedure.oid)
          ~* 'update\s+public\.products\s+set\s+stock'
      )),
    ('product_allocation_history_starts_empty',
      (select count(*) from public.order_item_financial_allocations) = 0
      and (select count(*) from public.order_item_refund_allocations) = 0
      and (select count(*) from public.order_return_events) = 0
      and (select count(*) from public.inventory_restoration_movements) = 0)
), gated_checks as (
  select check_name, passed and (select confirmed from gate) as passed
  from checks
)
select check_name, passed
from gated_checks
union all
select 'all_checks_passed', bool_and(passed)
from gated_checks
order by check_name;
