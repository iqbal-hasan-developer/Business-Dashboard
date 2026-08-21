begin;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_column('public', 'cash_movements', 'transaction_type', 'cash entries are classified');
select has_column('public', 'cash_movements', 'reversal_of_id', 'cash reversals link to their original entry');
select has_column('public', 'cash_movements', 'idempotency_key', 'cash entries carry idempotency evidence');
select has_view('public', 'dashboard_cash_ledger', 'authoritative cash ledger view exists');
select has_view('public', 'dashboard_cash_account_balances', 'account balance view exists');
select has_function('public', 'record_dashboard_cash_movement', array['date','text','text','numeric','text','text','text','uuid'], 'idempotent manual cash RPC exists');
select has_function('public', 'reverse_dashboard_cash_movement', array['uuid','text','uuid'], 'append-only reversal RPC exists');

select ok(
  has_function_privilege('authenticated', 'public.record_dashboard_cash_movement(date,text,text,numeric,text,text,text,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.record_dashboard_cash_movement(date,text,text,numeric,text,text,text,uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.record_dashboard_cash_movement(date,text,text,numeric,text,text,text,uuid)', 'EXECUTE'),
  'only authenticated dashboard callers can reach the manual cash RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.reverse_dashboard_cash_movement(uuid,text,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.reverse_dashboard_cash_movement(uuid,text,uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.reverse_dashboard_cash_movement(uuid,text,uuid)', 'EXECUTE'),
  'only authenticated dashboard callers can reach the owner reversal RPC'
);
select ok(
  not has_function_privilege('authenticated', 'public.record_cash_movement(date,text,text,numeric,text,uuid,uuid,uuid)', 'EXECUTE'),
  'the legacy unclassified cash RPC is retired'
);
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'cash_movements_idempotency_key_unique')
  and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'cash_movements_reversal_unique'),
  'idempotency and one-reversal-only indexes are installed'
);
select ok(
  pg_get_functiondef('public.record_dashboard_cash_movement(date,text,text,numeric,text,text,text,uuid)'::regprocedure) !~* 'double precision|[[:space:]]real[[:space:]]'
  and pg_get_functiondef('public.reverse_dashboard_cash_movement(uuid,text,uuid)'::regprocedure) !~* 'double precision|[[:space:]]real[[:space:]]',
  'cash workflow uses exact database money without floating point'
);
select ok(
  pg_get_functiondef('public.reverse_dashboard_cash_movement(uuid,text,uuid)'::regprocedure) ~* 'insert into public[.]cash_movements'
  and pg_get_functiondef('public.reverse_dashboard_cash_movement(uuid,text,uuid)'::regprocedure) !~* 'update[[:space:]]+public[.]cash_movements'
  and pg_get_functiondef('public.reverse_dashboard_cash_movement(uuid,text,uuid)'::regprocedure) !~* 'delete[[:space:]]+from[[:space:]]+public[.]cash_movements',
  'corrections append a reversal and never rewrite ledger history'
);
select ok(
  pg_get_viewdef('public.dashboard_cash_ledger'::regclass, true) ~* 'sum'
  and pg_get_viewdef('public.dashboard_cash_ledger'::regclass, true) ~* 'running_balance',
  'cash ledger computes signed running balances server-side'
);
select ok(
  pg_get_functiondef('public.reverse_dashboard_cash_movement(uuid,text,uuid)'::regprocedure) !~* 'update[[:space:]]+public[.](orders|products|order_financial_snapshots)'
  and pg_get_functiondef('public.record_dashboard_cash_movement(date,text,text,numeric,text,text,text,uuid)'::regprocedure) !~* 'update[[:space:]]+public[.](orders|products|order_financial_snapshots)',
  'cash workflow cannot change orders, inventory, or financial recognition'
);

select * from finish();
rollback;
