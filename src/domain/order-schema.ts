import { z } from "zod";
import { ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, SALES_CHANNELS, SETTLEMENT_STATUSES } from "@/domain/types";

const moneyString = z.string().regex(/^\d+(\.\d{0,2})?$/, "Enter a non-negative amount with up to 2 decimals");

export const orderFormSchema = z.object({
  orderNumber: z.string().min(8, "Order number is required"),
  externalReference: z.string(),
  orderDate: z.string().min(1, "Order date is required"),
  customerName: z.string().min(2, "Customer name is required"),
  customerLocation: z.enum(["Inside Dhaka", "Outside Dhaka"]),
  courier: z.string().min(1),
  channel: z.enum(SALES_CHANNELS),
  campaign: z.string(),
  status: z.enum(ORDER_STATUSES),
  paymentMethod: z.enum(PAYMENT_METHODS),
  paymentStatus: z.enum(PAYMENT_STATUSES),
  settlementStatus: z.enum(SETTLEMENT_STATUSES),
  discount: moneyString,
  deliveryCharged: moneyString,
  refundAmount: moneyString,
  items: z.array(z.object({
    sku: z.string().min(1, "Choose a SKU"),
    quantity: z.number().int().min(1, "Minimum quantity is 1"),
    actualUnitSellingPrice: moneyString,
  })).min(1, "Add at least one item"),
});

export type OrderFormValues = z.infer<typeof orderFormSchema>;
