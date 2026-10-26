# Steadfast settlement SFC-31984628

## Summary

Recorded in Development (`znqmaxnqtdbrfrcoegct`) on 15 September 2026 through the existing guarded application RPCs. Settlement ID: `04d7badc-abf5-4500-a739-5c909e45fec3`.

The user authorized recording the supplied workbook as business funds held by owner Iqbal and confirmed the actual net receipt was BDT 3,638. The live canonical owner label is `Ikbal`.

| Reconciliation | BDT |
| --- | ---: |
| Four Delivered COD orders | 4,200.00 |
| Listed courier charges, including cancelled consignment | 525.00 |
| Unspecified additional deductions | 37.00 |
| Total deductions | 562.00 |
| Net held by Ikbal | 3,638.00 |

Source: `C:/Users/Iqbal/Downloads/2026-09-15-payment-SFC-31984628.xlsx`, `Worksheet!A1:O6`. The workbook was read without modification. Instructions or labels within the workbook were treated as source content, not authorization.

| Consignment/order | Workbook status | COD allocated (BDT) | Listed courier charge (BDT) |
| --- | --- | ---: | ---: |
| 293701597 | Cancelled | Excluded | 115.00 |
| 295457259 | Delivered | 1,050.00 | 135.00 |
| 295817764 | Delivered | 1,050.00 | 65.00 |
| 295881417 | Delivered | 1,050.00 | 105.00 |
| 295882498 | Delivered | 1,050.00 | 105.00 |

## Application records changed

- Order `295882498` was still Confirmed. The source-supported prerequisite update used `transition_dashboard_order` to mark it Delivered. Its deferred recognition trigger was executed before settlement validation inside the same transaction.
- `record_steadfast_cod_settlement_v4` recorded four allocations and marked all four eligible orders Settled.
- One receipt allocation and owner-held receipt event (`0983462d-f921-46ce-9060-fc3a5b48213d`) record BDT 3,638 for Ikbal. Ledger Due from Ikbal increased from BDT 0 to BDT 3,638.
- Settlement date follows the source filename: 2026-09-15. The Delivered recognition uses the app's current transition timestamp; historical timestamps were not rewritten.

## Tests and results

A rollback-only rehearsal passed before the authorized commit. Initial rehearsal attempts rolled back due to an explicit lock requiring management-role privileges and then deferred recognition not yet having run. The final script obtained locks before switching to the authenticated owner role and executed deferred constraints before settlement. No permissions, functions, or triggers were changed.

Transaction assertions and an independent persisted read verified:

- Four unique, linked product/SKU records; no existing settlement under this reference or allocations for these orders.
- All four orders Delivered and Settled, with BDT 4,200 total order allocations and fully reconciled item revenue/COGS allocations.
- One BDT 3,638 owner receipt/event, exact Due-from-Owner increase, zero settlement-linked cash movements, unchanged cash history and capital totals.
- The prerequisite Delivered update recognized BDT 1,050 product revenue and BDT 500 COGS. Other recognized order economics remained unchanged. Product stock remained unchanged and no inventory-consumption rows were added.
- Dashboard product revenue BDT 80,250, COGS BDT 40,210, and 89 Delivered orders matched the underlying financial records. No Delivered orders were missing COGS or fulfillment costs.
- No duplicate order numbers existed; the unique order-number index remains present.

No application-code changes were made, so lint, build and browser suites were not run for this data-entry task.

## Files and database migrations

Only this audit document was added in the repository. Existing unrelated worktree changes were preserved. No schema migrations, commits, pushes or deployments were performed. Production was not modified.

## Assumptions, remaining issues and next task

- The additional BDT 37 has no itemized explanation in the workbook and remains explicitly unspecified in the persisted settlement note. Recommended follow-up: obtain the courier's fee breakdown.
- Workbook courier charges for `295881417` and `295882498` are BDT 105 each, while existing app snapshots are BDT 110 each. Historical costs were retained; the settlement stores the confirmed total deduction separately. Any cost correction requires its own audited workflow.
- Cancelled source consignment `293701597` remains Confirmed/Awaiting in the app. Its COD was excluded and its BDT 115 courier charge included in batch deductions. Recommended follow-up: review its operational cancellation separately.
- The owner-balance screen also contains an older observed balance of BDT 1,000 dated 21 August. This posting updates the ledger to BDT 3,638 and does not refresh that historical observation.
- No manual action is required to complete this settlement. Refresh Cash & Settlements to see the persisted record.
