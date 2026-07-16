import { describe, expect, it } from "vitest";
import { resolveDashboardUser } from "@/lib/auth/profile";

const authUser = { id: "owner-id", email: "owner@example.test" };
const ownerProfile = {
  user_id: "owner-id",
  email: null,
  display_name: "Development owner",
  role: "owner" as const,
  is_active: true,
};

describe("dashboard profile resolution", () => {
  it("resolves the active owner without exposing credentials", () => {
    expect(resolveDashboardUser(authUser, ownerProfile)).toEqual({
      id: "owner-id",
      email: "owner@example.test",
      displayName: "Development owner",
      role: "owner",
    });
  });

  it("rejects missing, inactive, and mismatched profiles", () => {
    expect(resolveDashboardUser(authUser, null)).toBeNull();
    expect(resolveDashboardUser(authUser, { ...ownerProfile, is_active: false })).toBeNull();
    expect(resolveDashboardUser(authUser, { ...ownerProfile, user_id: "other-id" })).toBeNull();
  });
});
