import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(process.cwd(), "supabase", "migrations", "202608130000_expense_management.sql");
const sql = fs.readFileSync(migrationPath, "utf8");

describe("expense-management SQL contract", () => {
  it("provides authenticated audited edit and owner-only delete RPCs", () => {
    expect(sql).toMatch(/create or replace function public\.edit_dashboard_expense/i);
    expect(sql).toMatch(/create or replace function public\.delete_dashboard_expense/i);
    expect(sql).toMatch(/array\['owner', 'admin'\]::public\.dashboard_role\[\]/i);
    expect(sql).toMatch(/array\['owner'\]::public\.dashboard_role\[\]/i);
    expect(sql).toMatch(/set_config\('nexanotion\.audit_reason'/i);
    expect(sql).toMatch(/grant execute[\s\S]*to authenticated/i);
    expect(sql).toMatch(/revoke all[\s\S]*service_role/i);
  });

  it("locks records, rejects stale updates, and protects linked cash evidence", () => {
    expect(sql).toMatch(/from public\.expenses[\s\S]*for update/i);
    expect(sql).toMatch(/updated_at is distinct from p_expected_updated_at/i);
    expect(sql).toMatch(/from public\.cash_movements where expense_id = p_expense_id/i);
  });

  it("uses exact decimal money and a database category allowlist", () => {
    expect(sql).toMatch(/p_amount <> trunc\(p_amount, 2\)/i);
    expect(sql).toMatch(/dashboard_expense_category_allowed/i);
    expect(sql).toContain("'product_purchase'");
    expect(sql).toContain("'transportation'");
    expect(sql).toContain("'other'");
    expect(sql).not.toMatch(/double precision|\breal\b/i);
  });
});
