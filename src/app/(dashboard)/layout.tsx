import { AppShell } from "@/components/app-shell";
import { requireDashboardUser } from "@/lib/auth/session";
import { requireWorkspaceSession } from "@/lib/auth/workspace-session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import type { DashboardUser } from "@/lib/auth/profile";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (resolveBusinessDataProvider() === "mock") {
    const user = await requireDashboardUser();
    return <AppShell user={user}>{children}</AppShell>;
  }

  const session = await requireWorkspaceSession();
  const legacyRole: DashboardUser["role"] = session.activeWorkspace.role === "staff" ? "data_entry" : session.activeWorkspace.role === "viewer" ? "viewer" : session.activeWorkspace.role === "owner" ? "owner" : "admin";
  const user = { ...session.user, role: legacyRole };
  return <AppShell user={user} workspace={{ activeWorkspace: session.activeWorkspace, workspaces: session.workspaces }}>{children}</AppShell>;
}
