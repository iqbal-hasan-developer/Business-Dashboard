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
  productFinancialRowSchema,
  procurementSummaryRowSchema,
  reconciliationRowSchema,
  rejectedCodAdjustmentFinancialRowSchema,
  selectCurrentUnsettledCodRows,
  summarizeOrderFinancialRows,
  type DailyFinancialRow,
  type FinancialSummaryRow,
  type OrderFinancialRow,
  type ProductFinancialRow,
  type RejectedCodAdjustmentFinancialRow,
} from "@/data/authoritative-reporting";
import type { BusinessRepository } from "@/data/repository";
import { buildExpenseAndAdSpendBreakdown } from "@/domain/dashboard";
import { expenseCategoryLabel } from "@/domain/expenses";
import { assertMoney } from "@/domain/money";
import { resolveMarketingDates } from "@/domain/marketing";
import {
  dhakaBusinessDate,
  lifetimeReportingPeriod,
  previousReportingPeriod,
  reportingDates,
  resolveReportingPeriod,
  type ReportingPeriod,
} from "@/domain/reporting-period";
import type {
  BusinessSettings, Campaign, CashWorkspaceData, CourierSettlementData, CustomerPaymentReceipt, DashboardData, DashboardFilters, Expense, ExpenseAuditRecord, MarketingFilters, MarketingWorkspaceData, Money, Order, OrderStatus, PaymentMethod, RejectedCodAdjustment,
  OwnerMoneyTakenEntry, OwnerPositionPeriod, PaymentStatus, Product, ProductCategory, SalesChannel, SettlementStatus,
} from "@/domain/types";
import { ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, SALES_CHANNELS, SETTLEMENT_STATUSES } from "@/domain/types";
import type { Database, OrderItemRow, OrderRow, ProductBusinessRow, ProductRow } from "@/lib/supabase/database.types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;
type CampaignOption = { id: string; name: string };
type ExpenseLedgerRow = { date: string; category: string; amount: Money };
type AdSpendLedgerRow = { date: string; amount: Money };

const MAX_LIST_ROWS = 500;
const MAX_REPORTING_ROWS = 5_000;
const MAX_LEDGER_ROWS = 10_000;
const ORDER_FINANCIAL_COLUMNS = "order_id,order_number,order_date,sales_channel,campaign_id,campaign_name_snapshot,payment_method,settlement_status,recognized_at,recognition_source,is_delivered,cogs_complete,fulfillment_costs_complete,recognized_product_revenue,recognized_delivery_revenue,recognized_discount_amount,recognized_refund_amount,net_revenue,recognized_cogs,gross_profit,contribution_profit,recognized_courier_cost,recognized_packaging_cost";
const DAILY_FINANCIAL_COLUMNS = "business_date,delivered_order_count,delivered_orders_missing_cogs,delivered_orders_missing_fulfillment_costs,product_revenue,net_revenue,cogs,gross_profit,contribution_profit,average_order_value,expenses,ad_spend,net_profit,profit_margin";
const SUMMARY_COLUMNS = "delivered_order_count,delivered_orders_missing_cogs,delivered_orders_missing_fulfillment_costs,product_revenue,net_revenue,cogs,gross_profit,contribution_profit,average_order_value,ad_spend,expenses,net_profit,profit_margin";
const TOP_PRODUCT_LIMIT = 5;

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

export function mapOwnerPositionPeriodRow(
  row: Database["public"]["Views"]["dashboard_owner_position_daily"]["Row"],
): OwnerPositionPeriod {
  return {
    eventDate: row.event_date,
    ownerLabel: row.owner_label,
    ownerMoneyTakenInPeriod: toMoney(row.owner_money_taken_in_period),
    capitalReturnInPeriod: toMoney(row.capital_return_in_period),
    excessDueInPeriod: toMoney(row.excess_due_in_period),
  };
}

export function mapOwnerMoneyTakenLifetimeRow(
  row: Database["public"]["Views"]["dashboard_owner_money_taken_lifetime_history"]["Row"],
): OwnerMoneyTakenEntry {
  return {
    id: row.id,
    eventDate: row.event_date,
    ownerLabel: row.owner_label,
    eventType: row.event_type,
    amount: toMoney(row.amount),
    capitalReturnAmount: toMoney(row.capital_return_amount),
    excessDueAmount: toMoney(row.excess_due_amount),
    sourceAccountKey: row.source_account_key,
    sourceAccountLabel: row.source_account_label,
    cashMovementId: row.cash_movement_id,
    capitalReturnId: row.capital_return_id,
    ownerHeldEventId: row.owner_held_event_id,
    reversalOfId: row.reversal_of_id,
    isReversed: row.is_reversed,
    description: row.description,
    reference: row.reference ?? "",
    createdAt: row.created_at,
    recordSource: row.record_source,
    canReverse: row.can_reverse,
  };
}

export function mapTopProductRows(rows: ProductFinancialRow[]): DashboardData["topProducts"] {
  return rows.map((row) => ({
    name: row.product_name,
    revenue: row.adjusted_product_net_revenue,
  }));
}

export function summarizeRecognizedCostRows(
  rows: Array<Pick<OrderFinancialRow, "recognized_courier_cost" | "recognized_packaging_cost">>,
  productCost: Money | null,
  accountingApplies: boolean,
  rejectedAdjustments: Array<Pick<RejectedCodAdjustmentFinancialRow, "courier_cost">> = [],
) {
  if (!accountingApplies) return { productCost: null, transportation: null, packaging: null };
  const transportation = rows.every((row) => row.recognized_courier_cost !== null)
    ? sumMoney([
      ...rows.map((row) => row.recognized_courier_cost ?? 0),
      ...rejectedAdjustments.map((row) => row.courier_cost),
    ])
    : null;
  const packaging = rows.every((row) => row.recognized_packaging_cost !== null)
    ? sumMoney(rows.map((row) => row.recognized_packaging_cost ?? 0))
    : null;
  return { productCost, transportation, packaging };
}

function allowed<T extends readonly string[]>(values: T, value: string | null | undefined, fallback: T[number]): T[number] {
  return values.includes(value as T[number]) ? value as T[number] : fallback;
}

function exactNonNegativeInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Business settings contain an invalid exact numeric value.");
  return value;
}

type SpendingCategoryRow = Database["public"]["Views"]["dashboard_spending_by_category"]["Row"];
type SteadfastControlRow = Database["public"]["Views"]["dashboard_steadfast_receivable_reconciliation"]["Row"];
type CapitalFundsRow = Database["public"]["Views"]["dashboard_capital_spending_available_funds"]["Row"];

export function mapSpendingCategoryRow(row: SpendingCategoryRow): CashWorkspaceData["spendingCategories"][number] {
  return {
    categoryKey: row.category_key,
    categoryLabel: row.category_label,
    recordedSourceTotal: toMoney(row.recorded_source_total),
    classifiedPaidSpending: toMoney(row.classified_paid_spending),
    unpaidTotal: toMoney(row.unpaid_total),
    unresolvedSourceCount: exactNonNegativeInteger(row.unresolved_source_count),
    totalSpending: row.total_spending === null ? null : toMoney(row.total_spending),
    independentlyVerifiedSpending: toMoney(row.independently_verified_spending),
    combinedSpending: row.combined_spending === null ? null : toMoney(row.combined_spending),
    overlapReviewRequired: row.overlap_review_required,
  };
}

export function mapSteadfastControlRow(row: SteadfastControlRow): Omit<CashWorkspaceData["steadfastReceivable"], "components"> {
  return {
    calculatedReceivable: toMoney(row.calculated_receivable),
    actualReceivable: row.actual_receivable === null ? null : toMoney(row.actual_receivable),
    difference: row.difference === null ? null : toMoney(row.difference),
    observedOn: row.observed_on,
    observationReason: row.observation_reason ?? "",
    grossEligibleReceivable: toMoney(row.gross_eligible_receivable),
    reversedBatchReceivable: toMoney(row.reversed_batch_receivable),
    currentCalculatedReceivable: toMoney(row.current_calculated_receivable),
    currentGrossEligibleReceivable: toMoney(row.current_gross_eligible_receivable),
    postObservationReceivable: toMoney(row.post_observation_receivable),
  };
}

export function mapCapitalFundsRow(row: CapitalFundsRow): CashWorkspaceData["capitalFunds"] {
  return {
    ownerCashInvestment: toMoney(row.owner_cash_investment),
    ownerNonCashContribution: toMoney(row.owner_non_cash_contribution),
    totalOwnerInvestmentContribution: toMoney(row.total_owner_investment_contribution),
    ownerWithdrawals: toMoney(row.owner_withdrawals),
    classifiedPaidSpending: toMoney(row.classified_paid_spending),
    totalBusinessSpending: row.total_business_spending === null ? null : toMoney(row.total_business_spending),
    unresolvedSourceCount: exactNonNegativeInteger(row.unresolved_source_count),
    ledgerBusinessCash: toMoney(row.ledger_business_cash),
    actualBusinessCash: row.actual_business_cash === null ? null : toMoney(row.actual_business_cash),
    ledgerDueFromOwners: toMoney(row.ledger_due_from_owners),
    actualDueFromOwners: toMoney(row.actual_due_from_owners),
    calculatedSteadfastReceivable: toMoney(row.calculated_steadfast_receivable),
    confirmedSteadfastReceivable: row.confirmed_steadfast_receivable === null ? null : toMoney(row.confirmed_steadfast_receivable),
    totalAvailableReceivableFunds: row.total_available_receivable_funds === null ? null : toMoney(row.total_available_receivable_funds),
    knownInventoryValue: toMoney(row.known_inventory_value),
    unresolvedReconciliationDifference: row.unresolved_reconciliation_difference === null ? null : toMoney(row.unresolved_reconciliation_difference),
    historicalOwnerInvestment: toMoney(row.historical_owner_investment),
    totalCapitalReturned: toMoney(row.total_capital_returned),
    currentContributedCapital: toMoney(row.current_contributed_capital),
    procurementSpending: row.procurement_spending === null ? null : toMoney(row.procurement_spending),
    supplierFreightSpending: row.supplier_freight_spending === null ? null : toMoney(row.supplier_freight_spending),
    advertisingSpending: row.advertising_spending === null ? null : toMoney(row.advertising_spending),
    courierFulfilmentSpending: row.courier_fulfilment_spending === null ? null : toMoney(row.courier_fulfilment_spending),
    operatingSpending: row.operating_spending === null ? null : toMoney(row.operating_spending),
    confirmedPaidSourceSpending: toMoney(row.confirmed_paid_source_spending),
    verifiedCourierFulfilmentSpending: toMoney(row.verified_courier_fulfilment_spending),
    totalBusinessCashSpending: row.total_business_cash_spending === null ? null : toMoney(row.total_business_cash_spending),
  };
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

function buildDailySeries(
  period: ReportingPeriod,
  status: string | undefined,
  dailyRows: DailyFinancialRow[],
  recognizedRows: OrderFinancialRow[],
  adRows: AdSpendLedgerRow[],
  expenseRows: ExpenseLedgerRow[],
  rejectedAdjustments: RejectedCodAdjustmentFinancialRow[],
  useDailyView: boolean,
) {
  const dailyByDate = new Map(dailyRows.map((row) => [row.business_date, row]));
  const ordersByDate = new Map<string, OrderFinancialRow[]>();
  recognizedRows.forEach((row) => ordersByDate.set(row.order_date, [...(ordersByDate.get(row.order_date) ?? []), row]));
  const adjustmentsByDate = new Map<string, RejectedCodAdjustmentFinancialRow[]>();
  rejectedAdjustments.forEach((row) => adjustmentsByDate.set(row.event_date, [...(adjustmentsByDate.get(row.event_date) ?? []), row]));
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
    const adjustments = adjustmentsByDate.get(iso) ?? [];
    const contributionComplete = rows.every((row) => row.contribution_profit !== null);
    return {
      date: label,
      revenue: sumMoney([...rows.map((row) => row.net_revenue), ...adjustments.map((row) => row.delivery_charge_recovery)]),
      profit: contributionComplete ? sumMoney([...rows.map((row) => row.contribution_profit ?? 0), ...adjustments.map((row) => row.net_adjustment)]) : null,
      adSpend: adByDate.get(iso) ?? 0,
      expenses: expensesByDate.get(iso) ?? 0,
    };
  });
}

export class SupabaseBusinessRepository implements BusinessRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getBusinessSettings(): Promise<BusinessSettings> {
    const [settingsResult, accountsResult] = await Promise.all([
      this.supabase.rpc("get_business_order_defaults"),
      this.supabase.from("business_lookup_values")
        .select("lookup_key,label,sort_order", { count: "exact" })
        .eq("lookup_type", "cash_account")
        .eq("is_active", true)
        .order("sort_order")
        .limit(MAX_LIST_ROWS),
    ]);
    if (settingsResult.error || accountsResult.error || !settingsResult.data || !accountsResult.data) {
      throw new Error("Unable to load business settings.");
    }
    assertCompleteResult(accountsResult.count, accountsResult.data.length, MAX_LIST_ROWS, "Cash account list");
    if (settingsResult.data.length !== 1) throw new Error("Business settings are incomplete; apply the reviewed settings migration before using connected mode.");
    const row = settingsResult.data[0];
    const currency = row.currency;
    const timezone = row.business_timezone;
    const defaultCourier = row.default_courier;
    if (currency !== "BDT" || timezone !== "Asia/Dhaka" || typeof defaultCourier !== "string" || !defaultCourier.trim()) {
      throw new Error("Business settings contain an unsupported currency, timezone, or courier.");
    }
    if (!accountsResult.data.length) throw new Error("At least one active cash account is required.");
    return {
      currency,
      timezone,
      defaultCourier,
      insideDhakaCourierCost: exactNonNegativeInteger(row.inside_dhaka_courier_cost_poisha),
      outsideDhakaCourierCost: exactNonNegativeInteger(row.outside_dhaka_courier_cost_poisha),
      packagingCostPerOrder: exactNonNegativeInteger(row.packaging_cost_per_order_poisha),
      taxVatBasisPoints: exactNonNegativeInteger(row.tax_vat_basis_points),
      cashAccounts: accountsResult.data.map((account) => ({ key: account.lookup_key, label: account.label })),
    };
  }

  async getCashWorkspace(): Promise<CashWorkspaceData> {
    const [ledgerResult, nonCashResult, historicalResult, reconciliationResult, fundingResult, ownerHeldResult, ownerCapitalResult, ownerMoneyTakenResult, ownerPositionDailyResult, spendingResult, steadfastControlResult, steadfastComponentsResult, capitalResult] = await Promise.all([
      this.supabase.from("dashboard_cash_ledger")
        .select("id,movement_date,transaction_type,account_key,account_label,amount,signed_amount,owner_investment_effect,running_balance,account_running_balance,description,reference,owner_label,reversal_of_id,correction_of_id,is_reversed,created_at", { count: "exact" })
        .order("movement_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(MAX_LEDGER_ROWS),
      this.supabase.from("dashboard_owner_non_cash_capital")
        .select("signed_amount", { count: "exact" })
        .limit(MAX_LEDGER_ROWS),
      this.supabase.from("dashboard_historical_cash_reconciliation")
        .select("record_type,record_id,record_date,description,amount,issue_type,account_key,owner_label,cash_movement_id", { count: "exact" })
        .order("record_date", { ascending: true })
        .limit(MAX_LEDGER_ROWS),
      this.supabase.from("dashboard_cash_account_reconciliation")
        .select("account_key,account_label,ledger_balance,actual_balance,difference,observed_on,observation_reason,unresolved_count,unresolved_amount", { count: "exact" })
        .order("account_label")
        .limit(MAX_LIST_ROWS),
      this.supabase.from("dashboard_active_source_fundings")
        .select("funding_id,source_type,source_id,source_date,description,amount,funding_treatment,payment_date,business_account_key,owner_label,existing_cash_movement_id,generated_cash_movement_id", { count: "exact" })
        .order("source_date", { ascending: false })
        .limit(MAX_LEDGER_ROWS),
      this.supabase.from("dashboard_owner_held_balances")
        .select("owner_label,ledger_due,actual_due,difference,observed_on,observation_reason", { count: "exact" })
        .order("owner_label")
        .limit(10),
      this.supabase.from("dashboard_owner_capital_positions")
        .select("owner_label,cash_investment,non_cash_contribution,historical_investment,capital_returned,current_contributed_capital,due_from_owner,owner_money_taken,money_taken_capital_return,money_taken_excess_due,cumulative_money_returned_or_due", { count: "exact" })
        .order("owner_label")
        .limit(10),
      this.supabase.from("dashboard_owner_money_taken_lifetime_history")
        .select("id,event_date,owner_label,event_type,amount,capital_return_amount,excess_due_amount,source_account_key,source_account_label,cash_movement_id,capital_return_id,owner_held_event_id,reversal_of_id,is_reversed,description,reference,created_at,record_source,can_reverse", { count: "exact" })
        .order("event_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(MAX_LEDGER_ROWS),
      this.supabase.from("dashboard_owner_position_daily")
        .select("owner_label,event_date,owner_money_taken_in_period,capital_return_in_period,excess_due_in_period", { count: "exact" })
        .order("event_date", { ascending: false })
        .limit(MAX_LEDGER_ROWS),
      this.supabase.from("dashboard_spending_by_category")
        .select("category_key,category_label,recorded_source_total,classified_paid_spending,unpaid_total,unresolved_source_count,total_spending,sort_order,independently_verified_spending,combined_spending,overlap_review_required", { count: "exact" })
        .order("sort_order")
        .limit(10),
      this.supabase.from("dashboard_steadfast_receivable_reconciliation")
        .select("calculated_receivable,actual_receivable,difference,observed_on,observation_reason,gross_eligible_receivable,reversed_batch_receivable,current_calculated_receivable,current_gross_eligible_receivable,post_observation_receivable")
        .single(),
      this.supabase.from("dashboard_steadfast_receivable_components")
        .select("order_id,order_number,order_date,customer_name,gross_cod_receivable,excluded_reversed_batch,active_collectible_receivable,reversed_settlement_id,reversed_on,reversal_reason", { count: "exact" })
        .order("order_date")
        .order("order_number")
        .limit(MAX_LIST_ROWS),
      this.supabase.from("dashboard_capital_spending_available_funds")
        .select("owner_cash_investment,owner_non_cash_contribution,total_owner_investment_contribution,owner_withdrawals,classified_paid_spending,total_business_spending,unresolved_source_count,ledger_business_cash,actual_business_cash,ledger_due_from_owners,actual_due_from_owners,calculated_steadfast_receivable,confirmed_steadfast_receivable,total_available_receivable_funds,known_inventory_value,unresolved_reconciliation_difference,historical_owner_investment,total_capital_returned,current_contributed_capital,procurement_spending,supplier_freight_spending,advertising_spending,courier_fulfilment_spending,operating_spending,confirmed_paid_source_spending,verified_courier_fulfilment_spending,total_business_cash_spending")
        .single(),
    ]);
    if (ledgerResult.error || nonCashResult.error || historicalResult.error || reconciliationResult.error || fundingResult.error
      || ownerHeldResult.error || ownerCapitalResult.error || ownerMoneyTakenResult.error || ownerPositionDailyResult.error || spendingResult.error || steadfastControlResult.error
      || steadfastComponentsResult.error || capitalResult.error
      || !ledgerResult.data || !nonCashResult.data || !historicalResult.data || !reconciliationResult.data || !fundingResult.data
      || !ownerHeldResult.data || !ownerCapitalResult.data || !ownerMoneyTakenResult.data || !ownerPositionDailyResult.data || !spendingResult.data || !steadfastControlResult.data
      || !steadfastComponentsResult.data || !capitalResult.data) {
      throw new Error("Unable to load the authoritative cash ledger.");
    }
    assertCompleteResult(ledgerResult.count, ledgerResult.data.length, MAX_LEDGER_ROWS, "Cash ledger");
    assertCompleteResult(nonCashResult.count, nonCashResult.data.length, MAX_LEDGER_ROWS, "Owner non-cash capital");
    assertCompleteResult(historicalResult.count, historicalResult.data.length, MAX_LEDGER_ROWS, "Historical cash reconciliation");
    assertCompleteResult(reconciliationResult.count, reconciliationResult.data.length, MAX_LIST_ROWS, "Cash account reconciliation");
    assertCompleteResult(fundingResult.count, fundingResult.data.length, MAX_LEDGER_ROWS, "Active source funding");
    assertCompleteResult(ownerHeldResult.count, ownerHeldResult.data.length, 10, "Owner-held balances");
    assertCompleteResult(ownerCapitalResult.count, ownerCapitalResult.data.length, 10, "Owner capital positions");
    assertCompleteResult(ownerMoneyTakenResult.count, ownerMoneyTakenResult.data.length, MAX_LEDGER_ROWS, "Owner money taken history");
    assertCompleteResult(ownerPositionDailyResult.count, ownerPositionDailyResult.data.length, MAX_LEDGER_ROWS, "Owner position daily totals");
    assertCompleteResult(spendingResult.count, spendingResult.data.length, 10, "Spending categories");
    assertCompleteResult(steadfastComponentsResult.count, steadfastComponentsResult.data.length, MAX_LIST_ROWS, "Steadfast receivable components");
    const entries = ledgerResult.data.map((row) => ({
      id: row.id,
      movementDate: row.movement_date,
      transactionType: row.transaction_type,
      accountKey: row.account_key,
      accountLabel: row.account_label,
      amount: toMoney(row.amount),
      signedAmount: toMoney(row.signed_amount),
      runningBalance: toMoney(row.running_balance),
      accountRunningBalance: toMoney(row.account_running_balance),
      description: row.description,
      reference: row.reference ?? "",
      ownerLabel: row.owner_label ?? "",
      reversalOfId: row.reversal_of_id,
      correctionOfId: row.correction_of_id,
      isReversed: row.is_reversed,
      createdAt: row.created_at,
    }));
    const entryById = new Map(entries.map((entry) => [entry.id, entry]));
    const ownerCashInvestment = sumMoney(entries.flatMap((entry) => {
      if (entry.transactionType === "owner_investment") return [entry.signedAmount];
      if (entry.transactionType === "reversal" && entry.reversalOfId
        && entryById.get(entry.reversalOfId)?.transactionType === "owner_investment") return [entry.signedAmount];
      return [];
    }));
    const ownerWithdrawal = sumMoney(entries.flatMap((entry) => {
      if (entry.transactionType === "owner_withdrawal") return [entry.amount];
      if (entry.transactionType === "reversal" && entry.reversalOfId
        && entryById.get(entry.reversalOfId)?.transactionType === "owner_withdrawal") return [-entry.amount];
      return [];
    }));
    const accountReconciliation = reconciliationResult.data.map((row) => ({
      accountKey: row.account_key,
      accountLabel: row.account_label,
      balance: toMoney(row.ledger_balance),
      actualBalance: row.actual_balance === null ? null : toMoney(row.actual_balance),
      difference: row.difference === null ? null : toMoney(row.difference),
      observedOn: row.observed_on,
      observationReason: row.observation_reason ?? "",
      unresolvedCount: exactNonNegativeInteger(row.unresolved_count),
      unresolvedAmount: toMoney(row.unresolved_amount),
    }));
    const allAccountsObserved = accountReconciliation.length > 0
      && accountReconciliation.every((account) => account.difference !== null);
    return {
      entries,
      accountBalances: accountReconciliation.map(({ accountKey, accountLabel, balance }) => ({ accountKey, accountLabel, balance })),
      totalBalance: sumMoney(accountReconciliation.map((account) => account.balance)),
      ownerInvestmentBalance: sumMoney(ledgerResult.data.map((row) => toMoney(row.owner_investment_effect))),
      ownerCashInvestment,
      ownerWithdrawal,
      ownerNonCashContribution: sumMoney(nonCashResult.data.map((row) => toMoney(row.signed_amount))),
      postedInflow: sumMoney(entries.filter((entry) => entry.signedAmount > 0).map((entry) => entry.signedAmount)),
      postedOutflow: sumMoney(entries.filter((entry) => entry.signedAmount < 0).map((entry) => -entry.signedAmount)),
      reconciliationDifference: allAccountsObserved
        ? sumMoney(accountReconciliation.map((account) => account.difference ?? 0))
        : null,
      accountReconciliation,
      historicalIssues: historicalResult.data.map((row) => ({
        recordType: row.record_type,
        recordId: row.record_id,
        recordDate: row.record_date,
        description: row.description,
        amount: toMoney(row.amount),
        issueType: row.issue_type,
        accountKey: row.account_key,
        ownerLabel: row.owner_label ?? "",
        cashMovementId: row.cash_movement_id,
      })),
      activeFundings: fundingResult.data.map((row) => ({
        fundingId: row.funding_id,
        sourceType: row.source_type,
        sourceId: row.source_id,
        sourceDate: row.source_date,
        description: row.description,
        amount: toMoney(row.amount),
        fundingTreatment: row.funding_treatment,
        paymentDate: row.payment_date,
        businessAccountKey: row.business_account_key,
        ownerLabel: row.owner_label ?? "",
        existingCashMovementId: row.existing_cash_movement_id,
        generatedCashMovementId: row.generated_cash_movement_id,
      })),
      ownerHeldBalances: ownerHeldResult.data.map((row) => ({
        ownerLabel: row.owner_label,
        ledgerDue: toMoney(row.ledger_due),
        actualDue: row.actual_due === null ? null : toMoney(row.actual_due),
        difference: row.difference === null ? null : toMoney(row.difference),
        observedOn: row.observed_on,
        observationReason: row.observation_reason ?? "",
      })),
      ownerCapitalPositions: ownerCapitalResult.data.map((row) => ({
        ownerLabel: row.owner_label,
        cashInvestment: toMoney(row.cash_investment),
        nonCashContribution: toMoney(row.non_cash_contribution),
        historicalInvestment: toMoney(row.historical_investment),
        capitalReturned: toMoney(row.capital_returned),
        currentContributedCapital: toMoney(row.current_contributed_capital),
        dueFromOwner: toMoney(row.due_from_owner),
        ownerMoneyTaken: toMoney(row.owner_money_taken),
        moneyTakenCapitalReturn: toMoney(row.money_taken_capital_return),
        moneyTakenExcessDue: toMoney(row.money_taken_excess_due),
        cumulativeMoneyReturnedOrDue: toMoney(row.cumulative_money_returned_or_due),
      })),
      ownerMoneyTakenEntries: ownerMoneyTakenResult.data.map(mapOwnerMoneyTakenLifetimeRow),
      ownerPositionPeriod: ownerPositionDailyResult.data.map(mapOwnerPositionPeriodRow),
      spendingCategories: spendingResult.data.map(mapSpendingCategoryRow),
      steadfastReceivable: {
        ...mapSteadfastControlRow(steadfastControlResult.data),
        components: steadfastComponentsResult.data.map((row) => ({
          orderId: row.order_id,
          orderNumber: row.order_number,
          orderDate: row.order_date,
          customerName: row.customer_name,
          grossCodReceivable: toMoney(row.gross_cod_receivable),
          excludedReversedBatch: row.excluded_reversed_batch,
          activeCollectibleReceivable: toMoney(row.active_collectible_receivable),
          reversedSettlementId: row.reversed_settlement_id,
          reversedOn: row.reversed_on,
          reversalReason: row.reversal_reason ?? "",
        })),
      },
      capitalFunds: mapCapitalFundsRow(capitalResult.data),
    };
  }

  async getDashboard(filters: DashboardFilters = {}): Promise<DashboardData> {
    const referenceDate = dhakaBusinessDate();
    const period = filters.range === "lifetime" ? null : resolveReportingPeriod(referenceDate, filters.range);
    const previousPeriod = period ? previousReportingPeriod(period) : null;
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
      productFinancialRows,
      dailyRows,
      operationalRows,
      previousOrderCount,
      products,
      cashBalance,
      expenses,
      adSpend,
      dataQualityRow,
      settlementEligibleOrderIds,
      procurementSummary,
      rejectedAdjustmentRows,
    ] = await Promise.all([
      campaignMissing ? EMPTY_FINANCIAL_SUMMARY : this.getFinancialSummary(period, channel, selectedCampaign?.id ?? null),
      this.getFinancialSummary(null, null, null),
      this.getGlobalReconciliation(),
      campaignMissing ? [] : this.getOrderFinancialRows(period, channel, selectedCampaign?.id ?? null),
      campaignMissing ? [] : this.getProductFinancialRows(period, channel, selectedCampaign?.id ?? null, filters.status),
      campaignMissing || !useDailyView ? [] : this.getDailyFinancialRows(period),
      campaignMissing ? [] : this.getOperationalRows(period, filters, selectedCampaign?.id ?? null),
      campaignMissing || !previousPeriod ? 0 : this.countOperationalOrders(previousPeriod, filters, selectedCampaign?.id ?? null),
      this.getProducts(),
      this.getCashBalance(),
      campaignMissing ? [] : this.getFilteredExpenses(period, channel, selectedCampaign?.id ?? null),
      campaignMissing ? [] : this.getFilteredAdSpend(period, channel, selectedCampaign?.id ?? null),
      this.getDataQuality(),
      this.getSettlementEligibleOrderIds(),
      this.getProcurementSummary(),
      campaignMissing ? [] : this.getRejectedCodAdjustmentFinancialRows(period, channel, selectedCampaign?.id ?? null),
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
    const filteredDetailSummary = summarizeOrderFinancialRows(recognizedRows, summary.ad_spend, summary.expenses, rejectedAdjustmentRows);
    const scope = financialState(summary, filters.status);
    const accountingApplies = scope.state !== "not-applicable";
    const chartPeriod = period ?? lifetimeReportingPeriod(referenceDate, [
      ...dailyRows.map((row) => row.business_date),
      ...recognizedRows.map((row) => row.order_date),
      ...rejectedAdjustmentRows.map((row) => row.event_date),
      ...operationalRows.map((row) => row.order_date ?? row.created_at?.slice(0, 10) ?? ""),
      ...expenses.map((row) => row.date),
      ...adSpend.map((row) => row.date),
    ]);
    const daily = buildDailySeries(chartPeriod, filters.status, dailyRows, recognizedRows, adSpend, expenses, rejectedAdjustmentRows, useDailyView);
    const lowStock = products.filter((product) => product.stock <= product.reorderLevel);
    const unsettledCod = selectCurrentUnsettledCodRows(
      recognizedRows,
      new Set(settlementEligibleOrderIds),
    );
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
        inventoryProcurement: procurementSummary.inventory_purchase_total,
        freightIn: procurementSummary.freight_in_total,
        unallocatedProcurement: procurementSummary.unallocated_procurement_total,
        netProfit: accountingApplies ? summary.net_profit : null,
        profitMargin: accountingApplies ? summary.profit_margin : null,
        adSpend: summary.ad_spend,
        averageOrderValue: accountingApplies ? summary.average_order_value : null,
        cashBalance,
        codReceivable,
        inventoryValue: procurementSummary.known_inventory_value,
      },
      comparison,
      generatedAt: new Date().toISOString(),
      trend: daily.map(({ date, revenue, profit }) => ({ date, revenue, profit })),
      statusBreakdown: ORDER_STATUSES.map((status) => ({ status, count: statusCounts.get(status) ?? 0 }))
        .filter((entry) => entry.count > 0),
      adSpendTrend: daily.map(({ date, revenue, adSpend: amount }) => ({ date, revenue, adSpend: amount })),
      topProducts: mapTopProductRows(productFinancialRows),
      expenseBreakdown: buildExpenseAndAdSpendBreakdown(
        expenses,
        adSpend,
        summarizeRecognizedCostRows(recognizedRows, summary.cogs, accountingApplies, rejectedAdjustmentRows),
      ),
      recentOrders,
      warnings: [
        ...(procurementSummary.unallocated_procurement_total > 0 ? [{ id: "unallocated-procurement", tone: "warning" as const, title: "Procurement cost needs allocation", detail: `${procurementSummary.unallocated_record_count} record(s) are excluded from Operating Expenses but cannot enter known inventory or landed COGS until batch, product, and quantity evidence is supplied.` }] : []),
        ...(scope.state === "incomplete" ? [{ id: "incomplete-costs", tone: "danger" as const, title: "Financial reporting is incomplete", detail: scope.message }] : []),
        ...(qualityIssueCount > 0 ? [{ id: "data-quality", tone: "danger" as const, title: `${qualityIssueCount} data-quality signals need review`, detail: "Open Data checks for the authoritative reconciliation results." }] : []),
        ...(lowStock.length ? [{ id: "stock", tone: "warning" as const, title: `${lowStock.length} products need attention`, detail: lowStock.map((product) => product.name).join(", ") }] : []),
        ...(unsettledCod.length ? [{ id: "settlement", tone: "warning" as const, title: `${unsettledCod.length} Delivered COD orders are unsettled`, detail: "COD receivable uses snapshot-backed Net Revenue and current, reversal-aware settlement evidence." }] : []),
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
        sources: {
          financialSummary: "get_dashboard_financial_summary",
          orderFinancials: "dashboard_order_financials",
          productFinancials: "get_dashboard_product_financials",
          dailyFinancials: useDailyView ? "dashboard_daily_financials" : "dashboard_order_financials",
          reconciliation: "dashboard_reconciliation",
          dataQuality: "get_dashboard_data_quality_checks",
          cashBalance: "cash_movements",
          codReceivable: "dashboard_steadfast_settlement_eligible_orders",
          inventoryValue: "get_dashboard_procurement_summary",
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

  private async getProductFinancialRows(
    period: ReportingPeriod | null,
    channel: string | null,
    campaignId: string | null,
    status?: string,
  ) {
    const { data, error } = await this.supabase.rpc("get_dashboard_product_financials", {
      p_start_date: period?.startDate ?? null,
      p_end_date: period?.endDate ?? null,
      p_sales_channel: channel,
      p_campaign_id: campaignId,
      p_order_status: status && status !== "all" ? status : null,
      p_product_id: null,
      p_sku: null,
      p_limit: TOP_PRODUCT_LIMIT,
      p_offset: 0,
    });
    if (error || !data) throw new Error("Unable to load authoritative product financials.");
    return data.map((row) => parseStrict(productFinancialRowSchema, row, "product financials RPC"));
  }

  private async getGlobalReconciliation() {
    const { data, error } = await this.supabase.from("dashboard_reconciliation").select(SUMMARY_COLUMNS).single();
    if (error || !data) throw new Error("Unable to load financial reconciliation.");
    return parseStrict(reconciliationRowSchema, data, "reconciliation view");
  }

  private async getDataQuality() {
    const { data, error } = await this.supabase.rpc("get_dashboard_data_quality_checks");
    if (error || !data || data.length !== 1) throw new Error("Unable to load data-quality checks.");
    return parseStrict(dataQualityRowSchema, data[0], "data-quality RPC");
  }

  private async getProcurementSummary() {
    const { data, error } = await this.supabase.rpc("get_dashboard_procurement_summary");
    if (error || !data || data.length !== 1) throw new Error("Unable to load procurement accounting.");
    return parseStrict(procurementSummaryRowSchema, data[0], "procurement summary RPC");
  }

  private async getSettlementEligibleOrderIds(): Promise<string[]> {
    const { data, error, count } = await this.supabase
      .from("dashboard_steadfast_settlement_eligible_orders")
      .select("order_id", { count: "exact" })
      .limit(MAX_REPORTING_ROWS);
    if (error || !data) throw new Error("Unable to load current COD settlement eligibility.");
    assertCompleteResult(count, data.length, MAX_REPORTING_ROWS, "COD settlement eligibility");
    return data.map((row) => {
      if (typeof row.order_id !== "string" || !row.order_id) {
        throw new Error("The COD settlement eligibility response did not match its installed contract.");
      }
      return row.order_id;
    });
  }

  private async getOrderFinancialRows(period: ReportingPeriod | null, channel: string | null, campaignId: string | null) {
    let query = this.supabase.from("dashboard_order_financials")
      .select(ORDER_FINANCIAL_COLUMNS, { count: "exact" });
    if (period) query = query.gte("order_date", period.startDate).lte("order_date", period.endDate);
    query = query.order("order_date", { ascending: true });
    if (channel) query = query.ilike("sales_channel", channel);
    if (campaignId) query = query.eq("campaign_id", campaignId);
    const { data, error, count } = await query.limit(MAX_REPORTING_ROWS);
    if (error || !data) throw new Error("Unable to load authoritative order financials.");
    assertCompleteResult(count, data.length, MAX_REPORTING_ROWS, "Order financial reporting");
    return data.map((row) => parseStrict(orderFinancialRowSchema, row, "order financials view"));
  }

  private async getRejectedCodAdjustmentFinancialRows(
    period: ReportingPeriod | null,
    channel: string | null,
    campaignId: string | null,
  ) {
    let query = this.supabase.from("dashboard_rejected_cod_adjustment_financials")
      .select("event_date,order_id,order_number,sales_channel,campaign_id,delivery_charge_recovery,courier_cost,net_adjustment,settlement_id,recognized_at", { count: "exact" });
    if (period) query = query.gte("event_date", period.startDate).lte("event_date", period.endDate);
    query = query.order("event_date", { ascending: true });
    if (channel) query = query.ilike("sales_channel", channel);
    if (campaignId) query = query.eq("campaign_id", campaignId);
    const { data, error, count } = await query.limit(MAX_REPORTING_ROWS);
    if (error || !data) throw new Error("Unable to load confirmed rejected COD adjustments.");
    assertCompleteResult(count, data.length, MAX_REPORTING_ROWS, "Rejected COD adjustment reporting");
    return data.map((row) => parseStrict(rejectedCodAdjustmentFinancialRowSchema, row, "rejected COD adjustment financials view"));
  }

  private async getDailyFinancialRows(period: ReportingPeriod | null) {
    let query = this.supabase.from("dashboard_daily_financials")
      .select(DAILY_FINANCIAL_COLUMNS, { count: "exact" });
    if (period) query = query.gte("business_date", period.startDate).lte("business_date", period.endDate);
    const { data, error, count } = await query.order("business_date").limit(MAX_REPORTING_ROWS);
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

  async getMarketingWorkspace(filters: MarketingFilters = {}): Promise<MarketingWorkspaceData> {
    const { startDate, endDate } = resolveMarketingDates(dhakaBusinessDate(), filters.range ?? "lifetime", filters.start, filters.end);
    const campaignsResult = await this.supabase.from("campaigns").select("id,name,channel,starts_on,ends_on,budget,is_active,updated_at,results_count,result_type,impressions,reach,total_messaging_contacts,new_messaging_contacts,purchases,attribution_setting,performance_source_reference").order("name").limit(MAX_LIST_ROWS);
    if (campaignsResult.error || !campaignsResult.data) throw new Error("Unable to load marketing campaigns.");
    let spendQuery = this.supabase.from("daily_ad_spend").select("id,campaign_id,spend_date,platform,amount,source_reference,updated_at,created_at").order("spend_date", { ascending: false }).order("created_at", { ascending: false }).limit(MAX_LIST_ROWS);
    if (startDate) spendQuery = spendQuery.gte("spend_date", startDate);
    if (endDate) spendQuery = spendQuery.lte("spend_date", endDate);
    if (filters.campaign && filters.campaign !== "all") spendQuery = spendQuery.eq("campaign_id", filters.campaign);
    if (filters.platform && filters.platform !== "all") spendQuery = spendQuery.ilike("platform", filters.platform);
    const [spendResult, auditResult] = await Promise.all([
      spendQuery,
      this.supabase.from("audit_history").select("id,record_id,action,changed_at,old_values,new_values,reason").eq("table_name", "daily_ad_spend").in("action", ["UPDATE", "DELETE"]).order("changed_at", { ascending: false }).limit(50),
    ]);
    if (spendResult.error || !spendResult.data) throw new Error("Unable to load advertising spend history.");
    if (auditResult.error || !auditResult.data) throw new Error("Unable to load advertising spend audit history.");
    const campaigns: Campaign[] = campaignsResult.data.map((row) => ({ id: row.id, name: row.name, channel: row.channel ?? "", startsOn: row.starts_on ?? "", endsOn: row.ends_on ?? "", budget: databaseNumericToMoney(row.budget ?? 0), isActive: row.is_active, updatedAt: row.updated_at, resultsCount: row.results_count, resultType: row.result_type ?? "", impressions: row.impressions, reach: row.reach, totalMessagingContacts: row.total_messaging_contacts, newMessagingContacts: row.new_messaging_contacts, purchases: row.purchases, attributionSetting: row.attribution_setting ?? "", performanceSourceReference: row.performance_source_reference ?? "" }));
    const names = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));
    const spend = spendResult.data.map((row) => ({ id: row.id, campaignId: row.campaign_id ?? "", campaignName: names.get(row.campaign_id ?? "") ?? "Unassigned campaign", spendDate: row.spend_date, platform: row.platform, amount: databaseNumericToMoney(row.amount), sourceReference: row.source_reference ?? "", updatedAt: row.updated_at }));
    const selected = filters.campaign && filters.campaign !== "all" ? campaigns.filter((item) => item.id === filters.campaign) : campaigns;
    const results = selected.map((item) => item.resultsCount).filter((value): value is number => value != null);
    const purchases = selected.map((item) => item.purchases).filter((value): value is number => value != null);
    return { campaigns, spend, audit: auditResult.data.map((row) => ({ id: String(row.id), recordId: row.record_id, action: row.action as "UPDATE" | "DELETE", reason: row.reason ?? "Legacy change (no reason captured)", changedAt: row.changed_at, oldValues: (row.old_values ?? {}) as Record<string, unknown>, newValues: (row.new_values ?? {}) as Record<string, unknown> })), platforms: [...new Set(spend.map((row) => row.platform))].sort(), totalSpend: spend.reduce((total, row) => total + row.amount, 0), totalResults: results.length ? results.reduce((total, value) => total + value, 0) : null, totalPurchases: purchases.length ? purchases.reduce((total, value) => total + value, 0) : null, startDate, endDate };
  }

  async getCourierSettlementData(): Promise<CourierSettlementData> {
    const [eligibleResult, rejectedEligibleResult, batchesResult, ordersResult, rejectedBatchResult, receiptAllocationsResult] = await Promise.all([
      this.supabase.from("dashboard_steadfast_settlement_eligible_orders")
        .select("order_id,order_number,order_date,customer_name,updated_at,gross_cod_receivable", { count: "exact" })
        .order("order_date", { ascending: true }).limit(MAX_LIST_ROWS),
      this.supabase.from("dashboard_steadfast_settlement_eligible_rejected_adjustments")
        .select("adjustment_id,order_id,order_number,order_date,customer_name,tracking_code,expected_created_at,gross_cod_recovery,courier_charge,expected_net_adjustment", { count: "exact" })
        .order("order_date", { ascending: true }).limit(MAX_LIST_ROWS),
      this.supabase.from("dashboard_steadfast_settlement_batches")
        .select("id,settlement_date,courier,receiving_method,receiving_account_label,receiving_account_last4,receiving_transaction_reference,settlement_reference,gross_cod_amount,deductions,net_received,notes,confirmed_at,order_count,is_reversed,reversed_on,reversal_reason,receipt_treatment,owner_label", { count: "exact" })
        .order("settlement_date", { ascending: false }).limit(MAX_LIST_ROWS),
      this.supabase.from("dashboard_steadfast_settlement_batch_orders")
        .select("settlement_id,order_id,order_number,customer_name,allocated_amount", { count: "exact" })
        .limit(MAX_LIST_ROWS),
      this.supabase.from("dashboard_steadfast_settlement_batch_rejected_adjustments")
        .select("settlement_id,adjustment_id,order_id,order_number,customer_name,tracking_code,customer_delivery_charge_recovery,courier_charge,net_adjustment", { count: "exact" })
        .limit(MAX_LIST_ROWS),
      this.supabase.from("dashboard_steadfast_settlement_receipt_allocations")
        .select("id,settlement_id,owner_label,amount,is_reversed", { count: "exact" })
        .limit(MAX_LIST_ROWS),
    ]);
    if (eligibleResult.error || rejectedEligibleResult.error || batchesResult.error || ordersResult.error || rejectedBatchResult.error || receiptAllocationsResult.error || !eligibleResult.data || !rejectedEligibleResult.data || !batchesResult.data || !ordersResult.data || !rejectedBatchResult.data || !receiptAllocationsResult.data) {
      throw new Error("Unable to load courier settlement records.");
    }
    assertCompleteResult(eligibleResult.count, eligibleResult.data.length, MAX_LIST_ROWS, "Eligible settlement orders");
    assertCompleteResult(rejectedEligibleResult.count, rejectedEligibleResult.data.length, MAX_LIST_ROWS, "Eligible rejected COD adjustments");
    assertCompleteResult(batchesResult.count, batchesResult.data.length, MAX_LIST_ROWS, "Settlement history");
    assertCompleteResult(ordersResult.count, ordersResult.data.length, MAX_LIST_ROWS, "Settlement allocations");
    assertCompleteResult(rejectedBatchResult.count, rejectedBatchResult.data.length, MAX_LIST_ROWS, "Rejected COD settlement allocations");
    assertCompleteResult(receiptAllocationsResult.count, receiptAllocationsResult.data.length, MAX_LIST_ROWS, "Settlement receipt allocations");
    const ordersByBatch = new Map<string, typeof ordersResult.data>();
    ordersResult.data.forEach((row) => ordersByBatch.set(row.settlement_id, [...(ordersByBatch.get(row.settlement_id) ?? []), row]));
    const receiptsByBatch = new Map<string, typeof receiptAllocationsResult.data>();
    receiptAllocationsResult.data.forEach((row) => receiptsByBatch.set(row.settlement_id, [...(receiptsByBatch.get(row.settlement_id) ?? []), row]));
    const rejectedByBatch = new Map<string, typeof rejectedBatchResult.data>();
    rejectedBatchResult.data.forEach((row) => rejectedByBatch.set(row.settlement_id, [...(rejectedByBatch.get(row.settlement_id) ?? []), row]));
    return {
      eligibleOrders: eligibleResult.data.map((row) => ({
        orderId: row.order_id, orderNumber: row.order_number, orderDate: row.order_date,
        customerName: row.customer_name, expectedUpdatedAt: row.updated_at,
        grossCodReceivable: databaseNumericToMoney(row.gross_cod_receivable),
      })),
      eligibleRejectedAdjustments: rejectedEligibleResult.data.map((row) => ({
        adjustmentId: row.adjustment_id, orderId: row.order_id, orderNumber: row.order_number,
        orderDate: row.order_date, customerName: row.customer_name, trackingCode: row.tracking_code,
        expectedCreatedAt: row.expected_created_at,
        grossCodRecovery: databaseNumericToMoney(row.gross_cod_recovery),
        courierCharge: databaseNumericToMoney(row.courier_charge),
        expectedNetAdjustment: databaseNumericToMoney(row.expected_net_adjustment),
      })),
      batches: batchesResult.data.map((row) => ({
        id: row.id, settlementDate: row.settlement_date, courier: "Steadfast",
        receiptTreatment: row.receipt_treatment, ownerLabel: row.owner_label ?? "",
        receivingMethod: row.receiving_method, receivingAccountLabel: row.receiving_account_label ?? "",
        receivingAccountLast4: row.receiving_account_last4 ?? "", transactionReference: row.receiving_transaction_reference ?? "",
        courierReference: row.settlement_reference ?? "", grossCodAmount: databaseNumericToMoney(row.gross_cod_amount),
        deductions: databaseNumericToMoney(row.deductions), netReceived: databaseNumericToMoney(row.net_received),
        note: row.notes ?? "", confirmedAt: row.confirmed_at,
        isReversed: row.is_reversed, reversedOn: row.reversed_on ?? "", reversalReason: row.reversal_reason ?? "",
        receiptAllocations: (receiptsByBatch.get(row.id) ?? []).map((allocation) => ({ id: allocation.id, ownerLabel: allocation.owner_label, amount: databaseNumericToMoney(allocation.amount), isReversed: allocation.is_reversed })),
        orders: (ordersByBatch.get(row.id) ?? []).map((order) => ({ orderId: order.order_id, orderNumber: order.order_number, customerName: order.customer_name, allocatedAmount: databaseNumericToMoney(order.allocated_amount) })),
        rejectedAdjustments: (rejectedByBatch.get(row.id) ?? []).map((adjustment) => ({
          adjustmentId: adjustment.adjustment_id, orderId: adjustment.order_id,
          orderNumber: adjustment.order_number, customerName: adjustment.customer_name,
          trackingCode: adjustment.tracking_code,
          grossCodRecovery: databaseNumericToMoney(adjustment.customer_delivery_charge_recovery),
          courierCharge: databaseNumericToMoney(adjustment.courier_charge),
          netAdjustment: databaseNumericToMoney(adjustment.net_adjustment),
        })),
      })),
    };
  }

  private async getOperationalRows(period: ReportingPeriod | null, filters: DashboardFilters, campaignId: string | null) {
    let query = this.supabase.from("orders").select("*", { count: "exact" });
    if (period) query = query.gte("order_date", period.startDate).lte("order_date", period.endDate);
    query = query.order("created_at", { ascending: false });
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

  private async getFilteredExpenses(period: ReportingPeriod | null, channel: string | null, campaignId: string | null): Promise<ExpenseLedgerRow[]> {
    let query = this.supabase.from("expenses")
      .select("expense_date,category_key,amount", { count: "exact" })
      .eq("accounting_class", "operating_expense");
    if (period) query = query.gte("expense_date", period.startDate).lte("expense_date", period.endDate);
    query = query.order("expense_date");
    if (channel) query = query.ilike("sales_channel", channel);
    if (campaignId) query = query.eq("campaign_id", campaignId);
    const { data, error, count } = await query.limit(MAX_LEDGER_ROWS);
    if (error || !data) throw new Error("Unable to load the expense ledger.");
    assertCompleteResult(count, data.length, MAX_LEDGER_ROWS, "Expense reporting");
    return data.map((row) => ({ date: row.expense_date, category: expenseCategoryLabel(row.category_key), amount: toMoney(row.amount) }));
  }

  private async getFilteredAdSpend(period: ReportingPeriod | null, channel: string | null, campaignId: string | null): Promise<AdSpendLedgerRow[]> {
    let query = this.supabase.from("daily_ad_spend")
      .select("spend_date,amount", { count: "exact" });
    if (period) query = query.gte("spend_date", period.startDate).lte("spend_date", period.endDate);
    query = query.order("spend_date");
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

  async getRejectedCodAdjustment(orderId: string): Promise<RejectedCodAdjustment | null> {
    const { data, error } = await this.supabase.from("dashboard_rejected_cod_adjustments")
      .select("id,order_id,order_number,evidence_date,courier,tracking_code,courier_outcome,rejection_reason,customer_delivery_charge_recovery,courier_charge,expected_net_adjustment,evidence_status,settlement_confirmation_status,settlement_id,settlement_date,settlement_reference,created_at")
      .eq("order_id", orderId)
      .maybeSingle();
    if (error) throw new Error("Unable to load rejected COD adjustment evidence.");
    if (!data) return null;
    return {
      id: data.id,
      orderId: data.order_id,
      orderNumber: data.order_number,
      evidenceDate: data.evidence_date,
      courier: "Steadfast",
      trackingCode: data.tracking_code,
      courierOutcome: "Partial Delivered",
      rejectionReason: "Customer rejected",
      customerDeliveryChargeRecovery: toMoney(data.customer_delivery_charge_recovery),
      courierCharge: toMoney(data.courier_charge),
      expectedNetAdjustment: toMoney(data.expected_net_adjustment),
      evidenceStatus: "provisional",
      settlementConfirmationStatus: data.settlement_confirmation_status as "Awaiting confirmation" | "Confirmed",
      settlementId: data.settlement_id,
      settlementDate: data.settlement_date,
      settlementReference: data.settlement_reference,
      createdAt: data.created_at,
    };
  }

  async getCustomerPaymentReceipt(orderId: string): Promise<CustomerPaymentReceipt | null> {
    const { data, error } = await this.supabase.from("dashboard_cash_ledger")
      .select("id,movement_date,account_key,account_label,amount,reference,order_id,is_reversed,created_at")
      .eq("order_id", orderId)
      .eq("transaction_type", "customer_payment")
      .is("correction_of_id", null)
      .maybeSingle();
    if (error) throw new Error("Unable to load the customer payment receipt.");
    if (!data || !data.order_id) return null;
    return {
      id: data.id,
      orderId: data.order_id,
      receivedOn: data.movement_date,
      accountKey: data.account_key,
      accountLabel: data.account_label,
      amount: toMoney(data.amount),
      reference: data.reference ?? "",
      isReversed: data.is_reversed,
      createdAt: data.created_at,
    };
  }

  async getExpenses(): Promise<Expense[]> {
    const { data, error, count } = await this.supabase.from("expenses")
      .select("id,expense_date,category_key,accounting_class,description,amount,payment_method,campaign_id,sales_channel,reference,updated_at", { count: "exact" })
      .order("expense_date", { ascending: false })
      .limit(MAX_LIST_ROWS);
    if (error || !data) throw new Error("Unable to load expenses.");
    assertCompleteResult(count, data.length, MAX_LIST_ROWS, "Expense list");
    return data.map((expense) => ({
      id: expense.id,
      date: expense.expense_date,
      category: expenseCategoryLabel(expense.category_key),
      categoryKey: expense.category_key,
      accountingClass: expense.accounting_class,
      description: expense.description,
      amount: toMoney(expense.amount),
      paymentMethod: expense.payment_method ?? "",
      campaignId: expense.campaign_id,
      salesChannel: expense.sales_channel ?? "",
      reference: expense.reference ?? "",
      updatedAt: expense.updated_at,
    }));
  }

  async getExpenseAuditHistory(): Promise<ExpenseAuditRecord[]> {
    const { data, error } = await this.supabase.from("audit_history")
      .select("id,record_id,action,changed_at,old_values,new_values,reason")
      .eq("table_name", "expenses")
      .in("action", ["UPDATE", "DELETE"])
      .order("changed_at", { ascending: false })
      .limit(50);
    if (error || !data) throw new Error("Unable to load expense audit history.");
    return data.map((row) => ({
      id: String(row.id),
      recordId: row.record_id,
      action: row.action as "UPDATE" | "DELETE",
      reason: row.reason ?? "Legacy change (no reason captured)",
      changedAt: row.changed_at,
      oldValues: (row.old_values ?? {}) as Record<string, unknown>,
      newValues: (row.new_values ?? {}) as Record<string, unknown>,
    }));
  }
}
