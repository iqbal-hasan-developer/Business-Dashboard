import { z } from "zod";
import { moneyToDatabaseNumber, parseMoney, sumMoney } from "@/domain/money";
import type { Money, SettlementEligibleOrder } from "@/domain/types";

const moneyInput = z.string().trim()
  .regex(/^\d+(\.\d{0,2})?$/, "Enter a non-negative amount with up to 2 decimals")
  .superRefine((value, context) => {
    try { parseMoney(value); } catch { context.addIssue({ code: "custom", message: "Enter a supported amount" }); }
  });
const sensitive = /(password|passcode|pin|otp|cvv|secret|full[ -]?account|account[ -]?number|routing[ -]?number)/i;

export const settlementEntrySchema = z.object({
  settlementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date"),
  receivingMethod: z.enum(["bkash", "bank_transfer"]),
  grossCodAmount: moneyInput,
  deductions: moneyInput,
  netReceived: moneyInput,
  courierReference: z.string().trim().max(160),
  receivingAccountLabel: z.string().trim().max(80),
  receivingAccountLast4: z.string().trim().regex(/^$|^\d{2,4}$/, "Enter only the masked final 2 to 4 digits"),
  transactionReference: z.string().trim().max(160),
  note: z.string().trim().max(500),
  selectedOrderIds: z.array(z.string().uuid()).min(1, "Select at least one eligible order").max(100, "A batch may contain at most 100 orders"),
  idempotencyKey: z.string().uuid(),
}).superRefine((value, context) => {
  if (parseMoney(value.netReceived) !== parseMoney(value.grossCodAmount) - parseMoney(value.deductions)) {
    context.addIssue({ code: "custom", path: ["netReceived"], message: "Net received must equal gross COD less deductions" });
  }
  if (parseMoney(value.netReceived) <= 0) {
    context.addIssue({ code: "custom", path: ["netReceived"], message: "Net received must be greater than zero" });
  }
  if (value.receivingMethod === "bkash" && value.receivingAccountLabel) {
    context.addIssue({ code: "custom", path: ["receivingAccountLabel"], message: "Account labels are only stored for bank transfers" });
  }
  if (sensitive.test(`${value.receivingAccountLabel} ${value.note}`)) {
    context.addIssue({ code: "custom", path: ["note"], message: "Do not enter credentials or full private account details" });
  }
});

export type SettlementEntryValues = z.infer<typeof settlementEntrySchema>;

export function calculateSettlementNet(gross: string, deductions: string): Money | null {
  try {
    const value = parseMoney(gross) - parseMoney(deductions);
    return value >= 0 ? value : null;
  } catch { return null; }
}

export function selectedReceivableTotal(orderIds: string[], eligibleOrders: SettlementEligibleOrder[]): Money {
  const selected = new Set(orderIds);
  return sumMoney(eligibleOrders.filter((order) => selected.has(order.orderId)).map((order) => order.grossCodReceivable));
}

export function settlementRpcArgs(values: SettlementEntryValues, eligibleOrders: SettlementEligibleOrder[]) {
  const byId = new Map(eligibleOrders.map((order) => [order.orderId, order]));
  const orders = values.selectedOrderIds.map((id) => byId.get(id));
  if (orders.some((order) => !order)) throw new Error("One or more selected orders are stale or unavailable.");
  const selectedTotal = selectedReceivableTotal(values.selectedOrderIds, eligibleOrders);
  if (selectedTotal !== parseMoney(values.grossCodAmount)) throw new Error("Selected orders do not reconcile to gross COD.");
  return {
    p_settlement_date: values.settlementDate,
    p_receiving_method: values.receivingMethod,
    p_gross_cod_amount: moneyToDatabaseNumber(parseMoney(values.grossCodAmount)),
    p_deductions: moneyToDatabaseNumber(parseMoney(values.deductions)),
    p_net_received: moneyToDatabaseNumber(parseMoney(values.netReceived)),
    p_orders: orders.map((order) => ({ order_id: order!.orderId, expected_updated_at: order!.expectedUpdatedAt })),
    p_idempotency_key: values.idempotencyKey,
    p_courier_reference: values.courierReference || null,
    p_receiving_account_label: values.receivingAccountLabel || null,
    p_receiving_account_last4: values.receivingAccountLast4 || null,
    p_receiving_transaction_reference: values.transactionReference || null,
    p_note: values.note || null,
  };
}

export function safeSettlementError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : "";
  if (/stale|ineligible|already settled|reconcile|duplicate|unique|request key/i.test(message)) return message;
  if (/credential|private account|masked/i.test(message)) return message;
  return "The settlement was not confirmed. Refresh the page and review the selected orders.";
}
