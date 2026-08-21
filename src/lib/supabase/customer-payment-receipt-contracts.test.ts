import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase", "migrations", "202608170000_customer_payment_receipts.sql"), "utf8");
const receiptFunction = migration.split("create or replace function public.record_customer_payment_receipt")[1]
  ?.split("revoke all on function public.record_customer_payment_receipt")[0] ?? "";

describe("customer payment receipt database contract", () => {
  it("derives amount and account from locked authoritative database records", () => {
    expect(receiptFunction).toContain("from public.orders");
    expect(receiptFunction).toContain("for update");
    expect(receiptFunction).toContain("from public.order_financial_snapshots");
    expect(receiptFunction).toContain("snapshot.product_revenue");
    expect(receiptFunction).toContain("snapshot.delivery_revenue");
    expect(receiptFunction).toContain("snapshot.discount_amount");
    expect(receiptFunction).toContain("when 'bkash' then 'bkash'");
    expect(receiptFunction).not.toMatch(/p_amount|p_account_key/i);
  });

  it("requires Delivered, Paid, non-COD, unadjusted orders with freshness evidence", () => {
    expect(receiptFunction).toContain("dashboard_order_status");
    expect(receiptFunction).toContain("dashboard_payment_status");
    expect(receiptFunction).toContain("p_expected_updated_at");
    expect(receiptFunction).toContain("order_financial_adjustments");
    expect(receiptFunction).toContain("COD and unsupported payment methods");
  });

  it("is append-only, idempotent, and duplicate-safe", () => {
    expect(migration).toContain("cash_movements_customer_payment_order_unique");
    expect(receiptFunction).toContain("pg_advisory_xact_lock");
    expect(receiptFunction).toMatch(/insert into public[.]cash_movements/i);
    expect(receiptFunction).not.toMatch(/update\s+public[.](orders|cash_movements|products|order_financial_snapshots)/i);
    expect(receiptFunction).not.toMatch(/delete\s+from/i);
  });

  it("preserves least privilege and exact database money", () => {
    expect(migration).toContain("from public, anon, service_role");
    expect(migration).toContain("to authenticated");
    expect(migration).not.toMatch(/double precision|\breal\b/i);
    expect(receiptFunction).not.toMatch(/settlement_status\s*=|dashboard_payment_status\s*=|refund_amount\s*=|stock\s*=/i);
  });
});
