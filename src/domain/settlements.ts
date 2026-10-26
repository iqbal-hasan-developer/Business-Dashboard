import { z } from "zod";
import { moneyToDatabaseNumber, parseMoney, sumMoney } from "@/domain/money";
import type { Money, SettlementEligibleOrder, SettlementEligibleRejectedAdjustment } from "@/domain/types";

const moneyInput = z.string().trim()
  .regex(/^\d+(\.\d{0,2})?$/, "Enter a non-negative amount with up to 2 decimals")
  .superRefine((value, context) => {
    try { parseMoney(value); } catch { context.addIssue({ code: "custom", message: "Enter a supported amount" }); }
  });
const sensitive = /(password|passcode|pin|otp|cvv|secret|full[ -]?account|account[ -]?number|routing[ -]?number)/i;

function parseValidMoney(value: string): Money | null {
  try { return parseMoney(value); } catch { return null; }
}

export const settlementEntrySchema = z.object({
  settlementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date"),
  receiptTreatment: z.enum(["business_account", "owner_held_business_funds"]),
  receivingMethod: z.enum(["bkash", "bank_transfer"]).nullable(),
  ownerAllocations: z.array(z.object({
    ownerLabel: z.string().refine((owner) => ["Nasim", "Rifat", "Ikbal"].includes(owner), "Choose an owner"),
    amount: moneyInput,
  })).max(3, "A settlement may include at most three owners"),
  grossCodAmount: moneyInput,
  deductions: moneyInput,
  netReceived: moneyInput,
  courierReference: z.string().trim().max(160),
  receivingAccountLabel: z.string().trim().max(80),
  receivingAccountLast4: z.string().trim().regex(/^$|^\d{2,4}$/, "Enter only the masked final 2 to 4 digits"),
  transactionReference: z.string().trim().max(160),
  note: z.string().trim().max(500),
  selectedOrderIds: z.array(z.string().uuid()).max(100, "A batch may contain at most 100 items"),
  selectedAdjustmentIds: z.array(z.string().uuid()).max(100, "A batch may contain at most 100 items"),
  idempotencyKey: z.string().uuid(),
}).superRefine((value, context) => {
  if (value.selectedOrderIds.length + value.selectedAdjustmentIds.length < 1) {
    context.addIssue({ code: "custom", path: ["selectedOrderIds"], message: "Select at least one eligible order or rejected COD adjustment" });
  }
  if (value.selectedOrderIds.length + value.selectedAdjustmentIds.length > 100) {
    context.addIssue({ code: "custom", path: ["selectedOrderIds"], message: "A batch may contain at most 100 items" });
  }
  const grossCodAmount = parseValidMoney(value.grossCodAmount);
  const deductions = parseValidMoney(value.deductions);
  const netReceived = parseValidMoney(value.netReceived);
  if (grossCodAmount !== null && deductions !== null && netReceived !== null) {
    if (netReceived !== grossCodAmount - deductions) {
      context.addIssue({ code: "custom", path: ["netReceived"], message: "Net received must equal gross COD less deductions" });
    }
    if (netReceived <= 0) {
      context.addIssue({ code: "custom", path: ["netReceived"], message: "Net received must be greater than zero" });
    }
  }
  if (value.receiptTreatment === "business_account" && !value.receivingMethod) {
    context.addIssue({ code: "custom", path: ["receivingMethod"], message: "Choose the receiving business account" });
  }
  const owners = value.ownerAllocations.map((allocation) => allocation.ownerLabel);
  if (new Set(owners).size !== owners.length) context.addIssue({ code: "custom", path: ["ownerAllocations"], message: "Each owner may appear only once" });
  if (value.receiptTreatment === "owner_held_business_funds" && (value.receivingMethod || value.receivingAccountLabel || value.receivingAccountLast4)) {
    context.addIssue({ code: "custom", path: ["receiptTreatment"], message: "Owner-held receipts must not be posted to a business cash account" });
  }
  if (value.receiptTreatment === "business_account" && value.ownerAllocations.length) {
    context.addIssue({ code: "custom", path: ["ownerAllocations"], message: "Business-account receipts must not include owner allocations" });
  }
  if (value.receiptTreatment === "owner_held_business_funds") {
    if (!value.ownerAllocations.length) context.addIssue({ code: "custom", path: ["ownerAllocations"], message: "Add at least one owner allocation" });
    const amounts = value.ownerAllocations.map((allocation, index) => {
      const amount = parseValidMoney(allocation.amount);
      if (amount !== null && amount <= 0) context.addIssue({ code: "custom", path: ["ownerAllocations", index, "amount"], message: "Allocation must be greater than zero" });
      return amount;
    });
    if (netReceived !== null && amounts.every((amount): amount is Money => amount !== null)) {
      if (sumMoney(amounts) !== netReceived) context.addIssue({ code: "custom", path: ["ownerAllocations"], message: "Owner allocations must equal net received exactly" });
    }
  }
  if (value.receivingMethod === "bkash" && value.receivingAccountLabel) {
    context.addIssue({ code: "custom", path: ["receivingAccountLabel"], message: "Account labels are only stored for bank transfers" });
  }
  if (sensitive.test(`${value.receivingAccountLabel} ${value.note}`)) {
    context.addIssue({ code: "custom", path: ["note"], message: "Do not enter credentials or full private account details" });
  }
});

export type SettlementEntryValues = z.infer<typeof settlementEntrySchema>;

export const settlementReversalSchema = z.object({
  settlementId: z.uuid(),
  reversedOn: z.iso.date(),
  reason: z.string().trim().min(3, "Explain why the confirmed batch is being reversed").max(500),
  idempotencyKey: z.uuid(),
});

export type SettlementReversalValues = z.infer<typeof settlementReversalSchema>;

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

export function selectedRejectedRecoveryTotal(
  adjustmentIds: string[],
  eligibleAdjustments: SettlementEligibleRejectedAdjustment[],
): Money {
  const selected = new Set(adjustmentIds);
  return sumMoney(eligibleAdjustments.filter((item) => selected.has(item.adjustmentId)).map((item) => item.grossCodRecovery));
}

export function selectedRejectedCourierChargeTotal(
  adjustmentIds: string[],
  eligibleAdjustments: SettlementEligibleRejectedAdjustment[],
): Money {
  const selected = new Set(adjustmentIds);
  return sumMoney(eligibleAdjustments.filter((item) => selected.has(item.adjustmentId)).map((item) => item.courierCharge));
}

export function selectedSettlementGrossTotal(
  orderIds: string[],
  adjustmentIds: string[],
  eligibleOrders: SettlementEligibleOrder[],
  eligibleAdjustments: SettlementEligibleRejectedAdjustment[],
): Money {
  return sumMoney([
    selectedReceivableTotal(orderIds, eligibleOrders),
    selectedRejectedRecoveryTotal(adjustmentIds, eligibleAdjustments),
  ]);
}

export function ownerAllocationTotal(allocations: Array<{ amount: string }>): Money | null {
  const amounts = allocations.map((allocation) => parseValidMoney(allocation.amount));
  return amounts.every((amount): amount is Money => amount !== null) ? sumMoney(amounts) : null;
}

export function ownerAllocationRemaining(netReceived: Money | null, allocations: Array<{ amount: string }>): Money | null {
  const total = ownerAllocationTotal(allocations);
  return netReceived === null || total === null ? null : netReceived - total;
}

export function settlementRpcArgs(
  values: SettlementEntryValues,
  eligibleOrders: SettlementEligibleOrder[],
  eligibleAdjustments: SettlementEligibleRejectedAdjustment[],
) {
  const byId = new Map(eligibleOrders.map((order) => [order.orderId, order]));
  const orders = values.selectedOrderIds.map((id) => byId.get(id));
  if (orders.some((order) => !order)) throw new Error("One or more selected orders are stale or unavailable.");
  const adjustmentsById = new Map(eligibleAdjustments.map((adjustment) => [adjustment.adjustmentId, adjustment]));
  const adjustments = values.selectedAdjustmentIds.map((id) => adjustmentsById.get(id));
  if (adjustments.some((adjustment) => !adjustment)) throw new Error("One or more selected rejected COD adjustments are stale or unavailable.");
  const selectedTotal = selectedSettlementGrossTotal(values.selectedOrderIds, values.selectedAdjustmentIds, eligibleOrders, eligibleAdjustments);
  if (selectedTotal !== parseMoney(values.grossCodAmount)) throw new Error("Selected orders do not reconcile to gross COD.");
  const requiredRejectedCourierCharge = selectedRejectedCourierChargeTotal(values.selectedAdjustmentIds, eligibleAdjustments);
  if (parseMoney(values.deductions) < requiredRejectedCourierCharge) throw new Error("Batch deductions must include selected rejected-order courier charges.");
  return {
    p_settlement_date: values.settlementDate,
    p_receipt_treatment: values.receiptTreatment,
    p_receiving_method: values.receivingMethod,
    p_owner_allocations: values.receiptTreatment === "owner_held_business_funds"
      ? values.ownerAllocations.map((allocation) => ({ owner_label: allocation.ownerLabel, amount: moneyToDatabaseNumber(parseMoney(allocation.amount)) }))
      : [],
    p_gross_cod_amount: moneyToDatabaseNumber(parseMoney(values.grossCodAmount)),
    p_deductions: moneyToDatabaseNumber(parseMoney(values.deductions)),
    p_net_received: moneyToDatabaseNumber(parseMoney(values.netReceived)),
    p_orders: orders.map((order) => ({ order_id: order!.orderId, expected_updated_at: order!.expectedUpdatedAt })),
    p_rejected_adjustments: adjustments.map((adjustment) => ({ adjustment_id: adjustment!.adjustmentId, expected_created_at: adjustment!.expectedCreatedAt })),
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
  if (/already reversed|reversal evidence|cash receipt is missing/i.test(message)) return message;
  return "The settlement was not confirmed. Refresh the page and review the selected orders.";
}
