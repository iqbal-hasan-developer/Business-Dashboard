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

export const productCatalogSchema = z.object({
  productId: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Product name is required").max(180),
  slug: z.string().trim().min(2, "Slug is required").max(180)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens"),
  publicSku: z.string().trim().min(1, "SKU is required").max(120),
  sellingPrice: moneyInput,
  isActive: z.boolean(),
  categoryId: z.string().uuid().nullable(),
  buyingPrice: moneyInput,
  reorderLevel: z.number().int().min(0).max(1_000_000),
  dashboardSku: z.string().trim().max(120),
  variation: z.string().trim().max(160),
  internalNotes: z.string().trim().max(1_000),
});

export const expenseEntrySchema = z.object({
  expenseDate: isoDate,
  categoryKey: z.string().trim().min(2, "Category is required").max(80),
  description: z.string().trim().min(2, "Description is required").max(500),
  amount: moneyInput.refine((value) => parseMoney(value) > 0, "Amount must be greater than zero"),
  paymentMethod: z.string().trim().max(80),
  campaignId: z.string().uuid().nullable(),
  salesChannel: z.string().trim().max(100),
  reference: z.string().trim().max(160),
});

export const campaignEntrySchema = z.object({
  campaignId: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Campaign name is required").max(160),
  channel: z.string().trim().max(100),
  startsOn: isoDate.or(z.literal("")),
  endsOn: isoDate.or(z.literal("")),
  budget: moneyInput,
  isActive: z.boolean(),
}).superRefine((value, context) => {
  if (value.startsOn && value.endsOn && value.endsOn < value.startsOn) {
    context.addIssue({ code: "custom", path: ["endsOn"], message: "End date cannot precede start date" });
  }
});

export const adSpendEntrySchema = z.object({
  campaignId: z.string().uuid("Choose a campaign"),
  spendDate: isoDate,
  platform: z.string().trim().min(2, "Platform is required").max(100),
  amount: moneyInput,
  sourceReference: z.string().trim().max(160),
});

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
export type ProductCatalogValues = z.infer<typeof productCatalogSchema>;
export type ExpenseEntryValues = z.infer<typeof expenseEntrySchema>;
export type CampaignEntryValues = z.infer<typeof campaignEntrySchema>;
export type AdSpendEntryValues = z.infer<typeof adSpendEntrySchema>;
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
