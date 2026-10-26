begin;

select plan(12);

do $setup$
declare
  actor_id uuid;
begin
  select user_id into actor_id
  from public.dashboard_user_profiles
  where role = 'owner' and is_active
  order by created_at
  limit 1;
  if actor_id is null then
    raise exception 'Owner-held repayment test requires one active owner.';
  end if;
  perform set_config('request.jwt.claim.sub', actor_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end
$setup$;

set local role authenticated;

create temporary table owner_held_repayment_test_state (
  owner_label text not null,
  account_key text not null,
  due_before numeric(14,2) not null,
  cash_before numeric(14,2) not null,
  investment_before numeric(14,2) not null,
  investment_id uuid,
  repayment_id uuid
) on commit drop;

insert into owner_held_repayment_test_state (
  owner_label, account_key, due_before, cash_before, investment_before
)
select
  'Nasim',
  'cash',
  (select ledger_due from public.dashboard_owner_held_balances where owner_label = 'Nasim'),
  (select balance from public.dashboard_cash_account_balances where account_key = 'cash'),
  (select cash_investment from public.dashboard_owner_capital_positions where owner_label = 'Nasim');

select lives_ok(
  $$select public.record_owner_held_fund_transfer(
    current_date, 'Nasim', 'cash', 75.00,
    'Owner-held repayment database-test due fixture.',
    '35000000-0000-4000-8000-000000000001'
  )$$,
  'creates an isolated owner-held due fixture'
);

update owner_held_repayment_test_state
set investment_id = public.record_dashboard_cash_movement(
  current_date,
  'owner_investment',
  'cash',
  75.00,
  'Mistaken owner investment repayment fixture',
  'OWNER-REPAYMENT-TEST',
  'Nasim',
  '35000000-0000-4000-8000-000000000002'
);

select ok(investment_id is not null, 'records the mistaken owner investment fixture')
from owner_held_repayment_test_state;

update owner_held_repayment_test_state
set repayment_id = public.reclassify_owner_investment_as_held_repayment(
  investment_id,
  current_date,
  'Correct owner investment fixture to a Due-from-Owner repayment.',
  '35000000-0000-4000-8000-000000000003'
);

select ok(repayment_id is not null, 'reclassifies the investment atomically')
from owner_held_repayment_test_state;

select is(
  (select ledger_due from public.dashboard_owner_held_balances where owner_label = 'Nasim'),
  due_before,
  'repayment consumes the isolated Due-from-Owner fixture'
)
from owner_held_repayment_test_state;

select is(
  (select balance from public.dashboard_cash_account_balances where account_key = 'cash'),
  cash_before,
  'repayment correction preserves the business cash balance'
)
from owner_held_repayment_test_state;

select is(
  (select cash_investment from public.dashboard_owner_capital_positions where owner_label = 'Nasim'),
  investment_before,
  'repayment correction removes the false investment effect'
)
from owner_held_repayment_test_state;

select is(
  (select count(*) from public.cash_movements where reversal_of_id = state.investment_id),
  1::bigint,
  'keeps the original investment and adds one reversal'
)
from owner_held_repayment_test_state state;

select is(
  (select count(*) from public.cash_movements where correction_of_id = state.investment_id),
  1::bigint,
  'adds one linked repayment replacement'
)
from owner_held_repayment_test_state state;

select is(
  public.reclassify_owner_investment_as_held_repayment(
    investment_id,
    current_date,
    'Correct owner investment fixture to a Due-from-Owner repayment.',
    '35000000-0000-4000-8000-000000000003'
  ),
  repayment_id,
  'reclassification is idempotent'
)
from owner_held_repayment_test_state;

select lives_ok(
  format(
    $$select public.reverse_owner_held_fund_repayment(
      %L::uuid, current_date,
      'Reverse owner-held repayment database-test fixture.',
      '35000000-0000-4000-8000-000000000004'
    )$$,
    repayment_id
  ),
  'reverses a repayment through its source-specific workflow'
)
from owner_held_repayment_test_state;

select is(
  (select ledger_due from public.dashboard_owner_held_balances where owner_label = 'Nasim'),
  due_before + 75.00,
  'repayment reversal restores the Due-from-Owner fixture'
)
from owner_held_repayment_test_state;

select is(
  (select balance from public.dashboard_cash_account_balances where account_key = 'cash'),
  cash_before - 75.00,
  'repayment reversal removes the returned cash while retaining the investment correction'
)
from owner_held_repayment_test_state;

select * from finish();
rollback;
