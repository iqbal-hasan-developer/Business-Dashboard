import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  provider: vi.fn(),
  user: vi.fn(),
  client: vi.fn(),
  edit: vi.fn(),
  remove: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("@/lib/supabase/env", () => ({ resolveBusinessDataProvider: mocks.provider }));
vi.mock("@/lib/auth/session", () => ({ requireDashboardUser: mocks.user }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.client }));
vi.mock("@/data/expense-writes", () => ({ editExpense: mocks.edit, deleteExpense: mocks.remove }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { deleteExpenseAction, editExpenseAction } from "@/actions/expenses";

const editValues = {
  expenseId: "00000000-0000-4000-8000-000000000071",
  expenseDate: "2026-08-13",
  categoryKey: "business_transportation",
  description: "Stock collection transport",
  amount: "250.00",
  paymentMethod: "Cash",
  campaignId: null,
  salesChannel: "",
  reference: "",
  reason: "Corrected category",
  expectedUpdatedAt: "2026-08-13T00:00:00.000Z",
} as const;

describe("expense actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.provider.mockReturnValue("supabase");
    mocks.user.mockResolvedValue({ id: "u1", role: "owner" });
    mocks.client.mockResolvedValue({ rpc: vi.fn() });
    mocks.edit.mockResolvedValue(editValues.expenseId);
    mocks.remove.mockResolvedValue(editValues.expenseId);
  });

  it("fails closed in mock mode", async () => {
    mocks.provider.mockReturnValue("mock");
    expect((await editExpenseAction(editValues)).ok).toBe(false);
    expect(mocks.edit).not.toHaveBeenCalled();
  });

  it("allows owner and admin edits through the authenticated client", async () => {
    const result = await editExpenseAction(editValues);
    expect(result.ok).toBe(true);
    expect(mocks.edit).toHaveBeenCalledWith(expect.anything(), editValues);
    expect(mocks.revalidate).toHaveBeenCalledWith("/expenses");
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard");
  });

  it("keeps delete owner-only", async () => {
    mocks.user.mockResolvedValue({ id: "u2", role: "admin" });
    const result = await deleteExpenseAction({ expenseId: editValues.expenseId, reason: "Duplicate entry", expectedUpdatedAt: editValues.expectedUpdatedAt });
    expect(result.ok).toBe(false);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("deletes through the audited owner RPC and returns safe stale errors", async () => {
    const values = { expenseId: editValues.expenseId, reason: "Duplicate entry", expectedUpdatedAt: editValues.expectedUpdatedAt };
    expect((await deleteExpenseAction(values)).ok).toBe(true);
    expect(mocks.remove).toHaveBeenCalledWith(expect.anything(), values);
    mocks.remove.mockRejectedValueOnce({ code: "40001", message: "private database detail" });
    expect((await deleteExpenseAction(values)).message).toContain("changed after you opened");
  });
});
