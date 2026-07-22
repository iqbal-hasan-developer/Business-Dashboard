import "server-only";

import type { z } from "zod";
import {
  dailyFinancialRowSchema,
  dataQualityAllZero,
  dataQualityRowSchema,
  databaseNumericToMoney,
  financialSummariesMatch,
  financialSummaryRowSchema,
  mapDataQuality,
  orderFinancialRowSchema,
  reconciliationRowSchema,
  summarizeOrderFinancialRows,
  type DailyFinancialRow,
  type FinancialSummaryRow,
  type OrderFinancialRow,
} from "@/data/authoritative-reporting";
import type { BusinessRepository } from "@/data/repository";
import { calculateInventoryValue } from "@/domain/calculations";
import { assertMoney } from "@/domain/money";
import {
  dhakaBusinessDate,
  previousReportingPeriod,
  reportingDates,
  resolveReportingPeriod,
  type ReportingPeriod,
} from "@/domain/reporting-period";
import type {
  Campaign, CourierSettlementData, DashboardData, DashboardFilters, Expense, Money, Order, OrderStatus, PaymentMethod,
  PaymentStatus, Product, ProductCategory, SalesChannel, SettlementStatus,
} from "@/domain/types";
import { ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, SALES_CHANNELS, SETTLEMENT_STATUSES } from "@/domain/types";
import type { OrderItemRow, OrderRow, ProductBusinessRow, ProductRow } from "@/lib/supabase/database.types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;
type CampaignOption = { id: string; name: string };
type ExpenseLedgerRow = { date: string; category: string; amount: Money };
type AdSpendLedgerRow = { date: string; amount: Money };

const MAX_LIST_ROWS = 500;
const MAX_REPORTING_ROWS = 5_000;
const MAX_LEDGER_ROWS = 10_000;
const ORDER_FINANCIAL_COLUMNS = "order_id,order_number,order_date,sales_channel,campaign_id,campaign_name_snapshot,payment_method,settlement_status,recognized_at,recognition_source,is_delivered,cogs_complete,fulfillment_costs_complete,recognized_product_revenue,recognized_delivery_revenue,recognized_discount_amount,recognized_refund_amount,net_revenue,recognized_cogs,gross_profit,contribution_profit";
const DAILY_FINANCIAL_COLUMNS = "business_date,delivered_order_count,delivered_orders_missing_cogs,delivered_orders_missing_fulfillment_costs,product_revenue,net_revenue,cogs,gross_profit,contribution_profit,average_order_value,expenses,ad_spend,net_profit,profit_margin";
const SUMMARY_COLUMNS = "delivered_order_count,delivered_orders_missing_cogs,delivered_orders_missing_fulfillment_costs,product_revenue,net_revenue,cogs,gross_profit,contribution_profit,average_order_value,ad_spend,expenses,net_profit,profit_margin";
const DATA_QUALITY_COLUMNS = "order_items_with_missing_links,duplicate_order_numbers,products_with_missing_sku,duplicate_product_skus,delivered_orders_without_items,delivered_orders_missing_financial_snapshot,snapshot_product_revenue_mismatches,snapshot_cogs_mismatches";

const EMPTY_FINANCIAL_SUMMARY: FinancialSummaryRow = {
  delivered_order_count: 0,
  delivered_orders_missing_cogs: 0,
  delivered_orders_missing_fulfillment_costs: 0,
  product_revenue: 0,
  net_revenue: 0,
  cogs: 0,
  gross_profit: 0,
  contribution_profit: 0,
  average_order_value: 0,
  ad_spend: 0,
  expenses: 0,
  net_profit: 0,
  profit_margin: null,
};

function toMoney(value: number | string | null | undefined): Money {
  return value === null || value === undefined ? 0 : databaseNumericToMoney(value);
}

function sumMoney(values: Money[]): Money {
  const total = values.reduce((sum, value) => sum + value, 0);
  assertMoney(total);
  return total;
}

function parseStrict<TSchema extends z.ZodType>(schema: TSchema, value: unknown, label: string): z.output<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`The ${label} response did not match its installed contract.`);
  return parsed.data;
}

function assertCompleteResult(count: number | null, returned: number, limit: number, label: string) {
  if (count !== null && count > limit) {
    throw new Error(`${label} exceeds the safe read limit; refine the reporting range before retrying.`);
  }
  if (count !== null && count !== returned) throw new Error(`${label} returned an incomplete result set.`);
}

function allowed<T extends readonly string[]>(values: T, value: string | null | undefined, fallback: T[number]): T[number] {
  return values.includes(value as T[number]) ? value as T[number] : fallback;
}

export function mapProduct(row: ProductRow, business?: ProductBusinessRow): Product {
  return {
    id: row.id,
    sku: business?.sku_override ?? row.sku ?? row.slug,
    publicSku: row.sku ?? row.slug,
    slug: row.slug,
    name: row.name,
    category: row.category_id ?? "Uncategorised",
    categoryId: row.category_id,
    isActive: row.is_active ?? false,
    variation: business?.variation ?? "Default",
    buyingPrice: toMoney(business?.buying_price),
    sellingPrice: toMoney(row.price),
    stock: row.stock ?? 0,
    reorderLevel: business?.reorder_level ?? 0,
    internalNotes: business?.internal_notes ?? undefined,
  };
}

function legacyOrderStatus(value: string): OrderStatus {
  const mapped: Record<string, OrderStatus> = {
    pending: "Pending", confirmed: "Confirmed", processing: "Confirmed",
    shipped: "Dispatched", delivered: "Delivered", cancelled: "Cancelled",
  };
  return mapped[value.toLowerCase()] ?? "Pending";
}

function legacyPaymentStatus(value: string): PaymentStatus {
  const mapped: Record<string, PaymentStatus> = {
    unpaid: "Unpaid", pending: "Unpaid", verified: "Paid", refunded: "Refunded",
  };
  return mapped[value.toLowerCase()] ?? "Unpaid";
}

function legacyPaymentMethod(value: string): PaymentMethod {
  const mapped: Record<string, PaymentMethod> = { cod: "COD", bkash: "bKash", nagad: "Nagad" };
  return mapped[value.toLowerCase()] ?? "Cash";
}

function orderStatus(row: Pick<OrderRow, "dashboard_order_status" | "order_status">): OrderStatus {
  return row.dashboard_order_status
    ? allowed(ORDER_STATUSES, row.dashboard_order_status, "Pending")
    : legacyOrderStatus(row.order_status);
}

export function mapOrder(row: OrderRow, itemRows: OrderItemRow[], hasImmutableFinancialSnapshot = false): Order {
  const status = orderStatus(row);
  return {
    id: row.id,
    updatedAt: row.updated_at ?? undefined,
    hasImmutableFinancialSnapshot,
    orderNumber: row.order_number,
    externalReference: row.external_reference ?? undefined,
    orderDate: row.order_date ?? row.created_at?.slice(0, 10) ?? dhakaBusinessDate(),
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerAddress: row.customer_address,
    customerNote: row.customer_note ?? undefined,
    customerLocation: row.customer_location === "Outside Dhaka" ? "Outside Dhaka" : "Inside Dhaka",
    courier: row.courier ?? "Steadfast",
    channel: allowed(SALES_CHANNELS, row.sales_channel, "Other") as SalesChannel,
    campaign: row.campaign_name_snapshot ?? "Unattributed",
    status,
    paymentMethod: allowed(PAYMENT_METHODS, row.payment_method, legacyPaymentMethod(row.payment_method)),
    paymentStatus: row.dashboard_payment_status
      ? allowed(PAYMENT_STATUSES, row.dashboard_payment_status, "Unpaid")
      : legacyPaymentStatus(row.payment_status),
    settlementStatus: allowed(SETTLEMENT_STATUSES, row.settlement_status, "Not Applicable") as SettlementStatus,
    discount: toMoney(row.discount_amount),
    deliveryCharged: toMoney(row.delivery_charge),
    refundAmount: toMoney(row.refund_amount),
    courierCostSnapshot: toMoney(row.courier_cost_snapshot),
    packagingCostSnapshot: toMoney(row.packaging_cost_snapshot),
    courierCostSnapshotKnown: row.courier_cost_snapshot !== null,
    packagingCostSnapshotKnown: row.packaging_cost_snapshot !== null,
    items: itemRows.map((item) => ({
      id: item.id,
      productId: item.product_id ?? "unknown",
      skuSnapshot: item.sku_snapshot ?? item.product_slug,
      productNameSnapshot: item.product_name,
      listPriceSnapshot: toMoney(item.list_price_snapshot ?? item.unit_price),
      buyingCostSnapshot: toMoney(item.buying_cost_snapshot),
      quantity: item.quantity,
      actualUnitSellingPrice: toMoney(item.actual_unit_selling_price ?? item.unit_price),
    })),
  };
}

function matchesStatusForAccounting(status?: string): boolean {
  return !status || status === "all" || status === "Delivered";
}

function financialState(summary: FinancialSummaryRow, status?: string) {
  if (!matchesStatusForAccounting(status)) {
    return {
      state: "not-applicable" as const,
      message: "Recognized financials apply only to Delivered orders; the selected status affects operational metrics only.",
    };
  }
  if (summary.delivered_orders_missing_cogs > 0 || summary.delivered_orders_missing_fulfillment_costs > 0) {
    return {
      state: "incomplete" as const,
      message: "Incomplete cost data prevents profit and margin from being calculated.",
    };
  }
  return {
    state: "available" as const,
    message: "Financial values use immutable Delivered snapshots and append-only refund adjustments.",
  };
}

function expenseBreakdown(rows: ExpenseLedgerRow[]) {
  const totals = new Map<string, Money>();
  rows.forEach((row) => totals.set(row.category, sumMoney([totals.get(row.category) ?? 0, row.amount])));
  return [...totals.entries()].map(([category, amount]) => ({ category, amount }));
}

function buildDailySeries(
  period: ReportingPeriod,
  status: string | undefined,
  dailyRows: DailyFinancialRow[],
  recognizedRows: OrderFinancialRow[],
  adRows: AdSpendLedgerRow[],
  expenseRows: ExpenseLedgerRow[],
  useDailyView: boolean,
) {
  const dailyByDate = new Map(dailyRows.map((row) => [row.business_date, row]));
  const ordersByDate = new Map<string, OrderFinancialRow[]>();
  recognizedRows.forEach((row) => ordersByDate.set(row.order_date, [...(ordersByDate.get(row.order_date) ?? []), row]));
  const adByDate = new Map<string, Money>();
  adRows.forEach((row) => adByDate.set(row.date, sumMoney([adByDate.get(row.date) ?? 0, row.amount])));
  const expensesByDate = new Map<string, Money>();
  expenseRows.forEach((row) => expensesByDate.set(row.date, sumMoney([expensesByDate.get(row.date) ?? 0, row.amount])));
  const accountingApplies = matchesStatusForAccounting(status);

  return reportingDates(period).map(({ iso, label }) => {
    if (!accountingApplies) return { date: label, revenue: null, profit: null, adSpend: adByDate.get(iso) ?? 0 };
    if (useDailyView) {
      const daily = dailyByDate.get(iso);
      return {
        date: label,
        revenue: daily?.net_revenue ?? 0,
        profit: daily ? daily.contribution_profit : 0,
        adSpend: daily?.ad_spend ?? 0,
      };
    }
    const rows = ordersByDate.get(iso) ?? [];
    const contributionComplete = rows.every((row) => row.contribution_profit !== null);
    return {
      date: label,
      revenue: sumMoney(rows.map((row) => row.net_revenue)),
      profit: contributionComplete ? sumMoney(rows.map((row) => row.contribution_profit ?? 0)) : null,
      adSpend: adByDate.get(iso) ?? 0,
      expenses: expensesByDate.get(iso) ?? 0,
    };
  });
}

export class SupabaseBusinessRepository implements BusinessRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getDashboard(filters: DashboardFilters = {}): Promise<DashboardData> {
    const referenceDate = dhakaBusinessDate();
    const period = resolveReportingPeriod(referenceDate, filters.range);
    const previousPeriod = previousReportingPeriod(period);
    const campaigns = await this.getCampaignOptions();
    const selectedCampaign = filters.campaign && filters.campaign !== "all"
      ? campaigns.find((campaign) => campaign.name === filters.campaign)
      : undefined;
    const campaignMissing = Boolean(filters.campaign && filters.campaign !== "all" && !selectedCampaign);
    const channel = filters.channel && filters.channel !== "all" ? filters.channel : null;
    const useDailyView = !channel && !selectedCampaign;

    const [
      summary,
      globalSummary,
      globalReconciliation,
      recognizedRows,
      dailyRows,
      operationalRows,
      previousOrderCount,
      products,
      cashBalance,
      expenses,
      adSpend,
      dataQualityRow,
    ] = await Promise.all([
      campaignMissing ? EMPTY_FINANCIAL_SUMMARY : this.getFinancialSummary(period, channel, selectedCampaign?.id ?? null),
      this.getFinancialSummary(null, null, null),
      this.getGlobalReconciliation(),
      campaignMissing ? [] : this.getOrderFinancialRows(period, channel, selectedCampaign?.id ?? null),
      campaignMissing || !useDailyView ? [] : this.getDailyFinancialRows(period),
      campaignMissing ? [] : this.getOperationalRows(period, filters, selectedCampaign?.id ?? null),
      campaignMissing ? 0 : this.countOperationalOrders(previousPeriod, filters, selectedCampaign?.id ?? null),
      this.getProducts(),
      this.getCashBalance(),
      campaignMissing ? [] : this.getFilteredExpenses(period, channel, selectedCampaign?.id ?? null),
      campaignMissing ? [] : this.getFilteredAdSpend(period, channel, selectedCampaign?.id ?? null),
      this.getDataQuality(),
    ]);

    const dataQuality = mapDataQuality(dataQualityRow);
    const statusCounts = new Map<OrderStatus, number>();
    operationalRows.forEach((row) => {
      const status = orderStatus(row);
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    });
    const deliveredOrders = statusCounts.get("Delivered") ?? 0;
    const pendingOrders = (["Pending", "Confirmed", "Dispatched"] as const)
      .reduce((count, status) => count + (statusCounts.get(status) ?? 0), 0);
    const recentOrders = await this.mapRecentOrders(operationalRows.slice(0, 6));
    const filteredDetailSummary = summarizeOrderFinancialRows(recognizedRows, summary.ad_spend, summary.expenses);
    const scope = financialState(summary, filters.status);
    const accountingApplies = scope.state !== "not-applicable";
    const daily = buildDailySeries(period, filters.status, dailyRows, recognizedRows, adSpend, expenses, useDailyView);
    const lowStock = products.filter((product) => product.stock <= product.reorderLevel);
    const unsettledCod = recognizedRows.filter((row) =>
      row.payment_method.toLowerCase() === "cod" && row.settlement_status !== "Settled");
    const codReceivable = sumMoney(unsettledCod.map((row) => row.net_revenue));
    const recognizedRefundAmount = sumMoney(recognizedRows.map((row) => row.recognized_refund_amount));
    const currentOrderCount = operationalRows.length;
    const comparison = previousOrderCount > 0
      ? { hasPriorPeriodData: true, totalOrdersChangePercent: ((currentOrderCount - previousOrderCount) / previousOrderCount) * 100 }
      : { hasPriorPeriodData: false, totalOrdersChangePercent: null };
    const qualityIssueCount = Object.values(dataQuality).reduce((total, count) => total + count, 0);

    return {
      summary: {
        totalOrders: currentOrderCount,
        deliveredOrders,
        pendingOrders,
        productRevenue: accountingApplies ? summary.product_revenue : null,
        netRevenue: accountingApplies ? summary.net_revenue : null,
        cogs: accountingApplies ? summary.cogs : null,
        grossProfit: accountingApplies ? summary.gross_profit : null,
        contributionProfit: accountingApplies ? summary.contribution_profit : null,
        operatingExpenses: summary.expenses,
        netProfit: accountingApplies ? summary.net_profit : null,
        profitMargin: accountingApplies ? summary.profit_margin : null,
        adSpend: summary.ad_spend,
        averageOrderValue: accountingApplies ? summary.average_order_value : null,
        cashBalance,
        codReceivable,
        inventoryValue: calculateInventoryValue(products),
      },
      comparison,
      generatedAt: new Date().toISOString(),
      trend: daily.map(({ date, revenue, profit }) => ({ date, revenue, profit })),
      statusBreakdown: ORDER_STATUSES.map((status) => ({ status, count: statusCounts.get(status) ?? 0 }))
        .filter((entry) => entry.count > 0),
      adSpendTrend: daily.map(({ date, revenue, adSpend: amount }) => ({ date, revenue, adSpend: amount })),
      topProducts: [],
      expenseBreakdown: expenseBreakdown(expenses),
      recentOrders,
      warnings: [
        ...(scope.state === "incomplete" ? [{ id: "incomplete-costs", tone: "danger" as const, title: "Financial reporting is incomplete", detail: scope.message }] : []),
        ...(qualityIssueCount > 0 ? [{ id: "data-quality", tone: "danger" as const, title: `${qualityIssueCount} data-quality signals need review`, detail: "Open Data checks for the authoritative reconciliation results." }] : []),
        ...(lowStock.length ? [{ id: "stock", tone: "warning" as const, title: `${lowStock.length} products need attention`, detail: lowStock.map((product) => product.name).join(", ") }] : []),
        ...(unsettledCod.length ? [{ id: "settlement", tone: "warning" as const, title: `${unsettledCod.length} Delivered COD orders are unsettled`, detail: "COD receivable uses adjusted snapshot-backed Net Revenue." }] : []),
      ],
      campaigns: campaigns.map((campaign) => campaign.name),
      dataQuality,
      reporting: {
        financialState: scope.state,
        financialMessage: scope.message,
        deliveredOrdersMissingCogs: summary.delivered_orders_missing_cogs,
        deliveredOrdersMissingFulfillmentCosts: summary.delivered_orders_missing_fulfillment_costs,
        recognizedRefundAmount,
        summaryMatchesOrderDetails: financialSummariesMatch(summary, filteredDetailSummary),
        globalReconciliationMatches: financialSummariesMatch(globalSummary, globalReconciliation),
        dataQualityAllZero: dataQualityAllZero(dataQuality),
        topProductsAvailable: false,
        sources: {
          financialSummary: "get_dashboard_financial_summary",
          orderFinancials: "dashboard_order_financials",
          dailyFinancials: useDailyView ? "dashboard_daily_financials" : "dashboard_order_financials",
          reconciliation: "dashboard_reconciliation",
          dataQuality: "dashboard_data_quality_checks",
          cashBalance: "cash_movements",
          codReceivable: "dashboard_order_financials",
          inventoryValue: "products + product_business_data",
        },
      },
    };
  }

  private async getFinancialSummary(period: ReportingPeriod | null, channel: string | null, campaignId: string | null) {
    const { data, error } = await this.supabase.rpc("get_dashboard_financial_summary", {
      p_start_date: period?.startDate ?? null,
      p_end_date: period?.endDate ?? null,
      p_sales_channel: channel,
      p_campaign_id: campaignId,
    });
    if (error || !data || data.length !== 1) throw new Error("Unable to load the authoritative financial summary.");
    return parseStrict(financialSummaryRowSchema, data[0], "financial summary RPC");
  }

  private async getGlobalReconciliation() {
    const { data, error } = await this.supabase.from("dashboard_reconciliation").select(SUMMARY_COLUMNS).single();
    if (error || !data) throw new Error("Unable to load financial reconciliation.");
    return parseStrict(reconciliationRowSchema, data, "reconciliation view");
  }

  private async getDataQuality() {
    const { data, error } = await this.supabase.from("dashboard_data_quality_checks").select(DATA_QUALITY_COLUMNS).single();
    if (error || !data) throw new Error("Unable to load data-quality checks.");
    return parseStrict(dataQualityRowSchema, data, "data-quality view");
  }

  private async getOrderFinancialRows(period: ReportingPeriod, channel: string | null, campaignId: string | null) {
    let query = this.supabase.from("dashboard_order_financials")
      .select(ORDER_FINANCIAL_COLUMNS, { count: "exact" })
      .gte("order_date", period.startDate)
      .lte("order_date", period.endDate)
      .order("order_date", { ascending: true });
    if (channel) query = query.ilike("sales_channel", channel);
    if (campaignId) query = query.eq("campaign_id", campaignId);
    const { data, error, count } = await query.limit(MAX_REPORTING_ROWS);
    if (error || !data) throw new Error("Unable to load authoritative order financials.");
    assertCompleteResult(count, data.length, MAX_REPORTING_ROWS, "Order financial reporting");
    return data.map((row) => parseStrict(orderFinancialRowSchema, row, "order financials view"));
  }

  private async getDailyFinancialRows(period: ReportingPeriod) {
    const { data, error, count } = await this.supabase.from("dashboard_daily_financials")
      .select(DAILY_FINANCIAL_COLUMNS, { count: "exact" })
      .gte("business_date", period.startDate)
      .lte("business_date", period.endDate)
      .order("business_date")
      .limit(MAX_REPORTING_ROWS);
    if (error || !data) throw new Error("Unable to load authoritative daily financials.");
    assertCompleteResult(count, data.length, MAX_REPORTING_ROWS, "Daily financial reporting");
    return data.map((row) => parseStrict(dailyFinancialRowSchema, row, "daily financials view"));
  }

  private async getCampaignOptions(): Promise<CampaignOption[]> {
    const { data, error, count } = await this.supabase.from("campaigns")
      .select("id,name", { count: "exact" })
      .order("name")
      .limit(MAX_LIST_ROWS);
    if (error || !data) throw new Error("Unable to load campaign filters.");
    assertCompleteResult(count, data.length, MAX_LIST_ROWS, "Campaign filters");
    return data;
  }

  async getCampaigns(): Promise<Campaign[]> {
    const { data, error, count } = await this.supabase.from("campaigns")
      .select("id,name,channel,starts_on,ends_on,budget,is_active", { count: "exact" })
      .order("name").limit(MAX_LIST_ROWS);
    if (error || !data) throw new Error("Unable to load campaigns.");
    assertCompleteResult(count, data.length, MAX_LIST_ROWS, "Campaign list");
    return data.map((row) => ({
      id: row.id, name: row.name, channel: row.channel ?? "", startsOn: row.starts_on ?? "",
      endsOn: row.ends_on ?? "", budget: toMoney(row.budget), isActive: row.is_active,
    }));
  }

  async getCourierSettlementData(): Promise<CourierSettlementData> {
    const [eligibleResult, batchesResult, ordersResult] = await Promise.all([
      this.supabase.from("dashboard_steadfast_settlement_eligible_orders")
        .select("order_id,order_number,order_date,customer_name,updated_at,gross_cod_receivable", { count: "exact" })
        .order("order_date", { ascending: true }).limit(MAX_LIST_ROWS),
      this.supabase.from("dashboard_steadfast_settlement_batches")
        .select("id,settlement_date,courier,receiving_method,receiving_account_label,receiving_account_last4,receiving_transaction_reference,settlement_reference,gross_cod_amount,deductions,net_received,notes,confirmed_at,order_count", { count: "exact" })
        .order("settlement_date", { ascending: false }).limit(MAX_LIST_ROWS),
      this.supabase.from("dashboard_steadfast_settlement_batch_orders")
        .select("settlement_id,order_id,order_number,customer_name,allocated_amount", { count: "exact" })
        .limit(MAX_LIST_ROWS),
    ]);
    if (eligibleResult.error || batchesResult.error || ordersResult.error || !eligibleResult.data || !batchesResult.data || !ordersResult.data) {
      throw new Error("Unable to load courier settlement records.");
    }
    assertCompleteResult(eligibleResult.count, eligibleResult.data.length, MAX_LIST_ROWS, "Eligible settlement orders");
    assertCompleteResult(batchesResult.count, batchesResult.data.length, MAX_LIST_ROWS, "Settlement history");
    assertCompleteResult(ordersResult.count, ordersResult.data.length, MAX_LIST_ROWS, "Settlement allocations");
    const ordersByBatch = new Map<string, typeof ordersResult.data>();
    ordersResult.data.forEach((row) => ordersByBatch.set(row.settlement_id, [...(ordersByBatch.get(row.settlement_id) ?? []), row]));
    return {
      eligibleOrders: eligibleResult.data.map((row) => ({
        orderId: row.order_id, orderNumber: row.order_number, orderDate: row.order_date,
        customerName: row.customer_name, expectedUpdatedAt: row.updated_at,
        grossCodReceivable: databaseNumericToMoney(row.gross_cod_receivable),
      })),
      batches: batchesResult.data.map((row) => ({
        id: row.id, settlementDate: row.settlement_date, courier: "Steadfast",
        receivingMethod: row.receiving_method, receivingAccountLabel: row.receiving_account_label ?? "",
        receivingAccountLast4: row.receiving_account_last4 ?? "", transactionReference: row.receiving_transaction_reference ?? "",
        courierReference: row.settlement_reference ?? "", grossCodAmount: databaseNumericToMoney(row.gross_cod_amount),
        deductions: databaseNumericToMoney(row.deductions), netReceived: databaseNumericToMoney(row.net_received),
        note: row.notes ?? "", confirmedAt: row.confirmed_at,
        orders: (ordersByBatch.get(row.id) ?? []).map((order) => ({ orderId: order.order_id, orderNumber: order.order_number, customerName: order.customer_name, allocatedAmount: databaseNumericToMoney(order.allocated_amount) })),
      })),
    };
  }

  private async getOperationalRows(period: ReportingPeriod, filters: DashboardFilters, campaignId: string | null) {
    let query = this.supabase.from("orders").select("*", { count: "exact" })
      .gte("order_date", period.startDate)
      .lte("order_date", period.endDate)
      .order("created_at", { ascending: false });
    if (filters.channel && filters.channel !== "all") query = query.eq("sales_channel", filters.channel);
    if (filters.status && filters.status !== "all") query = query.eq("dashboard_order_status", filters.status);
    if (campaignId) query = query.eq("campaign_id", campaignId);
    const { data, error, count } = await query.limit(MAX_REPORTING_ROWS);
    if (error || !data) throw new Error("Unable to load operational order metrics.");
    assertCompleteResult(count, data.length, MAX_REPORTING_ROWS, "Operational order metrics");
    return data;
  }

  private async countOperationalOrders(period: ReportingPeriod, filters: DashboardFilters, campaignId: string | null) {
    let query = this.supabase.from("orders").select("id", { count: "exact", head: true })
      .gte("order_date", period.startDate)
      .lte("order_date", period.endDate);
    if (filters.channel && filters.channel !== "all") query = query.eq("sales_channel", filters.channel);
    if (filters.status && filters.status !== "all") query = query.eq("dashboard_order_status", filters.status);
    if (campaignId) query = query.eq("campaign_id", campaignId);
    const { error, count } = await query;
    if (error || count === null) throw new Error("Unable to load the prior-period order count.");
    return count;
  }

  private async mapRecentOrders(rows: OrderRow[]): Promise<Order[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const { data: items, error } = await this.supabase.from("order_items").select("*").in("order_id", ids);
    if (error || !items) throw new Error("Unable to load recent order items.");
    const itemsByOrder = new Map<string, OrderItemRow[]>();
    items.forEach((item) => {
      if (!item.order_id) return;
      itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) ?? []), item]);
    });
    return rows.map((row) => mapOrder(row, itemsByOrder.get(row.id) ?? []));
  }

  private async getFilteredExpenses(period: ReportingPeriod, channel: string | null, campaignId: string | null): Promise<ExpenseLedgerRow[]> {
    let query = this.supabase.from("expenses")
      .select("expense_date,category_key,amount", { count: "exact" })
      .gte("expense_date", period.startDate)
      .lte("expense_date", period.endDate)
      .order("expense_date");
    if (channel) query = query.ilike("sales_channel", channel);
    if (campaignId) query = query.eq("campaign_id", campaignId);
    const { data, error, count } = await query.limit(MAX_LEDGER_ROWS);
    if (error || !data) throw new Error("Unable to load the expense ledger.");
    assertCompleteResult(count, data.length, MAX_LEDGER_ROWS, "Expense reporting");
    return data.map((row) => ({ date: row.expense_date, category: row.category_key, amount: toMoney(row.amount) }));
  }

  private async getFilteredAdSpend(period: ReportingPeriod, channel: string | null, campaignId: string | null): Promise<AdSpendLedgerRow[]> {
    let query = this.supabase.from("daily_ad_spend")
      .select("spend_date,amount", { count: "exact" })
      .gte("spend_date", period.startDate)
      .lte("spend_date", period.endDate)
      .order("spend_date");
    if (channel) query = query.ilike("platform", channel);
    if (campaignId) query = query.eq("campaign_id", campaignId);
    const { data, error, count } = await query.limit(MAX_LEDGER_ROWS);
    if (error || !data) throw new Error("Unable to load the advertising-spend ledger.");
    assertCompleteResult(count, data.length, MAX_LEDGER_ROWS, "Advertising-spend reporting");
    return data.map((row) => ({ date: row.spend_date, amount: toMoney(row.amount) }));
  }

  private async getCashBalance(): Promise<Money> {
    const { data, error, count } = await this.supabase.from("cash_movements")
      .select("movement_type,amount", { count: "exact" })
      .order("movement_date")
      .limit(MAX_LEDGER_ROWS);
    if (error || !data) throw new Error("Unable to load cash movements.");
    assertCompleteResult(count, data.length, MAX_LEDGER_ROWS, "Cash movement reporting");
    return sumMoney(data.map((movement) => {
      const amount = toMoney(movement.amount);
      return ["inflow", "transfer_in"].includes(movement.movement_type) ? amount : -amount;
    }));
  }

  async getProducts(): Promise<Product[]> {
    const [productsResult, businessResult] = await Promise.all([
      this.supabase.from("products")
        .select("id,category_id,name,slug,sku,price,stock,is_active,created_at,updated_at", { count: "exact" })
        .order("name")
        .limit(MAX_LIST_ROWS),
      this.supabase.from("product_business_data")
        .select("product_id,sku_override,variation,buying_price,buying_price_verified_at,buying_price_verified_by,reorder_level,internal_notes,created_at,updated_at", { count: "exact" })
        .limit(MAX_LIST_ROWS),
    ]);
    if (productsResult.error || businessResult.error || !productsResult.data || !businessResult.data) {
      throw new Error("Unable to load products.");
    }
    assertCompleteResult(productsResult.count, productsResult.data.length, MAX_LIST_ROWS, "Product catalogue");
    assertCompleteResult(businessResult.count, businessResult.data.length, MAX_LIST_ROWS, "Private product data");
    const privateByProduct = new Map(businessResult.data.map((row) => [row.product_id, row]));
    return productsResult.data.map((row) => mapProduct(row, privateByProduct.get(row.id)));
  }

  async getProductCategories(): Promise<ProductCategory[]> {
    const { data, error, count } = await this.supabase.from("categories")
      .select("id,name,slug,is_active", { count: "exact" })
      .order("name").limit(MAX_LIST_ROWS);
    if (error || !data) throw new Error("Unable to load product categories.");
    assertCompleteResult(count, data.length, MAX_LIST_ROWS, "Product category list");
    return data.map((row) => ({ id: row.id, name: row.name, slug: row.slug, isActive: row.is_active ?? false }));
  }

  async getOrders(): Promise<Order[]> {
    const { data: orders, error, count } = await this.supabase.from("orders")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(MAX_LIST_ROWS);
    if (error || !orders) throw new Error("Unable to load orders.");
    assertCompleteResult(count, orders.length, MAX_LIST_ROWS, "Order list");
    if (!orders.length) return [];
    const { data: items, error: itemsError } = await this.supabase.from("order_items").select("*").in("order_id", orders.map((order) => order.id));
    if (itemsError || !items) throw new Error("Unable to load order items.");
    const itemsByOrder = new Map<string, OrderItemRow[]>();
    items.forEach((item) => {
      if (!item.order_id) return;
      itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) ?? []), item]);
    });
    return orders.map((order) => mapOrder(order, itemsByOrder.get(order.id) ?? []));
  }

  async getOrder(id: string): Promise<Order | null> {
    const { data: order, error } = await this.supabase.from("orders").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error("Unable to load the order.");
    if (!order) return null;
    const [itemsResult, snapshotResult] = await Promise.all([
      this.supabase.from("order_items").select("*").eq("order_id", id),
      this.supabase.from("order_financial_snapshots").select("order_id").eq("order_id", id).maybeSingle(),
    ]);
    if (itemsResult.error || !itemsResult.data) throw new Error("Unable to load order items.");
    if (snapshotResult.error) throw new Error("Unable to verify the order edit lock.");
    return mapOrder(order, itemsResult.data, snapshotResult.data !== null);
  }

  async getExpenses(): Promise<Expense[]> {
    const { data, error, count } = await this.supabase.from("expenses")
      .select("id,expense_date,category_key,description,amount,created_at,updated_at", { count: "exact" })
      .order("expense_date", { ascending: false })
      .limit(MAX_LIST_ROWS);
    if (error || !data) throw new Error("Unable to load expenses.");
    assertCompleteResult(count, data.length, MAX_LIST_ROWS, "Expense list");
    return data.map((expense) => ({
      id: expense.id,
      date: expense.expense_date,
      category: expense.category_key === "advertising" ? "Advertising" : expense.category_key,
      description: expense.description,
      amount: toMoney(expense.amount),
    }));
  }
}
