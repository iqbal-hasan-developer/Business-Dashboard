begin;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select ok(
  procedure.prosecdef
    and exists (
      select 1
      from unnest(procedure.proconfig) as setting
      where setting like 'search_path=%'
    ),
  'update_dashboard_order is SECURITY DEFINER with an empty fixed search path'
)
from pg_proc as procedure
where procedure.oid =
  'public.update_dashboard_order(uuid,timestamptz,jsonb,jsonb)'::regprocedure;

select ok(
  has_function_privilege(
    'authenticated',
    'public.update_dashboard_order(uuid,timestamptz,jsonb,jsonb)',
    'EXECUTE'
  )
    and not has_function_privilege(
      'anon',
      'public.update_dashboard_order(uuid,timestamptz,jsonb,jsonb)',
      'EXECUTE'
    )
    and not exists (
      select 1
      from pg_proc as procedure
      cross join lateral aclexplode(
        coalesce(
          procedure.proacl,
          acldefault('f'::"char", procedure.proowner)
        )
      ) as privilege
      where procedure.oid =
        'public.update_dashboard_order(uuid,timestamptz,jsonb,jsonb)'::regprocedure
        and privilege.grantee = 0
        and privilege.privilege_type = 'EXECUTE'
    ),
  'only authenticated dashboard callers can reach the edit RPC'
);

select ok(
  pg_get_functiondef(
    'public.update_dashboard_order(uuid,timestamptz,jsonb,jsonb)'::regprocedure
  ) ~* 'for update'
    and pg_get_functiondef(
      'public.update_dashboard_order(uuid,timestamptz,jsonb,jsonb)'::regprocedure
    ) ~* 'order_financial_snapshots'
    and pg_get_functiondef(
      'public.update_dashboard_order(uuid,timestamptz,jsonb,jsonb)'::regprocedure
    ) ~* 'p_expected_updated_at'
    and pg_get_functiondef(
      'public.update_dashboard_order(uuid,timestamptz,jsonb,jsonb)'::regprocedure
    ) !~* 'update[[:space:]]+public[.]products'
    and pg_get_functiondef(
      'public.update_dashboard_order(uuid,timestamptz,jsonb,jsonb)'::regprocedure
    ) !~* 'decrement_product_stock',
  'the edit RPC locks stale/recognized orders and has no inventory mutation path'
);

select ok(
  pg_get_functiondef(
    'public.update_dashboard_order(uuid,timestamptz,jsonb,jsonb)'::regprocedure
  ) ~* 'insert into public[.]audit_history'
    and pg_get_functiondef(
      'public.update_dashboard_order(uuid,timestamptz,jsonb,jsonb)'::regprocedure
    ) ~* 'changed_fields',
  'the edit RPC writes a minimized field-level audit summary'
);

select * from finish();
rollback;
