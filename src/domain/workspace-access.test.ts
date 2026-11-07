import { describe, expect, it } from "vitest";
import { resolveActiveWorkspace } from "@/domain/workspace-access";

const authorized = [{ id: "workspace-a", role: "owner" }, { id: "workspace-b", role: "viewer" }] as const;

describe("active workspace selection", () => {
  it("selects only an id already present in the server-verified membership list", () => {
    expect(resolveActiveWorkspace(authorized, "workspace-b")).toBe(authorized[1]);
    expect(resolveActiveWorkspace(authorized, "workspace-from-url")).toBe(authorized[0]);
  });

  it("returns no active workspace for users with no memberships", () => {
    expect(resolveActiveWorkspace([], "spoofed-workspace")).toBeNull();
  });
});
