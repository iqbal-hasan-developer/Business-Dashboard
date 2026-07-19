import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function runtimeSource(directory: string): string {
  return readdirSync(directory, { withFileTypes: true }).map((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return runtimeSource(path);
    if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith(".test.ts")) return "";
    return readFileSync(path, "utf8");
  }).join("\n");
}

const source = runtimeSource(join(process.cwd(), "src"));
const provider = readFileSync(join(process.cwd(), "src", "data", "provider.ts"), "utf8");
const protectedLayout = readFileSync(join(process.cwd(), "src", "app", "(dashboard)", "layout.tsx"), "utf8");
const loginAction = readFileSync(join(process.cwd(), "src", "app", "login", "actions.ts"), "utf8");
const appRoutes = runtimeSource(join(process.cwd(), "src", "app"));
const dashboardFilters = readFileSync(join(process.cwd(), "src", "components", "dashboard", "dashboard-filters.tsx"), "utf8");
const kpiGrid = readFileSync(join(process.cwd(), "src", "components", "dashboard", "kpi-grid.tsx"), "utf8");
const supabaseRepository = readFileSync(join(process.cwd(), "src", "data", "supabase-repository.ts"), "utf8");

describe("development Supabase connection contracts", () => {
  it("contains no privileged credential or inventory-mutation path", () => {
    expect(source).not.toMatch(/service.?role/i);
    expect(source).not.toContain("decrement_product_stock");
    const rpcNames = [...new Set([...source.matchAll(/\.rpc\s*\(\s*["']([^"']+)["']/g)].map((match) => match[1]))].sort();
    expect(rpcNames).toEqual([
      "create_dashboard_order",
      "get_dashboard_financial_summary",
      "set_product_buying_cost",
      "transition_dashboard_order",
    ]);
    expect(source).not.toMatch(/record_dashboard_(refund|return)/i);
    expect(source).not.toMatch(/\.update\s*\([^)]*stock/i);
  });

  it("does not import mock records or prototype actions from application routes", () => {
    expect(appRoutes).not.toMatch(/from\s+["']@\/data\/mock-data["']/);
    expect(appRoutes).not.toContain("PrototypeAction");
  });

  it("authorizes the active JWT profile before private repository access", () => {
    expect(protectedLayout).toContain("requireDashboardUser");
    expect(provider.indexOf("await requireDashboardUser()"))
      .toBeLessThan(provider.indexOf("new SupabaseBusinessRepository"));
    expect(loginAction).toContain('from("dashboard_user_profiles")');
    expect(loginAction).toContain("resolveDashboardUser");
    expect(loginAction).toContain("await supabase.auth.signOut()");
  });

  it("does not embed connected-dashboard prototype trends or stale timestamps", () => {
    expect(kpiGrid).not.toContain("+12.5%");
    expect(dashboardFilters).not.toContain("Updated Jul 14, 2026");
    expect(dashboardFilters).toContain("updatedAtLabel");
  });

  it("uses installed reporting contracts instead of mutable base-row financial aggregation", () => {
    expect(supabaseRepository).not.toContain("aggregateDashboardData");
    expect(supabaseRepository).not.toContain("calculateOrderFinancials");
    expect(supabaseRepository).toContain('.rpc("get_dashboard_financial_summary"');
    expect(supabaseRepository).toContain('.from("dashboard_order_financials")');
    expect(supabaseRepository).toContain('.from("dashboard_daily_financials")');
    expect(supabaseRepository).toContain('.from("dashboard_reconciliation")');
    expect(supabaseRepository).toContain('.from("dashboard_data_quality_checks")');
  });
});
