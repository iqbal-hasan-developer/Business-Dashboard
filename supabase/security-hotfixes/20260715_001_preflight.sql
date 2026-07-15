-- REVIEW ONLY: metadata-only preflight for the production privilege hotfix.
-- This script does not call the function or read/change product data.

-- 1. Verify the exact overload and security properties. This returns a hash of
--    the definition, never the definition itself. Record the hash for comparison
--    with the post-application verification output.
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

-- Expected: exactly one row, result_type = boolean, security_definer = true.

-- 2. Verify that all required Supabase roles exist.
select
  requested_role,
  pg_catalog.to_regrole(requested_role) is not null as role_exists
from (
  values ('anon'), ('authenticated'), ('service_role')
) as required_roles(requested_role)
order by requested_role;

-- Expected: three rows with role_exists = true.

-- 3. Enumerate every direct ACL entry on the exact overload. This exposes role
--    names and privilege metadata only; it does not expose credentials.
with target as (
  select
    p.proowner,
    p.proacl
  from pg_catalog.pg_proc as p
  where p.oid = pg_catalog.to_regprocedure(
    'public.decrement_product_stock(uuid,integer)'
  )
)
select
  case
    when acl.grantee = 0 then 'PUBLIC'
    else pg_catalog.pg_get_userbyid(acl.grantee)
  end as grantee,
  pg_catalog.pg_get_userbyid(acl.grantor) as grantor,
  acl.privilege_type,
  acl.is_grantable
from target as t
cross join lateral pg_catalog.aclexplode(
  coalesce(
    t.proacl,
    pg_catalog.acldefault('f'::"char", t.proowner)
  )
) as acl
order by grantee, acl.privilege_type;

-- Review any grantee outside the function owner, PUBLIC, anon, authenticated,
-- and service_role before applying the deliberately minimal hotfix.

-- 4. Show direct and effective EXECUTE privileges for only the principals in
--    scope. PUBLIC is represented by ACL grantee OID zero. No role passwords,
--    memberships, credentials, or function definition text are returned.
with target as (
  select
    p.oid as function_oid,
    p.proowner,
    p.proacl
  from pg_catalog.pg_proc as p
  where p.oid = pg_catalog.to_regprocedure(
    'public.decrement_product_stock(uuid,integer)'
  )
), principals(principal, role_oid) as (
  values
    ('PUBLIC'::text, 0::oid),
    ('anon', pg_catalog.to_regrole('anon')::oid),
    ('authenticated', pg_catalog.to_regrole('authenticated')::oid),
    ('service_role', pg_catalog.to_regrole('service_role')::oid)
), acl_entries as (
  select
    acl.grantee,
    acl.privilege_type,
    acl.is_grantable
  from target as t
  cross join lateral pg_catalog.aclexplode(
    coalesce(
      t.proacl,
      pg_catalog.acldefault('f'::"char", t.proowner)
    )
  ) as acl
), direct_privileges as (
  select
    p.principal,
    p.role_oid,
    coalesce(
      bool_or(
        a.grantee = p.role_oid
        and a.privilege_type = 'EXECUTE'
      ),
      false
    ) as direct_execute,
    coalesce(
      bool_or(
        a.grantee = p.role_oid
        and a.privilege_type = 'EXECUTE'
        and a.is_grantable
      ),
      false
    ) as execute_is_grantable
  from principals as p
  left join acl_entries as a
    on a.grantee = p.role_oid
  group by p.principal, p.role_oid
)
select
  d.principal,
  d.direct_execute,
  case
    when d.principal = 'PUBLIC' then d.direct_execute
    else pg_catalog.has_function_privilege(
      d.role_oid,
      t.function_oid,
      'EXECUTE'
    )
  end as effective_execute,
  d.execute_is_grantable
from direct_privileges as d
cross join target as t
order by case d.principal
  when 'PUBLIC' then 1
  when 'anon' then 2
  when 'authenticated' then 3
  when 'service_role' then 4
end;
