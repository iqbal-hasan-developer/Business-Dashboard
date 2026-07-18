-- Canonical least-privilege follow-up for authenticated security-invoker reports.
-- No business DML, inventory mutation, table grant, or service-role expansion.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $reporting_helper_acl_guard$
begin
  if exists (
    select 1
    from (
      values
        ('public.dashboard_money_to_poisha(numeric)'::text, 'bigint'::regtype),
        ('public.dashboard_poisha_to_money(bigint)', 'numeric'::regtype)
    ) as expected(signature, return_type)
    left join pg_proc as procedure
      on procedure.oid = to_regprocedure(expected.signature)
    where procedure.oid is null
       or procedure.prorettype <> expected.return_type
       or procedure.prosecdef
       or procedure.provolatile <> 'i'
       or not procedure.proisstrict
       or not exists (
         select 1
         from unnest(coalesce(procedure.proconfig, array[]::text[]))
           as configuration
         where configuration = 'search_path=pg_catalog'
       )
  ) then
    raise exception 'Reporting conversion helper contract is missing or unsafe.';
  end if;

  if to_regclass('public.dashboard_order_financials') is null
     or to_regclass('public.dashboard_reconciliation') is null
     or to_regclass('public.dashboard_daily_financials') is null
     or to_regclass('public.dashboard_data_quality_checks') is null
     or to_regclass('public.dashboard_product_allocation_reconciliation') is null
     or to_regclass('public.dashboard_product_allocation_data_quality') is null then
    raise exception 'Expected authenticated reporting views are missing.';
  end if;

  if (
    select count(*)
    from pg_class
    where oid in (
      'public.dashboard_order_financials'::regclass,
      'public.dashboard_reconciliation'::regclass,
      'public.dashboard_daily_financials'::regclass,
      'public.dashboard_data_quality_checks'::regclass,
      'public.dashboard_product_allocation_reconciliation'::regclass,
      'public.dashboard_product_allocation_data_quality'::regclass
    )
      and relkind = 'v'
      and coalesce(reloptions, array[]::text[])
        @> array['security_invoker=true']
  ) <> 6 then
    raise exception 'Authenticated reporting views must remain security invoker.';
  end if;

  if position(
       'dashboard_poisha_to_money'
       in pg_get_viewdef('public.dashboard_order_financials'::regclass, true)
     ) = 0
     or position(
       'dashboard_money_to_poisha'
       in pg_get_viewdef(
         'public.dashboard_product_allocation_reconciliation'::regclass, true
       )
     ) = 0
     or position(
       'dashboard_money_to_poisha'
       in pg_get_viewdef(
         'public.dashboard_product_allocation_data_quality'::regclass, true
       )
     ) = 0 then
    raise exception 'Expected reporting-helper dependencies are missing.';
  end if;

  if not has_table_privilege(
       'authenticated', 'public.dashboard_order_financials', 'SELECT'
     )
     or not has_table_privilege(
       'authenticated',
       'public.dashboard_product_allocation_reconciliation', 'SELECT'
     )
     or not has_table_privilege(
       'authenticated',
       'public.dashboard_product_allocation_data_quality', 'SELECT'
     ) then
    raise exception 'Authenticated reporting view grants are missing.';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.dashboard_money_to_poisha(numeric)', 'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.dashboard_poisha_to_money(bigint)', 'EXECUTE'
     ) then
    raise exception 'Reporting helper ACL drift requires separate review.';
  end if;

  if has_function_privilege(
       'anon', 'public.dashboard_money_to_poisha(numeric)', 'EXECUTE'
     )
     or has_function_privilege(
       'anon', 'public.dashboard_poisha_to_money(bigint)', 'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.dashboard_money_to_poisha(numeric)', 'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.dashboard_poisha_to_money(bigint)', 'EXECUTE'
     ) then
    raise exception 'Protected roles unexpectedly have reporting helper access.';
  end if;

  if exists (
    select 1
    from pg_proc as procedure
    cross join lateral aclexplode(
      coalesce(
        procedure.proacl,
        acldefault('f'::"char", procedure.proowner)
      )
    ) as privilege
    where procedure.oid in (
      'public.dashboard_money_to_poisha(numeric)'::regprocedure,
      'public.dashboard_poisha_to_money(bigint)'::regprocedure
    )
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC unexpectedly has reporting helper access.';
  end if;

  if exists (
    select 1
    from pg_proc as procedure
    cross join lateral aclexplode(
      coalesce(
        procedure.proacl,
        acldefault('f'::"char", procedure.proowner)
      )
    ) as privilege
    where procedure.oid in (
      'public.dashboard_money_to_poisha(numeric)'::regprocedure,
      'public.dashboard_poisha_to_money(bigint)'::regprocedure
    )
      and privilege.privilege_type = 'EXECUTE'
      and privilege.grantee <> procedure.proowner
  ) then
    raise exception 'Unexpected reporting helper grantee requires review.';
  end if;
end
$reporting_helper_acl_guard$;

grant execute on function
  public.dashboard_money_to_poisha(numeric),
  public.dashboard_poisha_to_money(bigint)
to authenticated;

do $reporting_helper_acl_verify$
begin
  if not has_function_privilege(
       'authenticated',
       'public.dashboard_money_to_poisha(numeric)', 'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.dashboard_poisha_to_money(bigint)', 'EXECUTE'
     )
     or has_function_privilege(
       'anon', 'public.dashboard_money_to_poisha(numeric)', 'EXECUTE'
     )
     or has_function_privilege(
       'anon', 'public.dashboard_poisha_to_money(bigint)', 'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.dashboard_money_to_poisha(numeric)', 'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.dashboard_poisha_to_money(bigint)', 'EXECUTE'
     )
     or exists (
       select 1
       from pg_proc as procedure
       cross join lateral aclexplode(
         coalesce(
           procedure.proacl,
           acldefault('f'::"char", procedure.proowner)
         )
       ) as privilege
       where procedure.oid in (
         'public.dashboard_money_to_poisha(numeric)'::regprocedure,
         'public.dashboard_poisha_to_money(bigint)'::regprocedure
       )
         and privilege.privilege_type = 'EXECUTE'
         and privilege.grantee not in (
           procedure.proowner,
           'authenticated'::regrole
         )
     ) then
    raise exception 'Reporting helper ACL verification failed.';
  end if;
end
$reporting_helper_acl_verify$;

commit;
