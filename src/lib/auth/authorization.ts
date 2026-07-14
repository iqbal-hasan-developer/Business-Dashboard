import type { DashboardUser } from "@/lib/auth/session";

export type DashboardPermission = "read" | "create" | "update" | "delete" | "manage_users" | "read_audit";

const permissions: Record<DashboardUser["role"], ReadonlySet<DashboardPermission>> = {
  owner: new Set(["read", "create", "update", "delete", "manage_users", "read_audit"]),
  admin: new Set(["read", "create", "update", "delete", "read_audit"]),
  data_entry: new Set(["read", "create", "update"]),
  viewer: new Set(["read"]),
};

export function can(role: DashboardUser["role"], permission: DashboardPermission) {
  return permissions[role].has(permission);
}
