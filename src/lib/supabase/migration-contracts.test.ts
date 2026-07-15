import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectory = join(process.cwd(), "supabase", "migrations");
const migration = (name: string) =>
  readFileSync(join(migrationDirectory, name), "utf8");

const identity = migration("202607140001_dashboard_identity_and_roles.sql");
const campaigns = migration("202607140003_campaigns_and_ad_spend.sql");
const snapshots = migration(
  "202607140004_order_compatibility_and_financial_snapshots.sql",
);
const constraints = migration("202607140006_constraints_and_indexes.sql");
const rls = migration("202607140007_row_level_security.sql");
const rpc = migration("202607140008_atomic_order_rpc.sql");
const reporting = migration(
  "202607140009_financial_and_reconciliation_views.sql",
);

describe("migration security contracts", () => {
  it("makes secure function defaults and the stock hotfix durable", () => {
    expect(identity).toContain(
      "alter default privileges in schema public\n  revoke execute on functions from public, anon, authenticated",
    );
    expect(identity).toContain(
      "revoke execute on function public.decrement_product_stock(uuid, integer)\n  from public, anon, authenticated",
    );
    expect(identity).toContain(
      "grant execute on function public.decrement_product_stock(uuid, integer)\n  to service_role",
    );
  });

  it("uses named, table-specific private-data policies", () => {
    expect(rls).not.toContain('create policy "Dashboard role read"');
    expect(rls).toContain(
      'create policy "Dashboard owners and admins read product costs"',
    );
    expect(rls).toContain(
      'create policy "Dashboard owners and admins read orders"',
    );
    expect(rls).toContain(
      'create policy "Dashboard owners and admins read audit history"',
    );
    expect(rls).not.toMatch(/create policy[^\n]*audit history[^]*for (insert|update|delete)/i);
  });

  it.each([
    "product_business_data",
    "orders",
    "order_items",
    "order_financial_snapshots",
    "order_financial_adjustments",
    "expenses",
    "cash_movements",
    "audit_history",
  ])("enables RLS for %s", (table) => {
    expect(rls).toContain(`alter table public.${table} enable row level security`);
  });
});

describe("migration compatibility contracts", () => {
  it("keeps all five approved payment methods distinct", () => {
    for (const method of ["cod", "bkash", "nagad", "cash", "bank_transfer"]) {
      expect(constraints).toContain(`'${method}'`);
    }
    expect(rpc).toContain("when 'cash' then 'cash'");
    expect(rpc).toContain("when 'bank transfer' then 'bank_transfer'");
    expect(rpc).not.toContain("when 'cash' then 'cod'");
  });

  it("preserves ongoing Website compatibility and Dhaka business dates", () => {
    expect(snapshots).toContain("dashboard_sync_order_compatibility");
    expect(snapshots).toContain("at time zone 'Asia/Dhaka'");
    expect(snapshots).toContain("new.sales_channel := 'Website'");
    expect(snapshots).toContain("when 'delivered' then 'Delivered'");
  });

  it("does not guess private historical costs or mutate inventory", () => {
    expect(snapshots).toContain(
      "Courier,\n-- campaign, SKU, buying cost, and fulfillment cost are deliberately not guessed.",
    );
    expect(snapshots).toContain("business.buying_price_verified_at is not null");
    expect(rpc).not.toMatch(/update\s+public\.products[\s\S]{0,160}\bstock\b/i);
    expect(rpc).not.toContain("decrement_product_stock(");
  });

  it("uses null-safe daily ad-spend identity", () => {
    expect(campaigns).toContain("unique nulls not distinct");
  });
});

describe("Delivered-only financial recognition contracts", () => {
  it("captures one immutable Delivered snapshot and append-only refunds", () => {
    expect(snapshots).toContain("recognition_status = 'Delivered'");
    expect(snapshots).toContain("on conflict (order_id) do nothing");
    expect(snapshots).toContain("order_financial_snapshots_immutable");
    expect(snapshots).toContain("order_financial_adjustments_immutable");
  });

  it("builds recognized metrics only from the immutable ledger", () => {
    const reportingSection = reporting.split(
      "-- This view is operational validation only.",
    )[0];

    expect(reportingSection).toContain("from public.order_financial_snapshots");
    expect(reportingSection).toContain("public.order_financial_adjustments");
    expect(reportingSection).not.toContain("from public.orders");
    expect(reportingSection).not.toContain("from public.order_items");
    expect(reporting).toContain("recognized_product_revenue");
    expect(reporting).toContain("average_order_value");
    expect(reporting).toContain("net_profit");
    expect(reporting).toContain("profit_margin");
  });

  it("fails profit metrics closed when historical costs are unknown", () => {
    expect(reporting).toContain("delivered_orders_missing_cogs");
    expect(reporting).toContain(
      "delivered_orders_missing_fulfillment_costs",
    );
    expect(reporting).toMatch(
      /when orders\.contribution_profit is null then null[\s\S]+as net_profit/,
    );
  });

  it("applies date, channel, and campaign filters to recognized summaries", () => {
    expect(reporting).toContain("get_dashboard_financial_summary");
    expect(reporting).toContain("financial.order_date >= p_start_date");
    expect(reporting).toContain(
      "lower(financial.sales_channel) = lower(p_sales_channel)",
    );
    expect(reporting).toContain("financial.campaign_id = p_campaign_id");
  });
});
