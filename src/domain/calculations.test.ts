import { describe, expect, it } from "vitest";
import { calculateLineCogs, calculateLineRevenue, calculateOrderFinancials, orderWarnings } from "@/domain/calculations";
import { formatMoney, multiplyMoney, parseMoney, sumMoney } from "@/domain/money";
import type { Order } from "@/domain/types";

const deliveredOrder: Order = {
  id: "test",
  orderNumber: "NNM-20260714-9999",
  orderDate: "2026-07-14",
  customerName: "Test Customer",
  customerLocation: "Inside Dhaka",
  courier: "Steadfast",
  channel: "Website",
  campaign: "Test",
  status: "Delivered",
  paymentMethod: "COD",
  paymentStatus: "Paid",
  settlementStatus: "Settled",
  discount: parseMoney("50"),
  deliveryCharged: parseMoney("80"),
  refundAmount: parseMoney("100"),
  courierCostSnapshot: parseMoney("70"),
  packagingCostSnapshot: 0,
  items: [{
    id: "item",
    productId: "p1",
    skuSnapshot: "NN-001",
    productNameSnapshot: "Planner",
    listPriceSnapshot: parseMoney("580"),
    buyingCostSnapshot: parseMoney("280"),
    quantity: 2,
    actualUnitSellingPrice: parseMoney("550"),
  }],
};

describe("decimal-safe money", () => {
  it("parses, multiplies, sums and formats integer poisha", () => {
    expect(parseMoney("1,234.50")).toBe(123450);
    expect(multiplyMoney(parseMoney("19.99"), 3)).toBe(5997);
    expect(sumMoney([parseMoney("0.10"), parseMoney("0.20")])).toBe(30);
    expect(formatMoney(123450, true)).toBe("৳1,234.50");
  });

  it("rejects unsupported precision and negative form amounts", () => {
    expect(() => parseMoney("1.999")).toThrow();
    expect(() => parseMoney("-1")).toThrow();
  });
});

describe("order calculations", () => {
  it("calculates quantity, discounts, refunds and costs", () => {
    expect(calculateLineRevenue(deliveredOrder.items[0])).toBe(parseMoney("1100"));
    expect(calculateLineCogs(deliveredOrder.items[0])).toBe(parseMoney("560"));
    expect(calculateOrderFinancials(deliveredOrder)).toEqual({
      productSubtotal: parseMoney("1100"),
      productRevenue: parseMoney("1100"),
      orderTotal: parseMoney("1130"),
      productCogs: parseMoney("560"),
      netRevenue: parseMoney("1030"),
      recognizedCogs: parseMoney("560"),
      grossProfit: parseMoney("470"),
      contributionProfit: parseMoney("400"),
      profitMargin: 400 / 1030,
    });
  });

  it.each(["Pending", "Confirmed", "Dispatched", "Cancelled", "Returned", "Refunded", "Failed Delivery"] as const)("does not recognize revenue or COGS for %s", (status) => {
    const result = calculateOrderFinancials({ ...deliveredOrder, status });
    expect(result.productSubtotal).toBe(parseMoney("1100"));
    expect(result.productRevenue).toBe(0);
    expect(result.orderTotal).toBe(parseMoney("1130"));
    expect(result.netRevenue).toBe(0);
    expect(result.recognizedCogs).toBe(0);
    expect(result.contributionProfit).toBe(0);
  });

  it("keeps order, payment and settlement status independent", () => {
    const order = { ...deliveredOrder, status: "Confirmed" as const, paymentStatus: "Paid" as const, settlementStatus: "Settled" as const };
    expect(calculateOrderFinancials(order).netRevenue).toBe(0);
    expect(orderWarnings(order, new Set(["NN-001"]), new Set())).toContain("Settlement is marked Settled before delivery");
  });

  it("warns for below-cost pricing and excessive refunds", () => {
    const order = {
      ...deliveredOrder,
      refundAmount: parseMoney("2000"),
      items: [{ ...deliveredOrder.items[0], actualUnitSellingPrice: parseMoney("200") }],
    };
    const warnings = orderWarnings(order, new Set(["NN-001"]), new Set());
    expect(warnings).toContain("One or more selling prices are below buying cost");
    expect(warnings).toContain("Refund exceeds the order value");
  });
});
