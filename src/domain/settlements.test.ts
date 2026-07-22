import { describe, expect, it } from "vitest";
import { calculateSettlementNet, safeSettlementError, selectedReceivableTotal, settlementEntrySchema, settlementRpcArgs } from "@/domain/settlements";
import { parseMoney } from "@/domain/money";
import type { SettlementEligibleOrder } from "@/domain/types";

const order: SettlementEligibleOrder = {
  orderId: "82400000-0000-4000-8000-000000000001", orderNumber: "NN-1", orderDate: "2026-07-22",
  customerName: "Customer", expectedUpdatedAt: "2026-07-22T10:00:00+00:00", grossCodReceivable: parseMoney("580.25"),
};
const valid = {
  settlementDate: "2026-07-22", receivingMethod: "bkash" as const, grossCodAmount: "580.25", deductions: "30.25",
  netReceived: "550.00", courierReference: "ST-1", receivingAccountLabel: "", receivingAccountLast4: "1234",
  transactionReference: "TX-1", note: "July collection", selectedOrderIds: [order.orderId], idempotencyKey: "82500000-0000-4000-8000-000000000001",
};

describe("Steadfast settlement domain contract", () => {
  it("accepts exact bKash settlement values", () => expect(settlementEntrySchema.parse(valid)).toEqual(valid));
  it("accepts a bank-transfer snapshot", () => expect(settlementEntrySchema.safeParse({ ...valid, receivingMethod: "bank_transfer", receivingAccountLabel: "Business bank account" }).success).toBe(true));
  it("does not broaden bKash snapshots with an unrequested account label", () => expect(settlementEntrySchema.safeParse({ ...valid, receivingAccountLabel: "Business bKash" }).success).toBe(false));
  it("calculates net in integer poisha", () => expect(calculateSettlementNet("580.25", "30.25")).toBe(parseMoney("550")));
  it("rejects net values that do not equal gross less deductions", () => expect(settlementEntrySchema.safeParse({ ...valid, netReceived: "549.99" }).success).toBe(false));
  it("requires at least one eligible order", () => expect(settlementEntrySchema.safeParse({ ...valid, selectedOrderIds: [] }).success).toBe(false));
  it("rejects unmasked account identifiers", () => expect(settlementEntrySchema.safeParse({ ...valid, receivingAccountLast4: "01712345678" }).success).toBe(false));
  it("rejects credential-like private details", () => expect(settlementEntrySchema.safeParse({ ...valid, note: "OTP 123456" }).success).toBe(false));
  it("sums only selected receivables", () => expect(selectedReceivableTotal([order.orderId], [order, { ...order, orderId: "82400000-0000-4000-8000-000000000002" }])).toBe(order.grossCodReceivable));
  it("maps exact RPC decimals and freshness evidence", () => expect(settlementRpcArgs(valid, [order])).toMatchObject({ p_gross_cod_amount: 580.25, p_deductions: 30.25, p_net_received: 550, p_orders: [{ order_id: order.orderId, expected_updated_at: order.expectedUpdatedAt }] }));
  it("rejects stale client selections before calling the RPC", () => expect(() => settlementRpcArgs(valid, [])).toThrow(/stale/));
  it("preserves safe actionable conflict messages", () => expect(safeSettlementError(new Error("One order is already settled"))).toMatch(/already settled/));
});
