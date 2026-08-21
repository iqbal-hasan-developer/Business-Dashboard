-- DEVELOPMENT ONLY. Append-only correction for the already-posted August 21
-- settlement and the three owner withdrawals. Run only after migration
-- 202608210003 and the paired dry run return the expected rows.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $correction$
declare
  actor constant uuid := '5f8df5e9-3374-4643-a531-bb500163a25a';
  wrong_settlement constant uuid := '1b60b110-1ed6-4e92-b478-26fde666b7fa';
  corrected_settlement constant uuid := 'a8210003-0001-4000-8000-000000000001';
  settlement_reversal constant uuid := 'a8210003-0002-4000-8000-000000000001';
  expense_id constant uuid := 'a8210003-0003-4000-8000-000000000001';
  expense_funding_id constant uuid := 'a8210003-0004-4000-8000-000000000001';
  invalid_count bigint;
  actual numeric;
begin
  if to_regclass('public.owner_money_taken_events') is null then
    raise exception 'Apply migration 202608210003 before this correction.';
  end if;
  if exists (select 1 from public.owner_money_taken_events where id in (
      'a8210003-0101-4000-8000-000000000001',
      'a8210003-0102-4000-8000-000000000001',
      'a8210003-0103-4000-8000-000000000001'
    )) or exists (select 1 from public.settlement_records where id=corrected_settlement) then
    raise exception 'The August 21 owner-money-taken correction is already present.';
  end if;

  select count(*) into invalid_count
  from public.cash_movements movement
  left join public.cash_movements reversal on reversal.reversal_of_id=movement.id
  where movement.id in (
      'fa70fd15-a0b9-4767-8f83-fe8a71b5acee',
      'd3f725c3-dc20-4689-8f2c-1760c8e08cbf',
      '5c220104-7d5d-46b5-8a24-9f87c97e8f87'
    )
    and movement.movement_date='2026-08-21'
    and movement.transaction_type='owner_withdrawal'
    and movement.amount=case movement.owner_label when 'Rifat' then 10000 else 500 end
    and reversal.id is null;
  if invalid_count <> 3 then
    raise exception 'Expected exactly three active August 21 owner withdrawals; found %.',invalid_count;
  end if;

  if not exists (
    select 1 from public.settlement_records settlement
    where settlement.id=wrong_settlement
      and settlement.settlement_date='2026-08-21'
      and settlement.gross_cod_amount=12940
      and settlement.fees_withheld=1940
      and settlement.amount_received=11000
      and settlement.receipt_treatment='owner_held_business_funds'
      and not exists (select 1 from public.settlement_reversals reversal where reversal.settlement_id=settlement.id)
      and (select count(*) from public.settlement_order_allocations allocation where allocation.settlement_id=settlement.id)=13
      and (select sum(allocated_amount) from public.settlement_order_allocations allocation where allocation.settlement_id=settlement.id)=12940
  ) then
    raise exception 'The posted settlement no longer matches the reviewed incorrect batch.';
  end if;

  if not exists (
    select 1 from public.financial_source_fundings funding
    join public.owner_held_fund_events event on event.funding_id=funding.id and event.event_type='spend'
    where funding.id='9a6b46ab-7e96-4218-bf57-2c3a9222af59'
      and funding.expense_id='7d6004cd-125c-43c0-9a8e-927560eca86f'
      and funding.amount=40 and funding.owner_label='Nasim'
      and funding.funding_treatment='owner_held_business_funds'
      and not exists (select 1 from public.financial_source_funding_reversals reversal where reversal.funding_id=funding.id)
  ) then
    raise exception 'The reviewed BDT 40 Nasim funding classification is no longer active.';
  end if;

  -- Reverse the wrong owner-held settlement effects. The original batch and
  -- allocations remain immutable and visible in history.
  insert into public.owner_held_fund_events (
    id,event_type,event_date,owner_label,amount,reversal_of_id,reason,
    idempotency_key,request_fingerprint,created_by
  ) values
    ('a8210003-1001-4000-8000-000000000001','reversal','2026-08-21','Ikbal',500,
      '44760850-fceb-4e1b-ae5e-243734ea3f4f','Settlement was received in business bKash, not held by Ikbal.',
      'a8210003-1101-4000-8000-000000000001',md5('SFC-31468898:reverse:Ikbal'),actor),
    ('a8210003-1002-4000-8000-000000000001','reversal','2026-08-21','Nasim',500,
      'e7facb11-305e-44d3-ac35-79c968a82784','Settlement was received in business bKash, not held by Nasim.',
      'a8210003-1102-4000-8000-000000000001',md5('SFC-31468898:reverse:Nasim'),actor),
    ('a8210003-1003-4000-8000-000000000001','reversal','2026-08-21','Rifat',10000,
      '7c53cc1f-444b-4690-a13a-ef3174a5f319','Settlement was received in business bKash, not held by Rifat.',
      'a8210003-1103-4000-8000-000000000001',md5('SFC-31468898:reverse:Rifat'),actor);

  insert into public.settlement_receipt_allocations (
    id,settlement_id,receipt_treatment,owner_label,amount,owner_held_event_id,
    allocation_type,reversal_of_id,source_reference,created_by
  ) values
    ('a8210003-1201-4000-8000-000000000001',wrong_settlement,'owner_held_business_funds','Ikbal',500,
      'a8210003-1001-4000-8000-000000000001','reversal','da52cbb2-fa08-4c79-b1a1-1ddd357445e6','settlement-correction:SFC-31468898:Ikbal',actor),
    ('a8210003-1202-4000-8000-000000000001',wrong_settlement,'owner_held_business_funds','Nasim',500,
      'a8210003-1002-4000-8000-000000000001','reversal','85f636fb-285b-4f01-9e6c-c619d932400b','settlement-correction:SFC-31468898:Nasim',actor),
    ('a8210003-1203-4000-8000-000000000001',wrong_settlement,'owner_held_business_funds','Rifat',10000,
      'a8210003-1003-4000-8000-000000000001','reversal','2ec5972c-3f38-4286-801a-b21b766c56f0','settlement-correction:SFC-31468898:Rifat',actor);

  insert into public.settlement_reversals (
    id,settlement_id,reversed_on,reason,cash_reversal_id,owner_held_reversal_id,
    idempotency_key,request_fingerprint,created_by
  ) values (
    settlement_reversal,wrong_settlement,'2026-08-21',
    'Correct SFC-31468898 destination and separate the BDT 63 bKash fee from Steadfast deductions.',
    null,'a8210003-1001-4000-8000-000000000001',
    'a8210003-1301-4000-8000-000000000001',md5('SFC-31468898:settlement-reversal'),actor
  );
  update public.orders set settlement_status='Awaiting',updated_at=now()
  where id in (select order_id from public.settlement_order_allocations where settlement_id=wrong_settlement);

  -- Reverse the three ambiguous ordinary withdrawals. Their opposite cash
  -- entries remove the old account effects; corrected replacements follow.
  insert into public.cash_movements (
    id,movement_date,movement_type,transaction_type,account_key,amount,description,
    reference,owner_label,reversal_of_id,idempotency_key,request_fingerprint,created_by
  ) values
    ('a8210003-2001-4000-8000-000000000001','2026-08-21','inflow','reversal','bkash',10000,
      'Reclassification: Rifat money taken follows the capital-first workflow.',null,'Rifat',
      'fa70fd15-a0b9-4767-8f83-fe8a71b5acee','a8210003-2101-4000-8000-000000000001',md5('owner-taken:reverse:Rifat'),actor),
    ('a8210003-2002-4000-8000-000000000001','2026-08-21','inflow','reversal','cash',500,
      'Reclassification: Nasim money came from bKash and becomes Due from Owner.',null,'Nasim',
      'd3f725c3-dc20-4689-8f2c-1760c8e08cbf','a8210003-2102-4000-8000-000000000001',md5('owner-taken:reverse:Nasim'),actor),
    ('a8210003-2003-4000-8000-000000000001','2026-08-21','inflow','reversal','cash',500,
      'Reclassification: Ikbal money came from bKash and becomes Due from Owner.',null,'Ikbal',
      '5c220104-7d5d-46b5-8a24-9f87c97e8f87','a8210003-2103-4000-8000-000000000001',md5('owner-taken:reverse:Ikbal'),actor);

  -- The BDT 40 utility was paid from historical business funds with no
  -- evidence for a specific account or owner. Reverse only its classification.
  insert into public.owner_held_fund_events (
    id,event_type,event_date,owner_label,amount,reversal_of_id,reason,
    idempotency_key,request_fingerprint,created_by
  ) values (
    'a8210003-3001-4000-8000-000000000001','reversal','2026-08-21','Nasim',40,
    '988790d1-9e55-4e56-a087-66f6dc41f1df',
    'No evidence that this historical utility payment used business funds held by Nasim.',
    'a8210003-3101-4000-8000-000000000001',md5('utility40:reverse-owner-held'),actor
  );
  insert into public.financial_source_funding_reversals (
    id,funding_id,reversed_on,reason,owner_held_reversal_id,
    idempotency_key,request_fingerprint,created_by
  ) values (
    'a8210003-3002-4000-8000-000000000001','9a6b46ab-7e96-4218-bf57-2c3a9222af59','2026-08-21',
    'Reclassify as historical business paid with account unknown; do not reduce Due from Nasim.',
    'a8210003-3001-4000-8000-000000000001','a8210003-3102-4000-8000-000000000001',
    md5('utility40:funding-reversal'),actor
  );
  insert into public.financial_source_fundings (
    id,expense_id,funding_treatment,payment_date,amount,notes,
    idempotency_key,request_fingerprint,created_by
  ) values (
    'a8210003-3003-4000-8000-000000000001','7d6004cd-125c-43c0-9a8e-927560eca86f',
    'historical_business_paid_account_unknown','2026-08-20',40,
    'User-confirmed business payment; exact historical Cash, bKash, Nagad, Bank, or owner source is unavailable.',
    'a8210003-3103-4000-8000-000000000001',md5('utility40:historical-account-unknown'),actor
  );

  -- Append the corrected settlement using the exact same 13 reviewed orders.
  insert into public.settlement_records (
    id,courier,settlement_reference,settlement_date,amount_received,fees_withheld,
    status,notes,created_by,updated_by,receiving_method,receiving_account_label,
    receiving_transaction_reference,gross_cod_amount,idempotency_key,
    request_fingerprint,confirmed_at,receipt_treatment,owner_label
  ) values (
    corrected_settlement,'Steadfast','SFC-31468898','2026-08-21',11063,1877,
    'reconciled','Corrected append-only replacement: net received in business bKash; BDT 63 cash-out fee posted separately.',
    actor,actor,'bkash','Business bKash','SFC-31468898',12940,
    'a8210003-4001-4000-8000-000000000001',md5('SFC-31468898:corrected-settlement'),now(),
    'business_account',null
  );
  insert into public.settlement_order_allocations (settlement_id,order_id,allocated_amount,created_by)
  select corrected_settlement,allocation.order_id,allocation.allocated_amount,actor
  from public.settlement_order_allocations allocation
  where allocation.settlement_id=wrong_settlement;
  insert into public.cash_movements (
    id,movement_date,movement_type,transaction_type,account_key,amount,settlement_id,
    description,reference,created_by
  ) values (
    'a8210003-4002-4000-8000-000000000001','2026-08-21','inflow','courier_settlement',
    'bkash',11063,corrected_settlement,'Steadfast COD settlement receipt','SFC-31468898',actor
  );
  update public.orders set settlement_status='Settled',updated_at=now()
  where id in (select order_id from public.settlement_order_allocations where settlement_id=corrected_settlement);

  -- Rifat: the full BDT 10,000 is a capital return.
  insert into public.cash_movements (
    id,movement_date,movement_type,transaction_type,account_key,amount,description,
    reference,owner_label,idempotency_key,request_fingerprint,created_by
  ) values (
    'a8210003-5001-4000-8000-000000000001','2026-08-21','outflow','owner_money_taken','bkash',10000,
    'Rifat took business money; applied to contributed capital first.','SFC-31468898','Rifat',
    'a8210003-5101-4000-8000-000000000001',md5('owner-taken:Rifat:10000'),actor
  );
  insert into public.owner_capital_return_events (
    id,event_type,event_date,owner_label,amount,settlement_treatment,reason,
    idempotency_key,request_fingerprint,created_by
  ) values (
    'a8210003-5002-4000-8000-000000000001','return','2026-08-21','Rifat',10000,'business_account',
    'Capital portion of owner money taken from bKash; no profit effect.',
    'a8210003-5102-4000-8000-000000000001',md5('owner-taken:Rifat:capital'),actor
  );
  insert into public.owner_money_taken_events (
    id,event_type,event_date,owner_label,amount,capital_return_amount,excess_due_amount,
    source_account_key,cash_movement_id,capital_return_id,description,reference,
    idempotency_key,request_fingerprint,created_by
  ) values (
    'a8210003-0101-4000-8000-000000000001','taken','2026-08-21','Rifat',10000,10000,0,
    'bkash','a8210003-5001-4000-8000-000000000001','a8210003-5002-4000-8000-000000000001',
    'Rifat took business money; applied to contributed capital first.','SFC-31468898',
    'a8210003-5103-4000-8000-000000000001',md5('owner-taken:Rifat:master'),actor
  );

  -- Nasim and Ikbal have no remaining contributed capital, so each BDT 500
  -- becomes Due from Owner while cash leaves bKash exactly once.
  insert into public.cash_movements (
    id,movement_date,movement_type,transaction_type,account_key,amount,description,
    reference,owner_label,idempotency_key,request_fingerprint,created_by
  ) values
    ('a8210003-5003-4000-8000-000000000001','2026-08-21','outflow','owner_money_taken','bkash',500,
      'Nasim took business money beyond remaining contributed capital.','SFC-31468898','Nasim',
      'a8210003-5104-4000-8000-000000000001',md5('owner-taken:Nasim:500'),actor),
    ('a8210003-5004-4000-8000-000000000001','2026-08-21','outflow','owner_money_taken','bkash',500,
      'Ikbal took business money beyond remaining contributed capital.','SFC-31468898','Ikbal',
      'a8210003-5105-4000-8000-000000000001',md5('owner-taken:Ikbal:500'),actor);
  insert into public.owner_held_fund_events (
    id,event_type,event_date,owner_label,amount,cash_movement_id,reason,
    idempotency_key,request_fingerprint,created_by
  ) values
    ('a8210003-5005-4000-8000-000000000001','receipt','2026-08-21','Nasim',500,
      'a8210003-5003-4000-8000-000000000001','Excess owner money taken beyond contributed capital.',
      'a8210003-5106-4000-8000-000000000001',md5('owner-taken:Nasim:due'),actor),
    ('a8210003-5006-4000-8000-000000000001','receipt','2026-08-21','Ikbal',500,
      'a8210003-5004-4000-8000-000000000001','Excess owner money taken beyond contributed capital.',
      'a8210003-5107-4000-8000-000000000001',md5('owner-taken:Ikbal:due'),actor);
  insert into public.owner_money_taken_events (
    id,event_type,event_date,owner_label,amount,capital_return_amount,excess_due_amount,
    source_account_key,cash_movement_id,owner_held_event_id,description,reference,
    idempotency_key,request_fingerprint,created_by
  ) values
    ('a8210003-0102-4000-8000-000000000001','taken','2026-08-21','Nasim',500,0,500,
      'bkash','a8210003-5003-4000-8000-000000000001','a8210003-5005-4000-8000-000000000001',
      'Nasim took business money beyond remaining contributed capital.','SFC-31468898',
      'a8210003-5108-4000-8000-000000000001',md5('owner-taken:Nasim:master'),actor),
    ('a8210003-0103-4000-8000-000000000001','taken','2026-08-21','Ikbal',500,0,500,
      'bkash','a8210003-5004-4000-8000-000000000001','a8210003-5006-4000-8000-000000000001',
      'Ikbal took business money beyond remaining contributed capital.','SFC-31468898',
      'a8210003-5109-4000-8000-000000000001',md5('owner-taken:Ikbal:master'),actor);

  -- The BDT 63 is an operating financial fee paid from bKash, not a courier
  -- deduction, capital return, owner balance, or settlement allocation.
  insert into public.expenses (
    id,expense_date,category_key,description,amount,payment_method,reference,
    created_by,updated_by
  ) values (
    expense_id,'2026-08-21','financial_fees','bKash cash-out / transaction charge',63,
    'bKash','SFC-31468898',actor,actor
  );
  insert into public.financial_source_fundings (
    id,expense_id,funding_treatment,payment_date,business_account_key,amount,
    idempotency_key,request_fingerprint,created_by
  ) values (
    expense_funding_id,expense_id,'business_account_paid','2026-08-21','bkash',63,
    'a8210003-6001-4000-8000-000000000001',md5('SFC-31468898:bkash-fee:funding'),actor
  );
  insert into public.cash_movements (
    id,movement_date,movement_type,transaction_type,account_key,amount,expense_id,
    description,reference,funding_id,idempotency_key,request_fingerprint,created_by
  ) values (
    'a8210003-6002-4000-8000-000000000001','2026-08-21','outflow','expense','bkash',63,
    expense_id,'bKash cash-out / transaction charge','SFC-31468898',expense_funding_id,
    'a8210003-6003-4000-8000-000000000001',md5('SFC-31468898:bkash-fee:cash'),actor
  );

  -- Append current control observations; prior observations remain immutable.
  insert into public.owner_held_balance_observations (
    owner_label,observed_on,actual_due,reason,idempotency_key,request_fingerprint,created_by
  ) values
    ('Rifat','2026-08-21',0,'Owner-position correction confirmed; latest BDT 10,000 was capital returned.',
      'a8210003-7001-4000-8000-000000000001',md5('owner-control:Rifat:0'),actor),
    ('Nasim','2026-08-21',7714,'Owner-position correction confirmed from append-only receipt and spend history.',
      'a8210003-7002-4000-8000-000000000001',md5('owner-control:Nasim:7714'),actor),
    ('Ikbal','2026-08-21',1000,'Canonical Ikbal owner-position correction confirmed.',
      'a8210003-7003-4000-8000-000000000001',md5('owner-control:Ikbal:1000'),actor);
  insert into public.cash_account_balance_observations (
    account_key,observed_on,actual_balance,reason,idempotency_key,request_fingerprint,created_by
  ) values (
    'bkash','2026-08-21',0,
    'SFC-31468898 net receipt was fully used by BDT 11,000 owner money taken plus BDT 63 bKash fee.',
    'a8210003-7004-4000-8000-000000000001',md5('cash-control:bkash:2026-08-21:0'),actor
  );

  -- Transaction-local acceptance gates.
  select count(*) into invalid_count
  from public.dashboard_owner_capital_positions position
  where (position.owner_label='Rifat' and (
      position.historical_investment<>33600 or position.capital_returned<>10000
      or position.current_contributed_capital<>23600 or position.due_from_owner<>0))
    or (position.owner_label='Nasim' and (
      position.historical_investment<>15120 or position.capital_returned<>15120
      or position.current_contributed_capital<>0 or position.due_from_owner<>7714))
    or (position.owner_label='Ikbal' and (
      position.historical_investment<>0 or position.capital_returned<>0
      or position.current_contributed_capital<>0 or position.due_from_owner<>1000));
  if invalid_count <> 0 then raise exception 'Per-owner reconciliation failed for % owner rows.',invalid_count; end if;

  select sum(historical_investment) into actual from public.dashboard_owner_capital_positions;
  if actual<>48720 then raise exception 'Historical investment expected 48720; got %.',actual; end if;
  select sum(capital_returned) into actual from public.dashboard_owner_capital_positions;
  if actual<>25120 then raise exception 'Capital returned expected 25120; got %.',actual; end if;
  select sum(current_contributed_capital) into actual from public.dashboard_owner_capital_positions;
  if actual<>23600 then raise exception 'Current capital expected 23600; got %.',actual; end if;
  select sum(due_from_owner) into actual from public.dashboard_owner_capital_positions;
  if actual<>8714 then raise exception 'Due from owners expected 8714; got %.',actual; end if;
  select sum(amount) into actual from public.owner_money_taken_events
  where event_type='taken' and event_date='2026-08-21' and reference='SFC-31468898';
  if actual<>11000 then raise exception 'Owner money taken expected 11000; got %.',actual; end if;
  select sum(capital_return_amount) into actual from public.owner_money_taken_events
  where event_type='taken' and event_date='2026-08-21' and reference='SFC-31468898';
  if actual<>10000 then raise exception 'Capital-return portion expected 10000; got %.',actual; end if;
  select sum(excess_due_amount) into actual from public.owner_money_taken_events
  where event_type='taken' and event_date='2026-08-21' and reference='SFC-31468898';
  if actual<>1000 then raise exception 'Excess-Due portion expected 1000; got %.',actual; end if;
  if exists (select 1 from public.owner_money_taken_events where event_type='taken' and reference='SFC-31468898' and source_account_key<>'bkash') then
    raise exception 'Every corrected owner-money-taken source must be bKash.';
  end if;
  if (select count(*) from public.settlement_records settlement left join public.settlement_reversals reversal on reversal.settlement_id=settlement.id where settlement.settlement_reference='SFC-31468898' and reversal.id is null)<>1 then
    raise exception 'SFC-31468898 must have exactly one active batch.';
  end if;
  if not exists (select 1 from public.settlement_records where id=corrected_settlement and gross_cod_amount=12940 and fees_withheld=1877 and amount_received=11063) then
    raise exception 'Corrected settlement totals do not reconcile.';
  end if;
  if not exists (select 1 from public.expenses where id=expense_id and amount=63 and category_key='financial_fees') then
    raise exception 'The separate BDT 63 financial fee is missing.';
  end if;
end
$correction$;

commit;
