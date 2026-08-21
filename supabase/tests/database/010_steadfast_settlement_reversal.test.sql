begin;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_table('public', 'settlement_reversals', 'append-only settlement reversal evidence exists');
select has_column('public', 'settlement_reversals', 'cash_reversal_id', 'settlement reversal links the correcting cash entry');
select has_function('public', 'reverse_steadfast_cod_settlement', array['uuid','date','text','uuid'], 'owner settlement reversal RPC exists');
select ok(
  has_function_privilege('authenticated', 'public.reverse_steadfast_cod_settlement(uuid,date,text,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.reverse_steadfast_cod_settlement(uuid,date,text,uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.reverse_steadfast_cod_settlement(uuid,date,text,uuid)', 'EXECUTE'),
  'only authenticated dashboard callers can reach the reversal RPC'
);
select ok(
  pg_get_functiondef('public.reverse_steadfast_cod_settlement(uuid,date,text,uuid)'::regprocedure) ~* 'array\[''owner''\]'
  and pg_get_functiondef('public.reverse_steadfast_cod_settlement(uuid,date,text,uuid)'::regprocedure) ~* 'for update',
  'settlement reversal is owner-only and locks its evidence'
);
select ok(
  pg_get_functiondef('public.reverse_steadfast_cod_settlement(uuid,date,text,uuid)'::regprocedure) ~* 'insert into public[.]settlement_reversals'
  and pg_get_functiondef('public.reverse_steadfast_cod_settlement(uuid,date,text,uuid)'::regprocedure) ~* 'insert into public[.]cash_movements'
  and pg_get_functiondef('public.reverse_steadfast_cod_settlement(uuid,date,text,uuid)'::regprocedure) !~* 'delete[[:space:]]+from',
  'reversal appends settlement and cash evidence without deleting history'
);
select ok(
  pg_get_functiondef('public.reverse_steadfast_cod_settlement(uuid,date,text,uuid)'::regprocedure) ~* 'settlement_status = ''Awaiting'''
  and pg_get_functiondef('public.reverse_steadfast_cod_settlement(uuid,date,text,uuid)'::regprocedure) !~* 'payment_status[[:space:]]*='
  and pg_get_functiondef('public.reverse_steadfast_cod_settlement(uuid,date,text,uuid)'::regprocedure) !~* 'order_financial_snapshots',
  'reversal restores eligibility without changing payment or financial recognition'
);
select ok(
  pg_get_viewdef('public.dashboard_steadfast_settlement_eligible_orders'::regclass, true) ~* 'settlement_reversals'
  and pg_get_viewdef('public.dashboard_steadfast_settlement_batches'::regclass, true) ~* 'is_reversed',
  'settlement read models distinguish reversed evidence and re-eligibility'
);
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'settlement_order_allocations_order_history_idx')
  and not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'settlement_order_allocations_order_unique'),
  'allocation history permits resettlement only after reversal evidence'
);
select ok(
  pg_get_functiondef('public.reverse_steadfast_cod_settlement(uuid,date,text,uuid)'::regprocedure) !~* 'double precision|[[:space:]]real[[:space:]]',
  'settlement reversal introduces no floating-point financial path'
);

select * from finish();
rollback;
