import { describe, expect, it, vi } from "vitest";
import { classifyHistoricalFunding, payUnpaidSource, recordAccountObservation, recordOwnerCapitalReturn, recordOwnerHeldObservation, recordOwnerHeldTransfer, recordSteadfastObservation, reverseOwnerCapitalReturn, reverseOwnerHeldTransfer, reverseSourceFunding } from "@/data/funding-writes";

const key = "00000000-0000-4000-8000-000000000091";
const sourceId = "00000000-0000-4000-8000-000000000092";

function clientWith(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as never;
}

describe("source funding repository writes", () => {
  it("maps historical evidence without float conversion or direct table writes", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "00000000-0000-4000-8000-000000000099", error: null });
    await classifyHistoricalFunding(clientWith(rpc), { sourceType: "expense", sourceId: "00000000-0000-4000-8000-000000000091", fundingTreatment: "already_represented", paymentDate: "2026-08-17", businessAccountKey: "cash", ownerLabel: "", existingCashMovementId: "00000000-0000-4000-8000-000000000092", notes: "Matched exact cash evidence", submissionKey: "00000000-0000-4000-8000-000000000093" });
    expect(rpc).toHaveBeenCalledWith("classify_historical_financial_source", expect.objectContaining({ p_funding_treatment: "already_represented", p_existing_cash_movement_id: "00000000-0000-4000-8000-000000000092" }));
  });

  it("maps unpaid payment, reversal, and actual balance RPCs", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "00000000-0000-4000-8000-000000000099", error: null });
    const client = clientWith(rpc);
    await payUnpaidSource(client, { sourceType: "expense", sourceId: "00000000-0000-4000-8000-000000000091", fundingTreatment: "business_account_paid", paymentDate: "2026-08-17", businessAccountKey: "bkash", ownerLabel: "", reason: "Paid from statement evidence", submissionKey: "00000000-0000-4000-8000-000000000092" });
    await reverseSourceFunding(client, { fundingId: "00000000-0000-4000-8000-000000000091", reversedOn: "2026-08-17", reason: "Incorrect source payment", submissionKey: "00000000-0000-4000-8000-000000000093" });
    await recordAccountObservation(client, { accountKey: "cash", observedOn: "2026-08-17", actualBalance: "49849.70", reason: "Verified physical and statement balance", submissionKey: "00000000-0000-4000-8000-000000000094" });
    expect(rpc).toHaveBeenNthCalledWith(1, "pay_unpaid_financial_source", expect.objectContaining({ p_business_account_key: "bkash" }));
    expect(rpc).toHaveBeenNthCalledWith(2, "reverse_financial_source_funding", expect.objectContaining({ p_funding_id: "00000000-0000-4000-8000-000000000091" }));
    expect(rpc).toHaveBeenNthCalledWith(3, "record_cash_account_balance_observation", expect.objectContaining({ p_actual_balance: 49849.7 }));
  });

  it("maps owner-held, capital-return, reversal, and control RPCs with exact money", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "00000000-0000-4000-8000-000000000099", error: null });
    const client = clientWith(rpc);
    await recordOwnerHeldTransfer(client, { transferDate: "2026-08-17", ownerLabel: "Nasim", businessAccountKey: "cash", amount: "22334.00", reason: "Confirmed business funds held", submissionKey: key });
    await recordOwnerCapitalReturn(client, { returnDate: "2026-08-17", ownerLabel: "Nasim", amount: "15120.00", reason: "Confirmed capital return", submissionKey: key });
    await reverseOwnerCapitalReturn(client, { capitalReturnId: sourceId, reversedOn: "2026-08-18", reason: "Rollback evidence", submissionKey: key });
    await reverseOwnerHeldTransfer(client, { ownerHeldEventId: sourceId, reversedOn: "2026-08-18", reason: "Rollback transfer", submissionKey: key });
    await recordOwnerHeldObservation(client, { ownerLabel: "Nasim", observedOn: "2026-08-17", actualDue: "7214.00", reason: "Confirmed control", submissionKey: key });
    await recordSteadfastObservation(client, { observedOn: "2026-08-17", actualReceivable: "4623.00", reason: "Confirmed control", submissionKey: key });
    expect(rpc).toHaveBeenNthCalledWith(1, "record_owner_held_fund_transfer", expect.objectContaining({ p_amount: 22334 }));
    expect(rpc).toHaveBeenNthCalledWith(2, "record_owner_capital_return_from_held", expect.objectContaining({ p_amount: 15120 }));
    expect(rpc).toHaveBeenNthCalledWith(3, "reverse_owner_capital_return_from_held", expect.objectContaining({ p_capital_return_id: sourceId }));
    expect(rpc).toHaveBeenNthCalledWith(4, "reverse_owner_held_fund_transfer", expect.objectContaining({ p_owner_held_event_id: sourceId }));
    expect(rpc).toHaveBeenNthCalledWith(5, "record_owner_held_balance_observation", expect.objectContaining({ p_actual_due: 7214 }));
    expect(rpc).toHaveBeenNthCalledWith(6, "record_steadfast_receivable_observation", expect.objectContaining({ p_actual_receivable: 4623 }));
  });
});
