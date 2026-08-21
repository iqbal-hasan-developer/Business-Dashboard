begin;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_table('public','owner_held_fund_events','Due from Owner has an append-only event ledger');
select has_table('public','owner_capital_return_events','capital returns have a separate append-only ledger');
select has_column('public','owner_held_fund_events','capital_return_id','owner-held spending links to its capital return');
select has_view('public','dashboard_owner_capital_positions','per-owner historical, returned, and current capital are exposed');
select has_view('public','dashboard_steadfast_receivable_components','Steadfast component rows expose reversed-batch exclusions');
select has_view('public','dashboard_spending_by_category','business spending is categorized from authoritative source records');

select has_function('public','record_owner_capital_return_from_held',array['date','text','numeric','text','uuid'],'capital return against held funds is atomic');
select has_function('public','reverse_owner_capital_return_from_held',array['uuid','date','text','uuid'],'capital returns have an append-only reversal');
select has_function('public','reverse_owner_held_fund_transfer',array['uuid','date','text','uuid'],'owner-held transfers have an append-only reversal');

select ok(
  (select relrowsecurity from pg_class where oid='public.owner_capital_return_events'::regclass)
  and (select relrowsecurity from pg_class where oid='public.owner_held_fund_events'::regclass),
  'private owner capital and held-fund tables have RLS enabled'
);
select ok(
  not has_table_privilege('authenticated','public.owner_capital_return_events','INSERT')
  and not has_table_privilege('authenticated','public.owner_capital_return_events','UPDATE')
  and not has_table_privilege('authenticated','public.owner_capital_return_events','DELETE')
  and not has_table_privilege('authenticated','public.owner_held_fund_events','INSERT'),
  'authenticated callers cannot bypass the atomic owner accounting RPCs'
);
select ok(
  has_function_privilege('authenticated','public.record_owner_capital_return_from_held(date,text,numeric,text,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.record_owner_capital_return_from_held(date,text,numeric,text,uuid)','EXECUTE')
  and not has_function_privilege('service_role','public.record_owner_capital_return_from_held(date,text,numeric,text,uuid)','EXECUTE'),
  'capital returns require an authenticated dashboard caller'
);
select ok(
  pg_get_functiondef('public.record_owner_capital_return_from_held(date,text,numeric,text,uuid)'::regprocedure) ~* 'array\[''owner''\]'
  and pg_get_functiondef('public.record_owner_capital_return_from_held(date,text,numeric,text,uuid)'::regprocedure) ~* 'pg_advisory_xact_lock'
  and pg_get_functiondef('public.record_owner_capital_return_from_held(date,text,numeric,text,uuid)'::regprocedure) !~* 'double precision|[[:space:]]real[[:space:]]',
  'capital return is owner-only, serialized, and exact-money'
);
select ok(
  pg_get_functiondef('public.record_owner_capital_return_from_held(date,text,numeric,text,uuid)'::regprocedure) ~* 'insert into public[.]owner_capital_return_events'
  and pg_get_functiondef('public.record_owner_capital_return_from_held(date,text,numeric,text,uuid)'::regprocedure) ~* 'insert into public[.]owner_held_fund_events'
  and pg_get_functiondef('public.record_owner_capital_return_from_held(date,text,numeric,text,uuid)'::regprocedure) !~* 'update[[:space:]]+public[.](cash_movements|expenses|orders|order_financial_snapshots)'
  and pg_get_functiondef('public.record_owner_capital_return_from_held(date,text,numeric,text,uuid)'::regprocedure) !~* 'delete[[:space:]]+from',
  'capital return appends only capital and Due from Owner evidence'
);
select ok(
  pg_get_functiondef('public.reverse_owner_capital_return_from_held(uuid,date,text,uuid)'::regprocedure) ~* 'insert into public[.]owner_capital_return_events'
  and pg_get_functiondef('public.reverse_owner_capital_return_from_held(uuid,date,text,uuid)'::regprocedure) ~* 'insert into public[.]owner_held_fund_events'
  and pg_get_functiondef('public.reverse_owner_capital_return_from_held(uuid,date,text,uuid)'::regprocedure) !~* 'update[[:space:]]+public[.]owner_',
  'capital-return reversal preserves both ledgers append-only'
);
select ok(
  exists (select 1 from pg_indexes where schemaname='public' and indexname='owner_capital_return_events_reversal_uidx')
  and exists (select 1 from pg_indexes where schemaname='public' and indexname='owner_held_fund_events_capital_return_uidx'),
  'database indexes reject duplicate return reversals and duplicate capital links'
);
select ok(
  pg_get_viewdef('public.dashboard_spending_by_category'::regclass,true) ~* 'financial_source_funding_reversals'
  and pg_get_viewdef('public.dashboard_spending_by_category'::regclass,true) ~* 'funding_treatment.*unpaid'
  and pg_get_viewdef('public.dashboard_spending_by_category'::regclass,true) !~* 'owner_capital_return_events',
  'spending excludes reversed funding, unpaid costs, and capital returns'
);
select ok(
  pg_get_viewdef('public.dashboard_steadfast_receivable_components'::regclass,true) ~* 'settlement_reversals'
  and pg_get_viewdef('public.dashboard_steadfast_receivable_reconciliation'::regclass,true) ~* 'reversed_batch_receivable',
  'Steadfast reconciliation exposes rather than hides reversed-batch evidence'
);

select * from finish();
rollback;
