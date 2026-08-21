begin;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_table('public','owner_money_taken_events','owner money taken has a normalized immutable master event');
select has_view('public','dashboard_owner_money_taken_history','owner money taken has a private history read model');
select has_view('public','dashboard_owner_position_daily','owner position changes are available by business date');
select has_function('public','record_owner_money_taken',array['date','text','numeric','text','text','text','uuid'],'posting is atomic');
select has_function('public','reverse_owner_money_taken',array['uuid','date','text','uuid'],'reversal is atomic');

select ok(
  (select relrowsecurity from pg_class where oid='public.owner_money_taken_events'::regclass)
  and not has_table_privilege('anon','public.owner_money_taken_events','SELECT')
  and not has_table_privilege('authenticated','public.owner_money_taken_events','INSERT')
  and not has_table_privilege('authenticated','public.owner_money_taken_events','UPDATE')
  and not has_table_privilege('authenticated','public.owner_money_taken_events','DELETE'),
  'RLS and privileges prevent direct financial mutation'
);
select ok(
  has_function_privilege('authenticated','public.record_owner_money_taken(date,text,numeric,text,text,text,uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.reverse_owner_money_taken(uuid,date,text,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.record_owner_money_taken(date,text,numeric,text,text,text,uuid)','EXECUTE')
  and not has_function_privilege('service_role','public.record_owner_money_taken(date,text,numeric,text,text,text,uuid)','EXECUTE'),
  'only authenticated dashboard callers can reach the guarded workflow'
);
select ok(
  exists (select 1 from pg_trigger where tgrelid='public.owner_money_taken_events'::regclass and tgname='owner_money_taken_events_immutable' and not tgisinternal)
  and exists (select 1 from pg_trigger where tgrelid='public.cash_movements'::regclass and tgname='dashboard_require_owner_money_taken_workflow' and not tgisinternal),
  'master events are immutable and legacy owner withdrawals are blocked'
);
select ok(
  pg_get_functiondef('public.record_owner_money_taken(date,text,numeric,text,text,text,uuid)'::regprocedure) ~* 'least\(p_amount, greatest'
  and pg_get_functiondef('public.record_owner_money_taken(date,text,numeric,text,text,text,uuid)'::regprocedure) ~* 'insert into public[.]cash_movements'
  and pg_get_functiondef('public.record_owner_money_taken(date,text,numeric,text,text,text,uuid)'::regprocedure) ~* 'insert into public[.]owner_capital_return_events'
  and pg_get_functiondef('public.record_owner_money_taken(date,text,numeric,text,text,text,uuid)'::regprocedure) ~* 'insert into public[.]owner_held_fund_events'
  and pg_get_functiondef('public.record_owner_money_taken(date,text,numeric,text,text,text,uuid)'::regprocedure) ~* 'pg_advisory_xact_lock'
  and pg_get_functiondef('public.record_owner_money_taken(date,text,numeric,text,text,text,uuid)'::regprocedure) !~* 'double precision|[[:space:]]real[[:space:]]',
  'posting classifies exact money under a serialized transaction'
);
select ok(
  pg_get_functiondef('public.reverse_owner_money_taken(uuid,date,text,uuid)'::regprocedure) ~* 'insert into public[.]cash_movements'
  and pg_get_functiondef('public.reverse_owner_money_taken(uuid,date,text,uuid)'::regprocedure) ~* 'insert into public[.]owner_money_taken_events'
  and pg_get_functiondef('public.reverse_owner_money_taken(uuid,date,text,uuid)'::regprocedure) !~* 'delete[[:space:]]+from',
  'reversal appends linked counter-effects without deleting history'
);

select * from finish();
rollback;
