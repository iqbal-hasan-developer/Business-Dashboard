import { describe, expect, it } from "vitest";
import { can } from "@/lib/auth/authorization";

describe("dashboard authorization roles", () => {
  it("keeps viewers read-only", () => {
    expect(can("viewer", "read")).toBe(true);
    expect(can("viewer", "create")).toBe(false);
    expect(can("viewer", "update")).toBe(false);
    expect(can("viewer", "delete")).toBe(false);
  });

  it("allows data entry without destructive or user-management rights", () => {
    expect(can("data_entry", "create")).toBe(true);
    expect(can("data_entry", "update")).toBe(true);
    expect(can("data_entry", "delete")).toBe(false);
    expect(can("data_entry", "manage_users")).toBe(false);
  });

  it("reserves user management for owners", () => {
    expect(can("admin", "read_audit")).toBe(true);
    expect(can("admin", "manage_users")).toBe(false);
    expect(can("owner", "manage_users")).toBe(true);
  });
});
