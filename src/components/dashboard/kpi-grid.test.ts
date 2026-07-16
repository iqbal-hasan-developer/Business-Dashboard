import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { buildDashboardData } from "@/data/mock-data";
import { aggregateDashboardData } from "@/domain/dashboard";

describe("dashboard KPI truthfulness", () => {
  it("renders neutral live-empty copy without prototype trends or false urgency", () => {
    const data = aggregateDashboardData(
      { orders: [], products: [], expenses: [] },
      {},
      { referenceDate: "2026-07-16", cashBalance: 0 },
    );
    const markup = renderToStaticMarkup(createElement(KpiGrid, { data: data.summary, comparison: data.comparison }));

    expect(markup).toContain("No prior-period data");
    expect(markup).toContain("No pending orders");
    expect(markup).toContain("No cash movements recorded");
    expect(markup).not.toContain("+12.5%");
    expect(markup).not.toContain("Needs action");
  });

  it("preserves the explicit mock-mode prototype comparison", () => {
    const data = buildDashboardData();
    const markup = renderToStaticMarkup(createElement(KpiGrid, { data: data.summary, comparison: data.comparison }));

    expect(markup).toContain("+12.5%");
  });
});
