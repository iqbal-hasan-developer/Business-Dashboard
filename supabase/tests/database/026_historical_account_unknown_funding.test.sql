begin;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_function(
  'public', 'classify_historical_account_unknown_source', array['text','uuid','text','uuid'],
  'historical business-paid sources have a dedicated account-unknown RPC'
);
select ok(
  pg_get_constraintdef((select oid from pg_constraint where conrelid='public.financial_source_fundings'::regclass and conname='financial_source_fundings_treatment_allowed'))
    like '%historical_business_paid_account_unknown%',
  'funding treatment constraint supports the first-class historical account-unknown state'
);
select ok(
  not has_function_privilege('authenticated', 'public.classify_historical_account_unknown_source(text,uuid,text,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.classify_historical_account_unknown_source(text,uuid,text,uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.classify_historical_account_unknown_source(text,uuid,text,uuid)', 'EXECUTE'),
  'the narrow helper remains private behind the authenticated classification wrapper'
);
select ok(
  has_function_privilege('authenticated', 'public.classify_historical_financial_source(text,uuid,text,date,text,text,uuid,text,uuid)', 'EXECUTE'),
  'authenticated dashboard users can use the guarded historical classification wrapper'
);
select ok(
  pg_get_functiondef('public.classify_historical_account_unknown_source(text,uuid,text,uuid)'::regprocedure) !~* 'cash_movements|owner_non_cash_capital_events|owner_held_fund_events',
  'account-unknown classification cannot fabricate a cash account or owner event'
);
select has_column('public','dashboard_spending_by_category','independently_verified_spending','independently verified spending remains separate');
select has_column('public','dashboard_spending_by_category','combined_spending','combined spending is explicit');
select has_column('public','dashboard_spending_by_category','overlap_review_required','overlap fails closed for review');
select has_column('public','dashboard_capital_spending_available_funds','confirmed_paid_source_spending','confirmed source-paid spending is explicit');
select has_column('public','dashboard_capital_spending_available_funds','verified_courier_fulfilment_spending','verified courier deductions are explicit');
select has_column('public','dashboard_capital_spending_available_funds','total_business_cash_spending','overall non-duplicated spending is explicit');
select has_column('public','dashboard_steadfast_receivable_reconciliation','current_calculated_receivable','current Steadfast receivable remains visible');
select has_column('public','dashboard_steadfast_receivable_reconciliation','post_observation_receivable','post-observation receivable is separated');
select ok(
  exists(select 1 from pg_trigger where tgrelid='public.financial_source_fundings'::regclass and tgname='financial_source_fundings_one_active' and not tgisinternal),
  'database trigger enforces one active funding classification per source'
);
select ok(
  not has_table_privilege('authenticated','public.financial_source_fundings','INSERT'),
  'authenticated callers still cannot bypass the RPC with direct funding writes'
);

select * from finish();
rollback;
