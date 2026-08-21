import { describe, expect, it, vi } from "vitest";
import { editOwnerCapitalMovement, recordOwnerMoneyTaken, reverseOwnerMoneyTaken } from "@/data/cash-writes";

describe("cash RPC repository", () => {
  it("sends owner-capital edits through one atomic RPC with exact BDT conversion", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "00000000-0000-4000-8000-000000000091", error: null });
    const client = { rpc } as unknown as Parameters<typeof editOwnerCapitalMovement>[0];
    const values = {
      movementId: "00000000-0000-4000-8000-000000000001",
      movementDate: "2026-08-08",
      transactionType: "owner_investment" as const,
      accountKey: "bkash",
      amount: "1234.56",
      description: "Corrected owner investment",
      reference: "CAP-1",
      ownerLabel: "Nasim",
      correctionReason: "Correct amount and account",
      submissionKey: "00000000-0000-4000-8000-000000000002",
    };

    await expect(editOwnerCapitalMovement(client, values)).resolves.toBe("00000000-0000-4000-8000-000000000091");
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("edit_dashboard_owner_capital_movement", {
      p_original_id: values.movementId,
      p_movement_date: values.movementDate,
      p_transaction_type: values.transactionType,
      p_account_key: values.accountKey,
      p_amount: 1234.56,
      p_description: values.description,
      p_reference: values.reference,
      p_owner_label: values.ownerLabel,
      p_reason: values.correctionReason,
      p_idempotency_key: values.submissionKey,
    });
  });

  it("posts owner money taken through the atomic classification RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "00000000-0000-4000-8000-000000000092", error: null });
    const client = { rpc } as unknown as Parameters<typeof recordOwnerMoneyTaken>[0];
    const values = {
      eventDate: "2026-08-21",
      ownerLabel: "Rifat" as const,
      amount: "10000",
      sourceAccountKey: "bkash",
      description: "Money taken by Rifat",
      reference: "OWNER-TAKEN-1",
      submissionKey: "00000000-0000-4000-8000-000000000003",
    };

    await expect(recordOwnerMoneyTaken(client, values)).resolves.toBe("00000000-0000-4000-8000-000000000092");
    expect(rpc).toHaveBeenCalledWith("record_owner_money_taken", {
      p_event_date: values.eventDate,
      p_owner_label: values.ownerLabel,
      p_amount: 10000,
      p_source_account_key: values.sourceAccountKey,
      p_description: values.description,
      p_reference: values.reference,
      p_idempotency_key: values.submissionKey,
    });
  });

  it("reverses a unified owner-money-taken event through one RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "00000000-0000-4000-8000-000000000093", error: null });
    const client = { rpc } as unknown as Parameters<typeof reverseOwnerMoneyTaken>[0];
    const values = {
      ownerMoneyTakenId: "00000000-0000-4000-8000-000000000004",
      reversedOn: "2026-08-21",
      reason: "Correct the source account",
      submissionKey: "00000000-0000-4000-8000-000000000005",
    };

    await expect(reverseOwnerMoneyTaken(client, values)).resolves.toBe("00000000-0000-4000-8000-000000000093");
    expect(rpc).toHaveBeenCalledWith("reverse_owner_money_taken", {
      p_owner_money_taken_id: values.ownerMoneyTakenId,
      p_reversed_on: values.reversedOn,
      p_reason: values.reason,
      p_idempotency_key: values.submissionKey,
    });
  });
});
