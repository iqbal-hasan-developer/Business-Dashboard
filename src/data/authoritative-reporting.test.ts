import { describe, expect, it } from "vitest";
import {
  databaseNumericToMoney,
  dailyFinancialRowSchema,
  dataQualityRowSchema,
  financialSummariesMatch,
  financialSummaryRowSchema,
  orderFinancialRowSchema,
  productFinancialRowSchema,
  rejectedCodAdjustmentFinancialRowSchema,
  selectCurrentUnsettledCodRows,
  summarizeOrderFinancialRows,
} from "@/data/authoritative-reporting";

const summaryInput = {
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

function recognizedOrder(overrides: Record<string, unknown> = {}) {
  return orderFinancialRowSchema.parse({
    order_id: "00000000-0000-4000-8000-000000000001",
    order_number: "TEST-001",
    order_date: "2026-07-16",
    sales_channel: "Website",
    campaign_id: null,
    campaign_name_snapshot: null,
    payment_method: "COD",
    settlement_status: "Awaiting",
    recognized_at: "2026-07-16T00:00:00Z",
    recognition_source: "dashboard",
    is_delivered: true,
    cogs_complete: true,
    fulfillment_costs_complete: true,
    recognized_product_revenue: "100.00",
    recognized_delivery_revenue: "10.00",
    recognized_discount_amount: "5.00",
    recognized_refund_amount: "20.00",
    net_revenue: "85.00",
    recognized_cogs: "40.00",
    gross_profit: "45.00",
    contribution_profit: "35.00",
    recognized_courier_cost: "8.00",
    recognized_packaging_cost: "2.00",
    ...overrides,
  });
}

describe("authoritative reporting contracts", () => {
  it("converts database numerics to integer poisha without binary-float arithmetic", () => {
    expect(databaseNumericToMoney("1,234.50".replace(",", ""))).toBe(123450);
    expect(databaseNumericToMoney(0.1)).toBe(10);
    expect(databaseNumericToMoney("-20.00")).toBe(-2000);
    expect(() => databaseNumericToMoney("0.001")).toThrow();
  });

  it("distinguishes a truthful zero summary from an unavailable margin", () => {
    expect(financialSummaryRowSchema.parse(summaryInput)).toEqual({ ...summaryInput, profit_margin: null });
  });

  it("preserves unknown COGS and fulfillment costs as null", () => {
    const detail = recognizedOrder({
      cogs_complete: false,
      fulfillment_costs_complete: false,
      recognized_cogs: null,
      gross_profit: null,
      contribution_profit: null,
    });
    const summary = summarizeOrderFinancialRows([detail], 1000, 500);
    expect(summary.cogs).toBeNull();
    expect(summary.gross_profit).toBeNull();
    expect(summary.contribution_profit).toBeNull();
    expect(summary.net_profit).toBeNull();
    expect(summary.profit_margin).toBeNull();
  });

  it("adds a confirmed rejected COD recovery and courier charge without product revenue or COGS", () => {
    const adjustment = rejectedCodAdjustmentFinancialRowSchema.parse({
      event_date: "2026-08-23", order_id: "00000000-0000-4000-8000-000000000099",
      order_number: "284766796", sales_channel: "Facebook Messenger", campaign_id: null,
      delivery_charge_recovery: "100.00", courier_cost: "115.00", net_adjustment: "-15.00",
      settlement_id: "00000000-0000-4000-8000-000000000098", recognized_at: "2026-08-23T10:00:00Z",
    });
    const summary = summarizeOrderFinancialRows([], 0, 0, [adjustment]);
    expect(summary).toMatchObject({
      delivered_order_count: 0, product_revenue: 0, net_revenue: 10_000,
      cogs: 0, gross_profit: 10_000, contribution_profit: -1_500,
      average_order_value: 0, net_profit: -1_500,
    });
  });

  it("preserves an unknown daily contribution value instead of converting it to zero", () => {
    const daily = dailyFinancialRowSchema.parse({
      business_date: "2026-07-16",
      delivered_order_count: 1,
      delivered_orders_missing_cogs: 1,
      delivered_orders_missing_fulfillment_costs: 0,
      product_revenue: "100.00",
      net_revenue: "100.00",
      cogs: null,
      gross_profit: null,
      contribution_profit: null,
      average_order_value: "100.00",
      expenses: "0.00",
      ad_spend: "0.00",
      net_profit: null,
      profit_margin: null,
    });
    expect(daily.contribution_profit).toBeNull();
  });

  it("validates every product-financial numeric and preserves exact poisha and null costs", () => {
    const product = productFinancialRowSchema.parse({
      product_id: "00000000-0000-4000-8000-000000000010",
      sku: "NN-010",
      product_name: "Planner",
      delivered_order_count: "2",
      delivered_units: 3,
      returned_units: "1",
      gross_product_revenue: "1234.50",
      allocated_delivery_revenue: "120.05",
      allocated_discount: "34.25",
      allocated_refund: "200.10",
      adjusted_product_net_revenue: "1120.20",
      recognized_cogs: null,
      gross_profit: null,
      allocated_courier_cost: "70.00",
      allocated_packaging_cost: "2.00",
      contribution_profit: null,
    });

    expect(product).toMatchObject({
      delivered_order_count: 2,
      delivered_units: 3,
      returned_units: 1,
      gross_product_revenue: 123450,
      allocated_delivery_revenue: 12005,
      allocated_discount: 3425,
      allocated_refund: 20010,
      adjusted_product_net_revenue: 112020,
      recognized_cogs: null,
      allocated_courier_cost: 7000,
      allocated_packaging_cost: 200,
      contribution_profit: null,
    });
  });

  it("rejects imprecise or structurally drifted product-financial responses", () => {
    const valid = {
      product_id: "00000000-0000-4000-8000-000000000010",
      sku: "NN-010",
      product_name: "Planner",
      delivered_order_count: 1,
      delivered_units: 1,
      returned_units: 0,
      gross_product_revenue: "100.00",
      allocated_delivery_revenue: "0.00",
      allocated_discount: "0.00",
      allocated_refund: "0.00",
      adjusted_product_net_revenue: "100.00",
      recognized_cogs: "40.00",
      gross_profit: "60.00",
      allocated_courier_cost: "0.00",
      allocated_packaging_cost: "0.00",
      contribution_profit: "60.00",
    };
    expect(() => productFinancialRowSchema.parse({ ...valid, adjusted_product_net_revenue: "99.999" })).toThrow();
    expect(() => productFinancialRowSchema.parse({ ...valid, unexpected: 1 })).toThrow();
  });

  it("uses refund-adjusted recognized rows and reconciles exact money totals", () => {
    const detail = recognizedOrder();
    const summary = summarizeOrderFinancialRows([detail], 1000, 500);
    expect(detail.recognized_refund_amount).toBe(2000);
    expect(detail.recognized_courier_cost).toBe(800);
    expect(detail.recognized_packaging_cost).toBe(200);
    expect(summary.net_revenue).toBe(8500);
    expect(summary.contribution_profit).toBe(3500);
    expect(summary.net_profit).toBe(2000);
    expect(summary.profit_margin).toBe(0.2353);
    expect(financialSummariesMatch(summary, { ...summary })).toBe(true);
  });

  it("reconciles only the detail rows selected by channel and campaign filters", () => {
    const selected = recognizedOrder();
    const excluded = recognizedOrder({
      order_id: "00000000-0000-4000-8000-000000000002",
      sales_channel: "WhatsApp",
      campaign_id: "00000000-0000-4000-8000-000000000099",
    });
    const filtered = [selected, excluded].filter((row) => row.sales_channel === "Website" && row.campaign_id === null);
    expect(summarizeOrderFinancialRows(filtered, 0, 0).delivered_order_count).toBe(1);
  });

  it("uses current reversal-aware eligibility instead of the immutable settlement snapshot", () => {
    const settledAfterDelivery = recognizedOrder({
      order_id: "00000000-0000-4000-8000-000000000001",
      settlement_status: "Awaiting",
    });
    const eligibleAfterReversal = recognizedOrder({
      order_id: "00000000-0000-4000-8000-000000000002",
      settlement_status: "Settled",
    });
    const nonCod = recognizedOrder({
      order_id: "00000000-0000-4000-8000-000000000003",
      payment_method: "bKash",
    });

    const current = selectCurrentUnsettledCodRows(
      [settledAfterDelivery, eligibleAfterReversal, nonCod],
      new Set([eligibleAfterReversal.order_id, nonCod.order_id]),
    );

    expect(current.map((row) => row.order_id)).toEqual([eligibleAfterReversal.order_id]);
    expect(current.reduce((total, row) => total + row.net_revenue, 0)).toBe(8500);
  });

  it("rejects missing or extra RPC/view fields", () => {
    expect(() => financialSummaryRowSchema.parse({ ...summaryInput, unexpected: 1 })).toThrow();
    expect(() => dataQualityRowSchema.parse({})).toThrow();
  });
});
