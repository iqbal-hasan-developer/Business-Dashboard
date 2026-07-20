with rpc as (
  select p.oid, p.proname, p.prosecdef, p.proconfig, p.proacl,
    l.lanname,
    pg_catalog.pg_get_functiondef(p.oid) as definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_language l on l.oid = p.prolang
  where n.nspname = 'public'
    and p.oid in (
      to_regprocedure('public.create_dashboard_product(text,text,text,numeric,boolean,uuid,numeric,integer,text,text,text)'),
      to_regprocedure('public.update_dashboard_product(uuid,text,text,text,numeric,boolean,uuid,numeric,integer,text,text,text)')
    )
), detail as (
  select
    count(*) = 2 as two_product_management_rpcs_exist,
    bool_and(
      lanname = 'plpgsql'
      and prosecdef
      and (
        select count(*) = 1
          and bool_and(
            btrim(
              substring(configuration from length('search_path=') + 1),
              '"'
            ) = ''
          )
        from unnest(coalesce(proconfig, array[]::text[])) as configuration
        where split_part(configuration, '=', 1) = 'search_path'
      )
    )
      as product_rpcs_are_fixed_path_definers,
    bool_and(definition like '%dashboard_has_any_role(%'
      and definition like '%owner%admin%'
      and definition like '%42501%') as owner_admin_role_gate_preserved,
    bool_and(has_function_privilege('authenticated', oid, 'EXECUTE'))
      and bool_and(not has_function_privilege('anon', oid, 'EXECUTE'))
      and bool_and(not has_function_privilege('service_role', oid, 'EXECUTE'))
      and bool_and(not has_function_privilege('public', oid, 'EXECUTE'))
      as product_rpc_acl_is_authenticated_only,
    bool_and(definition not like '%stock =%')
      and bool_or(proname = 'create_dashboard_product' and definition ~ 'p_price,\s*0,')
      as product_rpcs_do_not_mutate_inventory
  from rpc
)
select *,
  two_product_management_rpcs_exist
  and product_rpcs_are_fixed_path_definers
  and owner_admin_role_gate_preserved
  and product_rpc_acl_is_authenticated_only
  and product_rpcs_do_not_mutate_inventory
  and to_regclass('public.products_slug_ci_uidx') is not null
  and not has_table_privilege('authenticated', 'public.products', 'INSERT')
  and not has_table_privilege('authenticated', 'public.products', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.product_business_data', 'INSERT')
  and not has_table_privilege('authenticated', 'public.product_business_data', 'UPDATE')
  as all_checks_passed
from detail;
