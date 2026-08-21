import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  provider: vi.fn(), requireUser: vi.fn(), createClient: vi.fn(), update: vi.fn(), revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/env", () => ({ resolveBusinessDataProvider: mocks.provider }));
vi.mock("@/lib/auth/session", () => ({ requireDashboardUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.createClient }));
vi.mock("@/data/settings-writes", () => ({ updateBusinessFinancialDefaults: mocks.update }));

import { updateBusinessSettingsAction } from "@/actions/settings";

const values = {
  defaultCourier: "Steadfast",
  insideDhakaCourierCost: "65",
  outsideDhakaCourierCost: "115",
  packagingCostPerOrder: "2",
  taxVatPercent: "0",
};

describe("settings action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.provider.mockReturnValue("supabase");
    mocks.requireUser.mockResolvedValue({ id: "owner", role: "owner" });
    mocks.createClient.mockResolvedValue({ rpc: vi.fn() });
  });

  it("fails closed in mock mode before authentication or database access", async () => {
    mocks.provider.mockReturnValue("mock");
    expect(await updateBusinessSettingsAction(values)).toEqual({ ok: false, message: "Persistent settings are unavailable in isolated mock mode." });
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("allows only owners", async () => {
    mocks.requireUser.mockResolvedValue({ id: "admin", role: "admin" });
    expect(await updateBusinessSettingsAction(values)).toEqual({ ok: false, message: "Owner access is required to change business defaults." });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("updates all defaults once and revalidates dependent pages", async () => {
    await expect(updateBusinessSettingsAction(values)).resolves.toEqual({ ok: true, message: "Business defaults updated. Existing order snapshots were not changed." });
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith(expect.anything(), values);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/orders/new");
  });

  it("returns field errors without calling the database", async () => {
    const result = await updateBusinessSettingsAction({ ...values, insideDhakaCourierCost: "-1" });
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.insideDhakaCourierCost).toBeDefined();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not leak database errors", async () => {
    mocks.update.mockRejectedValue(new Error("private database details"));
    expect(await updateBusinessSettingsAction(values)).toEqual({ ok: false, message: "The settings could not be updated. No values were changed." });
  });
});
