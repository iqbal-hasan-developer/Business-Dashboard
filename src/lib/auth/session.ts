import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveDashboardUser, type DashboardUser } from "@/lib/auth/profile";

export type { DashboardUser } from "@/lib/auth/profile";

export const getDashboardUser = cache(async (): Promise<DashboardUser | null> => {
  if (resolveBusinessDataProvider() === "mock") {
    if (process.env.VERCEL) {
      const cookieStore = await cookies();
      if (cookieStore.get("demo_auth_session")?.value !== "active") return null;
      return { id: "demo-user", email: "demo@nexanotion.online", displayName: "Demo User", role: "owner" };
    }
    return { id: "mock-user", email: "developer@localhost", displayName: "Development user", role: "owner" };
  }

  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("dashboard_user_profiles")
    .select("user_id,email,display_name,role,is_active")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (profileError) return null;
  return resolveDashboardUser(authData.user, profile);
});

export async function requireDashboardUser() {
  const user = await getDashboardUser();
  if (!user) redirect("/login");
  return user;
}
