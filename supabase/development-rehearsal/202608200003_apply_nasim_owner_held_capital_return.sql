-- EXECUTED SUCCESSFULLY ON NEXANOTION BUSINESS DASHBOARD DEV ON 2026-08-18.
-- DEVELOPMENT-ONLY, owner-authorized, append-only correction.
-- Apply only to linked NexaNotion Business Dashboard Dev after the paired dry run passes.
-- Safe to retry only when the fixed idempotency keys identify the same requests.

begin;
set transaction isolation level serializable;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = public, extensions, pg_catalog;

do $apply$
declare
  actor_id uuid;
  first_active boolean;
  second_active boolean;
  first_done boolean;
  second_done boolean;
  snapshots_before text;
  allocations_before text;
begin
  select user_id into actor_id from public.dashboard_user_profiles
  where role='owner' and is_active order by created_at limit 1;
  if actor_id is null then raise exception 'Apply requires one active Development owner.'; end if;
  perform set_config('request.jwt.claim.sub',actor_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);

  select exists(select 1 from public.cash_movements m where m.id='9dd4f87d-f0f5-4055-80e2-1805efa12939'
    and not exists(select 1 from public.cash_movements r where r.reversal_of_id=m.id)) into first_active;
  select exists(select 1 from public.cash_movements m where m.id='69d9b865-576b-4c1b-8dd3-b6a9baa085eb'
    and not exists(select 1 from public.cash_movements r where r.reversal_of_id=m.id)) into second_active;
  select exists(select 1 from public.owner_held_fund_events where idempotency_key='f3000000-0000-4000-8000-000000000001') into first_done;
  select exists(select 1 from public.owner_held_fund_events where idempotency_key='f3000000-0000-4000-8000-000000000002') into second_done;
  if (first_active <> second_active) or (first_done <> second_done)
     or (first_active and first_done) or (not first_active and not first_done) then
    raise exception 'Nasim correction is in a partial or unexpected state.';
  end if;
  if (select historical_investment from public.dashboard_owner_capital_positions where owner_label='Rifat') <> 33600.00
     or (select historical_investment from public.dashboard_owner_capital_positions where owner_label='Nasim') <> 15120.00 then
    raise exception 'Confirmed investments do not match before apply.';
  end if;
  if not exists (select 1 from public.cash_movements where id='eb4913f2-3b9a-45e5-9399-6597d13de0d8'
      and transaction_type='owner_withdrawal' and owner_label='Ikbal' and amount=500.00)
     or exists (select 1 from public.cash_movements where reversal_of_id='eb4913f2-3b9a-45e5-9399-6597d13de0d8') then
    raise exception 'Ikbal separate 500 withdrawal is not active.';
  end if;

  select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.order_id)::text,'[]'))
    into snapshots_before from public.order_financial_snapshots row_data;
  select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text,'[]'))
    into allocations_before from public.order_item_financial_allocations row_data;

  if first_active then
    perform public.reclassify_owner_withdrawal_as_held(
      '9dd4f87d-f0f5-4055-80e2-1805efa12939',date '2026-08-17',
      'Owner-confirmed correction: Steadfast business money held by Nasim, not a personal withdrawal.',
      'f3000000-0000-4000-8000-000000000001');
    perform public.reclassify_owner_withdrawal_as_held(
      '69d9b865-576b-4c1b-8dd3-b6a9baa085eb',date '2026-08-17',
      'Owner-confirmed correction: Steadfast business money held by Nasim, not a personal withdrawal.',
      'f3000000-0000-4000-8000-000000000002');
  end if;
  perform public.record_owner_capital_return_from_held(
    date '2026-08-17','Nasim',15120.00,
    'Owner-confirmed full return of Nasim contributed capital, settled against business funds held by Nasim.',
    'f3000000-0000-4000-8000-000000000003');

  if (select ledger_due from public.dashboard_owner_held_balances where owner_label='Nasim') <> 7214.00
     or (select actual_due from public.dashboard_owner_held_balances where owner_label='Nasim') <> 7214.00
     or (select difference from public.dashboard_owner_held_balances where owner_label='Nasim') <> 0.00 then
    raise exception 'Posted Due from Nasim does not reconcile to the 7,214 control.';
  end if;
  if (select historical_investment from public.dashboard_owner_capital_positions where owner_label='Nasim') <> 15120.00
     or (select capital_returned from public.dashboard_owner_capital_positions where owner_label='Nasim') <> 15120.00
     or (select current_contributed_capital from public.dashboard_owner_capital_positions where owner_label='Nasim') <> 0.00
     or (select current_contributed_capital from public.dashboard_owner_capital_positions where owner_label='Rifat') <> 33600.00
     or (select sum(historical_investment) from public.dashboard_owner_capital_positions) <> 48720.00
     or (select sum(capital_returned) from public.dashboard_owner_capital_positions) <> 15120.00
     or (select sum(current_contributed_capital) from public.dashboard_owner_capital_positions) <> 33600.00 then
    raise exception 'Posted capital reconciliation does not match the confirmed facts.';
  end if;
  if (select owner_withdrawals from public.dashboard_capital_spending_available_funds) <> 500.00 then
    raise exception 'Ikbal 500 did not remain separate.';
  end if;
  if (select calculated_receivable from public.dashboard_steadfast_receivable_reconciliation) <> 4620.00
     or (select actual_receivable from public.dashboard_steadfast_receivable_reconciliation) <> 4623.00
     or (select difference from public.dashboard_steadfast_receivable_reconciliation) <> 3.00 then
    raise exception 'Steadfast active/control/residual reconciliation changed unexpectedly.';
  end if;
  if (select total_available_receivable_funds from public.dashboard_capital_spending_available_funds) <> 11837.00 then
    raise exception 'Total available/receivable funds is not 11,837.';
  end if;
  if snapshots_before <> (select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.order_id)::text,'[]'))
      from public.order_financial_snapshots row_data)
     or allocations_before <> (select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text,'[]'))
      from public.order_item_financial_allocations row_data) then
    raise exception 'Immutable Delivered financial evidence changed during apply.';
  end if;
end
$apply$;

commit;

select
  'Development correction applied and reconciled' as result,
  (select sum(historical_investment) from public.dashboard_owner_capital_positions) as historical_investment,
  (select sum(capital_returned) from public.dashboard_owner_capital_positions) as capital_returned,
  (select sum(current_contributed_capital) from public.dashboard_owner_capital_positions) as current_contributed_capital,
  (select ledger_due from public.dashboard_owner_held_balances where owner_label='Nasim') as due_from_nasim,
  (select calculated_receivable from public.dashboard_steadfast_receivable_reconciliation) as calculated_steadfast,
  (select actual_receivable from public.dashboard_steadfast_receivable_reconciliation) as observed_steadfast,
  (select difference from public.dashboard_steadfast_receivable_reconciliation) as steadfast_residual,
  (select total_available_receivable_funds from public.dashboard_capital_spending_available_funds) as available_receivable_funds;
