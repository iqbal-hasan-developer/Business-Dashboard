-- Development-only rollback rehearsal for the owner-confirmed Nasim correction.
-- This file must never be run against Production and never commits data.

begin;
set transaction isolation level serializable;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = public, extensions, pg_catalog;

do $dry_run$
declare
  actor_id uuid;
  cash_before numeric;
  snapshots_before text;
  allocations_before text;
begin
  select user_id into actor_id from public.dashboard_user_profiles
  where role='owner' and is_active order by created_at limit 1;
  if actor_id is null then raise exception 'Dry run requires one active Development owner.'; end if;
  perform set_config('request.jwt.claim.sub',actor_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);

  if (select historical_investment from public.dashboard_owner_capital_positions where owner_label='Rifat') <> 33600.00
     or (select historical_investment from public.dashboard_owner_capital_positions where owner_label='Nasim') <> 15120.00 then
    raise exception 'Confirmed Rifat/Nasim historical investments do not match the Development ledger.';
  end if;
  if not exists (select 1 from public.cash_movements where id='9dd4f87d-f0f5-4055-80e2-1805efa12939'
      and transaction_type='owner_withdrawal' and owner_label='Nasim' and amount=13736.00)
     or not exists (select 1 from public.cash_movements where id='69d9b865-576b-4c1b-8dd3-b6a9baa085eb'
      and transaction_type='owner_withdrawal' and owner_label='Nasim' and amount=8598.00)
     or exists (select 1 from public.cash_movements where reversal_of_id in (
      '9dd4f87d-f0f5-4055-80e2-1805efa12939','69d9b865-576b-4c1b-8dd3-b6a9baa085eb')) then
    raise exception 'The two confirmed active Nasim withdrawals are not in the expected starting state.';
  end if;
  if not exists (select 1 from public.cash_movements where id='eb4913f2-3b9a-45e5-9399-6597d13de0d8'
      and transaction_type='owner_withdrawal' and owner_label='Ikbal' and amount=500.00)
     or exists (select 1 from public.cash_movements where reversal_of_id='eb4913f2-3b9a-45e5-9399-6597d13de0d8') then
    raise exception 'Ikbal separate 500 withdrawal is not active.';
  end if;

  select coalesce(sum(signed_amount),0) into cash_before from public.dashboard_cash_ledger;
  select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.order_id)::text,'[]'))
    into snapshots_before from public.order_financial_snapshots row_data;
  select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text,'[]'))
    into allocations_before from public.order_item_financial_allocations row_data;

  perform public.reclassify_owner_withdrawal_as_held(
    '9dd4f87d-f0f5-4055-80e2-1805efa12939',date '2026-08-17',
    'Owner-confirmed correction: Steadfast business money held by Nasim, not a personal withdrawal.',
    'f3000000-0000-4000-8000-000000000001'
  );
  perform public.reclassify_owner_withdrawal_as_held(
    '69d9b865-576b-4c1b-8dd3-b6a9baa085eb',date '2026-08-17',
    'Owner-confirmed correction: Steadfast business money held by Nasim, not a personal withdrawal.',
    'f3000000-0000-4000-8000-000000000002'
  );
  perform public.record_owner_capital_return_from_held(
    date '2026-08-17','Nasim',15120.00,
    'Owner-confirmed full return of Nasim contributed capital, settled against business funds held by Nasim.',
    'f3000000-0000-4000-8000-000000000003'
  );

  if (select ledger_due from public.dashboard_owner_held_balances where owner_label='Nasim') <> 7214.00 then
    raise exception 'Dry-run Due from Nasim is not 7,214.';
  end if;
  if (select historical_investment from public.dashboard_owner_capital_positions where owner_label='Nasim') <> 15120.00
     or (select capital_returned from public.dashboard_owner_capital_positions where owner_label='Nasim') <> 15120.00
     or (select current_contributed_capital from public.dashboard_owner_capital_positions where owner_label='Nasim') <> 0.00 then
    raise exception 'Dry-run Nasim capital position is incorrect.';
  end if;
  if (select current_contributed_capital from public.dashboard_owner_capital_positions where owner_label='Rifat') <> 33600.00
     or (select sum(historical_investment) from public.dashboard_owner_capital_positions) <> 48720.00
     or (select sum(capital_returned) from public.dashboard_owner_capital_positions) <> 15120.00
     or (select sum(current_contributed_capital) from public.dashboard_owner_capital_positions) <> 33600.00 then
    raise exception 'Dry-run confirmed capital totals are incorrect.';
  end if;
  if (select owner_withdrawals from public.dashboard_capital_spending_available_funds) <> 500.00 then
    raise exception 'Ikbal 500 must remain the only active owner withdrawal.';
  end if;
  if (select coalesce(sum(signed_amount),0) from public.dashboard_cash_ledger) <> cash_before then
    raise exception 'Reclassification or capital return unexpectedly changed total business cash.';
  end if;
  if (select calculated_receivable from public.dashboard_steadfast_receivable_reconciliation) <> 4620.00
     or (select actual_receivable from public.dashboard_steadfast_receivable_reconciliation) <> 4623.00
     or (select difference from public.dashboard_steadfast_receivable_reconciliation) <> 3.00
     or (select gross_eligible_receivable from public.dashboard_steadfast_receivable_reconciliation) <> 6190.00
     or (select reversed_batch_receivable from public.dashboard_steadfast_receivable_reconciliation) <> 1570.00
     or (select count(*) from public.dashboard_steadfast_receivable_components) <> 6
     or (select count(*) from public.dashboard_steadfast_receivable_components where excluded_reversed_batch) <> 2 then
    raise exception 'Steadfast 6,190/1,570/4,620/4,623/3 reconciliation is incorrect.';
  end if;
  if (select total_available_receivable_funds from public.dashboard_capital_spending_available_funds) <> 11837.00 then
    raise exception 'Total available/receivable funds is not 11,837.';
  end if;
  if snapshots_before <> (select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.order_id)::text,'[]'))
      from public.order_financial_snapshots row_data)
     or allocations_before <> (select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text,'[]'))
      from public.order_item_financial_allocations row_data) then
    raise exception 'Immutable Delivered financial evidence changed during the dry run.';
  end if;
end
$dry_run$;

select
  'dry-run passed; transaction will roll back' as result,
  (select historical_investment from public.dashboard_owner_capital_positions where owner_label='Rifat') as rifat_historical,
  (select historical_investment from public.dashboard_owner_capital_positions where owner_label='Nasim') as nasim_historical,
  (select capital_returned from public.dashboard_owner_capital_positions where owner_label='Nasim') as nasim_returned,
  (select ledger_due from public.dashboard_owner_held_balances where owner_label='Nasim') as due_from_nasim,
  (select total_available_receivable_funds from public.dashboard_capital_spending_available_funds) as available_receivable_funds;

rollback;
