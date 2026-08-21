import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(
  process.cwd(),
  "supabase",
  "migrations",
  "202608210003_owner_money_taken_workflow.sql",
), "utf8");
const lifetimeHistoryMigration = readFileSync(join(
  process.cwd(),
  "supabase",
  "migrations",
  "202608220000_owner_money_taken_lifetime_history.sql",
), "utf8");

const recordFunction = migration
  .split("create or replace function public.record_owner_money_taken")[1]
  ?.split("create or replace function public.reverse_owner_money_taken")[0] ?? "";
const reversalFunction = migration
  .split("create or replace function public.reverse_owner_money_taken")[1]
  ?.split("-- Keep the earlier")[0] ?? "";

describe("owner-money-taken database contract", () => {
  it("posts cash, capital return, and excess Due from Owner atomically", () => {
    expect(recordFunction).toContain("owner-capital-and-held:");
    expect(recordFunction).toContain("least(p_amount, greatest(coalesce(current_capital,0),0))");
    expect(recordFunction).toContain("due_portion := (p_amount-capital_portion)");
    expect(recordFunction).toContain("'outflow','owner_money_taken'");
    expect(recordFunction).toContain("'business_account'");
    expect(recordFunction).toContain("insert into public.owner_held_fund_events");
    expect(recordFunction).toContain("insert into public.owner_money_taken_events");
    expect(recordFunction).not.toMatch(/update\s+public\.(cash_movements|owner_capital_return_events|owner_held_fund_events)/i);
  });

  it("uses exact money, role checks, locking, and idempotency", () => {
    expect(recordFunction).toContain("p_amount <> trunc(p_amount,2)");
    expect(recordFunction).toContain("pg_advisory_xact_lock");
    expect(recordFunction).toContain("idempotency_key=p_idempotency_key");
    expect(recordFunction).toContain("array['owner','admin']::public.dashboard_role[]");
    expect(recordFunction).not.toMatch(/double precision|\breal\b/i);
  });

  it("reverses every linked effect without deleting accounting history", () => {
    expect(reversalFunction).toContain("original.capital_return_id");
    expect(reversalFunction).toContain("original.owner_held_event_id");
    expect(reversalFunction).toContain("insert into public.cash_movements");
    expect(reversalFunction).toContain("insert into public.owner_money_taken_events");
    expect(reversalFunction).not.toMatch(/delete\s+from/i);
    expect(reversalFunction).not.toMatch(/update\s+public\.(cash_movements|owner_capital_return_events|owner_held_fund_events)/i);
  });

  it("blocks legacy owner withdrawals and protects the append-only event table", () => {
    expect(migration).toContain("Use record_owner_money_taken so capital and Due from Owner are classified atomically.");
    expect(migration).toContain("create trigger owner_money_taken_events_immutable");
    expect(migration).toContain("alter table public.owner_money_taken_events enable row level security");
    expect(migration).toContain("from public,anon,authenticated,service_role");
    expect(migration).toContain("to authenticated");
  });

  it("provides a private, deduplicated lifetime history from current and legacy sources", () => {
    expect(lifetimeHistoryMigration).toContain("with (security_invoker = true)");
    expect(lifetimeHistoryMigration).toContain("dashboard_owner_money_taken_history");
    expect(lifetimeHistoryMigration).toContain("dashboard_owner_held_funds");
    expect(lifetimeHistoryMigration).toContain("dashboard_owner_capital_returns");
    expect(lifetimeHistoryMigration).toContain("unified.owner_held_event_id = held.id");
    expect(lifetimeHistoryMigration).toContain("unified.capital_return_id = capital.id");
    expect(lifetimeHistoryMigration).toContain("greatest(coalesce(capital.amount, 0) - receipt.prior_receipts, 0)");
    expect(lifetimeHistoryMigration).toContain("grant select on table public.dashboard_owner_money_taken_lifetime_history\nto authenticated");
    expect(lifetimeHistoryMigration).not.toMatch(/double precision|\breal\b/i);
  });
});
