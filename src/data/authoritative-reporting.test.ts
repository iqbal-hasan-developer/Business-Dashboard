import { describe, expect, it } from "vitest";
import {
  databaseNumericToMoney,
  dailyFinancialRowSchema,
  dataQualityRowSchema,
  financialSummariesMatch,
  financialSummaryRowSchema,
  orderFinancialRowSchema,
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

  it("uses refund-adjusted recognized rows and reconciles exact money totals", () => {
    const detail = recognizedOrder();
    const summary = summarizeOrderFinancialRows([detail], 1000, 500);
    expect(detail.recognized_refund_amount).toBe(2000);
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

  it("rejects missing or extra RPC/view fields", () => {
    expect(() => financialSummaryRowSchema.parse({ ...summaryInput, unexpected: 1 })).toThrow();
    expect(() => dataQualityRowSchema.parse({})).toThrow();
  });
});
