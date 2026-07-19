import { describe, expect, it } from "vitest";
import {
  buildManualOrderRpcArgs,
  createSubmissionGuard,
  manualOrderSchema,
  orderTransitionSchema,
  productBusinessSchema,
  safeManualEntryError,
  type ManualOrderValues,
} from "@/domain/manual-entry";

const validOrder: ManualOrderValues = {
  orderNumber: "NNM-20260719-001",
  externalReference: "EXT-1",
  orderDate: "2026-07-19",
  customerName: "Owner Test",
  customerPhone: "01700000000",
  customerAddress: "Dhaka, Bangladesh",
  customerNote: "Call before delivery",
  customerLocation: "Inside Dhaka",
  courier: "Steadfast",
  channel: "Phone",
  campaign: "Manual MVP",
  status: "Delivered",
  paymentMethod: "COD",
  paymentStatus: "Unpaid",
  settlementStatus: "Awaiting",
  discount: "10.05",
  deliveryCharged: "80",
  courierCostSnapshot: "70.25",
  packagingCostSnapshot: "5.50",
  items: [{ productId: "82100000-0000-4000-8000-000000000001", quantity: 2, actualUnitSellingPrice: "580.75" }],
};

describe("manual-entry validation and RPC mapping", () => {
  it("preserves exact poisha inputs and independent statuses", () => {
    expect(manualOrderSchema.parse(validOrder)).toEqual(validOrder);
    const args = buildManualOrderRpcArgs(validOrder);
    expect(args.p_order).toMatchObject({
      order_status: "Delivered",
      payment_status: "Unpaid",
      settlement_status: "Awaiting",
      discount_amount: "10.05",
      delivery_charged: "80",
      refund_amount: "0",
      courier_cost_snapshot: "70.25",
      packaging_cost_snapshot: "5.5",
    });
    expect(args.p_items).toEqual([{ product_id: validOrder.items[0].productId, quantity: 2, actual_unit_selling_price: 580.75 }]);
  });

  it("rejects refund and return workflow states in this slice", () => {
    expect(manualOrderSchema.safeParse({ ...validOrder, status: "Returned" }).success).toBe(false);
    expect(manualOrderSchema.safeParse({ ...validOrder, paymentStatus: "Refunded" }).success).toBe(false);
    expect(orderTransitionSchema.safeParse({ orderId: validOrder.items[0].productId, orderStatus: "Refunded", paymentStatus: "Paid", settlementStatus: "Settled" }).success).toBe(false);
  });

  it("validates required delivery fields and non-negative exact money", () => {
    expect(manualOrderSchema.safeParse({ ...validOrder, customerPhone: "", discount: "-1" }).success).toBe(false);
    expect(productBusinessSchema.safeParse({ productId: validOrder.items[0].productId, buyingPrice: "12.345", reorderLevel: -1, skuOverride: "SKU", variation: "V", internalNotes: "" }).success).toBe(false);
  });

  it("locks duplicate submissions until the active save releases", () => {
    const guard = createSubmissionGuard();
    expect(guard.tryLock()).toBe(true);
    expect(guard.tryLock()).toBe(false);
    guard.release();
    expect(guard.tryLock()).toBe(true);
  });

  it("maps database errors without disclosing raw messages", () => {
    expect(safeManualEntryError({ code: "23505", message: "private detail" }, "Duplicate order.")).toBe("Duplicate order.");
    expect(safeManualEntryError({ code: "42501", message: "private detail" })).toMatch(/role/);
    expect(safeManualEntryError({ code: "XX000", message: "private detail" })).toBe("The record could not be saved. No changes were made.");
  });
});
