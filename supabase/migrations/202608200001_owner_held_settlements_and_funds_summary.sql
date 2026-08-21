begin;

create or replace function public.record_steadfast_cod_settlement_v2(
  p_settlement_date date,
  p_receipt_treatment text,
  p_receiving_method text,
  p_owner_label text,
  p_gross_cod_amount numeric,
  p_deductions numeric,
  p_net_received numeric,
  p_orders jsonb,
  p_idempotency_key uuid,
  p_courier_reference text default null,
  p_receiving_account_label text default null,
  p_receiving_account_last4 text default null,
  p_receiving_transaction_reference text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  normalized_treatment text := lower(btrim(p_receipt_treatment));
  normalized_method text := nullif(lower(btrim(p_receiving_method)), '');
  normalized_owner text := case lower(btrim(p_owner_label))
    when 'nasim' then 'Nasim' when 'rifat' then 'Rifat' when 'ikbal' then 'Ikbal' end;
  normalized_courier_reference text := nullif(btrim(p_courier_reference), '');
  normalized_label text := nullif(btrim(p_receiving_account_label), '');
  normalized_last4 text := nullif(btrim(p_receiving_account_last4), '');
  normalized_tx_reference text := nullif(btrim(p_receiving_transaction_reference), '');
  normalized_note text := nullif(btrim(p_note), '');
  fingerprint text;
  existing_id uuid;
  existing_fingerprint text;
  selected_count integer;
  eligible_count integer;
  selected_total numeric(14,2);
  new_id uuid;
begin
  if actor_id is null or not public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  ) then
    raise exception 'Owner or admin access is required.' using errcode = '42501';
  end if;
  if p_settlement_date is null or p_settlement_date > (now() at time zone 'Asia/Dhaka')::date then
    raise exception 'Settlement date must be a valid current or historical Dhaka business date.' using errcode = '22023';
  end if;
  if normalized_treatment not in ('business_account', 'owner_held_business_funds') then
    raise exception 'Choose business-account receipt or owner-held business funds.' using errcode = '22023';
  end if;
  if normalized_treatment = 'business_account' then
    if normalized_method not in ('bkash', 'bank_transfer') or normalized_owner is not null then
      raise exception 'A valid business receiving account is required.' using errcode = '22023';
    end if;
  else
    if normalized_owner is null or normalized_method is not null or normalized_label is not null or normalized_last4 is not null then
      raise exception 'Owner-held settlement receipt requires only the accountable owner.' using errcode = '22023';
    end if;
  end if;
  if normalized_method = 'bkash' and normalized_label is not null then
    raise exception 'Account labels are only stored for bank transfers.' using errcode = '22023';
  end if;
  if p_gross_cod_amount <= 0 or p_deductions < 0 or p_net_received <= 0
    or p_net_received <> p_gross_cod_amount - p_deductions then
    raise exception 'Net received must equal gross COD less deductions and remain positive.' using errcode = '22023';
  end if;
  if normalized_last4 is not null and normalized_last4 !~ '^[0-9]{2,4}$' then
    raise exception 'Only a masked final 2 to 4 digits may be stored.' using errcode = '22023';
  end if;
  if normalized_label is not null and length(normalized_label) > 80
    or normalized_courier_reference is not null and length(normalized_courier_reference) > 160
    or normalized_tx_reference is not null and length(normalized_tx_reference) > 160
    or normalized_note is not null and length(normalized_note) > 500 then
    raise exception 'Settlement text exceeds the supported length.' using errcode = '22023';
  end if;
  if concat_ws(' ', normalized_label, normalized_note) ~* '(password|passcode|pin|otp|cvv|secret|full[ -]?account|account[ -]?number|routing[ -]?number)' then
    raise exception 'Do not store credentials or full private account details.' using errcode = '22023';
  end if;
  if p_idempotency_key is null or jsonb_typeof(p_orders) <> 'array'
    or jsonb_array_length(p_orders) = 0 or jsonb_array_length(p_orders) > 100 then
    raise exception 'A request key and at least one order are required.' using errcode = '22023';
  end if;

  fingerprint := pg_catalog.md5(jsonb_build_object(
    'date', p_settlement_date, 'receipt_treatment', normalized_treatment,
    'method', normalized_method, 'owner', normalized_owner,
    'gross', p_gross_cod_amount, 'deductions', p_deductions, 'net', p_net_received,
    'orders', p_orders, 'courier_reference', normalized_courier_reference,
    'label', normalized_label, 'last4', normalized_last4,
    'transaction_reference', normalized_tx_reference, 'note', normalized_note
  )::text);

  select id, request_fingerprint into existing_id, existing_fingerprint
  from public.settlement_records where idempotency_key = p_idempotency_key;
  if existing_id is not null then
    if existing_fingerprint = fingerprint then return existing_id; end if;
    raise exception 'The request key was already used with different settlement details.' using errcode = '23505';
  end if;

  select count(*), count(distinct value->>'order_id')
    into selected_count, eligible_count
  from jsonb_array_elements(p_orders);
  if selected_count <> eligible_count or exists (
    select 1 from jsonb_array_elements(p_orders) item
    where item->>'order_id' is null or item->>'expected_updated_at' is null
  ) then
    raise exception 'Selected orders must be unique and include freshness evidence.' using errcode = '22023';
  end if;

  perform orders.id
  from public.orders as orders
  where orders.id in (select (item->>'order_id')::uuid from jsonb_array_elements(p_orders) item)
  order by orders.id
  for update;

  select count(*), coalesce(sum(eligible.gross_cod_receivable), 0)::numeric(14,2)
    into eligible_count, selected_total
  from public.dashboard_steadfast_settlement_eligible_orders as eligible
  join jsonb_array_elements(p_orders) item
    on eligible.order_id = (item->>'order_id')::uuid
   and eligible.updated_at = (item->>'expected_updated_at')::timestamptz;

  if eligible_count <> selected_count then
    raise exception 'One or more orders are stale, ineligible, non-COD, not Delivered, or already settled.' using errcode = 'P0001';
  end if;
  if selected_total <> p_gross_cod_amount then
    raise exception 'Selected order receivables do not reconcile to gross COD.' using errcode = 'P0001';
  end if;

  insert into public.settlement_records (
    courier, settlement_reference, settlement_date, amount_received, fees_withheld,
    status, notes, created_by, updated_by, receiving_method,
    receiving_account_label, receiving_account_last4,
    receiving_transaction_reference, gross_cod_amount, idempotency_key,
    request_fingerprint, confirmed_at, receipt_treatment, owner_label
  ) values (
    'Steadfast', normalized_courier_reference, p_settlement_date, p_net_received, p_deductions,
    'reconciled', normalized_note, actor_id, actor_id, normalized_method,
    normalized_label, normalized_last4, normalized_tx_reference, p_gross_cod_amount,
    p_idempotency_key, fingerprint, now(), normalized_treatment, normalized_owner
  ) returning id into new_id;

  insert into public.settlement_order_allocations (
    settlement_id, order_id, allocated_amount, created_by
  )
  select new_id, eligible.order_id, eligible.gross_cod_receivable, actor_id
  from public.dashboard_steadfast_settlement_eligible_orders as eligible
  join jsonb_array_elements(p_orders) item on eligible.order_id = (item->>'order_id')::uuid;

  if normalized_treatment = 'business_account' then
    insert into public.cash_movements (
      movement_date, movement_type, account_key, amount, settlement_id, description, created_by
    ) values (
      p_settlement_date, 'inflow', normalized_method, p_net_received, new_id,
      'Steadfast COD settlement receipt', actor_id
    );
  else
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('owner-held:' || normalized_owner, 0)
    );
    insert into public.owner_held_fund_events (
      event_type, event_date, owner_label, amount, settlement_id, reason,
      idempotency_key, request_fingerprint, created_by
    ) values (
      'receipt', p_settlement_date, normalized_owner, p_net_received, new_id,
      coalesce(normalized_note, 'Steadfast settlement received by owner for the business'),
      p_idempotency_key, fingerprint, actor_id
    );
  end if;

  update public.orders
  set settlement_status = 'Settled', updated_at = now()
  where id in (select (item->>'order_id')::uuid from jsonb_array_elements(p_orders) item);

  return new_id;
exception
  when unique_violation then
    if p_idempotency_key is not null then
      select id, request_fingerprint into existing_id, existing_fingerprint
      from public.settlement_records where idempotency_key = p_idempotency_key;
      if existing_id is not null and existing_fingerprint = fingerprint then return existing_id; end if;
    end if;
    raise;
end
$function$;

create or replace function public.reverse_steadfast_cod_settlement(
  p_settlement_id uuid,
  p_reversed_on date,
  p_reason text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
  normalized_reason text := btrim(p_reason);
  settlement public.settlement_records%rowtype;
  original_cash public.cash_movements%rowtype;
  original_held public.owner_held_fund_events%rowtype;
  existing public.settlement_reversals%rowtype;
  fingerprint text;
  cash_reversal_id uuid;
  held_reversal_id uuid;
  new_id uuid;
begin
  if not public.dashboard_has_any_role(array['owner']::public.dashboard_role[]) then
    raise exception 'Only owners may reverse confirmed settlements' using errcode = '42501';
  end if;
  if p_settlement_id is null or p_reversed_on is null or p_idempotency_key is null
     or nullif(normalized_reason, '') is null or char_length(normalized_reason) > 500 then
    raise exception 'Settlement, date, reason, and idempotency key are required' using errcode = '22023';
  end if;
  fingerprint := pg_catalog.md5(pg_catalog.concat_ws('|', p_settlement_id::text, p_reversed_on::text, normalized_reason));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into existing from public.settlement_reversals where idempotency_key = p_idempotency_key::text;
  if found then
    if existing.request_fingerprint <> fingerprint then
      raise exception 'Idempotency key was already used for a different settlement reversal' using errcode = '23505';
    end if;
    return existing.id;
  end if;

  select * into settlement from public.settlement_records where id = p_settlement_id for update;
  if not found or settlement.confirmed_at is null or settlement.courier <> 'Steadfast' then
    raise exception 'Confirmed Steadfast settlement not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.settlement_reversals where settlement_id = settlement.id) then
    raise exception 'Settlement was already reversed' using errcode = '23505';
  end if;
  if settlement.receipt_treatment = 'owner_held_business_funds' then
    select * into original_held from public.owner_held_fund_events
    where settlement_id = settlement.id and event_type = 'receipt' for update;
    if not found then raise exception 'Settlement owner-held receipt is missing' using errcode = 'P0001'; end if;
    insert into public.owner_held_fund_events (
      event_type,event_date,owner_label,amount,reversal_of_id,reason,
      idempotency_key,request_fingerprint,created_by
    ) values (
      'reversal',p_reversed_on,original_held.owner_label,original_held.amount,
      original_held.id,normalized_reason,p_idempotency_key,fingerprint,actor
    ) returning id into held_reversal_id;
  else
    select * into original_cash from public.cash_movements where settlement_id = settlement.id for update;
    if not found then raise exception 'Settlement cash receipt is missing' using errcode = 'P0001'; end if;
    insert into public.cash_movements (
      movement_date, movement_type, transaction_type, account_key, amount,
      description, reference, reversal_of_id, idempotency_key,
      request_fingerprint, created_by
    ) values (
      p_reversed_on, 'outflow', 'reversal', original_cash.account_key,
      original_cash.amount, 'Reversal: ' || normalized_reason,
      settlement.settlement_reference, original_cash.id, p_idempotency_key::text,
      fingerprint, actor
    ) returning id into cash_reversal_id;
  end if;

  insert into public.settlement_reversals (
    settlement_id, reversed_on, reason, cash_reversal_id, owner_held_reversal_id,
    idempotency_key, request_fingerprint, created_by
  ) values (
    settlement.id, p_reversed_on, normalized_reason, cash_reversal_id, held_reversal_id,
    p_idempotency_key::text, fingerprint, actor
  ) returning id into new_id;

  update public.orders
  set settlement_status = 'Awaiting', updated_at = now()
  where id in (
    select allocation.order_id from public.settlement_order_allocations allocation
    where allocation.settlement_id = settlement.id
  );
  return new_id;
end
$function$;

create or replace view public.dashboard_steadfast_settlement_batches
with (security_invoker = true)
as
select
  settlement.id,
  settlement.settlement_date,
  settlement.courier,
  settlement.receiving_method,
  settlement.receiving_account_label,
  settlement.receiving_account_last4,
  settlement.receiving_transaction_reference,
  settlement.settlement_reference,
  settlement.gross_cod_amount,
  settlement.fees_withheld as deductions,
  settlement.amount_received as net_received,
  settlement.notes,
  settlement.confirmed_at,
  count(allocation.order_id)::integer as order_count,
  reversal.id is not null as is_reversed,
  reversal.reversed_on,
  reversal.reason as reversal_reason,
  settlement.receipt_treatment,
  settlement.owner_label
from public.settlement_records settlement
left join public.settlement_order_allocations allocation on allocation.settlement_id = settlement.id
left join public.settlement_reversals reversal on reversal.settlement_id = settlement.id
where settlement.confirmed_at is not null
group by settlement.id, reversal.id;

create or replace view public.dashboard_capital_spending_available_funds
with (security_invoker = true)
as
with cash_effects as (
  select
    coalesce(sum(case
      when ledger.transaction_type = 'owner_investment' then ledger.signed_amount
      when ledger.transaction_type = 'reversal' and original.transaction_type = 'owner_investment' then ledger.signed_amount
      else 0 end),0)::numeric(14,2) as owner_cash_investment,
    coalesce(sum(case
      when ledger.transaction_type = 'owner_withdrawal' then -ledger.signed_amount
      when ledger.transaction_type = 'reversal' and original.transaction_type = 'owner_withdrawal' then -ledger.signed_amount
      else 0 end),0)::numeric(14,2) as owner_withdrawals
  from public.dashboard_cash_ledger ledger
  left join public.dashboard_cash_ledger original on original.id = ledger.reversal_of_id
), non_cash as (
  select coalesce(sum(signed_amount),0)::numeric(14,2) as owner_non_cash_contribution
  from public.dashboard_owner_non_cash_capital
), cash_control as (
  select
    sum(ledger_balance)::numeric(14,2) as ledger_business_cash,
    case when count(*) filter (where actual_balance is not null) = 4
      then sum(actual_balance)::numeric(14,2) end as actual_business_cash
  from public.dashboard_cash_account_reconciliation
  where account_key in ('cash','bkash','nagad','bank')
), due_control as (
  select
    sum(ledger_due)::numeric(14,2) as ledger_due_from_owners,
    coalesce(sum(actual_due),0)::numeric(14,2) as actual_due_from_owners,
    count(*) filter (where actual_due is not null)::bigint as observed_owner_count
  from public.dashboard_owner_held_balances
), cod_control as (
  select calculated_receivable, actual_receivable, difference
  from public.dashboard_steadfast_receivable_reconciliation
), active_funding as (
  select funding.*
  from public.financial_source_fundings funding
  left join public.financial_source_funding_reversals reversal on reversal.funding_id=funding.id
  where reversal.id is null
), spending as (
  select coalesce(sum(amount) filter (where funding_treatment <> 'unpaid'),0)::numeric(14,2)
    as classified_paid_spending
  from active_funding
), unresolved as (
  select count(*)::bigint as unresolved_source_count
  from public.dashboard_historical_cash_reconciliation
  where issue_type = 'missing_funding_treatment'
), inventory as (
  select known_inventory_value::numeric(14,2) from public.dashboard_procurement_summary
)
select
  cash_effects.owner_cash_investment,
  non_cash.owner_non_cash_contribution,
  (cash_effects.owner_cash_investment + non_cash.owner_non_cash_contribution)::numeric(14,2)
    as total_owner_investment_contribution,
  cash_effects.owner_withdrawals,
  spending.classified_paid_spending,
  case when unresolved.unresolved_source_count = 0 then spending.classified_paid_spending end
    as total_business_spending,
  unresolved.unresolved_source_count,
  cash_control.ledger_business_cash,
  cash_control.actual_business_cash,
  due_control.ledger_due_from_owners,
  due_control.actual_due_from_owners,
  cod_control.calculated_receivable as calculated_steadfast_receivable,
  cod_control.actual_receivable as confirmed_steadfast_receivable,
  case when cash_control.actual_business_cash is null or cod_control.actual_receivable is null
    then null else (cash_control.actual_business_cash + due_control.actual_due_from_owners
      + cod_control.actual_receivable)::numeric(14,2) end as total_available_receivable_funds,
  inventory.known_inventory_value,
  case when cash_control.actual_business_cash is null or cod_control.actual_receivable is null
    then null else ((cash_control.actual_business_cash - cash_control.ledger_business_cash)
      + (due_control.actual_due_from_owners - due_control.ledger_due_from_owners)
      + cod_control.difference)::numeric(14,2) end as unresolved_reconciliation_difference
from cash_effects cross join non_cash cross join cash_control cross join due_control
cross join cod_control cross join spending cross join unresolved cross join inventory;

revoke all on function public.record_steadfast_cod_settlement(
  date,text,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text
) from authenticated;
revoke all on function public.record_steadfast_cod_settlement_v2(
  date,text,text,text,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.record_steadfast_cod_settlement_v2(
  date,text,text,text,numeric,numeric,numeric,jsonb,uuid,text,text,text,text,text
) to authenticated;

revoke all on table public.dashboard_capital_spending_available_funds from public,anon;
grant select on table public.dashboard_capital_spending_available_funds to authenticated;

commit;
