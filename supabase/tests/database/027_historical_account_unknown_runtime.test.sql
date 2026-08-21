begin;
set local search_path = public, extensions, pg_catalog;

do $test$
declare
  actor_id uuid;
  v_source_id uuid := gen_random_uuid();
  unknown_key uuid := gen_random_uuid();
  replacement_key uuid := gen_random_uuid();
  v_funding_id uuid;
  repeated_id uuid;
  replacement_id uuid;
  source_paid_before numeric;
  cash_before numeric;
begin
  select user_id into actor_id from public.dashboard_user_profiles
  where role='owner' and is_active order by created_at limit 1;
  if actor_id is null then raise exception 'Runtime test requires one active owner.'; end if;
  perform set_config('request.jwt.claim.sub',actor_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);

  select confirmed_paid_source_spending into source_paid_before
  from public.dashboard_capital_spending_available_funds;
  select coalesce(sum(signed_amount),0) into cash_before from public.dashboard_cash_ledger;

  insert into public.expenses(
    id,expense_date,category_key,accounting_class,description,amount,payment_method,
    campaign_id,sales_channel,reference,created_by,updated_by
  ) values (
    v_source_id,date '2026-08-18','operations','operating_expense',
    'Rollback-only historical account-unknown source',12.34,null,null,null,
    'TEST-HISTORICAL-UNKNOWN',actor_id,actor_id
  );

  v_funding_id := public.classify_historical_financial_source(
    'expense',v_source_id,'historical_business_paid_account_unknown',date '2026-08-18',
    null,null,null,'Business-paid evidence exists; historical account is unavailable.',unknown_key
  );
  repeated_id := public.classify_historical_financial_source(
    'expense',v_source_id,'historical_business_paid_account_unknown',date '2026-08-18',
    null,null,null,'Business-paid evidence exists; historical account is unavailable.',unknown_key
  );
  if v_funding_id<>repeated_id then raise exception 'Idempotent retry returned a different funding record.'; end if;
  if exists(select 1 from public.cash_movements movement where movement.funding_id=v_funding_id)
     or exists(select 1 from public.owner_non_cash_capital_events event where event.funding_id=v_funding_id)
     or exists(select 1 from public.owner_held_fund_events event where event.funding_id=v_funding_id) then
    raise exception 'Historical account-unknown classification fabricated cash or owner evidence.';
  end if;
  if (select count(*) from public.dashboard_active_source_fundings where source_id=v_source_id)<>1 then
    raise exception 'Source does not have exactly one active classification.';
  end if;

  perform public.reverse_financial_source_funding(
    v_funding_id,date '2026-08-18','Replace rollback-only unknown funding with recovered cash evidence.',gen_random_uuid()
  );
  replacement_id := public.classify_historical_financial_source(
    'expense',v_source_id,'business_account_paid',date '2026-08-18',
    'cash',null,null,'Recovered exact Cash evidence.',replacement_key
  );
  if (select count(*) from public.cash_movements where funding_id=replacement_id)<>1
     or (select count(*) from public.dashboard_active_source_fundings where source_id=v_source_id)<>1 then
    raise exception 'Account-known replacement did not create one active source and one cash movement.';
  end if;
  if (select confirmed_paid_source_spending from public.dashboard_capital_spending_available_funds)<>source_paid_before+12.34 then
    raise exception 'Replacement double-counted or omitted source-paid spending.';
  end if;
  if (select coalesce(sum(signed_amount),0) from public.dashboard_cash_ledger)<>cash_before-12.34 then
    raise exception 'Only the recovered account-known replacement should change cash.';
  end if;
end
$test$;

select 'historical account-unknown runtime contract passed' as result;
rollback;
