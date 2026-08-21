import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ provider: vi.fn(), user: vi.fn(), client: vi.fn(), reverse: vi.fn(), record: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ resolveBusinessDataProvider: mocks.provider }));
vi.mock("@/lib/auth/session", () => ({ requireDashboardUser: mocks.user }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.client }));
vi.mock("@/data/settlement-writes", () => ({ recordSteadfastSettlement: mocks.record, reverseSteadfastSettlement: mocks.reverse }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/auth/authorization", () => ({ can: vi.fn(() => true) }));

import { reverseSteadfastSettlementAction } from "@/actions/settlements";

const values = { settlementId: "82600000-0000-4000-8000-000000000001", reversedOn: "2026-08-08", reason: "Incorrect courier batch", idempotencyKey: "82500000-0000-4000-8000-000000000002" };

describe("settlement reversal action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.provider.mockReturnValue("supabase");
    mocks.user.mockResolvedValue({ id: "u1", role: "owner" });
    mocks.client.mockResolvedValue({ rpc: vi.fn() });
    mocks.reverse.mockResolvedValue("82600000-0000-4000-8000-000000000002");
  });

  it("fails closed outside connected mode", async () => {
    mocks.provider.mockReturnValue("mock");
    expect((await reverseSteadfastSettlementAction(values)).ok).toBe(false);
    expect(mocks.reverse).not.toHaveBeenCalled();
  });

  it("requires owner role", async () => {
    mocks.user.mockResolvedValue({ id: "u2", role: "admin" });
    expect((await reverseSteadfastSettlementAction(values)).ok).toBe(false);
    expect(mocks.reverse).not.toHaveBeenCalled();
  });

  it("appends reversal through the owner JWT client and revalidates affected modules", async () => {
    const result = await reverseSteadfastSettlementAction(values);
    expect(result.ok).toBe(true);
    expect(mocks.reverse).toHaveBeenCalledWith(expect.anything(), values);
    expect(mocks.revalidate).toHaveBeenCalledWith("/cash-settlements");
    expect(mocks.revalidate).toHaveBeenCalledWith("/orders");
  });
});
