import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(
  process.cwd(),
  "supabase",
  "migrations",
  "202608120000_owner_capital_corrections.sql",
), "utf8");

const correctionFunction = migration
  .split("create or replace function public.edit_dashboard_owner_capital_movement")[1]
  ?.split("revoke all on function public.edit_dashboard_owner_capital_movement")[0] ?? "";

describe("owner-capital correction database contract", () => {
  it("keeps edits atomic and append-only", () => {
    expect(correctionFunction.match(/insert into public\.cash_movements/gi)).toHaveLength(2);
    expect(correctionFunction).toContain("'reversal'");
    expect(correctionFunction).toContain("correction_of_id");
    expect(correctionFunction).not.toMatch(/update\s+public\.cash_movements/i);
    expect(correctionFunction).not.toMatch(/delete\s+from\s+public\.cash_movements/i);
  });

  it("requires owner role, active accounts, idempotency, and exact BDT", () => {
    expect(correctionFunction).toContain("array['owner']::public.dashboard_role[]");
    expect(correctionFunction).toContain("lookup_type = 'cash_account'");
    expect(correctionFunction).toContain("pg_advisory_xact_lock");
    expect(correctionFunction).toContain("p_amount <> trunc(p_amount, 2)");
    expect(migration).toContain("cash_movements_correction_unique");
    expect(correctionFunction).not.toMatch(/double precision|\breal\b/i);
  });

  it("limits corrections to owner capital without expanding privileged access", () => {
    expect(correctionFunction).toContain("('owner_investment', 'owner_withdrawal')");
    expect(migration).toContain("from public, anon, service_role");
    expect(migration).toContain("to authenticated");
    expect(correctionFunction).not.toMatch(/update\s+public\.(orders|products|order_financial_snapshots)/i);
  });
});
