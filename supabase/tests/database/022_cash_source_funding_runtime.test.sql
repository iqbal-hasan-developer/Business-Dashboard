begin;
set local search_path = public, extensions, pg_catalog;

do $test$
declare
  actor_id uuid;
  campaign_id uuid;
  v_expense_id uuid;
  v_unpaid_expense_id uuid;
  v_spend_id uuid;
  v_funding_id uuid;
  v_reversal_id uuid;
  account_before numeric;
  account_after numeric;
begin
  select user_id into actor_id from public.dashboard_user_profiles
  where role = 'owner' and is_active order by created_at limit 1;
  select id into campaign_id from public.campaigns order by created_at limit 1;
  if actor_id is null or campaign_id is null then
    raise exception 'Runtime test requires one active owner and one campaign.';
  end if;
  perform set_config('request.jwt.claim.sub', actor_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  select coalesce(sum(case when movement_type in ('inflow','transfer_in') then amount else -amount end),0)
  into account_before from public.cash_movements where account_key = 'cash';

  v_expense_id := public.record_funded_expense(
    current_date, 'operations', 'Rollback-only business-paid expense', 10.25,
    'cash', null, null, 'TEST-FUNDED-EXPENSE', 'business_account_paid',
    current_date, 'cash', null, gen_random_uuid()
  );
  select funding.id into v_funding_id from public.financial_source_fundings funding where funding.expense_id = v_expense_id;
  if (select count(*) from public.cash_movements movement where movement.funding_id = v_funding_id) <> 1 then
    raise exception 'Business-paid expense did not create exactly one cash outflow.';
  end if;
  if (select movement.amount from public.cash_movements movement where movement.funding_id = v_funding_id) <> 10.25 then
    raise exception 'Business-paid expense cash amount does not match the source.';
  end if;

  v_spend_id := public.record_funded_ad_spend(
    campaign_id, current_date, 'Meta', 8.50, 'TEST-FUNDED-AD',
    'owner_paid_personally', current_date, null, 'Nasim', gen_random_uuid()
  );
  if exists (select 1 from public.cash_movements movement join public.financial_source_fundings funding on funding.id = movement.funding_id where funding.ad_spend_id = v_spend_id)
     or (select count(*) from public.owner_non_cash_capital_events event join public.financial_source_fundings funding on funding.id = event.funding_id where funding.ad_spend_id = v_spend_id and event.event_type = 'contribution') <> 1 then
    raise exception 'Owner-paid advertising must create one non-cash contribution and no cash movement.';
  end if;

  v_unpaid_expense_id := public.record_funded_expense(
    current_date, 'inventory_purchase', 'Rollback-only unpaid procurement', 12.00,
    null, null, null, 'TEST-UNPAID-PROCUREMENT', 'unpaid',
    null, null, null, gen_random_uuid()
  );
  if exists (select 1 from public.cash_movements movement join public.financial_source_fundings funding on funding.id = movement.funding_id where funding.expense_id = v_unpaid_expense_id) then
    raise exception 'Unpaid procurement changed cash.';
  end if;
  v_funding_id := public.pay_unpaid_financial_source(
    'expense', v_unpaid_expense_id, 'business_account_paid', current_date,
    'cash', null, 'Pay the rollback-only payable', gen_random_uuid()
  );
  if (select count(*) from public.cash_movements movement where movement.funding_id = v_funding_id) <> 1 then
    raise exception 'Paying an unpaid procurement did not create exactly one cash movement.';
  end if;

  v_reversal_id := public.reverse_financial_source_funding(
    v_funding_id, current_date, 'Reverse rollback-only procurement payment', gen_random_uuid()
  );
  if v_reversal_id is null or not exists (
    select 1
    from public.financial_source_funding_reversals funding_reversal
    join public.cash_movements reversal on reversal.id = funding_reversal.cash_reversal_id
    join public.cash_movements original on original.id = reversal.reversal_of_id
    where funding_reversal.id = v_reversal_id
      and original.funding_id = v_funding_id
      and reversal.amount = original.amount
  ) then
    raise exception 'Funding reversal evidence was not appended.';
  end if;

  select coalesce(sum(case when movement_type in ('inflow','transfer_in') then amount else -amount end),0)
  into account_after from public.cash_movements where account_key = 'cash';
  if account_after <> account_before - 10.25 then
    raise exception 'Reversal did not restore the procurement cash position exactly.';
  end if;
end
$test$;

select 'cash source-funding runtime contract passed' as result;
rollback;
