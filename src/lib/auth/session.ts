import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import type { DashboardUser } from "@/lib/auth/profile";
import { getWorkspaceSession } from "@/lib/auth/workspace-session";

export type { DashboardUser } from "@/lib/auth/profile";

export const getDashboardUser = cache(async (): Promise<DashboardUser | null> => {
  if (resolveBusinessDataProvider() === "mock") {
    if (process.env.VERCEL) {
      const cookieStore = await cookies();
      if (cookieStore.get("demo_auth_session")?.value !== "active") return null;
      return { id: "demo-user", email: "demo@example.invalid", displayName: "Demo User", role: "owner" };
    }
    return { id: "mock-user", email: "developer@localhost", displayName: "Development user", role: "owner" };
  }

  return null;
});

export async function requireDashboardUser() {
  if (resolveBusinessDataProvider() === "supabase") {
    const session = await getWorkspaceSession();
    if (!session) redirect("/login");
    if (!session.activeWorkspace) redirect("/onboarding");
    redirect("/dashboard?notice=legacy-data-not-migrated");
  }
  const user = await getDashboardUser();
  if (!user) redirect("/login");
  return user;
}
