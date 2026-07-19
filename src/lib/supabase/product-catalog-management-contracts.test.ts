import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/202607200000_product_catalog_management_rpc.sql", "utf8");
const test = readFileSync("supabase/tests/database/005_product_catalog_management.test.sql", "utf8");

describe("product catalog management SQL contracts", () => {
  it("uses owner/admin fixed-path security-definer RPCs with authenticated-only execution", () => {
    expect(migration.match(/security definer/g)).toHaveLength(2);
    expect(migration.match(/set search_path = ''/g)).toHaveLength(2);
    expect(migration.match(/array\['owner', 'admin'\]/g)).toHaveLength(2);
    expect(migration.match(/using errcode = '42501'/g)).toHaveLength(2);
    expect(migration.match(/to authenticated;/g)).toHaveLength(2);
    expect(migration.match(/from public, anon, service_role;/g)).toHaveLength(2);
  });

  it("creates stock at zero and never updates or invokes inventory", () => {
    expect(migration).toMatch(/p_price, 0, coalesce\(p_is_active/);
    expect(migration).not.toMatch(/set\s+stock\s*=|decrement_product_stock|inventory_restoration|business dml/i);
    expect(test).not.toMatch(/update\s+public\.products\s+set\s+stock/i);
  });

  it("keeps public and private product writes atomic and duplicate-safe", () => {
    expect(migration).toContain("insert into public.products");
    expect(migration).toContain("insert into public.product_business_data");
    expect(migration).toContain("products_slug_ci_uidx");
    expect(migration.match(/using errcode = '23505'/g)).toHaveLength(2);
  });

  it("keeps the pgTAP fixture rollback-only", () => {
    expect(test.match(/^insert into pg_temp\.pgtap_005_result_buffer \(tap_result\)\r?$/gm)).toHaveLength(20);
    expect(test.match(/^select\s+(?:has_function|ok|is|function_privs_are|throws_ok)\s*\(/gm)).toHaveLength(19);
    expect(test).toContain("perform no_plan();");
    expect(test).toMatch(/from finish\(\) with ordinality/);
    expect(test).toMatch(/from expanded_tap_output\s+order by buffered_result_order, line_order;\s+rollback;\s*$/);
    expect(test).not.toMatch(/^\s*commit;/im);
  });

  it("returns one ordered exportable SQL Editor grid with complete diagnostics", () => {
    expect(test).toContain("create temporary table pgtap_005_result_buffer");
    expect(test).toContain("on commit drop");
    expect(test).toMatch(/grant insert \(tap_result\)[\s\S]*to authenticated;/);
    expect(test).toMatch(/grant usage[\s\S]*pgtap_005_result_buffer_result_order_seq[\s\S]*to authenticated;/);
    expect(test).toContain("pg_catalog.regexp_split_to_table(");
    expect(test).toMatch(/::bigint as result_order,\s+tap_result/);
  });
});
