import { z } from "zod";
import { parseMoney, moneyToDatabaseNumber } from "@/domain/money";
import {
  PAYMENT_METHODS,
  SALES_CHANNELS,
  type Money,
} from "@/domain/types";

export const MANUAL_ORDER_STATUSES = [
  "Pending",
  "Confirmed",
  "Dispatched",
  "Delivered",
  "Cancelled",
  "Failed Delivery",
] as const;

export const MANUAL_PAYMENT_STATUSES = [
  "Unpaid",
  "Paid",
  "Partially Paid",
] as const;

export const MANUAL_SETTLEMENT_STATUSES = [
  "Not Applicable",
  "Awaiting",
  "Partially Settled",
  "Settled",
] as const;

const moneyInput = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{0,2})?$/, "Enter a non-negative amount with up to 2 decimals")
  .superRefine((value, context) => {
    try {
      parseMoney(value);
    } catch {
      context.addIssue({ code: "custom", message: "Enter an amount within the supported poisha range" });
    }
  });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid business date");

const manualOrderFields = {
  orderNumber: z.string().trim().min(3, "Order number is required").max(80),
  externalReference: z.string().trim().max(120),
  orderDate: isoDate,
  customerName: z.string().trim().min(2, "Customer name is required").max(160),
  customerPhone: z.string().trim().min(5, "Customer phone is required").max(40),
  customerAddress: z.string().trim().min(5, "Customer address is required").max(500),
  customerNote: z.string().trim().max(500),
  customerLocation: z.enum(["Inside Dhaka", "Outside Dhaka"]),
  courier: z.string().trim().min(1, "Courier is required").max(100),
  channel: z.enum(SALES_CHANNELS),
  campaign: z.string().trim().max(160),
  status: z.enum(MANUAL_ORDER_STATUSES),
  paymentMethod: z.enum(PAYMENT_METHODS),
  paymentStatus: z.enum(MANUAL_PAYMENT_STATUSES),
  settlementStatus: z.enum(MANUAL_SETTLEMENT_STATUSES),
  discount: moneyInput,
  deliveryCharged: moneyInput,
  courierCostSnapshot: moneyInput,
  packagingCostSnapshot: moneyInput,
  items: z.array(z.object({
    productId: z.string().min(1, "Choose a product"),
    quantity: z.number().int().min(1, "Minimum quantity is 1").max(10_000),
    actualUnitSellingPrice: moneyInput,
  })).min(1, "Add at least one item").max(100),
};

export const manualOrderFormSchema = z.object(manualOrderFields);
export const manualOrderSchema = manualOrderFormSchema.extend({
  items: z.array(z.object({
    productId: z.string().uuid("Choose an installed product"),
    quantity: z.number().int().min(1, "Minimum quantity is 1").max(10_000),
    actualUnitSellingPrice: moneyInput,
  })).min(1, "Add at least one item").max(100),
});

export const productBusinessSchema = z.object({
  productId: z.string().uuid(),
  buyingPrice: moneyInput,
  reorderLevel: z.number().int().min(0).max(1_000_000),
  skuOverride: z.string().trim().max(120),
  variation: z.string().trim().max(160),
  internalNotes: z.string().trim().max(1_000),
});

export const orderTransitionSchema = z.object({
  orderId: z.string().uuid(),
  orderStatus: z.enum(MANUAL_ORDER_STATUSES),
  paymentStatus: z.enum(MANUAL_PAYMENT_STATUSES),
  settlementStatus: z.enum(MANUAL_SETTLEMENT_STATUSES),
});

export type ManualOrderValues = z.infer<typeof manualOrderSchema>;
export type ProductBusinessValues = z.infer<typeof productBusinessSchema>;
export type OrderTransitionValues = z.infer<typeof orderTransitionSchema>;

export type ManualOrderRpcArgs = {
  p_order: Record<string, string | null>;
  p_items: Array<{
    product_id: string;
    quantity: number;
    actual_unit_selling_price: number;
  }>;
};

function money(value: string): Money {
  return parseMoney(value);
}

export function buildManualOrderRpcArgs(values: ManualOrderValues): ManualOrderRpcArgs {
  return {
    p_order: {
      order_number: values.orderNumber,
      external_reference: values.externalReference || null,
      order_date: values.orderDate,
      customer_name: values.customerName,
      customer_phone: values.customerPhone,
      customer_address: values.customerAddress,
      customer_note: values.customerNote || null,
      delivery_area: values.customerLocation,
      customer_location: values.customerLocation,
      courier: values.courier,
      sales_channel: values.channel,
      campaign_id: null,
      campaign_name: values.campaign || null,
      order_status: values.status,
      payment_method: values.paymentMethod,
      payment_status: values.paymentStatus,
      settlement_status: values.settlementStatus,
      discount_amount: moneyToDatabaseNumber(money(values.discount)).toString(),
      delivery_charged: moneyToDatabaseNumber(money(values.deliveryCharged)).toString(),
      refund_amount: "0",
      courier_cost_snapshot: moneyToDatabaseNumber(money(values.courierCostSnapshot)).toString(),
      packaging_cost_snapshot: moneyToDatabaseNumber(money(values.packagingCostSnapshot)).toString(),
    },
    p_items: values.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
      actual_unit_selling_price: moneyToDatabaseNumber(money(item.actualUnitSellingPrice)),
    })),
  };
}

export function createSubmissionGuard() {
  let locked = false;
  return {
    tryLock() {
      if (locked) return false;
      locked = true;
      return true;
    },
    release() {
      locked = false;
    },
  };
}

export function safeManualEntryError(error: unknown, duplicateLabel?: string): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  if (code === "23505") return duplicateLabel ?? "That record already exists.";
  if (code === "42501") return "Your dashboard role is not allowed to perform this update.";
  if (code === "22023") return "The database rejected one or more invalid values.";
  if (code === "P0002") return "The requested record no longer exists.";
  return "The record could not be saved. No changes were made.";
}
