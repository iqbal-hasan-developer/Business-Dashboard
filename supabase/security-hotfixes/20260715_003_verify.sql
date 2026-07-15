-- READ ONLY: post-application verification for the stock-function ACL hotfix.
-- This script does not call the function or read/change product data.

-- 1. Confirm the exact function still has the same body/security metadata.
--    Compare definition_fingerprint with the recorded preflight fingerprint.
with target as (
  select
    p.oid,
    n.nspname as schema_name,
    p.proname as function_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
    pg_catalog.pg_get_function_result(p.oid) as result_type,
    l.lanname as language_name,
    p.prosecdef as security_definer,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) as definition_fingerprint
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n
    on n.oid = p.pronamespace
  join pg_catalog.pg_language as l
    on l.oid = p.prolang
  where p.oid = pg_catalog.to_regprocedure(
    'public.decrement_product_stock(uuid,integer)'
  )
)
select
  schema_name,
  function_name,
  identity_arguments,
  result_type,
  language_name,
  security_definer,
  definition_fingerprint
from target;

-- Expected: exactly one row and the same fingerprint as preflight.

-- 2. Prove the required effective privilege result without invoking the RPC.
with target as (
  select
    p.oid as function_oid,
    p.proowner,
    p.proacl
  from pg_catalog.pg_proc as p
  where p.oid = pg_catalog.to_regprocedure(
    'public.decrement_product_stock(uuid,integer)'
  )
), principals(principal, role_oid, expected_execute, display_order) as (
  values
    ('PUBLIC'::text, 0::oid, false, 1),
    ('anon', pg_catalog.to_regrole('anon')::oid, false, 2),
    ('authenticated', pg_catalog.to_regrole('authenticated')::oid, false, 3),
    ('service_role', pg_catalog.to_regrole('service_role')::oid, true, 4)
), acl_entries as (
  select
    acl.grantee,
    acl.privilege_type
  from target as t
  cross join lateral pg_catalog.aclexplode(
    coalesce(
      t.proacl,
      pg_catalog.acldefault('f'::"char", t.proowner)
    )
  ) as acl
), evaluated as (
  select
    p.principal,
    p.expected_execute,
    p.display_order,
    case
      when t.function_oid is null then null
      when p.principal = 'PUBLIC' then coalesce(
        (
          select bool_or(
            a.grantee = 0
            and a.privilege_type = 'EXECUTE'
          )
          from acl_entries as a
        ),
        false
      )
      else pg_catalog.has_function_privilege(
        p.role_oid,
        t.function_oid,
        'EXECUTE'
      )
    end as effective_execute,
    t.function_oid is not null as function_exists
  from principals as p
  left join target as t
    on true
)
select
  principal,
  effective_execute,
  expected_execute,
  function_exists
    and effective_execute is not distinct from expected_execute as check_passed
from evaluated
order by display_order;

-- Required result: four rows and check_passed = true for every row.
