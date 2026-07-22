import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "202607230000_steadfast_cod_settlement_workflow.sql"), "utf8");
const rpc = sql.slice(sql.indexOf("create or replace function public.record_steadfast_cod_settlement"));

describe("Steadfast COD settlement database contract", () => {
  it("snapshots only bKash or bank transfer and reconciles exact totals", () => {
    expect(sql).toContain("receiving_method in ('bkash', 'bank_transfer')");
    expect(sql).toContain("amount_received = gross_cod_amount - fees_withheld");
    expect(sql).not.toMatch(/double precision|\breal\b/);
  });
  it("enforces idempotency, transaction reference, one-order, and one-cash uniqueness", () => {
    expect(sql).toContain("settlement_records_idempotency_key_unique");
    expect(sql).toContain("settlement_records_receiving_reference_unique");
    expect(sql).toContain("settlement_order_allocations_order_unique");
    expect(sql).toContain("cash_movements_settlement_unique");
  });
  it("authorizes owner/admin through one authenticated security-definer RPC", () => {
    expect(rpc).toContain("security definer\nset search_path = ''");
    expect(rpc).toContain("array['owner', 'admin']::public.dashboard_role[]");
    expect(sql).toContain(") to authenticated;");
    expect(sql).toContain("from public, anon, service_role");
  });
  it("locks selected orders and rejects stale or ineligible rows before writing", () => {
    const insert = rpc.indexOf("insert into public.settlement_records");
    expect(rpc.indexOf("for update")).toBeLessThan(insert);
    expect(rpc.indexOf("expected_updated_at")).toBeLessThan(insert);
    expect(rpc.indexOf("dashboard_steadfast_settlement_eligible_orders")).toBeLessThan(insert);
  });
  it("reconciles selected authoritative net revenue to entered gross COD", () => {
    expect(sql).toContain("financials.net_revenue::numeric(14,2) as gross_cod_receivable");
    expect(rpc).toContain("selected_total <> p_gross_cod_amount");
  });
  it("atomically creates batch, full allocations, cash inflow, and Settled evidence", () => {
    expect(rpc).toContain("insert into public.settlement_records");
    expect(rpc).toContain("insert into public.settlement_order_allocations");
    expect(rpc).toContain("insert into public.cash_movements");
    expect(rpc).toContain("set settlement_status = 'Settled'");
  });
  it("does not mutate payment, revenue, COGS, stock, or financial snapshots", () => {
    const update = rpc.slice(rpc.indexOf("update public.orders"));
    expect(update).not.toMatch(/payment_status\s*=|dashboard_payment_status\s*=|\bstock\s*=|\bcogs\s*=|\brevenue\s*=/i);
    expect(rpc).not.toMatch(/update public\.order_financial|insert into public\.order_financial/);
  });
  it("prevents manual partial/settled status and makes evidence immutable", () => {
    expect(sql).toContain("Partial COD settlements are not supported");
    expect(sql).toContain("Settlement status requires confirmed allocation evidence");
    expect(sql).toContain("Confirmed settlement evidence is immutable; correction is deferred");
    expect(sql).toContain("dashboard_validate_initial_settlement_status");
  });
  it("rejects credential-like details and full account identifiers", () => {
    expect(sql).toContain("receiving_account_last4 ~ '^[0-9]{2,4}$'");
    expect(sql).toContain("Do not store credentials or full private account details");
  });
  it("keeps audit metadata while excluding duplicated private destination details", () => {
    expect(sql).toContain("'receiving_account_label', 'receiving_account_last4'");
    expect(sql).toContain("'receiving_transaction_reference', 'request_fingerprint'");
  });
  it("publishes bounded read models with security-invoker access", () => {
    expect(sql.match(/with \(security_invoker = true\)/g)).toHaveLength(3);
    expect(sql).toContain("dashboard_steadfast_settlement_batches");
    expect(sql).toContain("dashboard_steadfast_settlement_batch_orders");
  });
});
