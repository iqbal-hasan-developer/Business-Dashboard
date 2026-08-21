import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase", "migrations", "202608100000_steadfast_settlement_reversal.sql"), "utf8");

describe("Steadfast settlement reversal contract", () => {
  it("preserves original settlement and allocation evidence", () => {
    expect(migration).toContain("create table if not exists public.settlement_reversals");
    expect(migration).toContain("create or replace function public.reverse_steadfast_cod_settlement");
    expect(migration).not.toMatch(/delete\s+from\s+public\.(settlement_records|settlement_order_allocations)/i);
    expect(migration).not.toMatch(/update\s+public\.settlement_records/i);
  });

  it("requires owner role, exact idempotency, and append-only cash correction", () => {
    expect(migration).toContain("array['owner']::public.dashboard_role[]");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("'outflow', 'reversal'");
    expect(migration).toContain("original_cash.id, p_idempotency_key::text");
    expect(migration).not.toMatch(/double precision|\breal\b/i);
  });

  it("restores Awaiting eligibility without rewriting recognized financials", () => {
    expect(migration).toContain("settlement_status = 'Awaiting'");
    expect(migration).toContain("public.settlement_reversals reversal");
    expect(migration).not.toMatch(/update\s+public\.order_financial_snapshots/i);
    expect(migration).not.toMatch(/payment_status\s*=/i);
  });
});
