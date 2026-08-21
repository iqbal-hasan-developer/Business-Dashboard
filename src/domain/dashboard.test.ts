import { describe, expect, it } from "vitest";
import { aggregateDashboardData, buildExpenseAndAdSpendBreakdown } from "@/domain/dashboard";
import { mockOrders, mockProducts } from "@/data/mock-data";

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
      inventoryProcurement: 0,
      freightIn: 0,
      unallocatedProcurement: 0,
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

  it("includes all dated records and disables prior-period comparison for lifetime reporting", () => {
    const data = aggregateDashboardData(
      {
        orders: [
          { ...mockOrders[0], id: "current", orderDate: "2026-07-16" },
          { ...mockOrders[0], id: "historical", orderDate: "2025-01-01" },
        ],
        products: [],
        expenses: [{ id: "historical-expense", date: "2024-12-01", category: "Operations", description: "Historical expense", amount: 3_266_000 }],
      },
      { range: "lifetime" },
      { referenceDate: "2026-07-16", cashBalance: 0 },
    );

    expect(data.summary.totalOrders).toBe(2);
    expect(data.summary.operatingExpenses).toBe(3_266_000);
    expect(data.comparison).toEqual({ hasPriorPeriodData: false, totalOrdersChangePercent: null });
  });

  it("combines operating expenses and filtered advertising spend in the chart without changing accounting totals", () => {
    const data = aggregateDashboardData(
      {
        orders: [], products: [],
        expenses: [
          { id: "operations", date: "2026-07-16", category: "Operations", description: "Supplies", amount: 20_000 },
          { id: "ads", date: "2026-07-16", category: "Advertising", description: "Meta", amount: 10_000 },
        ],
      },
      {},
      { referenceDate: "2026-07-16", cashBalance: 0 },
    );

    expect(data.expenseBreakdown).toEqual([
      { category: "Advertising spend", amount: 10_000 },
      { category: "Operations", amount: 20_000 },
    ]);
    expect(data.summary.operatingExpenses).toBe(20_000);
    expect(data.summary.adSpend).toBe(10_000);
    expect(data.summary.netProfit).toBe(-30_000);
  });

  it("does not deduct inventory purchases or freight-in from Net Profit", () => {
    const data = aggregateDashboardData(
      {
        orders: [], products: [],
        expenses: [
          { id: "purchase", date: "2026-07-16", category: "Inventory purchase", categoryKey: "inventory_purchase", description: "Stock", amount: 100_000 },
          { id: "freight", date: "2026-07-16", category: "Freight-in", categoryKey: "freight_in", description: "Supplier transport", amount: 20_000 },
        ],
      },
      {},
      { referenceDate: "2026-07-16", cashBalance: -120_000 },
    );

    expect(data.summary.operatingExpenses).toBe(0);
    expect(data.summary.inventoryProcurement).toBe(100_000);
    expect(data.summary.freightIn).toBe(20_000);
    expect(data.summary.unallocatedProcurement).toBe(120_000);
    expect(data.summary.netProfit).toBe(0);
    expect(data.summary.cashBalance).toBe(-120_000);
    expect(data.expenseBreakdown).toEqual([]);
  });

  it("sources the advertising slice only from the ad-spend ledger", () => {
    expect(buildExpenseAndAdSpendBreakdown(
      [
        { category: "Operations", amount: 20_000 },
        { category: "Advertising", amount: 99_000 },
      ],
      [{ amount: 10_000 }],
    )).toEqual([
      { category: "Advertising spend", amount: 10_000 },
      { category: "Operations", amount: 20_000 },
    ]);
  });

  it("shows every recognized Delivered cost separately without including procurement cash outflow", () => {
    const delivered = {
      ...mockOrders[0],
      orderDate: "2026-07-16",
      courierCostSnapshot: 6_500,
      packagingCostSnapshot: 200,
    };
    const data = aggregateDashboardData(
      {
        orders: [delivered], products: mockProducts,
        expenses: [
          { id: "operations", date: "2026-07-16", category: "Operations", description: "Supplies", amount: 20_000 },
          { id: "inventory", date: "2026-07-16", category: "Inventory purchase", categoryKey: "inventory_purchase", description: "Stock", amount: 100_000 },
        ],
      },
      {},
      { referenceDate: "2026-07-16", cashBalance: 0 },
    );

    expect(data.expenseBreakdown).toEqual([
      { category: "Product cost", amount: 44_000 },
      { category: "Courier / transportation", amount: 6_500 },
      { category: "Packaging", amount: 200 },
      { category: "Operations", amount: 20_000 },
    ]);
    expect(data.expenseBreakdown).not.toContainEqual({ category: "Inventory purchase", amount: 100_000 });
  });

  it("ranks the mock dashboard's top products and records its product-report source", () => {
    const data = aggregateDashboardData(
      { orders: mockOrders, products: mockProducts, expenses: [] },
      { range: "lifetime" },
      { referenceDate: "2026-07-16", cashBalance: 0 },
    );

    expect(data.topProducts[0]).toEqual({ name: "Habit Builder Cards", revenue: 245000 });
    expect(data.topProducts).toHaveLength(5);
    expect(data.reporting.sources.productFinancials).toBe("mock");
  });
});
