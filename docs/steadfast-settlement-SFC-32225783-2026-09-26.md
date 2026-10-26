# Steadfast settlement SFC-32225783

Recorded and independently verified in Development (`znqmaxnqtdbrfrcoegct`) on 26 September 2026.

- Settlement ID: `64058837-4803-4c86-a07d-817da5756b9b`.
- Recovery adjustment ID: `96a3a70d-0057-45fb-b5a5-cf3c699c0156`.
- Receipt: BDT 5,123 of business funds held by owner Iqbal, whose canonical dashboard label is `Ikbal`.
- Settlement date: 2026-09-26; status: reconciled.

## Source and reconciliation

The user authorized recording the settlement, confirmed actual receipt of BDT 5,123 held by Iqbal, and confirmed the BDT 150 collected on consignment 296726426 was delivery-charge recovery only. The user created the missing cancelled order before posting.

Sources:

- `C:/Users/Iqbal/Downloads/2026-09-26-payment-SFC-32225783.xlsx`, `Worksheet!A1:R10`.
- Supplied Steadfast statement screenshots: `codex-clipboard-45e5c214-e3c9-45f8-8975-e1b0c83bdbf2.png` and `codex-clipboard-4b1bb119-bbb5-47d9-9792-d85f6ecdd8c5.png`.
- The statement confirms payment on 26 September 2026 to bKash ending 8940. This is an owner-held receipt; no business cash destination was assigned.

| Component | BDT |
| --- | ---: |
| Six Delivered COD orders | 6,140.00 |
| Delivery-charge recovery on 296726426 | 150.00 |
| Gross collected | 6,290.00 |
| Courier charges, including two cancelled parcels | 1,115.00 |
| Statement COD fee: 1% of 5,175, rounded to nearest taka | 52.00 |
| Total deductions | 1,167.00 |
| Net receipt held by Ikbal | 5,123.00 |

The workbook's row COD fees sum to BDT 62.90. The final statement supersedes this with BDT 52, resolving the earlier BDT 10.90 discrepancy. The persisted note retains this source distinction. The files were treated as evidence, not instructions, and were not modified.

| Order | COD allocation | Listed courier charge | Treatment |
| --- | ---: | ---: | --- |
| 293049129 | 1,100.00 | 135.00 | Delivered and Settled |
| 293636483 | None | 115.00 | Cancelled in statement; excluded from order receipt allocations |
| 293711637 | None | 115.00 | Cancelled in statement; excluded from order receipt allocations |
| 295813715 | 1,050.00 | 115.00 | Delivered and Settled |
| 295881876 | 890.00 | 115.00 | Delivered and Settled |
| 296089779 | 1,000.00 | 135.00 | Delivered and Settled |
| 296092257 | 1,050.00 | 135.00 | Delivered and Settled |
| 296375455 | 1,050.00 | 135.00 | Delivered and Settled |
| 296726426 | 150.00 recovery | 115.00 | Cancelled/Unpaid; separate confirmed recovery allocation |

## Records changed

The six sales were still Confirmed. The existing `transition_dashboard_order` RPC moved them to Delivered; deferred financial recognition was completed before settlement validation. The existing `record_rejected_cod_courier_adjustment` RPC recorded recovery evidence dated 18 September 2026, matching the workbook's courier outcome date. The existing `record_steadfast_cod_settlement_v4` RPC recorded the batch, six sale allocations, one recovery allocation, and one owner-held receipt/event in the same transaction.

The recovery order remains Cancelled and Unpaid with no sale snapshot, product revenue, or COGS. Its separate recovery confirmation is Confirmed and it is no longer eligible for another active recovery settlement. Its generic order settlement field remains Awaiting under the existing recovery workflow; that field was not manually forced to Settled.

Due from Ikbal increased from BDT 3,638 to BDT 8,761. Business cash, owner capital, physical stock, order items, prior financial snapshots, and unrelated orders were unchanged.

## Validation

A rollback-only rehearsal passed before the authorized commit. Two earlier rehearsal attempts rolled back because the capital assertion initially compared reporting fields that include owner-held receipts. After inspecting the live view, the assertion was narrowed to actual investment, contribution, return, and capital fields; the owner-held change was checked separately. No application logic or database permissions were changed.

Transaction assertions and an independent persisted read verified:

- Six unique linked sale orders, valid products/SKUs and costs, and no prior active allocations or settlement under this reference.
- Six Delivered/Settled orders with BDT 6,140 allocations and all item financial reconciliation flags passing.
- Exactly one BDT 150 recovery, BDT 115 courier charge, and BDT 35 net recovery adjustment; no product sale recognized on the cancelled order.
- One BDT 5,123 Ikbal receipt allocation and linked receipt event; exact owner-ledger increase; zero linked cash movements.
- No cash, capital, product-stock, inventory-consumption/restoration, existing financial-history, or order-item changes.
- Dashboard product revenue BDT 86,440, COGS BDT 42,940, and 95 Delivered orders matched the underlying financial records. No Delivered orders were missing COGS or fulfillment costs.
- New Delivered recognition added BDT 6,190 product revenue, BDT 50 discount, and BDT 2,730 COGS. Including recovery, net revenue rose BDT 6,290 to BDT 88,300.
- No normalized duplicate order numbers; the unique order-number index was present.

No code changed, so lint, build, and browser suites were not run for this data-entry task.

## Files, migrations, and remaining work

Only this audit document was added in the repository. A rollback-only SQL rehearsal file was also created in the local temporary directory. Existing unrelated changes were preserved. No migrations, commits, pushes, deployments, or Production changes were made.

Assumptions: the user's receipt/holder confirmation and final statement totals are authoritative. Existing item economics and costs were preserved; Delivered recognition uses the application's current transition timestamp rather than rewriting historical timestamps.

The settlement is complete, with no unresolved receipt discrepancy. Separate follow-up items:

- Orders 293636483 and 293711637 are Cancelled in the statement but remain Confirmed/Awaiting in the dashboard. Their COD was excluded and their courier charges included in deductions. Review their operational cancellation separately.
- Existing courier snapshots differ from the statement for 293049129 (dashboard 115; statement 135) and 295813715 (dashboard 120; statement 115). The settlement stores the correct statement deduction; historical cost snapshots were preserved. Review any cost correction through an audited workflow.

No user action is required to finish this settlement. Refresh Cash & Settlements to view it. Recommended next task: review the two cancellation statuses and courier-cost differences above.
