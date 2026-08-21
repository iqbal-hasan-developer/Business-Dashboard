import { describe, expect, it } from "vitest";
import { calculateSettlementNet, ownerAllocationRemaining, ownerAllocationTotal, safeSettlementError, selectedReceivableTotal, settlementEntrySchema, settlementReversalSchema, settlementRpcArgs } from "@/domain/settlements";
import { parseMoney } from "@/domain/money";
import type { SettlementEligibleOrder } from "@/domain/types";

const order: SettlementEligibleOrder = {
  orderId: "82400000-0000-4000-8000-000000000001", orderNumber: "NN-1", orderDate: "2026-07-22",
  customerName: "Customer", expectedUpdatedAt: "2026-07-22T10:00:00+00:00", grossCodReceivable: parseMoney("580.25"),
};
const valid = {
  settlementDate: "2026-07-22", receiptTreatment: "business_account" as const, receivingMethod: "bkash" as const, ownerAllocations: [], grossCodAmount: "580.25", deductions: "30.25",
  netReceived: "550.00", courierReference: "ST-1", receivingAccountLabel: "", receivingAccountLast4: "1234",
  transactionReference: "TX-1", note: "July collection", selectedOrderIds: [order.orderId], idempotencyKey: "82500000-0000-4000-8000-000000000001",
};

describe("Steadfast settlement domain contract", () => {
  it("accepts exact bKash settlement values", () => expect(settlementEntrySchema.parse(valid)).toEqual(valid));
  it("accepts a bank-transfer snapshot", () => expect(settlementEntrySchema.safeParse({ ...valid, receivingMethod: "bank_transfer", receivingAccountLabel: "Business bank account" }).success).toBe(true));
  it("does not broaden bKash snapshots with an unrequested account label", () => expect(settlementEntrySchema.safeParse({ ...valid, receivingAccountLabel: "Business bKash" }).success).toBe(false));
  it("keeps a one-owner settlement supported", () => expect(settlementEntrySchema.safeParse({ ...valid, receiptTreatment: "owner_held_business_funds", receivingMethod: null, ownerAllocations: [{ ownerLabel: "Nasim", amount: "550.00" }], receivingAccountLast4: "" }).success).toBe(true));
  it("accepts a two-owner settlement whose allocations exactly equal net received", () => expect(settlementEntrySchema.safeParse({ ...valid, receiptTreatment: "owner_held_business_funds", receivingMethod: null, ownerAllocations: [{ ownerLabel: "Rifat", amount: "500" }, { ownerLabel: "Nasim", amount: "50" }], receivingAccountLast4: "" }).success).toBe(true));
  it("rejects owner-held receipts that also name a business cash destination", () => expect(settlementEntrySchema.safeParse({ ...valid, receiptTreatment: "owner_held_business_funds", ownerAllocations: [{ ownerLabel: "Nasim", amount: "550" }] }).success).toBe(false));
  it.each([["549.99", "under"], ["550.01", "over"]])("rejects %s allocated as %s-allocation", (amount) => expect(settlementEntrySchema.safeParse({ ...valid, receiptTreatment: "owner_held_business_funds", receivingMethod: null, receivingAccountLast4: "", ownerAllocations: [{ ownerLabel: "Nasim", amount }] }).success).toBe(false));
  it("rejects duplicate owners", () => expect(settlementEntrySchema.safeParse({ ...valid, receiptTreatment: "owner_held_business_funds", receivingMethod: null, receivingAccountLast4: "", ownerAllocations: [{ ownerLabel: "Rifat", amount: "500" }, { ownerLabel: "Rifat", amount: "50" }] }).success).toBe(false));
  it.each(["0", "-1"])('rejects an allocation amount of %s', (amount) => expect(settlementEntrySchema.safeParse({ ...valid, receiptTreatment: "owner_held_business_funds", receivingMethod: null, receivingAccountLast4: "", ownerAllocations: [{ ownerLabel: "Rifat", amount }] }).success).toBe(false));
  it("calculates net in integer poisha", () => expect(calculateSettlementNet("580.25", "30.25")).toBe(parseMoney("550")));
  it("rejects net values that do not equal gross less deductions", () => expect(settlementEntrySchema.safeParse({ ...valid, netReceived: "549.99" }).success).toBe(false));
  it("returns validation errors instead of throwing while money fields are incomplete", () => {
    const incomplete = { ...valid, grossCodAmount: "", netReceived: "" };
    expect(() => settlementEntrySchema.safeParse(incomplete)).not.toThrow();
    expect(settlementEntrySchema.safeParse(incomplete).success).toBe(false);
  });
  it("requires at least one eligible order", () => expect(settlementEntrySchema.safeParse({ ...valid, selectedOrderIds: [] }).success).toBe(false));
  it("rejects unmasked account identifiers", () => expect(settlementEntrySchema.safeParse({ ...valid, receivingAccountLast4: "01712345678" }).success).toBe(false));
  it("rejects credential-like private details", () => expect(settlementEntrySchema.safeParse({ ...valid, note: "OTP 123456" }).success).toBe(false));
  it("sums only selected receivables", () => expect(selectedReceivableTotal([order.orderId], [order, { ...order, orderId: "82400000-0000-4000-8000-000000000002" }])).toBe(order.grossCodReceivable));
  it("maps exact RPC decimals, destination treatment, and freshness evidence", () => expect(settlementRpcArgs(valid, [order])).toMatchObject({ p_receipt_treatment: "business_account", p_owner_allocations: [], p_gross_cod_amount: 580.25, p_deductions: 30.25, p_net_received: 550, p_orders: [{ order_id: order.orderId, expected_updated_at: order.expectedUpdatedAt }] }));
  it("maps the exact split-owner invoice fixture without floating-point drift", () => {
    const fixture = { ...valid, settlementDate: "2026-08-21", receiptTreatment: "owner_held_business_funds" as const, receivingMethod: null, receivingAccountLast4: "", grossCodAmount: "12940", deductions: "1877", netReceived: "11063", ownerAllocations: [{ ownerLabel: "Rifat", amount: "10000" }, { ownerLabel: "Nasim", amount: "1063" }] };
    const fixtureOrder = { ...order, grossCodReceivable: parseMoney("12940") };
    expect(settlementEntrySchema.safeParse(fixture).success).toBe(true);
    expect(settlementRpcArgs(fixture, [fixtureOrder]).p_owner_allocations).toEqual([{ owner_label: "Rifat", amount: 10000 }, { owner_label: "Nasim", amount: 1063 }]);
    expect(ownerAllocationTotal(fixture.ownerAllocations)).toBe(parseMoney("11063"));
    expect(ownerAllocationRemaining(parseMoney("11063"), fixture.ownerAllocations)).toBe(0);
  });
  it("rejects the 12,160 selection against 12,940 gross and accepts the added 780 order", () => {
    const amounts = [900,670,1050,1050,780,1200,1250,1050,1120,1120,1050,650,1050];
    const orders = amounts.map((amount, index) => ({ ...order, orderId: `82400000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, grossCodReceivable: parseMoney(String(amount)) }));
    const ids = orders.map((item) => item.orderId);
    expect(selectedReceivableTotal(ids.filter((_, index) => index !== 4), orders)).toBe(parseMoney("12160"));
    expect(selectedReceivableTotal(ids, orders)).toBe(parseMoney("12940"));
    expect(() => settlementRpcArgs({ ...valid, grossCodAmount: "12940", deductions: "1877", netReceived: "11063", selectedOrderIds: ids.filter((_, index) => index !== 4) }, orders)).toThrow(/reconcile/);
  });
  it("rejects stale client selections before calling the RPC", () => expect(() => settlementRpcArgs(valid, [])).toThrow(/stale/));
  it("preserves safe actionable conflict messages", () => expect(safeSettlementError(new Error("One order is already settled"))).toMatch(/already settled/));
  it("requires dated, reasoned, idempotent settlement reversal values", () => {
    expect(settlementReversalSchema.safeParse({ settlementId: "82600000-0000-4000-8000-000000000001", reversedOn: "2026-08-08", reason: "Incorrect courier batch", idempotencyKey: "82500000-0000-4000-8000-000000000002" }).success).toBe(true);
    expect(settlementReversalSchema.safeParse({ settlementId: "bad", reversedOn: "", reason: "", idempotencyKey: "bad" }).success).toBe(false);
  });
});
