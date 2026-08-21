# Procurement and inventory accounting contract

## Income statement boundary

- Inventory purchase and supplier-to-business freight-in are procurement assets, not period operating expenses.
- Advertising is sourced only from `daily_ad_spend`.
- Order courier and packaging costs are sourced only from immutable Delivered-order snapshots.
- Net Profit is `Contribution Profit - Advertising Spend - Operating Expenses`.
- Reclassifying procurement never rewrites an existing Delivered financial snapshot.

## Legacy state

Migration `202608180000_procurement_inventory_accounting.sql` preserves the IDs,
dates, descriptions, amounts, and prior audit records for the reviewed nine
records. It changes only their accounting category, through the existing audit
trigger and a fixed migration reason.

The six purchase/mixed records total BDT 46,980 and the three confirmed
supplier-freight records total BDT 1,480. No reliable legacy product, SKU,
quantity, purchase-batch, or freight attribution exists. All BDT 48,460 is
therefore reported as unallocated procurement until evidence is supplied.

The records also lack linked cash movements. The data-quality view reports this
instead of guessing a payment account. A historical cash outflow must only be
added after the owner identifies the actual paying account.

## Posting a reliable purchase batch

The owner/admin `record_purchase_batch` RPC accepts:

1. purchase date, optional supplier/reference/notes;
2. one unique product ID per item, positive received quantity, and exact
   supplier unit cost in integer poisha;
3. explicit merchandise and freight allocations from existing procurement
   records.

Merchandise allocations must equal item merchandise cost exactly. Freight is
allocated to items proportionally by merchandise value. Base poisha are floored,
then remaining poisha go to the largest fractional remainder with product UUID
as the deterministic tie-breaker. Allocated freight therefore always equals the
batch freight total.

Posted batch items and allocations are immutable. A correction requires new
append-only evidence rather than editing recognized history.

## Delivered COGS and inventory value

Pending and Cancelled orders do not consume inventory and recognize no COGS.
On a new Delivered transition, available posted cost layers are consumed FIFO by
purchase date and stable IDs. Each item stores exact base-cost, freight-cost, and
landed-cost totals in integer poisha. The immutable item financial allocation
copies that landed-cost split.

If no complete allocated layer is available, the system does not invent one; it
retains the existing verified-cost fallback and raises the landed-cost data
check. Existing historical Delivered snapshots and refund adjustments remain
unchanged.

Known inventory value is the exact remaining landed cost of posted batch layers
less immutable Delivered consumptions. Unallocated procurement is presented
separately and is never included in the known value.
