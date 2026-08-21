import { describe, expect, it } from "vitest";
import { buildDashboardData, mockExpenses, mockOrders } from "@/data/mock-data";
import { calculateOrderFinancials } from "@/domain/calculations";
import { parseMoney } from "@/domain/money";
import { summarizeExpenseAccounting } from "@/domain/procurement";

function deliveredReconciliation(filters: Parameters<typeof buildDashboardData>[0] = {}) {
  const reference = new Date("2026-07-14T00:00:00Z");
  const days = filters.range === "7d" ? 7 : filters.range === "30d" ? 30 : 14;
  const start = filters.range === "month" ? "2026-07-01" : (() => {
    const value = new Date(reference);
    value.setUTCDate(value.getUTCDate() - days + 1);
    return value.toISOString().slice(0, 10);
  })();
  const delivered = mockOrders.filter((order) => {
    if (order.status !== "Delivered") return false;
    if (order.orderDate < start || order.orderDate > "2026-07-14") return false;
    if (filters.channel && filters.channel !== "all" && order.channel !== filters.channel) return false;
    if (filters.status && filters.status !== "all" && order.status !== filters.status) return false;
    if (filters.campaign && filters.campaign !== "all" && order.campaign !== filters.campaign) return false;
    return true;
  });
  const financials = delivered.map(calculateOrderFinancials);
  const periodExpenseRows = mockExpenses
    .filter((expense) => expense.date >= start && expense.date <= "2026-07-14");
  const periodExpenses = summarizeExpenseAccounting(
    periodExpenseRows.filter((expense) => expense.category !== "Advertising"),
  ).operatingExpenses;
  const adSpend = periodExpenseRows.filter((expense) => expense.category === "Advertising")
    .reduce((sum, expense) => sum + expense.amount, 0);
  const netRevenue = financials.reduce((sum, value) => sum + value.netRevenue, 0);
  const cogs = financials.reduce((sum, value) => sum + value.recognizedCogs, 0);
  const contribution = financials.reduce((sum, value) => sum + value.contributionProfit, 0);
  const netProfit = contribution - periodExpenses - adSpend;
  return {
    productRevenue: financials.reduce((sum, value) => sum + value.productRevenue, 0),
    netRevenue,
    cogs,
    grossProfit: netRevenue - cogs,
    contribution,
    netProfit,
    averageOrderValue: delivered.length ? Math.round(netRevenue / delivered.length) : 0,
    profitMargin: netRevenue > 0 ? netProfit / netRevenue : 0,
    deliveredCount: delivered.length,
  };
}

describe("dashboard Delivered-only recognition", () => {
  it("excludes non-Delivered item totals from recognized Product Revenue", () => {
    const allItemSubtotal = mockOrders
      .map(calculateOrderFinancials)
      .reduce((sum, value) => sum + value.productSubtotal, 0);
    const data = buildDashboardData();

    expect(allItemSubtotal).toBe(parseMoney("14320"));
    expect(data.summary.productRevenue).toBe(parseMoney("8920"));
    expect(data.summary.productRevenue).not.toBe(allItemSubtotal);
  });

  it("reconciles all recognized KPIs to the filtered Delivered records", () => {
    const data = buildDashboardData();
    const expected = deliveredReconciliation();

    expect(data.summary).toMatchObject({
      productRevenue: parseMoney("8920"),
      netRevenue: parseMoney("9390"),
      cogs: parseMoney("4200"),
      grossProfit: parseMoney("5190"),
      netProfit: expected.netProfit,
      averageOrderValue: parseMoney("1341.43"),
    });
    expect(data.summary.productRevenue).toBe(expected.productRevenue);
    expect(data.summary.netRevenue).toBe(expected.netRevenue);
    expect(data.summary.cogs).toBe(expected.cogs);
    expect(data.summary.grossProfit).toBe(expected.netRevenue - expected.cogs);
    expect(data.summary.averageOrderValue).toBe(Math.round(expected.netRevenue / expected.deliveredCount));
    expect(data.summary.netProfit).toBe(expected.netProfit);
    expect(data.summary.profitMargin).toBe((data.summary.netProfit ?? 0) / expected.netRevenue);
  });

  it.each([
    { label: "status", filters: { status: "Pending" }, productRevenue: 0, netRevenue: 0 },
    { label: "channel", filters: { channel: "Website" }, productRevenue: parseMoney("4080"), netRevenue: parseMoney("4270") },
    { label: "campaign", filters: { campaign: "July Focus" }, productRevenue: 0, netRevenue: 0 },
    { label: "range", filters: { range: "7d" }, productRevenue: parseMoney("4560"), netRevenue: parseMoney("4750") },
  ])("preserves Delivered-only recognition with the $label filter", ({ filters, productRevenue, netRevenue }) => {
    const data = buildDashboardData(filters);
    const expected = deliveredReconciliation(filters);
    expect(data.summary.productRevenue).toBe(productRevenue);
    expect(data.summary.netRevenue).toBe(netRevenue);
    expect(data.summary.productRevenue).toBe(expected.productRevenue);
    expect(data.summary.netRevenue).toBe(expected.netRevenue);
    expect(data.summary.cogs).toBe(expected.cogs);
    expect(data.summary.grossProfit).toBe(expected.grossProfit);
    expect(data.summary.averageOrderValue).toBe(expected.averageOrderValue);
    expect(data.summary.netProfit).toBe(expected.netProfit);
    expect(data.summary.profitMargin).toBe(expected.profitMargin);
  });
});
