begin;
set local search_path = public, extensions, pg_catalog;

do $test$
declare
  actor_id uuid;
  transfer_key uuid := gen_random_uuid();
  transfer_id uuid;
  duplicate_id uuid;
  return_id uuid;
  cash_before numeric;
  current_capital_before numeric;
  due_before numeric;
  snapshot_hash text;
  allocation_hash text;
  expense_hash text;
  procurement_hash text;
begin
  select user_id into actor_id from public.dashboard_user_profiles
  where role='owner' and is_active order by created_at limit 1;
  if actor_id is null then raise exception 'Runtime test requires one active owner.'; end if;
  perform set_config('request.jwt.claim.sub',actor_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);

  select current_contributed_capital into current_capital_before
  from public.dashboard_owner_capital_positions where owner_label='Rifat';
  select ledger_due into due_before from public.dashboard_owner_held_balances where owner_label='Rifat';
  select coalesce(sum(signed_amount),0) into cash_before from public.dashboard_cash_ledger;
  if current_capital_before < 50 then raise exception 'Runtime test requires at least 50 Rifat contributed capital.'; end if;

  select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.order_id)::text,'[]')) into snapshot_hash
    from public.order_financial_snapshots row_data;
  select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text,'[]')) into allocation_hash
    from public.order_item_financial_allocations row_data;
  select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text,'[]')) into expense_hash
    from public.expenses row_data;
  select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text,'[]')) into procurement_hash
    from public.purchase_batches row_data;

  transfer_id := public.record_owner_held_fund_transfer(
    current_date,'Rifat','cash',100.00,'Rollback-only owner-held transfer test',transfer_key);
  duplicate_id := public.record_owner_held_fund_transfer(
    current_date,'Rifat','cash',100.00,'Rollback-only owner-held transfer test',transfer_key);
  if duplicate_id <> transfer_id
     or (select count(*) from public.owner_held_fund_events where idempotency_key=transfer_key) <> 1 then
    raise exception 'Repeated transfer submission was not idempotent.';
  end if;
  if (select ledger_due from public.dashboard_owner_held_balances where owner_label='Rifat') <> due_before+100.00
     or (select coalesce(sum(signed_amount),0) from public.dashboard_cash_ledger) <> cash_before-100.00 then
    raise exception 'Owner-held transfer did not move cash to Due from Owner exactly once.';
  end if;

  return_id := public.record_owner_capital_return_from_held(
    current_date,'Rifat',50.00,'Rollback-only capital return test',gen_random_uuid());
  if (select ledger_due from public.dashboard_owner_held_balances where owner_label='Rifat') <> due_before+50.00
     or (select current_contributed_capital from public.dashboard_owner_capital_positions where owner_label='Rifat') <> current_capital_before-50.00
     or (select coalesce(sum(signed_amount),0) from public.dashboard_cash_ledger) <> cash_before-100.00 then
    raise exception 'Capital return did not reduce Due from Owner and current capital without changing cash.';
  end if;

  perform public.reverse_owner_capital_return_from_held(
    return_id,current_date,'Rollback-only capital return reversal',gen_random_uuid());
  if (select ledger_due from public.dashboard_owner_held_balances where owner_label='Rifat') <> due_before+100.00
     or (select current_contributed_capital from public.dashboard_owner_capital_positions where owner_label='Rifat') <> current_capital_before then
    raise exception 'Capital-return reversal did not restore capital and Due from Owner.';
  end if;
  perform public.reverse_owner_held_fund_transfer(
    transfer_id,current_date,'Rollback-only owner-held transfer reversal',gen_random_uuid());
  if (select ledger_due from public.dashboard_owner_held_balances where owner_label='Rifat') <> due_before
     or (select coalesce(sum(signed_amount),0) from public.dashboard_cash_ledger) <> cash_before then
    raise exception 'Owner-held transfer reversal did not restore cash and owner due.';
  end if;

  if snapshot_hash <> (select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.order_id)::text,'[]')) from public.order_financial_snapshots row_data)
     or allocation_hash <> (select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text,'[]')) from public.order_item_financial_allocations row_data)
     or expense_hash <> (select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text,'[]')) from public.expenses row_data)
     or procurement_hash <> (select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text,'[]')) from public.purchase_batches row_data) then
    raise exception 'Owner accounting workflow changed revenue, COGS, expenses, or procurement.';
  end if;
end
$test$;

select 'owner capital-return runtime contract passed' as result;
rollback;
