-- Controlled, order-linked cash receipts for Delivered, Paid, non-COD orders.
-- The database derives the account and exact receipt amount. This workflow does
-- not change payment, settlement, recognition, refund, inventory, or stock data.

alter table public.cash_movements
  drop constraint if exists cash_movements_transaction_type_allowed,
  add constraint cash_movements_transaction_type_allowed check (
    transaction_type in (
      'owner_investment', 'owner_withdrawal',
      'operating_inflow', 'operating_outflow',
      'transfer_in', 'transfer_out', 'courier_settlement', 'expense',
      'customer_payment', 'reversal'
    )
  ),
  drop constraint if exists cash_movements_customer_payment_shape,
  add constraint cash_movements_customer_payment_shape check (
    transaction_type <> 'customer_payment'
    or (
      movement_type = 'inflow'
      and order_id is not null
      and settlement_id is null
      and expense_id is null
      and reversal_of_id is null
      and owner_label is null
    )
  );

create unique index if not exists cash_movements_customer_payment_order_unique
  on public.cash_movements (order_id)
  where transaction_type = 'customer_payment'
    and correction_of_id is null;

create or replace function public.record_customer_payment_receipt(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_received_on date,
  p_reference text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
  current_order public.orders%rowtype;
  normalized_reference text := nullif(btrim(p_reference), '');
  normalized_payment_method text;
  receipt_account text;
  receipt_amount numeric(14,2);
  fingerprint text;
  existing public.cash_movements%rowtype;
  new_id uuid;
begin
  if actor is null or not public.dashboard_has_any_role(
    array['owner', 'admin']::public.dashboard_role[]
  ) then
    raise exception 'Owner or admin access is required to record a customer payment receipt.'
      using errcode = '42501';
  end if;

  if p_order_id is null or p_expected_updated_at is null
     or p_received_on is null or p_idempotency_key is null then
    raise exception 'Order, freshness evidence, receipt date, and request key are required.'
      using errcode = '22023';
  end if;
  if p_received_on > (now() at time zone 'Asia/Dhaka')::date then
    raise exception 'Receipt date cannot be in the future.' using errcode = '22023';
  end if;
  if char_length(coalesce(normalized_reference, '')) > 120 then
    raise exception 'Payment reference exceeds the supported length.' using errcode = '22023';
  end if;
  if coalesce(normalized_reference, '') ~* '(password|passcode|pin|otp|cvv|secret|full[ -]?account|account[ -]?number)' then
    raise exception 'Do not store credentials or full private account details.' using errcode = '22023';
  end if;

  fingerprint := pg_catalog.md5(pg_catalog.jsonb_build_object(
    'workflow', 'customer_payment_receipt',
    'order_id', p_order_id,
    'expected_updated_at', p_expected_updated_at,
    'received_on', p_received_on,
    'reference', coalesce(normalized_reference, '')
  )::text);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_idempotency_key::text, 0)
  );
  select * into existing
  from public.cash_movements
  where idempotency_key = p_idempotency_key::text;
  if found then
    if existing.request_fingerprint <> fingerprint
       or existing.transaction_type <> 'customer_payment' then
      raise exception 'The request key was already used with different receipt details.'
        using errcode = '23505';
    end if;
    return existing.id;
  end if;

  select * into current_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'Order was not found.' using errcode = 'P0002';
  end if;
  if current_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'The order changed after this page loaded. Refresh before recording the receipt.'
      using errcode = '40001';
  end if;
  if coalesce(current_order.dashboard_order_status, '') <> 'Delivered' then
    raise exception 'Only Delivered orders can record a customer payment receipt.'
      using errcode = 'P0001';
  end if;
  if coalesce(current_order.dashboard_payment_status, '') <> 'Paid' then
    raise exception 'Payment status must be Paid before recording the receipt.'
      using errcode = 'P0001';
  end if;
  if p_received_on < coalesce(
    current_order.order_date,
    (current_order.created_at at time zone 'Asia/Dhaka')::date
  ) then
    raise exception 'Receipt date cannot precede the order date.' using errcode = '22023';
  end if;
  if coalesce(current_order.refund_amount, 0) <> 0
     or exists (
       select 1 from public.order_financial_adjustments adjustment
       where adjustment.order_id = current_order.id
     ) then
    raise exception 'Refunded or financially adjusted orders require a dedicated receipt correction workflow.'
      using errcode = 'P0001';
  end if;

  select
    lower(snapshot.payment_method),
    (
      snapshot.product_revenue
      + snapshot.delivery_revenue
      - snapshot.discount_amount
    )::numeric(14,2)
  into normalized_payment_method, receipt_amount
  from public.order_financial_snapshots snapshot
  where snapshot.order_id = current_order.id
    and snapshot.recognition_status = 'Delivered';
  if not found then
    raise exception 'Delivered financial snapshot is required before recording the receipt.'
      using errcode = 'P0001';
  end if;

  receipt_account := case normalized_payment_method
    when 'bkash' then 'bkash'
    when 'nagad' then 'nagad'
    when 'cash' then 'cash'
    when 'bank transfer' then 'bank'
    when 'bank_transfer' then 'bank'
    else null
  end;
  if receipt_account is null then
    raise exception 'COD and unsupported payment methods cannot use customer payment receipts.'
      using errcode = 'P0001';
  end if;
  if receipt_amount is null or receipt_amount <= 0
     or receipt_amount <> trunc(receipt_amount, 2) then
    raise exception 'The authoritative order receipt amount must be positive exact BDT.'
      using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.business_lookup_values
    where lookup_type = 'cash_account'
      and lookup_key = receipt_account
      and is_active
  ) then
    raise exception 'The payment-method cash account is not active.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.cash_movements movement
    where movement.order_id = current_order.id
      and movement.movement_type in ('inflow', 'transfer_in')
      and movement.reversal_of_id is null
      and not exists (
        select 1 from public.cash_movements reversal
        where reversal.reversal_of_id = movement.id
      )
  ) then
    raise exception 'This order already has an active linked cash receipt.' using errcode = '23505';
  end if;

  insert into public.cash_movements (
    movement_date, movement_type, transaction_type, account_key, amount,
    order_id, description, reference, idempotency_key,
    request_fingerprint, created_by
  ) values (
    p_received_on, 'inflow', 'customer_payment', receipt_account, receipt_amount,
    current_order.id, 'Customer payment receipt for order ' || current_order.order_number,
    normalized_reference, p_idempotency_key::text, fingerprint, actor
  ) returning id into new_id;

  return new_id;
end
$function$;

revoke all on function public.record_customer_payment_receipt(
  uuid, timestamptz, date, text, uuid
) from public, anon, service_role;
grant execute on function public.record_customer_payment_receipt(
  uuid, timestamptz, date, text, uuid
) to authenticated;

comment on function public.record_customer_payment_receipt(
  uuid, timestamptz, date, text, uuid
) is 'Records one exact, idempotent cash receipt for a Delivered Paid non-COD order without changing order, settlement, recognition, refund, or inventory state.';
