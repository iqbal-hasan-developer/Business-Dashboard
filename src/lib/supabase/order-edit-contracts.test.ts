import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "202607220000_edit_order_workflow.sql"),
  "utf8",
);

describe("ordinary Edit Order database contract", () => {
  it("keeps explicit dashboard statuses authoritative in the compatibility trigger", () => {
    expect(migration).toContain("new.dashboard_order_status := coalesce(\n      new.dashboard_order_status,\n      mapped_order_status");
    expect(migration).toContain("new.dashboard_payment_status := coalesce(\n      new.dashboard_payment_status,\n      mapped_payment_status");
  });

  it("authorizes only owner/admin calls and exposes one authenticated RPC", () => {
    expect(migration).toContain("array['owner', 'admin']::public.dashboard_role[]");
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("to authenticated");
  });

  it("locks the row, rejects stale or immutable edits, and validates duplicates and products before writing", () => {
    const writeIndex = migration.indexOf("update public.orders");
    expect(migration.indexOf("for update")).toBeLessThan(writeIndex);
    expect(migration.indexOf("current_order.updated_at is distinct from p_expected_updated_at")).toBeLessThan(writeIndex);
    expect(migration.indexOf("from public.order_financial_snapshots as snapshot")).toBeLessThan(writeIndex);
    expect(migration.indexOf("Duplicate order number")).toBeLessThan(writeIndex);
    expect(migration.indexOf("product.is_active is true")).toBeLessThan(writeIndex);
    expect(migration).toContain("courier_cost := coalesce(courier_cost, current_order.courier_cost_snapshot)");
  });

  it("atomically replaces items, recalculates totals, and leaves statuses, recognition, and stock untouched", () => {
    const orderUpdate = migration.slice(migration.indexOf("update public.orders"), migration.indexOf("where id = current_order.id;"));
    expect(orderUpdate).toContain("subtotal = product_subtotal");
    expect(orderUpdate).toContain("total = product_subtotal + delivery_amount - order_discount");
    expect(orderUpdate).not.toMatch(/(?:dashboard_order_status|dashboard_payment_status|settlement_status|refund_amount)\s*=/);
    expect(migration.indexOf("delete from public.order_items")).toBeLessThan(migration.indexOf("insert into public.order_items"));
    expect(migration).not.toMatch(/update\s+public\.products[\s\S]{0,160}\bstock\b/i);
    expect(migration).not.toContain("decrement_product_stock(");
    expect(migration).not.toMatch(/insert into public\.order_financial_snapshots/i);
  });

  it("fails the transaction if a trigger changes status fields and records a minimized field-level audit summary", () => {
    expect(migration).toContain("persisted_order.dashboard_order_status is distinct from current_order.dashboard_order_status");
    expect(migration).toContain("raise exception 'Ordinary edits cannot change operational or financial status fields'");
    expect(migration).toContain("insert into public.audit_history");
    expect(migration).toContain("'changed_fields', changed_fields");
    expect(migration).toContain("'item_count', existing_item_count");
    const auditInsert = migration.slice(migration.indexOf("insert into public.audit_history"));
    expect(auditInsert).not.toContain("p_order ->> 'customer_name'");
    expect(auditInsert).not.toContain("p_order ->> 'customer_phone'");
    expect(auditInsert).not.toContain("p_order ->> 'customer_address'");
  });
});
