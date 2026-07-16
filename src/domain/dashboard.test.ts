import { describe, expect, it } from "vitest";
import { aggregateDashboardData } from "@/domain/dashboard";
import { mockOrders } from "@/data/mock-data";

describe("empty dashboard aggregation", () => {
  it("returns valid zero figures when the development project has no business records", () => {
    const data = aggregateDashboardData(
      { orders: [], products: [], expenses: [] },
      {},
      { referenceDate: "2026-07-16", cashBalance: 0 },
    );

    expect(data.summary).toEqual({
      totalOrders: 0,
      deliveredOrders: 0,
      pendingOrders: 0,
      productRevenue: 0,
      netRevenue: 0,
      cogs: 0,
      grossProfit: 0,
      contributionProfit: 0,
      operatingExpenses: 0,
      netProfit: 0,
      profitMargin: 0,
      adSpend: 0,
      averageOrderValue: 0,
      cashBalance: 0,
      codReceivable: 0,
      inventoryValue: 0,
    });
    expect(data.recentOrders).toEqual([]);
    expect(data.warnings).toEqual([]);
    expect(data.comparison).toEqual({ hasPriorPeriodData: false, totalOrdersChangePercent: null });
    expect(data.generatedAt).toBeUndefined();
  });

  it("calculates total-order comparison from the matching prior period", () => {
    const data = aggregateDashboardData(
      {
        orders: [
          { ...mockOrders[0], id: "current", orderDate: "2026-07-16" },
          { ...mockOrders[0], id: "previous", orderDate: "2026-07-02" },
        ],
        products: [],
        expenses: [],
      },
      {},
      { referenceDate: "2026-07-16", cashBalance: 0 },
    );

    expect(data.summary.totalOrders).toBe(1);
    expect(data.comparison).toEqual({ hasPriorPeriodData: true, totalOrdersChangePercent: 0 });
  });
});
