-- Development-only rollback rehearsal. Never run against Production.
-- Confirms the exact 20 paid historical sources and Ikbal's 500 owner-held correction.

begin;
set transaction isolation level serializable;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local search_path=public,extensions,pg_catalog;

create temporary table expected_paid_sources (
  source_type text not null,
  source_id uuid primary key,
  source_date date not null,
  amount numeric(12,2) not null,
  spending_category text not null,
  idempotency_key uuid not null unique
) on commit drop;

insert into expected_paid_sources values
  ('expense','a210d255-f291-4646-b3b8-c93d7e3c3de0','2026-06-22',6040.00,'procurement','f4000000-0000-4000-8000-000000000001'),
  ('expense','19da586d-e86c-4c86-99a8-ae7d3493a5b5','2026-07-12',6840.00,'procurement','f4000000-0000-4000-8000-000000000002'),
  ('expense','c80cf0ae-0e12-4aec-bfc3-b01177c60df8','2026-07-13',6840.00,'procurement','f4000000-0000-4000-8000-000000000003'),
  ('expense','1096c0a8-722e-4171-b95b-613fcd29869a','2026-07-15',6840.00,'procurement','f4000000-0000-4000-8000-000000000004'),
  ('expense','bbcdf759-62c0-4095-ab37-357a8bf327c3','2026-07-20',5300.00,'procurement','f4000000-0000-4000-8000-000000000005'),
  ('expense','fa6fa4aa-12e8-4ca2-a9d4-29d2be4b1a0a','2026-08-15',15120.00,'procurement','f4000000-0000-4000-8000-000000000006'),
  ('expense','236cb12d-07e3-468c-8337-ae0f7d88cc28','2026-07-01',800.00,'supplier_freight','f4000000-0000-4000-8000-000000000007'),
  ('expense','c9ee5905-a14c-4add-8926-4486d47b6bf9','2026-08-12',200.00,'supplier_freight','f4000000-0000-4000-8000-000000000008'),
  ('expense','2566055f-895e-482b-a3eb-3894b556e71f','2026-08-15',480.00,'supplier_freight','f4000000-0000-4000-8000-000000000009'),
  ('ad_spend','0c087aa9-5c81-4838-bf11-c144a20e5ab5','2026-07-17',1297.91,'advertising','f4000000-0000-4000-8000-000000000010'),
  ('ad_spend','1498e171-2c95-4bf3-9f86-e9e1348ec641','2026-07-20',354.20,'advertising','f4000000-0000-4000-8000-000000000011'),
  ('ad_spend','11a33a94-2a96-425a-807a-df9a3e1ff909','2026-07-21',60.61,'advertising','f4000000-0000-4000-8000-000000000012'),
  ('ad_spend','73b69bea-4732-437c-b7f2-9b3eb6bb8056','2026-07-21',839.46,'advertising','f4000000-0000-4000-8000-000000000013'),
  ('ad_spend','7f41293d-ca6d-42f1-82e3-65631bdcb2e7','2026-07-21',380.97,'advertising','f4000000-0000-4000-8000-000000000014'),
  ('ad_spend','0604593a-d085-4f7f-a942-e5dce4f282e7','2026-07-25',179.50,'advertising','f4000000-0000-4000-8000-000000000015'),
  ('ad_spend','3eea4b4b-49e5-40c9-8ebf-90f161d18736','2026-08-16',67.32,'advertising','f4000000-0000-4000-8000-000000000016'),
  ('ad_spend','b8e5a72d-d66d-4736-92d3-f405ba9478f1','2026-08-16',312.57,'advertising','f4000000-0000-4000-8000-000000000017'),
  ('ad_spend','e4c9b28d-b083-4c17-af5a-f7d904e129a1','2026-08-16',621.97,'advertising','f4000000-0000-4000-8000-000000000018'),
  ('ad_spend','ec1b732f-3364-40d9-b68c-4688a3e33a7c','2026-08-16',488.28,'advertising','f4000000-0000-4000-8000-000000000019'),
  ('expense','18a74311-770d-476a-a454-bd0cb3f739cb','2026-08-17',70.00,'operating','f4000000-0000-4000-8000-000000000020');

do $dry_run$
declare
  actor_id uuid;
  source_row record;
  duplicate_id uuid;
  original_id uuid;
  cash_total_before numeric;
  snapshots_before text;
  allocations_before text;
  expenses_before text;
  inventory_before text;
begin
  select user_id into actor_id from public.dashboard_user_profiles
  where role='owner' and is_active order by created_at limit 1;
  if actor_id is null then raise exception 'Dry run requires one active Development owner.'; end if;
  perform set_config('request.jwt.claim.sub',actor_id::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);

  if (select count(*) from pg_temp.expected_paid_sources)<>20
     or (select count(*) from pg_temp.expected_paid_sources where spending_category='procurement')<>6
     or (select count(*) from pg_temp.expected_paid_sources where spending_category='supplier_freight')<>3
     or (select count(*) from pg_temp.expected_paid_sources where spending_category='advertising')<>10
     or (select count(*) from pg_temp.expected_paid_sources where spending_category='operating')<>1
     or (select sum(amount) from pg_temp.expected_paid_sources)<>53132.79 then
    raise exception 'Expected source manifest count/category/amount contract is invalid.';
  end if;
  if exists (
    select 1 from pg_temp.expected_paid_sources expected
    left join lateral (
      select expense_date as source_date,amount from public.expenses
      where expected.source_type='expense' and id=expected.source_id
      union all
      select spend_date,amount from public.daily_ad_spend
      where expected.source_type='ad_spend' and id=expected.source_id
    ) actual on true
    where actual.source_date is null or actual.source_date<>expected.source_date or actual.amount<>expected.amount
  ) then raise exception 'A source ID, date, or amount differs from the approved manifest.'; end if;
  if exists (
    select 1 from pg_temp.expected_paid_sources expected
    join public.financial_source_fundings funding
      on funding.expense_id=expected.source_id or funding.ad_spend_id=expected.source_id
    left join public.financial_source_funding_reversals reversal on reversal.funding_id=funding.id
    where reversal.id is null
  ) then raise exception 'An approved source already has active funding.'; end if;
  if exists (
    select 1 from pg_temp.expected_paid_sources expected
    join public.cash_movements movement on movement.expense_id=expected.source_id
    where movement.reversal_of_id is null
      and not exists(select 1 from public.cash_movements reversal where reversal.reversal_of_id=movement.id)
  ) then raise exception 'An approved source already has an active linked cash movement.'; end if;
  if not exists (select 1 from public.cash_movements movement
      where movement.id='eb4913f2-3b9a-45e5-9399-6597d13de0d8'
        and movement.owner_label='Ikbal' and movement.transaction_type='owner_withdrawal'
        and movement.amount=500.00)
     or exists (select 1 from public.cash_movements reversal
      where reversal.reversal_of_id='eb4913f2-3b9a-45e5-9399-6597d13de0d8') then
    raise exception 'Canonical active Ikbal 500 withdrawal is not in the expected state.';
  end if;

  select coalesce(sum(signed_amount),0) into cash_total_before from public.dashboard_cash_ledger;
  select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.order_id)::text,'[]'))
    into snapshots_before from public.order_financial_snapshots row_data;
  select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text,'[]'))
    into allocations_before from public.order_item_financial_allocations row_data;
  select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text,'[]'))
    into expenses_before from public.expenses row_data;
  select md5(coalesce(jsonb_agg(to_jsonb(row_data))::text,'[]'))
    into inventory_before from public.dashboard_procurement_summary row_data;

  for source_row in select * from pg_temp.expected_paid_sources order by idempotency_key loop
    perform public.classify_historical_financial_source(
      source_row.source_type,source_row.source_id,'historical_business_paid_account_unknown',
      source_row.source_date,null,null,null,
      'Owner-confirmed paid from business funds; exact historical Cash/bKash/Nagad account is unavailable.',
      source_row.idempotency_key
    );
  end loop;
  select funding.id into original_id from public.financial_source_fundings funding
  where funding.idempotency_key='f4000000-0000-4000-8000-000000000001';
  duplicate_id := public.classify_historical_financial_source(
    'expense','a210d255-f291-4646-b3b8-c93d7e3c3de0','historical_business_paid_account_unknown',
    date '2026-06-22',null,null,null,
    'Owner-confirmed paid from business funds; exact historical Cash/bKash/Nagad account is unavailable.',
    'f4000000-0000-4000-8000-000000000001'
  );
  if duplicate_id<>original_id then raise exception 'Repeated submission was not idempotent.'; end if;

  perform public.reclassify_owner_withdrawal_as_held(
    'eb4913f2-3b9a-45e5-9399-6597d13de0d8',date '2026-08-18',
    'Owner-confirmed correction: NexaNotion business funds remain held by canonical owner Ikbal.',
    'f4000000-0000-4000-8000-000000000021'
  );
  perform public.record_owner_held_balance_observation(
    'Ikbal',date '2026-08-18',500.00,
    'Owner-confirmed current Due from Ikbal; canonical database owner identity retained.',
    'f4000000-0000-4000-8000-000000000022'
  );

  if (select count(*) from public.financial_source_fundings funding
      join pg_temp.expected_paid_sources expected on funding.idempotency_key=expected.idempotency_key
      left join public.financial_source_funding_reversals reversal on reversal.funding_id=funding.id
      where reversal.id is null and funding.funding_treatment='historical_business_paid_account_unknown')<>20
     or exists (select 1 from public.cash_movements movement
      join public.financial_source_fundings funding on funding.id=movement.funding_id
      join pg_temp.expected_paid_sources expected on expected.idempotency_key=funding.idempotency_key)
     or exists (select 1 from public.owner_non_cash_capital_events event
      join public.financial_source_fundings funding on funding.id=event.funding_id
      join pg_temp.expected_paid_sources expected on expected.idempotency_key=funding.idempotency_key)
     or exists (select 1 from public.owner_held_fund_events event
      join public.financial_source_fundings funding on funding.id=event.funding_id
      join pg_temp.expected_paid_sources expected on expected.idempotency_key=funding.idempotency_key) then
    raise exception 'Historical account-unknown classifications created duplicate cash or owner effects.';
  end if;
  if (select confirmed_paid_source_spending from public.dashboard_capital_spending_available_funds)<>53132.79
     or (select procurement_spending from public.dashboard_capital_spending_available_funds)<>46980.00
     or (select supplier_freight_spending from public.dashboard_capital_spending_available_funds)<>1480.00
     or (select advertising_spending from public.dashboard_capital_spending_available_funds)<>4602.79
     or (select operating_spending from public.dashboard_capital_spending_available_funds)<>70.00
     or (select verified_courier_fulfilment_spending from public.dashboard_capital_spending_available_funds)<>4336.30
     or (select total_business_cash_spending from public.dashboard_capital_spending_available_funds)<>57469.09 then
    raise exception 'Dry-run spending totals do not match the approved contract.';
  end if;
  if (select ledger_due from public.dashboard_owner_held_balances where owner_label='Nasim')<>7214.00
     or (select ledger_due from public.dashboard_owner_held_balances where owner_label='Ikbal')<>500.00
     or (select actual_due from public.dashboard_owner_held_balances where owner_label='Ikbal')<>500.00
     or (select actual_due_from_owners from public.dashboard_capital_spending_available_funds)<>7714.00
     or (select total_available_receivable_funds from public.dashboard_capital_spending_available_funds)<>12337.00 then
    raise exception 'Dry-run Due from Owner or available-funds totals are incorrect.';
  end if;
  if (select historical_owner_investment from public.dashboard_capital_spending_available_funds)<>48720.00
     or (select total_capital_returned from public.dashboard_capital_spending_available_funds)<>15120.00
     or (select current_contributed_capital from public.dashboard_capital_spending_available_funds)<>33600.00 then
    raise exception 'Dry run changed confirmed owner capital.';
  end if;
  if (select actual_business_cash from public.dashboard_capital_spending_available_funds)<>0.00 then
    raise exception 'Dry run changed observed business cash.';
  end if;
  if (select difference from public.dashboard_steadfast_receivable_reconciliation)<>3.00 then
    raise exception 'Dry run changed the Steadfast residual.';
  end if;
  if (select coalesce(sum(signed_amount),0) from public.dashboard_cash_ledger)<>cash_total_before then
    raise exception 'Dry run changed total ledger cash from % to %',cash_total_before,
      (select coalesce(sum(signed_amount),0) from public.dashboard_cash_ledger);
  end if;
  if snapshots_before<>(select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.order_id)::text,'[]')) from public.order_financial_snapshots row_data)
     or allocations_before<>(select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text,'[]')) from public.order_item_financial_allocations row_data)
     or expenses_before<>(select md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.id)::text,'[]')) from public.expenses row_data)
     or inventory_before<>(select md5(coalesce(jsonb_agg(to_jsonb(row_data))::text,'[]')) from public.dashboard_procurement_summary row_data) then
    raise exception 'Dry run mutated source, inventory, revenue, COGS, or refund evidence.';
  end if;

  -- Prove a later known-account replacement is append-only and does not double-count spending.
  begin
    perform public.reverse_financial_source_funding(
      original_id,date '2026-08-18','Rollback-only replacement proof',
      'f4000000-0000-4000-8000-000000000023'
    );
    perform public.classify_historical_financial_source(
      'expense','a210d255-f291-4646-b3b8-c93d7e3c3de0','business_account_paid',
      date '2026-06-22','cash',null,null,'Rollback-only known-account replacement proof',
      'f4000000-0000-4000-8000-000000000024'
    );
    if (select count(*) from public.dashboard_active_source_fundings where source_id='a210d255-f291-4646-b3b8-c93d7e3c3de0')<>1
       or (select confirmed_paid_source_spending from public.dashboard_capital_spending_available_funds)<>53132.79 then
      raise exception 'Known-account replacement duplicated or lost spending.';
    end if;
    raise exception using errcode='P7788',message='rollback replacement proof';
  exception when sqlstate 'P7788' then null;
  end;
end
$dry_run$;

select 'dry-run passed; transaction will roll back' as result,
  (select confirmed_paid_source_spending from public.dashboard_capital_spending_available_funds) as confirmed_paid_source_spending,
  (select verified_courier_fulfilment_spending from public.dashboard_capital_spending_available_funds) as verified_courier_spending,
  (select total_business_cash_spending from public.dashboard_capital_spending_available_funds) as total_business_cash_spending,
  (select ledger_due from public.dashboard_owner_held_balances where owner_label='Ikbal') as due_from_ikbal,
  (select total_available_receivable_funds from public.dashboard_capital_spending_available_funds) as available_receivable_funds;

rollback;
