begin;

-- Development-only control observations supplied by the owner on 2026-08-17.
-- These rows do not post cash, owner-held-fund, settlement, order, or balancing
-- movements. They only expose the difference between ledger and verified actuals.

insert into public.cash_account_balance_observations (
  id, account_key, observed_on, actual_balance, reason,
  idempotency_key, request_fingerprint, created_by
)
select
  observation_id, account_key, date '2026-08-17', 0.00,
  'Owner-confirmed current business account balance; observation only, no ledger adjustment.',
  idempotency_key,
  pg_catalog.md5(pg_catalog.concat_ws('|', account_key, '2026-08-17', '0.00',
    'Owner-confirmed current business account balance; observation only, no ledger adjustment.')),
  null
from (values
  ('f1000000-0000-4000-8000-000000000001'::uuid, 'cash'::text, 'f2000000-0000-4000-8000-000000000001'::uuid),
  ('f1000000-0000-4000-8000-000000000002'::uuid, 'bkash'::text, 'f2000000-0000-4000-8000-000000000002'::uuid),
  ('f1000000-0000-4000-8000-000000000003'::uuid, 'nagad'::text, 'f2000000-0000-4000-8000-000000000003'::uuid),
  ('f1000000-0000-4000-8000-000000000004'::uuid, 'bank'::text, 'f2000000-0000-4000-8000-000000000004'::uuid)
) as supplied(observation_id, account_key, idempotency_key)
on conflict (idempotency_key) do nothing;

insert into public.owner_held_balance_observations (
  id, owner_label, observed_on, actual_due, reason,
  idempotency_key, request_fingerprint, created_by
) values (
  'f1000000-0000-4000-8000-000000000005', 'Nasim', date '2026-08-17', 7214.00,
  'Owner-confirmed Due from Nasim control balance; historical source links remain unposted pending approval.',
  'f2000000-0000-4000-8000-000000000005',
  pg_catalog.md5(pg_catalog.concat_ws('|','Nasim','2026-08-17','7214.00',
    'Owner-confirmed Due from Nasim control balance; historical source links remain unposted pending approval.')),
  null
)
on conflict (idempotency_key) do nothing;

insert into public.steadfast_receivable_observations (
  id, observed_on, actual_receivable, reason,
  idempotency_key, request_fingerprint, created_by
) values (
  'f1000000-0000-4000-8000-000000000006', date '2026-08-17', 4623.00,
  'Owner-confirmed Steadfast collectible control balance; no order or settlement evidence was rewritten.',
  'f2000000-0000-4000-8000-000000000006',
  pg_catalog.md5(pg_catalog.concat_ws('|','2026-08-17','4623.00',
    'Owner-confirmed Steadfast collectible control balance; no order or settlement evidence was rewritten.')),
  null
)
on conflict (idempotency_key) do nothing;

commit;
