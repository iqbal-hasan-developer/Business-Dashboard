import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const evidenceSql = readFileSync(join(process.cwd(), "supabase", "migrations", "202608230000_rejected_cod_courier_adjustments.sql"), "utf8");
const settlementSql = readFileSync(join(process.cwd(), "supabase", "migrations", "202608230001_rejected_cod_settlement_reporting.sql"), "utf8");
const provisionalRpc = evidenceSql.slice(evidenceSql.indexOf("create or replace function public.record_rejected_cod_courier_adjustment"));
const confirmationRpc = settlementSql.slice(settlementSql.indexOf("create or replace function public.record_steadfast_cod_settlement_v4"));

describe("rejected partial-COD adjustment database contract", () => {
  it("uses exact money and one provisional record per order, tracking code, and request", () => {
    expect(evidenceSql).toContain("numeric(14,2)");
    expect(evidenceSql).not.toMatch(/double precision|\breal\b/);
    expect(evidenceSql).toContain("rejected_cod_adjustment_order_unique unique (order_id)");
    expect(evidenceSql).toContain("rejected_cod_adjustment_tracking_unique unique (tracking_code)");
    expect(evidenceSql).toContain("rejected_cod_adjustment_idempotency_unique unique (idempotency_key)");
  });

  it("keeps provisional evidence out of cash and Delivered accounting", () => {
    expect(provisionalRpc).not.toMatch(/insert into public\.cash_movements|insert into public\.order_financial|update public\.products/i);
    expect(provisionalRpc).toContain("exists (select 1 from public.order_financial_snapshots");
    expect(provisionalRpc).toContain("dashboard_order_status");
    expect(provisionalRpc).toContain("dashboard_payment_status");
  });

  it("protects append-only evidence with RLS and authenticated owner/admin RPCs", () => {
    expect(evidenceSql).toContain("enable row level security");
    expect(evidenceSql).toContain("revoke all on table public.rejected_cod_courier_adjustments");
    expect(evidenceSql).toContain("to authenticated;");
    expect(evidenceSql).toContain("Rejected COD evidence is append-only");
    expect(provisionalRpc).toContain("array['owner','admin']::public.dashboard_role[]");
  });

  it("confirms recovery and courier charge once in an immutable Steadfast batch", () => {
    expect(confirmationRpc).toContain("selected_order_total + selected_recovery_total <> p_gross_cod_amount");
    expect(confirmationRpc).toContain("p_deductions < selected_adjustment_charge_total");
    expect(confirmationRpc).toContain("insert into public.rejected_cod_adjustment_settlement_allocations");
    expect(confirmationRpc).toContain("expected_net_adjustment");
    expect(confirmationRpc).not.toMatch(/insert into public\.order_financial|update public\.products/i);
  });

  it("removes recognition through the existing linked settlement reversal", () => {
    expect(evidenceSql).toMatch(/not exists \([\s\S]*select 1 from public\.settlement_reversals/);
    expect(evidenceSql).toContain("dashboard_rejected_cod_adjustment_financials");
    expect(evidenceSql).toContain("dashboard_steadfast_settlement_eligible_rejected_adjustments");
  });

  it("keeps product revenue and COGS unchanged while adding recovery and exact net adjustment", () => {
    expect(settlementSql).toContain("orders.product_revenue");
    expect(settlementSql).toContain("orders.order_net_revenue+rejected.recovery");
    expect(settlementSql).toContain("orders.order_contribution_profit+rejected.contribution");
    expect(settlementSql).toContain("dashboard_rejected_cod_adjustment_financials");
  });
});
