import { z } from "zod";
import { calculateOrderFinancials } from "@/domain/calculations";
import type { Order, PaymentMethod } from "@/domain/types";

export const customerPaymentReceiptSchema = z.object({
  orderId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  receivedOn: z.iso.date(),
  reference: z.string().trim().max(120),
  submissionKey: z.string().uuid(),
}).strict();

export type CustomerPaymentReceiptValues = z.infer<typeof customerPaymentReceiptSchema>;

const PAYMENT_ACCOUNTS: Partial<Record<PaymentMethod, { key: string; label: string }>> = {
  bKash: { key: "bkash", label: "bKash" },
  Nagad: { key: "nagad", label: "Nagad" },
  Cash: { key: "cash", label: "Cash" },
  "Bank Transfer": { key: "bank", label: "Bank" },
};

export function customerPaymentReceiptEligibility(order: Order) {
  const account = PAYMENT_ACCOUNTS[order.paymentMethod];
  if (!account) return { eligible: false as const, message: "COD orders are recorded through courier settlement." };
  if (order.status !== "Delivered") return { eligible: false as const, message: "Record the receipt after the order is Delivered." };
  if (order.paymentStatus !== "Paid") return { eligible: false as const, message: "Set payment status to Paid before recording the receipt." };
  if (!order.updatedAt) return { eligible: false as const, message: "Freshness evidence is unavailable for this order." };
  if (order.refundAmount !== 0) return { eligible: false as const, message: "Refunded orders require a dedicated receipt correction workflow." };
  const amount = calculateOrderFinancials(order).orderTotal;
  if (amount <= 0) return { eligible: false as const, message: "The order does not have a positive receipt amount." };
  return { eligible: true as const, account, amount, expectedUpdatedAt: order.updatedAt };
}

export function safeCustomerPaymentReceiptError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/already has an? (customer payment|active linked cash) receipt/i.test(message)) return "This order already has a customer payment receipt.";
  if (/changed after this page loaded/i.test(message)) return "The order changed after this page loaded. Refresh and review it again.";
  if (/only Delivered orders/i.test(message)) return "Only Delivered orders can record a customer payment receipt.";
  if (/payment status must be Paid/i.test(message)) return "Set payment status to Paid before recording the receipt.";
  if (/COD and unsupported payment methods/i.test(message)) return "COD orders must use the courier-settlement workflow.";
  if (/refund|financially adjusted/i.test(message)) return "Refunded or adjusted orders need a dedicated receipt correction workflow.";
  if (/snapshot is required/i.test(message)) return "The Delivered financial snapshot is missing. Resolve that data issue first.";
  if (/receipt date cannot/i.test(message)) return "Choose a receipt date from the order date through today.";
  if (/cash account is not active/i.test(message)) return "The matching cash account is unavailable in Settings.";
  if (/not authorized|Owner or admin/i.test(message)) return "Owner or admin access is required.";
  if (/request key was already used/i.test(message)) return "This submission key was already used with different receipt details. Close and try again.";
  return "The customer payment receipt was not recorded. Refresh the order and try again.";
}
