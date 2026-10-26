# Direct owner collection: order 01878734378

## Recorded result

- Development project: `znqmaxnqtdbrfrcoegct` (NexaNotion Business Dashboard Dev).
- Mustakim, order `7f6820c3-484b-48e2-aa51-b61a5d08cffa`, is now Settled.
- User confirmed Iqbal collected the full BDT 600 directly from the customer and holds it for NexaNotion. Canonical ledger owner: `Ikbal`.
- Settlement `31de5f10-8b3b-4c97-b529-57775144b42e`, reference `OWNER-DELIVERY-01878734378`.
- BDT 600 gross/received, zero fees, receipt type Owner delivery.
- Recorded on the user's confirmation date, 2026-09-15, Asia/Dhaka. The historical physical collection date was not supplied.
- Ikbal's ledger Due from Owner increased from BDT 2,031 to BDT 2,631.
- Business cash did not change. Historical net revenue BDT 600, COGS BDT 500 and gross profit BDT 100 remain unchanged.

## Files and migration

- `supabase/migrations/20260914191910_owner_delivery_held_settlement.sql` applied only to Development.
- `supabase/tests/database/036_owner_delivery_held_settlement.test.sql` adds isolated, rollback-only validation.
- This handoff document.

The migration adds an owner/admin guarded atomic RPC for full owner-delivery COD collection, permits only zero-fee owner-held direct receipts in the existing confirmed-settlement constraint, and extends the existing owner-only append-only reversal function to these receipts. It preserves RLS, immutable snapshots and all existing Steadfast receipt rules. The original order's historical COD payment method is retained.

## Validation

- Migration plus four settlement/reversal suites: 35/35 pgTAP assertions passed in a transaction that was rolled back.
- Runtime cases cover unapproved callers, wrong courier, Pending orders, stale requests, idempotent replay, conflicting replay, duplicate settlement, receipt and owner-balance reconciliation, immutable evidence and reversal.
- Trial of the actual BDT 600 entry passed after migration and was rolled back; the same verified transaction was then committed.
- Independent persisted queries confirmed the receipt/event/allocation links, Settled status, removal from outstanding COD, unchanged financial totals and zero linked cash entries.
- Item revenue and COGS reconcile with the immutable order snapshot; no missing product/SKU links. Existing unique order-number constraint remains in place.
- Security advisor flags the two authenticated SECURITY DEFINER RPCs as expected: collection is explicitly owner/admin guarded, reversal is owner-only, and anon/service-role execution is denied. The separate pre-existing project advisories were not changed.
- No frontend code changed; no browser/build test was needed for this database-only operation.

## Corrections and remaining scope

Do not edit or delete the confirmed receipt or its allocations. If an owner authorizes a correction, call `reverse_steadfast_cod_settlement` with this settlement ID, a valid reversal date, reason and a new idempotency key. The compatibility function name is retained; it now also accepts Owner delivery. Reversal preserves the original receipt, restores outstanding status and appends the correcting owner-held event without a cash movement.

After a direct receipt exists, do not restore the old Steadfast-only table constraint: even reversed original receipts are retained. Disable future direct-collection calls by revoking execution if necessary; use a new reviewed migration for any further schema change.

Production, the website repository, existing uncommitted edits, commits and pushes were untouched. No new direct-collection entry form was added; existing settlement screens retain some Steadfast wording. The receipt itself stores Owner delivery and an explicit direct-collection note. A future UI task can expose direct collections with general settlement labels.

No action is required beyond refreshing the order page to review the saved status.
