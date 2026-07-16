export type DashboardUser = {
  id: string;
  email: string;
  displayName: string;
  role: "owner" | "admin" | "data_entry" | "viewer";
};

type AuthIdentity = { id: string; email?: string | null };

type DashboardProfile = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: DashboardUser["role"];
  is_active: boolean;
};

export function resolveDashboardUser(authUser: AuthIdentity | null, profile: DashboardProfile | null): DashboardUser | null {
  if (!authUser || !profile || !profile.is_active || profile.user_id !== authUser.id) return null;
  const email = profile.email ?? authUser.email ?? "";
  return {
    id: profile.user_id,
    email,
    displayName: profile.display_name ?? (email || "Dashboard user"),
    role: profile.role,
  };
}
