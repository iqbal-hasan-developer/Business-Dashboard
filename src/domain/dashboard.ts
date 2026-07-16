import { calculateInventoryValue, calculateOrderFinancials } from "@/domain/calculations";
import { previousReportingPeriod, reportingDates, resolveReportingPeriod } from "@/domain/reporting-period";
import type { DashboardComparison, DashboardData, DashboardFilters, Expense, Money, Order, Product } from "@/domain/types";

type DashboardSource = {
  orders: Order[];
  products: Product[];
  expenses: Expense[];
};

type DashboardOptions = {
  referenceDate: string;
  cashBalance?: Money;
  comparison?: DashboardComparison;
  generatedAt?: string;
};

function inReportingRange(date: string, filters: DashboardFilters, referenceDate: string) {
  const period = resolveReportingPeriod(referenceDate, filters.range);
  return date >= period.startDate && date <= period.endDate;
}

function matchesDimensions(order: Order, filters: DashboardFilters) {
  return (!filters.channel || filters.channel === "all" || order.channel === filters.channel) &&
    (!filters.status || filters.status === "all" || order.status === filters.status) &&
    (!filters.campaign || filters.campaign === "all" || order.campaign === filters.campaign);
}

export function aggregateDashboardData(
  source: DashboardSource,
  filters: DashboardFilters = {},
  options: DashboardOptions,
): DashboardData {
  const orders = source.orders.filter((order) =>
    inReportingRange(order.orderDate, filters, options.referenceDate) && matchesDimensions(order, filters));
  const period = resolveReportingPeriod(options.referenceDate, filters.range);
  const previousRange = previousReportingPeriod(period);
  const previousOrders = source.orders.filter((order) =>
    order.orderDate >= previousRange.startDate && order.orderDate <= previousRange.endDate && matchesDimensions(order, filters));
  const expenses = source.expenses.filter((expense) => inReportingRange(expense.date, filters, options.referenceDate));
  const delivered = orders.filter((order) => order.status === "Delivered");
  const financials = orders.map(calculateOrderFinancials);
  const productRevenue = financials.reduce((sum, value) => sum + value.productRevenue, 0);
  const netRevenue = financials.reduce((sum, value) => sum + value.netRevenue, 0);
  const cogs = financials.reduce((sum, value) => sum + value.recognizedCogs, 0);
  const grossProfit = netRevenue - cogs;
  const adSpend = expenses.filter((expense) => expense.category === "Advertising").reduce((sum, expense) => sum + expense.amount, 0);
  const operatingExpenses = expenses.filter((expense) => expense.category !== "Advertising").reduce((sum, expense) => sum + expense.amount, 0);
  const contributionProfit = financials.reduce((sum, value) => sum + value.contributionProfit, 0);
  const netProfit = contributionProfit - adSpend - operatingExpenses;
  const days = reportingDates(period);
  const trend = days.map(({ iso, label }) => {
    const values = orders.filter((order) => order.orderDate === iso).map(calculateOrderFinancials);
    return {
      date: label,
      revenue: values.reduce((sum, value) => sum + value.netRevenue, 0),
      profit: values.reduce((sum, value) => sum + value.contributionProfit, 0),
    };
  });
  const topProducts = source.products.map((product) => ({
    name: product.name.replace("Ultimate ", "").replace(" Workbook", ""),
    revenue: delivered.reduce((sum, order) => sum + order.items
      .filter((item) => item.productId === product.id)
      .reduce((inner, item) => inner + item.actualUnitSellingPrice * item.quantity, 0), 0),
  })).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const categories = [...new Set(expenses.map((expense) => expense.category))];
  const lowStock = source.products.filter((product) => product.stock <= product.reorderLevel);
  const unsettledDelivered = delivered.filter((order) => order.settlementStatus !== "Settled");

  const comparison = options.comparison ?? {
    hasPriorPeriodData: previousOrders.length > 0,
    totalOrdersChangePercent: previousOrders.length > 0
      ? ((orders.length - previousOrders.length) / previousOrders.length) * 100
      : null,
  };

  return {
    summary: {
      totalOrders: orders.length,
      deliveredOrders: delivered.length,
      pendingOrders: orders.filter((order) => ["Pending", "Confirmed", "Dispatched"].includes(order.status)).length,
      productRevenue,
      netRevenue,
      cogs,
      grossProfit,
      contributionProfit,
      operatingExpenses,
      netProfit,
      profitMargin: netRevenue > 0 ? netProfit / netRevenue : 0,
      adSpend,
      averageOrderValue: delivered.length ? Math.round(netRevenue / delivered.length) : 0,
      cashBalance: options.cashBalance ?? 0,
      codReceivable: orders.filter((order) => order.paymentMethod === "COD" && order.settlementStatus !== "Settled")
        .reduce((sum, order) => sum + calculateOrderFinancials(order).orderTotal, 0),
      inventoryValue: calculateInventoryValue(source.products),
    },
    comparison,
    generatedAt: options.generatedAt,
    trend,
    statusBreakdown: ["Pending", "Confirmed", "Dispatched", "Delivered", "Cancelled", "Returned", "Refunded", "Failed Delivery"]
      .map((status) => ({ status: status as Order["status"], count: orders.filter((order) => order.status === status).length }))
      .filter((entry) => entry.count > 0),
    adSpendTrend: trend.map((entry, index) => ({
      date: entry.date,
      revenue: entry.revenue,
      adSpend: expenses.filter((expense) => expense.category === "Advertising" && expense.date === days[index].iso)
        .reduce((sum, expense) => sum + expense.amount, 0),
    })),
    topProducts,
    expenseBreakdown: categories.map((category) => ({
      category,
      amount: expenses.filter((expense) => expense.category === category).reduce((sum, expense) => sum + expense.amount, 0),
    })),
    recentOrders: orders.slice(0, 6),
    warnings: [
      ...(lowStock.length ? [{ id: "stock", tone: "warning" as const, title: `${lowStock.length} products need attention`, detail: lowStock.map((product) => product.name).join(", ") }] : []),
      ...(unsettledDelivered.length ? [{ id: "settlement", tone: "danger" as const, title: `${unsettledDelivered.length} delivered orders are unsettled`, detail: unsettledDelivered.map((order) => order.orderNumber).join(", ") }] : []),
    ],
    campaigns: [...new Set(source.orders.map((order) => order.campaign))].sort(),
    dataQuality: {
      orderItemsWithMissingLinks: 0,
      duplicateOrderNumbers: 0,
      productsWithMissingSku: 0,
      duplicateProductSkus: 0,
      deliveredOrdersWithoutItems: 0,
      deliveredOrdersMissingFinancialSnapshot: 0,
      snapshotProductRevenueMismatches: 0,
      snapshotCogsMismatches: 0,
    },
    reporting: {
      financialState: "available",
      financialMessage: "Prototype calculations are shown only in explicit mock mode.",
      deliveredOrdersMissingCogs: 0,
      deliveredOrdersMissingFulfillmentCosts: 0,
      recognizedRefundAmount: delivered.reduce((sum, order) => sum + order.refundAmount, 0),
      summaryMatchesOrderDetails: true,
      globalReconciliationMatches: true,
      dataQualityAllZero: true,
      topProductsAvailable: true,
      sources: {
        financialSummary: "mock",
        orderFinancials: "mock",
        dailyFinancials: "mock",
        reconciliation: "mock",
        dataQuality: "mock",
        cashBalance: "mock",
        codReceivable: "mock",
        inventoryValue: "mock",
      },
    },
  };
}
