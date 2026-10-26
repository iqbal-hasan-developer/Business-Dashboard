# NexaNotion dashboard owner guide

This guide covers the private launch MVP. Automated courier, bank, wallet, Meta,
OCR, notification, forecasting, and AI features are intentionally deferred.

## Daily operating order

1. Sign in with the approved owner account.
2. Review **Data checks** before entering or changing financial records.
3. Enter new Messenger, WhatsApp, phone, or offline orders from **Orders → New order**.
4. Confirm the customer location before saving. The current defaults are BDT 65
   Inside Dhaka, BDT 135 Outside Dhaka, and BDT 8 packaging.
5. Update operational order status separately from payment status. Settlement
   status changes only when settlement evidence is recorded.
6. Record campaigns, daily advertising spend, and operating expenses in their
   own modules. An expense record does not automatically create a cash outflow.
7. Record actual cash inflows/outflows under **Cash & settlements** only when
   money really moves.
8. Confirm Steadfast COD batches only against Delivered, eligible COD orders.
9. For a Delivered, Paid bKash, Nagad, Cash, or Bank Transfer order, open the
   order and use **Record payment receipt** after confirming the money reached
   the displayed account. The app derives the amount from the immutable order
   snapshot; do not also enter it as **Other cash inflow**.
10. Review the dashboard and reports, then export owner-only CSV backups as needed.

## Financial rules

- Revenue and COGS are recognized only from immutable Delivered-order snapshots.
- Cash balance comes only from the append-only cash ledger.
- Profit and cash are different. Owner investment changes cash but not profit.
- Courier settlement changes cash and COD settlement evidence; it does not change
  payment status, revenue, COGS, profit, inventory, or stock.
- A customer payment receipt changes only the matching cash account. It does not
  change revenue, profit, payment status, settlement status, inventory, or stock.
- New courier and packaging defaults affect future order snapshots only.
- Never edit a confirmed financial record to hide an error. Use the available
  owner reversal workflow or stop for a source-specific correction.

## Cash entries

Use one of four manual transaction types:

- **Owner investment:** owner money enters the business.
- **Owner withdrawal:** owner money leaves the business.
- **Other cash inflow:** non-sales cash receipt not represented by settlement.
- **Other cash outflow:** non-expense-linked cash payment.

Choose only an approved account: Cash, bKash, Nagad, Bank, or Steadfast. Add a
clear description and reference. Confirm the account, direction, and BDT amount
on the review step.

The **Owner capital by person** section lists every active investment and
withdrawal. The owner can use **Edit** to correct the date, type, person, account,
amount, description, or reference. Saving appends an opposite movement and the
corrected replacement atomically. **Delete** removes the record from active totals
by appending an opposite movement. Both actions require a reason and preserve the
original evidence; neither hard-deletes or rewrites the cash ledger.

The owner may reverse an eligible manual entry. Reversal appends an equal opposite
movement and preserves the original. Settlement, expense, and order-linked cash
require their source-specific correction workflow.

## End-of-day checks

- Data-quality counts are zero or explained.
- Delivered orders have item and immutable financial snapshots.
- Cash account balances match the available real-world balances.
- Newly received Steadfast COD batches are confirmed once, not duplicated.
- Dashboard reconciliation checks pass.
- Any unresolved discrepancy is recorded outside the dashboard and investigated
  before production financial data is changed.

## Weekly backup

1. Export Orders, Products, and Financial Report CSV files.
2. Store the files in the approved private business backup location.
3. Do not place customer exports in public/shared links.
4. Record the export date and owner who performed the backup.

Database backup and recovery steps are in
[`launch-and-recovery-runbook.md`](launch-and-recovery-runbook.md).
