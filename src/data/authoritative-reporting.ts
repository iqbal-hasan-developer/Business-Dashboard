import { z } from "zod";
import { assertMoney } from "@/domain/money";
import type { DashboardDataQuality, Money } from "@/domain/types";

const databaseNumericSchema = z.union([z.string(), z.number().finite()]);

export function databaseNumericToMoney(value: string | number): Money {
  const normalized = String(value).trim();
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Database money must have at most two decimal places.");
  }
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  const poisha = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
  const signed = Number(negative ? -poisha : poisha);
  assertMoney(signed);
  return signed;
}

export function databasePercentToRatio(value: string | number): number {
  return databaseNumericToMoney(value) / 10_000;
}

const databaseMoneySchema = databaseNumericSchema.transform(databaseNumericToMoney);
const nullableDatabaseMoneySchema = databaseMoneySchema.nullable();
const databasePercentSchema = databaseNumericSchema.transform(databasePercentToRatio);
const nullableDatabasePercentSchema = databasePercentSchema.nullable();
const databaseCountSchema = z.union([z.string(), z.number().finite()]).transform((value) => {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("Database count must be a non-negative safe integer.");
  return count;
});

export const financialSummaryRowSchema = z.object({
  delivered_order_count: databaseCountSchema,
  delivered_orders_missing_cogs: databaseCountSchema,
  delivered_orders_missing_fulfillment_costs: databaseCountSchema,
  product_revenue: databaseMoneySchema,
  net_revenue: databaseMoneySchema,
  cogs: nullableDatabaseMoneySchema,
  gross_profit: nullableDatabaseMoneySchema,
  contribution_profit: nullableDatabaseMoneySchema,
  average_order_value: databaseMoneySchema,
  ad_spend: databaseMoneySchema,
  expenses: databaseMoneySchema,
  net_profit: nullableDatabaseMoneySchema,
  profit_margin: nullableDatabasePercentSchema,
}).strict();

export const orderFinancialRowSchema = z.object({
  order_id: z.string().uuid(),
  order_number: z.string(),
  order_date: z.string().date(),
  sales_channel: z.string(),
  campaign_id: z.string().uuid().nullable(),
  campaign_name_snapshot: z.string().nullable(),
  payment_method: z.string(),
  settlement_status: z.string(),
  recognized_at: z.string(),
  recognition_source: z.string(),
  is_delivered: z.literal(true),
  cogs_complete: z.boolean(),
  fulfillment_costs_complete: z.boolean(),
  recognized_product_revenue: databaseMoneySchema,
  recognized_delivery_revenue: databaseMoneySchema,
  recognized_discount_amount: databaseMoneySchema,
  recognized_refund_amount: databaseMoneySchema,
  net_revenue: databaseMoneySchema,
  recognized_cogs: nullableDatabaseMoneySchema,
  gross_profit: nullableDatabaseMoneySchema,
  contribution_profit: nullableDatabaseMoneySchema,
  recognized_courier_cost: nullableDatabaseMoneySchema,
  recognized_packaging_cost: nullableDatabaseMoneySchema,
}).strict();

export const dailyFinancialRowSchema = z.object({
  business_date: z.string().date(),
  delivered_order_count: databaseCountSchema,
  delivered_orders_missing_cogs: databaseCountSchema,
  delivered_orders_missing_fulfillment_costs: databaseCountSchema,
  product_revenue: databaseMoneySchema,
  net_revenue: databaseMoneySchema,
  cogs: nullableDatabaseMoneySchema,
  gross_profit: nullableDatabaseMoneySchema,
  contribution_profit: nullableDatabaseMoneySchema,
  average_order_value: databaseMoneySchema,
  expenses: databaseMoneySchema,
  ad_spend: databaseMoneySchema,
  net_profit: nullableDatabaseMoneySchema,
  profit_margin: nullableDatabasePercentSchema,
}).strict();

export const productFinancialRowSchema = z.object({
  product_id: z.string().uuid(),
  sku: z.string(),
  product_name: z.string(),
  delivered_order_count: databaseCountSchema,
  delivered_units: databaseCountSchema,
  returned_units: databaseCountSchema,
  gross_product_revenue: databaseMoneySchema,
  allocated_delivery_revenue: databaseMoneySchema,
  allocated_discount: databaseMoneySchema,
  allocated_refund: databaseMoneySchema,
  adjusted_product_net_revenue: databaseMoneySchema,
  recognized_cogs: nullableDatabaseMoneySchema,
  gross_profit: nullableDatabaseMoneySchema,
  allocated_courier_cost: nullableDatabaseMoneySchema,
  allocated_packaging_cost: nullableDatabaseMoneySchema,
  contribution_profit: nullableDatabaseMoneySchema,
}).strict();

export const reconciliationRowSchema = financialSummaryRowSchema;

export const dataQualityRowSchema = z.object({
  order_items_with_missing_links: databaseCountSchema,
  duplicate_order_numbers: databaseCountSchema,
  products_with_missing_sku: databaseCountSchema,
  duplicate_product_skus: databaseCountSchema,
  delivered_orders_without_items: databaseCountSchema,
  delivered_orders_missing_financial_snapshot: databaseCountSchema,
  snapshot_product_revenue_mismatches: databaseCountSchema,
  snapshot_cogs_mismatches: databaseCountSchema,
  inventory_purchases_recorded_as_operating_expense: databaseCountSchema,
  supplier_freight_recorded_as_operating_expense: databaseCountSchema,
  delivered_items_missing_landed_cost_snapshot: databaseCountSchema,
  procurement_batches_missing_quantity: databaseCountSchema,
  procurement_batches_missing_product: databaseCountSchema,
  unallocated_freight_in: databaseCountSchema,
  invalid_landed_cost: databaseCountSchema,
  purchase_batch_allocation_mismatches: databaseCountSchema,
  advertising_duplicated_in_expenses: databaseCountSchema,
  fulfillment_duplicated_in_expenses: databaseCountSchema,
  inventory_valuation_mismatches: databaseCountSchema,
  unallocated_procurement_records: databaseCountSchema,
  procurement_records_missing_cash_movement: databaseCountSchema,
}).strict();

export const procurementSummaryRowSchema = z.object({
  inventory_purchase_total: databaseMoneySchema,
  freight_in_total: databaseMoneySchema,
  allocated_procurement_total: databaseMoneySchema,
  unallocated_procurement_total: databaseMoneySchema,
  known_inventory_value: databaseMoneySchema,
  unallocated_record_count: databaseCountSchema,
  missing_cash_movement_count: databaseCountSchema,
}).strict();

export type FinancialSummaryRow = z.output<typeof financialSummaryRowSchema>;
export type OrderFinancialRow = z.output<typeof orderFinancialRowSchema>;
export type DailyFinancialRow = z.output<typeof dailyFinancialRowSchema>;
export type ProductFinancialRow = z.output<typeof productFinancialRowSchema>;
export type ReconciliationRow = z.output<typeof reconciliationRowSchema>;
export type DataQualityRow = z.output<typeof dataQualityRowSchema>;
export type ProcurementSummaryRow = z.output<typeof procurementSummaryRowSchema>;

export function mapDataQuality(row: DataQualityRow): DashboardDataQuality {
  return {
    orderItemsWithMissingLinks: row.order_items_with_missing_links,
    duplicateOrderNumbers: row.duplicate_order_numbers,
    productsWithMissingSku: row.products_with_missing_sku,
    duplicateProductSkus: row.duplicate_product_skus,
    deliveredOrdersWithoutItems: row.delivered_orders_without_items,
    deliveredOrdersMissingFinancialSnapshot: row.delivered_orders_missing_financial_snapshot,
    snapshotProductRevenueMismatches: row.snapshot_product_revenue_mismatches,
    snapshotCogsMismatches: row.snapshot_cogs_mismatches,
    inventoryPurchasesRecordedAsOperatingExpense: row.inventory_purchases_recorded_as_operating_expense,
    supplierFreightRecordedAsOperatingExpense: row.supplier_freight_recorded_as_operating_expense,
    deliveredItemsMissingLandedCostSnapshot: row.delivered_items_missing_landed_cost_snapshot,
    procurementBatchesMissingQuantity: row.procurement_batches_missing_quantity,
    procurementBatchesMissingProduct: row.procurement_batches_missing_product,
    unallocatedFreightIn: row.unallocated_freight_in,
    invalidLandedCost: row.invalid_landed_cost,
    purchaseBatchAllocationMismatches: row.purchase_batch_allocation_mismatches,
    advertisingDuplicatedInExpenses: row.advertising_duplicated_in_expenses,
    fulfillmentDuplicatedInExpenses: row.fulfillment_duplicated_in_expenses,
    inventoryValuationMismatches: row.inventory_valuation_mismatches,
    unallocatedProcurementRecords: row.unallocated_procurement_records,
    procurementRecordsMissingCashMovement: row.procurement_records_missing_cash_movement,
  };
}

export function dataQualityAllZero(data: DashboardDataQuality): boolean {
  return Object.values(data).every((count) => count === 0);
}

function sumMoney(values: Money[]): Money {
  const total = values.reduce((sum, value) => sum + value, 0);
  assertMoney(total);
  return total;
}

function roundedRatio(numerator: Money, denominator: Money): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

export function summarizeOrderFinancialRows(
  rows: OrderFinancialRow[],
  adSpend: Money,
  expenses: Money,
): FinancialSummaryRow {
  const cogsComplete = rows.every((row) => row.cogs_complete);
  const fulfillmentComplete = rows.every((row) => row.fulfillment_costs_complete);
  const productRevenue = sumMoney(rows.map((row) => row.recognized_product_revenue));
  const netRevenue = sumMoney(rows.map((row) => row.net_revenue));
  const cogs = cogsComplete ? sumMoney(rows.map((row) => row.recognized_cogs ?? 0)) : null;
  const grossProfit = cogsComplete ? sumMoney(rows.map((row) => row.gross_profit ?? 0)) : null;
  const contributionProfit = cogsComplete && fulfillmentComplete
    ? sumMoney(rows.map((row) => row.contribution_profit ?? 0))
    : null;
  const netProfit = contributionProfit === null ? null : contributionProfit - adSpend - expenses;
  if (netProfit !== null) assertMoney(netProfit);
  return {
    delivered_order_count: rows.length,
    delivered_orders_missing_cogs: rows.filter((row) => !row.cogs_complete).length,
    delivered_orders_missing_fulfillment_costs: rows.filter((row) => !row.fulfillment_costs_complete).length,
    product_revenue: productRevenue,
    net_revenue: netRevenue,
    cogs,
    gross_profit: grossProfit,
    contribution_profit: contributionProfit,
    average_order_value: rows.length ? Math.round(netRevenue / rows.length) : 0,
    ad_spend: adSpend,
    expenses,
    net_profit: netProfit,
    profit_margin: netProfit === null ? null : roundedRatio(netProfit, netRevenue),
  };
}

export function selectCurrentUnsettledCodRows(
  rows: OrderFinancialRow[],
  settlementEligibleOrderIds: ReadonlySet<string>,
): OrderFinancialRow[] {
  return rows.filter((row) =>
    row.payment_method.toLowerCase() === "cod"
      && settlementEligibleOrderIds.has(row.order_id));
}

export function financialSummariesMatch(left: FinancialSummaryRow, right: FinancialSummaryRow): boolean {
  return left.delivered_order_count === right.delivered_order_count
    && left.delivered_orders_missing_cogs === right.delivered_orders_missing_cogs
    && left.delivered_orders_missing_fulfillment_costs === right.delivered_orders_missing_fulfillment_costs
    && left.product_revenue === right.product_revenue
    && left.net_revenue === right.net_revenue
    && left.cogs === right.cogs
    && left.gross_profit === right.gross_profit
    && left.contribution_profit === right.contribution_profit
    && left.average_order_value === right.average_order_value
    && left.ad_spend === right.ad_spend
    && left.expenses === right.expenses
    && left.net_profit === right.net_profit
    && left.profit_margin === right.profit_margin;
}
