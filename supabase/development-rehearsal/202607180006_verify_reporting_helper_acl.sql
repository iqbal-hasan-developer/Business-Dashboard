-- READ ONLY. DEVELOPMENT SQL EDITOR ONLY.
-- Post-application verifier for canonical follow-up 202607180000.
-- Replace the sentinel only after confirming the visible development breadcrumb.

with gate as (
  select '__CONFIRM_VISIBLE_DEVELOPMENT_BREADCRUMB__'
    = 'NexaNotion Business Dashboard Dev' as confirmed
), expected_helpers(signature, return_type) as (
  values
    ('public.dashboard_money_to_poisha(numeric)'::text, 'bigint'::regtype),
    ('public.dashboard_poisha_to_money(bigint)', 'numeric'::regtype)
), helper_contracts as (
  select
    expected.signature,
    procedure.oid as function_oid,
    procedure.prorettype = expected.return_type
      and not procedure.prosecdef
      and procedure.provolatile = 'i'
      and procedure.proisstrict
      and exists (
        select 1
        from unnest(coalesce(procedure.proconfig, array[]::text[]))
          as configuration
        where configuration = 'search_path=pg_catalog'
      ) as contract_valid
  from expected_helpers as expected
  left join pg_proc as procedure
    on procedure.oid = to_regprocedure(expected.signature)
), helper_acl as (
  select
    signature,
    function_oid,
    case when function_oid is null then false else
      has_function_privilege('authenticated', function_oid, 'EXECUTE')
    end as authenticated_execute,
    case when function_oid is null then false else
      has_function_privilege('anon', function_oid, 'EXECUTE')
    end as anon_execute,
    case when function_oid is null then false else
      has_function_privilege('service_role', function_oid, 'EXECUTE')
    end as service_role_execute
  from helper_contracts
), expected_views(view_name, helper_name) as (
  values
    ('public.dashboard_order_financials'::text, 'dashboard_poisha_to_money'),
    (
      'public.dashboard_product_allocation_reconciliation',
      'dashboard_money_to_poisha'
    ),
    (
      'public.dashboard_product_allocation_data_quality',
      'dashboard_money_to_poisha'
    )
), view_contracts as (
  select
    expected.view_name,
    view_class.oid as view_oid,
    view_class.relkind = 'v'
      and coalesce(view_class.reloptions, array[]::text[])
        @> array['security_invoker=true']
      and position(
        expected.helper_name in pg_get_viewdef(view_class.oid, true)
      ) > 0
      and has_table_privilege(
        'authenticated', view_class.oid, 'SELECT'
      ) as contract_valid
  from expected_views as expected
  left join pg_class as view_class
    on view_class.oid = to_regclass(expected.view_name)
), all_reporting_views as (
  select view_class.oid,
    coalesce(view_class.reloptions, array[]::text[])
      @> array['security_invoker=true'] as security_invoker,
    has_table_privilege(
      'authenticated', view_class.oid, 'SELECT'
    ) as authenticated_select,
    has_table_privilege('anon', view_class.oid, 'SELECT') as anon_select,
    has_table_privilege(
      'service_role', view_class.oid, 'SELECT'
    ) as service_role_select
  from pg_class as view_class
  join pg_namespace as view_schema on view_schema.oid = view_class.relnamespace
  where view_schema.nspname = 'public'
    and view_class.relkind = 'v'
    and view_class.relname in (
      'dashboard_order_financials',
      'dashboard_reconciliation',
      'dashboard_daily_financials',
      'dashboard_data_quality_checks',
      'dashboard_product_allocation_reconciliation',
      'dashboard_product_allocation_data_quality'
    )
), public_execute as (
  select count(*)::bigint as grant_count
  from helper_contracts as helper
  join pg_proc as procedure on procedure.oid = helper.function_oid
  cross join lateral aclexplode(
    coalesce(
      procedure.proacl,
      acldefault('f'::"char", procedure.proowner)
    )
  ) as privilege
  where privilege.grantee = 0
    and privilege.privilege_type = 'EXECUTE'
), unexpected_execute as (
  select count(*)::bigint as grant_count
  from helper_contracts as helper
  join pg_proc as procedure on procedure.oid = helper.function_oid
  cross join lateral aclexplode(
    coalesce(
      procedure.proacl,
      acldefault('f'::"char", procedure.proowner)
    )
  ) as privilege
  where privilege.privilege_type = 'EXECUTE'
    and privilege.grantee not in (
      procedure.proowner,
      'authenticated'::regrole
    )
), product_reporting_contract as (
  select
    procedure.oid as function_oid,
    function_language.lanname = 'plpgsql' as language_valid,
    procedure.prosecdef as security_definer,
    -- Empty GUC values may be catalogued as search_path=""; parse the value.
    (
      select count(*) = 1
      from unnest(coalesce(procedure.proconfig, array[]::text[]))
        as configuration
      where split_part(configuration, '=', 1) = 'search_path'
        and btrim(
          substring(configuration from length('search_path=') + 1),
          '"'
        ) = ''
    ) as fixed_empty_search_path,
    procedure.prosrc
      ~* $role_gate$if\s+not\s+public\.dashboard_has_any_role\s*\($role_gate$
      and procedure.prosrc
        ~* $role_gate$'owner'\s*::\s*public\.dashboard_role$role_gate$
      and procedure.prosrc
        ~* $role_gate$'admin'\s*::\s*public\.dashboard_role$role_gate$
      and procedure.prosrc
        ~* $role_gate$'viewer'\s*::\s*public\.dashboard_role$role_gate$
      and procedure.prosrc
        ~* $role_gate$raise\s+exception\s+'Dashboard reporting access is required\.'$role_gate$
      and procedure.prosrc
        ~* $role_gate$errcode\s*=\s*'42501'$role_gate$
      as role_gate_valid
  from pg_proc as procedure
  join pg_language as function_language
    on function_language.oid = procedure.prolang
  where procedure.oid = to_regprocedure(
    'public.get_dashboard_product_financials(date,date,text,uuid,text,uuid,text,integer,integer)'
  )
), product_reporting_acl as (
  select
    has_function_privilege(
      'authenticated', contract.function_oid, 'EXECUTE'
    ) as authenticated_execute,
    has_function_privilege(
      'anon', contract.function_oid, 'EXECUTE'
    ) as anon_execute,
    has_function_privilege(
      'service_role', contract.function_oid, 'EXECUTE'
    ) as service_role_execute,
    not exists (
      select 1
      from pg_proc as procedure
      cross join lateral aclexplode(
        coalesce(
          procedure.proacl,
          acldefault('f'::"char", procedure.proowner)
        )
      ) as privilege
      where procedure.oid = contract.function_oid
        and privilege.privilege_type = 'EXECUTE'
        and privilege.grantee not in (
          procedure.proowner,
          'authenticated'::regrole
        )
    ) as no_unexpected_execute
  from product_reporting_contract as contract
), checks(check_name, passed) as (
  values
    ('development_breadcrumb_confirmed', (select confirmed from gate)),
    ('two_conversion_helpers_exist',
      (select count(*) from helper_contracts where function_oid is not null) = 2),
    ('conversion_helpers_are_pure_fixed_path_invokers',
      (select count(*) from helper_contracts where contract_valid) = 2),
    ('three_direct_security_invoker_dependencies_preserved',
      (select count(*) from view_contracts where contract_valid) = 3),
    ('six_authenticated_reporting_views_remain_security_invoker',
      (select count(*) from all_reporting_views
       where security_invoker and authenticated_select) = 6),
    ('authenticated_has_required_helper_execute',
      (select count(*) from helper_acl where authenticated_execute) = 2),
    ('anon_has_no_helper_or_financial_access',
      not exists (select 1 from helper_acl where anon_execute)
      and not exists (select 1 from all_reporting_views where anon_select)
      and not has_table_privilege(
        'anon', 'public.product_business_data', 'SELECT'
      )),
    ('service_role_has_no_helper_or_financial_expansion',
      not exists (select 1 from helper_acl where service_role_execute)
      and not exists (
        select 1 from all_reporting_views where service_role_select
      )
      and not has_table_privilege(
        'service_role', 'public.order_item_financial_allocations', 'SELECT'
      )
      and not has_table_privilege(
        'service_role', 'public.inventory_restoration_movements', 'INSERT'
      )),
    ('public_has_no_helper_execute',
      (select grant_count from public_execute) = 0),
    ('helper_execute_acl_has_no_unexpected_grantees',
      (select grant_count from unexpected_execute) = 0),
    ('authenticated_has_no_direct_financial_writes',
      not has_table_privilege(
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
    ('product_reporting_role_gate_and_fixed_path_preserved',
      (select count(*)
       from product_reporting_contract
       where language_valid
         and security_definer
         and fixed_empty_search_path
         and role_gate_valid) = 1
      and (select count(*)
           from product_reporting_acl
           where authenticated_execute
             and not anon_execute
             and not service_role_execute
             and no_unexpected_execute) = 1)
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
