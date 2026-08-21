import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase", "migrations", "202608090000_cash_ledger_workflow.sql"), "utf8");
const reversalFunction = migration.split("create or replace function public.reverse_dashboard_cash_movement")[1]
  ?.split("revoke all on function public.record_cash_movement")[0] ?? "";

describe("cash ledger database contract", () => {
  it("keeps cash history append-only with owner-only reversal", () => {
    expect(migration).toContain("create or replace function public.reverse_dashboard_cash_movement");
    expect(migration).toContain("array['owner']::public.dashboard_role[]");
    expect(migration).toContain("'reversal', original.account_key, original.amount");
    expect(reversalFunction).not.toMatch(/update\s+public\.cash_movements/i);
    expect(reversalFunction).not.toMatch(/delete\s+from\s+public\.cash_movements/i);
  });

  it("enforces idempotency, active accounts, and exact database money", () => {
    expect(migration).toContain("cash_movements_idempotency_key_unique");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("lookup_type = 'cash_account'");
    expect(migration).toContain("p_amount <> trunc(p_amount, 2)");
    expect(migration).not.toMatch(/double precision|\breal\b/i);
  });

  it("retires the unsafe legacy RPC and denies anonymous or service-role expansion", () => {
    expect(migration).toContain("public.record_cash_movement(");
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).toContain("from public, anon, service_role");
  });

  it("provides server-side running and account balances without mutating other domains", () => {
    expect(migration).toContain("create or replace view public.dashboard_cash_ledger");
    expect(migration).toContain("over (order by movement.movement_date");
    expect(migration).toContain("create or replace view public.dashboard_cash_account_balances");
    expect(migration).not.toMatch(/update\s+public\.(orders|products|order_financial_snapshots)/i);
  });
});
