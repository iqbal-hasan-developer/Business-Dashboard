begin;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_column('public', 'cash_movements', 'correction_of_id', 'corrected owner capital links to its original record');
select has_function(
  'public',
  'edit_dashboard_owner_capital_movement',
  array['uuid','date','text','text','numeric','text','text','text','text','uuid'],
  'atomic owner-capital edit RPC exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.edit_dashboard_owner_capital_movement(uuid,date,text,text,numeric,text,text,text,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.edit_dashboard_owner_capital_movement(uuid,date,text,text,numeric,text,text,text,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.edit_dashboard_owner_capital_movement(uuid,date,text,text,numeric,text,text,text,text,uuid)',
    'EXECUTE'
  ),
  'only authenticated dashboard callers can reach the owner-capital edit RPC'
);
select ok(
  pg_get_functiondef(
    'public.edit_dashboard_owner_capital_movement(uuid,date,text,text,numeric,text,text,text,text,uuid)'::regprocedure
  ) ~* 'array\[''owner''\]'
  and pg_get_functiondef(
    'public.edit_dashboard_owner_capital_movement(uuid,date,text,text,numeric,text,text,text,text,uuid)'::regprocedure
  ) ~* 'for update',
  'owner-capital edits are owner-only and lock the original record'
);
select ok(
  (
    select count(*) = 2
    from regexp_matches(
      pg_get_functiondef(
        'public.edit_dashboard_owner_capital_movement(uuid,date,text,text,numeric,text,text,text,text,uuid)'::regprocedure
      ),
      'insert into public[.]cash_movements',
      'gi'
    )
  )
  and pg_get_functiondef(
    'public.edit_dashboard_owner_capital_movement(uuid,date,text,text,numeric,text,text,text,text,uuid)'::regprocedure
  ) !~* 'update[[:space:]]+public[.]cash_movements'
  and pg_get_functiondef(
    'public.edit_dashboard_owner_capital_movement(uuid,date,text,text,numeric,text,text,text,text,uuid)'::regprocedure
  ) !~* 'delete[[:space:]]+from[[:space:]]+public[.]cash_movements',
  'edit appends a reversal and replacement without rewriting ledger history'
);
select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'cash_movements_correction_unique'
  )
  and pg_get_functiondef(
    'public.edit_dashboard_owner_capital_movement(uuid,date,text,text,numeric,text,text,text,text,uuid)'::regprocedure
  ) ~* 'pg_advisory_xact_lock',
  'one correction per source and request idempotency are enforced'
);
select ok(
  pg_get_functiondef(
    'public.edit_dashboard_owner_capital_movement(uuid,date,text,text,numeric,text,text,text,text,uuid)'::regprocedure
  ) !~* 'double precision|[[:space:]]real[[:space:]]'
  and pg_get_functiondef(
    'public.edit_dashboard_owner_capital_movement(uuid,date,text,text,numeric,text,text,text,text,uuid)'::regprocedure
  ) ~* 'trunc\(p_amount, 2\)',
  'owner-capital corrections use exact database money without floating point'
);
select ok(
  pg_get_viewdef('public.dashboard_cash_ledger'::regclass, true) ~* 'correction_of_id',
  'the ledger read model exposes correction lineage'
);
select ok(
  pg_get_functiondef(
    'public.edit_dashboard_owner_capital_movement(uuid,date,text,text,numeric,text,text,text,text,uuid)'::regprocedure
  ) !~* 'update[[:space:]]+public[.](orders|products|order_financial_snapshots)',
  'owner-capital correction cannot change orders, inventory, or recognition'
);

select * from finish();
rollback;
