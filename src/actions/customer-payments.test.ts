import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ provider: vi.fn(), user: vi.fn(), client: vi.fn(), record: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ resolveBusinessDataProvider: mocks.provider }));
vi.mock("@/lib/auth/session", () => ({ requireDashboardUser: mocks.user }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.client }));
vi.mock("@/data/customer-payment-writes", () => ({ recordCustomerPaymentReceipt: mocks.record }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { recordCustomerPaymentReceiptAction } from "@/actions/customer-payments";

const values = {
  orderId: "00000000-0000-4000-8000-000000000001",
  expectedUpdatedAt: "2026-08-17T10:00:00+00:00",
  receivedOn: "2026-08-10",
  reference: "BKASH-TX-1",
  submissionKey: "00000000-0000-4000-8000-000000000002",
};

describe("customer payment receipt action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.provider.mockReturnValue("supabase");
    mocks.user.mockResolvedValue({ id: "u1", role: "owner" });
    mocks.client.mockResolvedValue({ rpc: vi.fn() });
    mocks.record.mockResolvedValue("00000000-0000-4000-8000-000000000091");
  });

  it("fails closed outside connected mode", async () => {
    mocks.provider.mockReturnValue("mock");
    expect((await recordCustomerPaymentReceiptAction(values)).ok).toBe(false);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("requires owner or admin inside the server action", async () => {
    mocks.user.mockResolvedValue({ id: "u2", role: "viewer" });
    expect((await recordCustomerPaymentReceiptAction(values)).ok).toBe(false);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("records with the authenticated server client and revalidates cash and order reporting", async () => {
    const result = await recordCustomerPaymentReceiptAction(values);
    expect(result.ok).toBe(true);
    expect(mocks.record).toHaveBeenCalledWith(expect.anything(), values);
    expect(mocks.revalidate).toHaveBeenCalledWith(`/orders/${values.orderId}`);
    expect(mocks.revalidate).toHaveBeenCalledWith("/cash-settlements");
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard");
  });

  it("returns a safe duplicate message", async () => {
    mocks.record.mockRejectedValueOnce(new Error("This order already has an active linked cash receipt."));
    expect((await recordCustomerPaymentReceiptAction(values)).message).toContain("already");
  });
});
