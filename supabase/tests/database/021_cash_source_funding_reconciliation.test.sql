begin;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_table('public', 'financial_source_fundings', 'financial sources have an auditable funding ledger');
select has_table('public', 'owner_non_cash_capital_events', 'owner-paid costs have a non-cash capital ledger');
select has_table('public', 'financial_source_funding_reversals', 'funding corrections are append-only');
select has_table('public', 'cash_account_balance_observations', 'actual account observations are append-only');
select has_column('public', 'cash_movements', 'funding_id', 'generated cash movements identify their funding source');
select has_view('public', 'dashboard_historical_cash_reconciliation', 'historical unresolved funding report exists');
select has_view('public', 'dashboard_cash_account_reconciliation', 'per-account cash reconciliation exists');
select has_view('public', 'dashboard_owner_non_cash_capital', 'owner non-cash capital view exists');

select has_function('public', 'record_funded_expense', array['date','text','text','numeric','text','uuid','text','text','text','date','text','text','uuid'], 'atomic funded expense RPC exists');
select has_function('public', 'record_funded_ad_spend', array['uuid','date','text','numeric','text','text','date','text','text','uuid'], 'atomic funded advertising RPC exists');
select has_function('public', 'pay_unpaid_financial_source', array['text','uuid','text','date','text','text','text','uuid'], 'unpaid sources can be paid exactly once');
select has_function('public', 'reverse_financial_source_funding', array['uuid','date','text','uuid'], 'source funding has an atomic reversal RPC');
select has_function('public', 'classify_historical_financial_source', array['text','uuid','text','date','text','text','uuid','text','uuid'], 'historical classifications require explicit evidence');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.financial_source_fundings'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.owner_non_cash_capital_events'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.financial_source_funding_reversals'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.cash_account_balance_observations'::regclass),
  'all new private accounting tables have RLS enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.financial_source_fundings', 'INSERT')
  and not has_table_privilege('authenticated', 'public.owner_non_cash_capital_events', 'INSERT')
  and not has_table_privilege('authenticated', 'public.financial_source_funding_reversals', 'INSERT')
  and not has_table_privilege('authenticated', 'public.cash_account_balance_observations', 'INSERT'),
  'authenticated callers cannot bypass atomic RPCs with direct writes'
);
select ok(
  has_function_privilege('authenticated', 'public.record_funded_expense(date,text,text,numeric,text,uuid,text,text,text,date,text,text,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.record_funded_expense(date,text,text,numeric,text,uuid,text,text,text,date,text,text,uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.record_funded_expense(date,text,text,numeric,text,uuid,text,text,text,date,text,text,uuid)', 'EXECUTE'),
  'funded source writes require an authenticated dashboard caller'
);
select ok(
  not has_function_privilege('authenticated', 'public.record_expense(date,text,text,numeric,text,uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.record_daily_ad_spend(uuid,date,text,numeric,text)', 'EXECUTE'),
  'legacy source-only creation RPCs cannot bypass funding treatment'
);
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'cash_movements_funding_uidx')
  and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'financial_source_fundings_existing_cash_uidx'),
  'database indexes prevent duplicate generated and already-represented cash links'
);
select ok(
  pg_get_functiondef('public.record_funded_expense(date,text,text,numeric,text,uuid,text,text,text,date,text,text,uuid)'::regprocedure) !~* 'double precision|[[:space:]]real[[:space:]]'
  and pg_get_functiondef('public.record_funded_ad_spend(uuid,date,text,numeric,text,text,date,text,text,uuid)'::regprocedure) !~* 'double precision|[[:space:]]real[[:space:]]',
  'all funding workflows preserve exact database money'
);
select ok(
  pg_get_functiondef('public.reverse_financial_source_funding(uuid,date,text,uuid)'::regprocedure) ~* 'insert into public[.]cash_movements'
  and pg_get_functiondef('public.reverse_financial_source_funding(uuid,date,text,uuid)'::regprocedure) !~* 'update[[:space:]]+public[.]cash_movements'
  and pg_get_functiondef('public.reverse_financial_source_funding(uuid,date,text,uuid)'::regprocedure) !~* 'delete[[:space:]]+from[[:space:]]+public[.]cash_movements',
  'cash corrections append reversals without rewriting posted history'
);
select ok(
  not exists (
    select 1
    from public.financial_source_fundings funding
    where ((funding.expense_id is not null)::integer
      + (funding.ad_spend_id is not null)::integer
      + (funding.purchase_batch_id is not null)::integer) <> 1
  ),
  'every reviewed funding classification retains exactly one financial source'
);
select ok(
  pg_get_functiondef(
    'public.record_cash_account_balance_observation(text,date,numeric,text,uuid)'::regprocedure
  ) !~* 'cash_movements',
  'account observations remain evidence-only and never fabricate ledger adjustments'
);
select is(
  (select coalesce(sum(ledger_balance), 0)::numeric from public.dashboard_cash_account_reconciliation),
  (select coalesce(sum(case when movement_type in ('inflow','transfer_in') then amount else -amount end), 0)::numeric from public.cash_movements),
  'account reconciliation balances exactly equal the overall posted cash ledger'
);

select * from finish();
rollback;
