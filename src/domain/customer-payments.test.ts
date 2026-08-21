import { describe, expect, it } from "vitest";
import { customerPaymentReceiptEligibility, customerPaymentReceiptSchema, safeCustomerPaymentReceiptError } from "@/domain/customer-payments";
import { parseMoney } from "@/domain/money";
import type { Order } from "@/domain/types";

const order: Order = {
  id: "00000000-0000-4000-8000-000000000001",
  updatedAt: "2026-08-17T10:00:00+00:00",
  hasImmutableFinancialSnapshot: true,
  orderNumber: "NNM-1",
  orderDate: "2026-08-10",
  customerName: "Customer",
  customerLocation: "Inside Dhaka",
  courier: "owner",
  channel: "Facebook Messenger",
  campaign: "Unattributed",
  status: "Delivered",
  paymentMethod: "bKash",
  paymentStatus: "Paid",
  settlementStatus: "Not Applicable",
  items: [{ id: "i1", productId: "p1", skuSnapshot: "SKU", productNameSnapshot: "Product", listPriceSnapshot: parseMoney("1100"), buyingCostSnapshot: parseMoney("620"), quantity: 1, actualUnitSellingPrice: parseMoney("1100") }],
  discount: 0,
  deliveryCharged: parseMoney("70"),
  refundAmount: 0,
  courierCostSnapshot: 0,
  packagingCostSnapshot: parseMoney("2"),
};

describe("customer payment receipt domain", () => {
  it("derives the exact order total and account for a Delivered Paid non-COD order", () => {
    expect(customerPaymentReceiptEligibility(order)).toEqual({
      eligible: true,
      account: { key: "bkash", label: "bKash" },
      amount: parseMoney("1170"),
      expectedUpdatedAt: order.updatedAt,
    });
  });

  it("blocks COD, non-Delivered, unpaid, refunded, and stale orders", () => {
    expect(customerPaymentReceiptEligibility({ ...order, paymentMethod: "COD" }).eligible).toBe(false);
    expect(customerPaymentReceiptEligibility({ ...order, status: "Confirmed" }).eligible).toBe(false);
    expect(customerPaymentReceiptEligibility({ ...order, paymentStatus: "Unpaid" }).eligible).toBe(false);
    expect(customerPaymentReceiptEligibility({ ...order, refundAmount: 100 }).eligible).toBe(false);
    expect(customerPaymentReceiptEligibility({ ...order, updatedAt: undefined }).eligible).toBe(false);
  });

  it("validates only receipt evidence supplied by the browser", () => {
    const values = { orderId: order.id, expectedUpdatedAt: order.updatedAt, receivedOn: order.orderDate, reference: "BKASH-TX-1", submissionKey: "00000000-0000-4000-8000-000000000002" };
    expect(customerPaymentReceiptSchema.safeParse(values).success).toBe(true);
    expect(customerPaymentReceiptSchema.safeParse({ ...values, amount: "1170" }).success).toBe(false);
    expect(customerPaymentReceiptSchema.safeParse({ ...values, receivedOn: "bad-date" }).success).toBe(false);
  });

  it("returns safe workflow errors without database details", () => {
    expect(safeCustomerPaymentReceiptError(new Error("This order already has an active linked cash receipt."))).toContain("already");
    expect(safeCustomerPaymentReceiptError(new Error("internal database detail"))).toContain("was not recorded");
  });
});
