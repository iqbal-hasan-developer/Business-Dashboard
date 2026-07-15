# Confirmed-schema migration review

This review is based on the locally retained metadata-only production and
development exports. It contains no raw function definitions, credentials,
customer rows, product rows, order rows, Auth users, or sensitive constants.

## Decision record

- Production has the five expected storefront tables; development is empty.
- The guarded development baseline reproduces only the shared storefront schema
  and inserts no data.
- The dashboard migration chain remains additive to production's shared tables.
- The production stock ACL hotfix is preserved in migration `202607140001`.
- Cash and Bank Transfer are separate payment values, not COD aliases.
- Recognized reporting truth is the immutable Delivered snapshot ledger.
- Buying costs remain in `product_business_data`, behind Auth and RLS.
- Inventory mutation is deferred until a single audited/idempotent transaction
  is adopted by both website and dashboard.

## Review gates before any remote application

1. Confirm the target is the separate development project.
2. Review the baseline acknowledgement and empty-schema guards.
3. Run the baseline only in development, then rerun the read-only inspection.
4. Run migration `000` separately and stop on any exception.
5. Review every `NOT VALID`/validation/`SET NOT NULL` operation against current
   row counts and a low-traffic lock window.
6. Apply `001` through `009` only in development and in exact order.
7. Verify stock and timestamp function modes, search paths, and effective ACLs.
8. Run the three pgTAP files and the metadata inspection again.
9. Validate five payment methods, ongoing Website synchronization, Delivered
   recognition, immutable historical values, refund deltas, and filtered totals.
10. Approve an evidence-based historical financial backfill separately. Do not
    use current buying or fulfillment costs as historical substitutes.

## Deferred production decisions

- maintenance window and rollback/runbook ownership;
- approved audit-retention period;
- standardized sales-channel/platform lookup values;
- evidence source and approval workflow for historical COGS and fulfillment;
- the later inventory-ledger/RPC design and coordinated website adoption;
- first owner-profile bootstrap procedure and break-glass ownership.
