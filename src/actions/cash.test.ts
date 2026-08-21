import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  provider: vi.fn(),
  user: vi.fn(),
  client: vi.fn(),
  record: vi.fn(),
  reverse: vi.fn(),
  edit: vi.fn(),
  recordOwnerTaken: vi.fn(),
  reverseOwnerTaken: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("@/lib/supabase/env", () => ({ resolveBusinessDataProvider: mocks.provider }));
vi.mock("@/lib/auth/session", () => ({ requireDashboardUser: mocks.user }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.client }));
vi.mock("@/data/cash-writes", () => ({
  editOwnerCapitalMovement: mocks.edit,
  recordCashMovement: mocks.record,
  recordOwnerMoneyTaken: mocks.recordOwnerTaken,
  reverseCashMovement: mocks.reverse,
  reverseOwnerMoneyTaken: mocks.reverseOwnerTaken,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import {
  deleteOwnerCapitalMovementAction,
  editOwnerCapitalMovementAction,
  recordCashMovementAction,
  recordOwnerMoneyTakenAction,
  reverseCashMovementAction,
  reverseOwnerMoneyTakenAction,
} from "@/actions/cash";

const movement = {
  movementDate: "2026-08-08",
  transactionType: "owner_investment",
  accountKey: "cash",
  amount: "5000",
  description: "Opening owner investment",
  reference: "OPEN-1",
  ownerLabel: "Nasim",
  submissionKey: "00000000-0000-4000-8000-000000000001",
};

describe("cash actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.provider.mockReturnValue("supabase");
    mocks.user.mockResolvedValue({ id: "u1", role: "owner" });
    mocks.client.mockResolvedValue({ rpc: vi.fn() });
    mocks.record.mockResolvedValue("00000000-0000-4000-8000-000000000091");
    mocks.reverse.mockResolvedValue("00000000-0000-4000-8000-000000000092");
    mocks.edit.mockResolvedValue("00000000-0000-4000-8000-000000000093");
    mocks.recordOwnerTaken.mockResolvedValue("00000000-0000-4000-8000-000000000094");
    mocks.reverseOwnerTaken.mockResolvedValue("00000000-0000-4000-8000-000000000095");
  });

  it("fails closed in mock mode", async () => {
    mocks.provider.mockReturnValue("mock");
    expect((await recordCashMovementAction(movement)).ok).toBe(false);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("records with the owner JWT client and revalidates cash reporting", async () => {
    const result = await recordCashMovementAction(movement);
    expect(result.ok).toBe(true);
    expect(mocks.record).toHaveBeenCalledWith(expect.anything(), movement);
    expect(mocks.revalidate).toHaveBeenCalledWith("/cash-settlements");
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard");
  });

  it("requires owner role for append-only reversal", async () => {
    mocks.user.mockResolvedValue({ id: "u2", role: "admin" });
    const result = await reverseCashMovementAction({ movementId: movement.submissionKey, reason: "Wrong account", submissionKey: "00000000-0000-4000-8000-000000000002" });
    expect(result.ok).toBe(false);
    expect(mocks.reverse).not.toHaveBeenCalled();
  });

  it("appends an owner reversal and preserves safe errors", async () => {
    const values = { movementId: movement.submissionKey, reason: "Wrong account", submissionKey: "00000000-0000-4000-8000-000000000002" };
    expect((await reverseCashMovementAction(values)).ok).toBe(true);
    mocks.reverse.mockRejectedValueOnce(new Error("Cash movement was already reversed"));
    expect((await reverseCashMovementAction(values)).message).toContain("already reversed");
  });

  it("edits owner capital through the owner-only atomic correction", async () => {
    const values = { ...movement, movementId: movement.submissionKey, correctionReason: "Correct the amount" };
    const result = await editOwnerCapitalMovementAction(values);
    expect(result.ok).toBe(true);
    expect(mocks.edit).toHaveBeenCalledWith(expect.anything(), values);
    expect(mocks.reverse).not.toHaveBeenCalled();
  });

  it("requires owner role for owner-capital edit and delete", async () => {
    mocks.user.mockResolvedValue({ id: "u2", role: "admin" });
    const editResult = await editOwnerCapitalMovementAction({ ...movement, movementId: movement.submissionKey, correctionReason: "Correct the amount" });
    const deleteResult = await deleteOwnerCapitalMovementAction({ movementId: movement.submissionKey, reason: "Entered by mistake", submissionKey: "00000000-0000-4000-8000-000000000003" });
    expect(editResult.ok).toBe(false);
    expect(deleteResult.ok).toBe(false);
    expect(mocks.edit).not.toHaveBeenCalled();
    expect(mocks.reverse).not.toHaveBeenCalled();
  });

  it("deletes owner capital from active totals through an audited reversal", async () => {
    const values = { movementId: movement.submissionKey, reason: "Entered by mistake", submissionKey: "00000000-0000-4000-8000-000000000003" };
    const result = await deleteOwnerCapitalMovementAction(values);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("removed from active owner capital");
    expect(mocks.reverse).toHaveBeenCalledWith(expect.anything(), values);
  });

  it("records owner money taken with owner or admin access", async () => {
    const values = {
      eventDate: "2026-08-21",
      ownerLabel: "Rifat",
      amount: "10000",
      sourceAccountKey: "bkash",
      description: "Money taken by Rifat",
      reference: "OWNER-TAKEN-1",
      submissionKey: "00000000-0000-4000-8000-000000000004",
    };
    const result = await recordOwnerMoneyTakenAction(values);
    expect(result.ok).toBe(true);
    expect(mocks.recordOwnerTaken).toHaveBeenCalledWith(expect.anything(), values);
  });

  it("restricts owner-money-taken reversal to the owner role", async () => {
    const values = {
      ownerMoneyTakenId: "00000000-0000-4000-8000-000000000004",
      reversedOn: "2026-08-21",
      reason: "Correct the source account",
      submissionKey: "00000000-0000-4000-8000-000000000005",
    };
    mocks.user.mockResolvedValueOnce({ id: "u2", role: "admin" });
    expect((await reverseOwnerMoneyTakenAction(values)).ok).toBe(false);
    expect(mocks.reverseOwnerTaken).not.toHaveBeenCalled();
    mocks.user.mockResolvedValueOnce({ id: "u1", role: "owner" });
    expect((await reverseOwnerMoneyTakenAction(values)).ok).toBe(true);
    expect(mocks.reverseOwnerTaken).toHaveBeenCalledWith(expect.anything(), values);
  });
});
