import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase", "migrations", "202608080000_business_settings_defaults.sql"), "utf8");

describe("business settings database contract", () => {
  it("stores owner-approved money defaults as integer poisha", () => {
    expect(migration).toContain("to_jsonb(6500::bigint)");
    expect(migration).toContain("to_jsonb(11500::bigint)");
    expect(migration).toContain("to_jsonb(200::bigint)");
    expect(migration).not.toMatch(/double precision|\breal\b/);
    expect(migration).toContain("p_inside_dhaka_courier_cost_poisha is null");
    expect(migration).toContain("p_tax_vat_basis_points is null");
  });

  it("seeds the confirmed cash account labels without overwriting existing rows", () => {
    for (const label of ["Cash", "bKash", "Nagad", "Bank", "Steadfast"]) expect(migration).toContain(`'${label}'`);
    expect(migration).toContain("on conflict (lookup_type, lookup_key) do nothing");
  });

  it("updates all financial defaults atomically through an owner-only RPC", () => {
    expect(migration).toContain("create or replace function public.update_business_financial_defaults");
    expect(migration).toContain("array['owner']::public.dashboard_role[]");
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("to authenticated");
    expect(migration).toContain("from public, anon, service_role");
  });

  it("exposes order defaults to operational roles without granting base-table access", () => {
    expect(migration).toContain("create or replace function public.get_business_order_defaults()");
    expect(migration).toContain("array['owner', 'admin', 'data_entry']::public.dashboard_role[]");
    expect(migration).toContain("revoke all on function public.get_business_order_defaults() from public, anon, service_role");
  });

  it("cannot rewrite orders, financial snapshots, inventory, or cash", () => {
    expect(migration).not.toMatch(/update\s+public\.(orders|order_financial|products|cash_movements)/i);
    expect(migration).not.toContain("decrement_product_stock(");
  });
});
