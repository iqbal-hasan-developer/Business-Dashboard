-- DEVELOPMENT SQL EDITOR ONLY. Read-only preflight for 202607190000.
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
          ~* 'from\s+public\.order_items\s+as\s+item'
        and reporting_rpc.prosrc
          ~* 'item\.product_id\s*=\s*p_product_id'
        and reporting_rpc.prosrc
          ~* 'lower\s*\(\s*item\.sku_snapshot\s*\)\s*=\s*lower\s*\(\s*p_sku\s*\)'
        and reporting_rpc.prosrc !~* 'from\s+public\.order_item_financial_allocations\s+as\s+scoped_allocation'
    ) = 1 as mutable_guard_defect_confirmed,
    count(*) filter (
      where reporting_rpc.prosrc
          ~* 'snapshot\.order_date\s*>=\s*p_start_date'
        and reporting_rpc.prosrc
          ~* 'snapshot\.order_date\s*<=\s*p_end_date'
        and reporting_rpc.prosrc
          ~* 'lower\s*\(\s*snapshot\.sales_channel\s*\)\s*=\s*lower\s*\(\s*p_sales_channel\s*\)'
        and reporting_rpc.prosrc
          ~* 'snapshot\.campaign_id\s*=\s*p_campaign_id'
    ) = 1 as shared_non_product_filters_preserved
  from reporting_rpc
), immutable_columns as (
  select count(*) = 3 as available
  from pg_attribute
  where attrelid = to_regclass('public.order_item_financial_allocations')
    and attname in ('order_id', 'product_id_snapshot', 'sku_snapshot')
    and attnum > 0
    and not attisdropped
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
    ('mutable_order_item_guard_defect_confirmed',
      (select mutable_guard_defect_confirmed from contract)),
    ('shared_non_product_filters_preserved',
      (select shared_non_product_filters_preserved from contract)),
    ('immutable_allocation_scope_columns_available',
      (select available from immutable_columns)),
    ('product_reporting_acl_is_authenticated_only',
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
      and (select grant_count from unexpected_execute) = 0)
), results as (
  select check_name, passed, not passed as stop_required
  from checks
)
select check_name, passed, stop_required
from results
union all
select
  'followup_application_allowed',
  bool_and(passed),
  not bool_and(passed)
from results
order by check_name;
