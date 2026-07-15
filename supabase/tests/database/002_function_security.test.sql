begin;
select no_plan();

select ok(
  not exists (
    select 1
    from pg_proc as procedure
    cross join lateral aclexplode(
      coalesce(
        procedure.proacl,
        acldefault('f'::"char", procedure.proowner)
      )
    ) as privilege
    where procedure.oid =
      'public.decrement_product_stock(uuid,integer)'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute decrement_product_stock'
);
select ok(
  not has_function_privilege(
    'anon', 'public.decrement_product_stock(uuid,integer)', 'EXECUTE'
  ),
  'anon cannot execute decrement_product_stock'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.decrement_product_stock(uuid,integer)',
    'EXECUTE'
  ),
  'authenticated cannot execute decrement_product_stock'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.decrement_product_stock(uuid,integer)',
    'EXECUTE'
  ),
  'service_role can execute decrement_product_stock'
);

select ok(
  not procedure.prosecdef,
  'set_updated_at remains SECURITY INVOKER'
)
from pg_proc as procedure
where procedure.oid = 'public.set_updated_at()'::regprocedure;

select ok(
  procedure.proconfig @> array['search_path=pg_catalog']::text[],
  'set_updated_at has a fixed pg_catalog search_path'
)
from pg_proc as procedure
where procedure.oid = 'public.set_updated_at()'::regprocedure;

select ok(
  not exists (
    select 1
    from pg_proc as procedure
    cross join lateral aclexplode(
      coalesce(
        procedure.proacl,
        acldefault('f'::"char", procedure.proowner)
      )
    ) as privilege
    where procedure.oid = 'public.set_updated_at()'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  )
    and not has_function_privilege(
      'anon', 'public.set_updated_at()', 'EXECUTE'
    )
    and not has_function_privilege(
      'authenticated', 'public.set_updated_at()', 'EXECUTE'
    )
    and has_function_privilege(
      'service_role', 'public.set_updated_at()', 'EXECUTE'
    ),
  'set_updated_at has the intended trigger-function ACL'
);

select ok(
  not exists (
    select 1
    from pg_default_acl as defaults
    cross join lateral aclexplode(defaults.defaclacl) as privilege
    where defaults.defaclobjtype = 'f'
      and defaults.defaclnamespace = 'public'::regnamespace
      and defaults.defaclrole = (
        select proowner from pg_proc
        where oid = 'public.dashboard_current_role()'::regprocedure
      )
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'the migration owner default function ACL does not grant PUBLIC execute'
);

select ok(
  has_function_privilege(
    'authenticated', 'public.create_dashboard_order(jsonb,jsonb)', 'EXECUTE'
  )
    and not has_function_privilege(
      'anon', 'public.create_dashboard_order(jsonb,jsonb)', 'EXECUTE'
    ),
  'authenticated dashboard users reach order creation only through the RPC'
);

select * from finish();
rollback;
