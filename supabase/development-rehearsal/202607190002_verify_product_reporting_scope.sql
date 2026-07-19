-- DEVELOPMENT SQL EDITOR ONLY. Read-only verifier for 202607190000.
do $development_gate$
begin
  if '__CONFIRM_VISIBLE_DEVELOPMENT_BREADCRUMB__'
     is distinct from 'NexaNotion Business Dashboard Dev' then
    raise exception 'Development breadcrumb confirmation is missing.';
  end if;
end
$development_gate$;

with reporting_rpc as (
  select
    procedure.oid,
    procedure.proowner,
    procedure.prosecdef,
    procedure.proconfig,
    procedure.prosrc
  from pg_proc as procedure
  where procedure.oid = to_regprocedure(
    'public.get_dashboard_product_financials(date,date,text,uuid,text,uuid,text,integer,integer)'
  )
), contract as (
  select
    count(*) = 1 as rpc_exists,
    count(*) filter (
      where reporting_rpc.prosecdef
        and (
          select count(*) = 1
          from unnest(coalesce(reporting_rpc.proconfig, array[]::text[]))
            as configuration
          where split_part(configuration, '=', 1) = 'search_path'
            and btrim(
              substring(configuration from length('search_path=') + 1),
              '"'
            ) = ''
        )
        and reporting_rpc.prosrc
          ~* 'public\.dashboard_has_any_role\s*\('
        and reporting_rpc.prosrc
          ~* '''owner''\s*::\s*public\.dashboard_role'
        and reporting_rpc.prosrc
          ~* '''admin''\s*::\s*public\.dashboard_role'
        and reporting_rpc.prosrc
          ~* '''viewer''\s*::\s*public\.dashboard_role'
        and reporting_rpc.prosrc ~* 'errcode\s*=\s*''42501'''
    ) = 1 as security_contract_preserved,
    count(*) filter (
      where reporting_rpc.prosrc
          ~* 'from\s+public\.order_item_financial_allocations\s+as\s+scoped_allocation'
        and reporting_rpc.prosrc
          ~* 'scoped_allocation\.order_id\s*=\s*snapshot\.order_id'
        and reporting_rpc.prosrc
          ~* 'scoped_allocation\.product_id_snapshot\s*=\s*p_product_id'
        and reporting_rpc.prosrc
          ~* 'lower\s*\(\s*scoped_allocation\.sku_snapshot\s*\)\s*=\s*lower\s*\(\s*p_sku\s*\)'
        and reporting_rpc.prosrc
          !~* 'from\s+public\.order_items\s+as\s+item'
    ) = 1 as immutable_fail_closed_scope_installed,
    count(*) filter (
      where reporting_rpc.prosrc
          ~* 'snapshot\.order_date\s*>=\s*p_start_date'
        and reporting_rpc.prosrc
          ~* 'snapshot\.order_date\s*<=\s*p_end_date'
        and reporting_rpc.prosrc
          ~* 'lower\s*\(\s*snapshot\.sales_channel\s*\)\s*=\s*lower\s*\(\s*p_sales_channel\s*\)'
        and reporting_rpc.prosrc
          ~* 'snapshot\.campaign_id\s*=\s*p_campaign_id'
        and reporting_rpc.prosrc
          ~* 'allocation\.product_id_snapshot\s*=\s*p_product_id'
        and reporting_rpc.prosrc
          ~* 'lower\s*\(\s*allocation\.sku_snapshot\s*\)\s*=\s*lower\s*\(\s*p_sku\s*\)'
    ) = 1 as guard_and_result_filters_consistent
  from reporting_rpc
), public_execute as (
  select count(*)::bigint as grant_count
  from reporting_rpc
  join pg_proc as procedure on procedure.oid = reporting_rpc.oid
  cross join lateral aclexplode(
    coalesce(procedure.proacl, acldefault('f'::"char", procedure.proowner))
  ) as privilege
  where privilege.grantee = 0
    and privilege.privilege_type = 'EXECUTE'
), unexpected_execute as (
  select count(*)::bigint as grant_count
  from reporting_rpc
  join pg_proc as procedure on procedure.oid = reporting_rpc.oid
  cross join lateral aclexplode(
    coalesce(procedure.proacl, acldefault('f'::"char", procedure.proowner))
  ) as privilege
  where privilege.privilege_type = 'EXECUTE'
    and privilege.grantee not in (
      procedure.proowner,
      'authenticated'::regrole
    )
), checks(check_name, passed) as (
  values
    ('development_breadcrumb_confirmed', true),
    ('product_reporting_rpc_exists', (select rpc_exists from contract)),
    ('product_reporting_security_contract_preserved',
      (select security_contract_preserved from contract)),
    ('immutable_allocation_fail_closed_scope_installed',
      (select immutable_fail_closed_scope_installed from contract)),
    ('guard_and_result_filters_are_consistent',
      (select guard_and_result_filters_consistent from contract)),
    ('product_reporting_acl_remains_authenticated_only',
      has_function_privilege(
        'authenticated',
        'public.get_dashboard_product_financials(date,date,text,uuid,text,uuid,text,integer,integer)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        'public.get_dashboard_product_financials(date,date,text,uuid,text,uuid,text,integer,integer)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'service_role',
        'public.get_dashboard_product_financials(date,date,text,uuid,text,uuid,text,integer,integer)',
        'EXECUTE'
      )
      and (select grant_count from public_execute) = 0
      and (select grant_count from unexpected_execute) = 0),
    ('authenticated_financial_writes_remain_denied',
      not has_table_privilege(
        'authenticated', 'public.order_item_financial_allocations', 'INSERT'
      )
      and not has_table_privilege(
        'authenticated', 'public.order_item_refund_allocations', 'INSERT'
      )
      and not has_table_privilege(
        'authenticated', 'public.inventory_restoration_movements', 'INSERT'
      ))
), gated_checks as (
  select check_name, passed
  from checks
)
select check_name, passed
from gated_checks
union all
select 'all_checks_passed', bool_and(passed)
from gated_checks
order by check_name;
