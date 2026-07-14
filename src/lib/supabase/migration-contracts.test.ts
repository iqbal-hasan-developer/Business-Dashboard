import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = join(process.cwd(), "supabase", "migrations");
const rls = readFileSync(join(migrations, "202607140007_row_level_security.sql"), "utf8");
const views = readFileSync(join(migrations, "202607140009_financial_and_reconciliation_views.sql"), "utf8");

describe("migration security and finance contracts", () => {
  it.each(["product_business_data", "orders", "order_items", "expenses", "cash_movements", "audit_history"])("enables RLS for %s", (table) => {
    expect(rls).toContain(`alter table public.${table} enable row level security`);
  });

  it("recognizes product revenue only inside the Delivered branch", () => {
    expect(views).toMatch(/case when is_delivered then product_subtotal else 0 end[\s\S]+recognized_product_revenue/);
    expect(views).toContain("delivered_orders_missing_cogs");
  });
});
