import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { UniversalDatabase } from "@/lib/supabase/universal-database.types";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { resolveActiveWorkspace } from "@/domain/workspace-access";

export const ACTIVE_WORKSPACE_COOKIE = "active_workspace_id";
export type WorkspaceRole = "owner" | "admin" | "manager" | "staff" | "viewer";
export type WorkspaceSummary = { id: string; name: string; role: WorkspaceRole };
export type WorkspaceSession = {
  user: { id: string; email: string; displayName: string };
  workspaces: WorkspaceSummary[];
  activeWorkspace: WorkspaceSummary | null;
};

export function asUniversalClient(client: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  return client as unknown as SupabaseClient<UniversalDatabase>;
}

export async function getAuthenticatedWorkspaceUser() {
  if (resolveBusinessDataProvider() !== "supabase") return null;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const email = data.user.email ?? "";
  const displayName = typeof data.user.user_metadata?.display_name === "string"
    ? data.user.user_metadata.display_name
    : email || "Workspace user";
  return { id: data.user.id, email, displayName };
}

export const getWorkspaceSession = cache(async (): Promise<WorkspaceSession | null> => {
  const supabase = asUniversalClient(await createServerSupabaseClient());
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return null;

  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_memberships")
    .select("workspace_id,role")
    .eq("user_id", authData.user.id)
    .eq("is_active", true);
  if (membershipError) throw new Error("Workspace access could not be verified.");

  const roles = new Map((memberships ?? []).map((membership) => [membership.workspace_id, membership.role]));
  const workspaceIds = [...roles.keys()];
  const workspaces: WorkspaceSummary[] = [];
  if (workspaceIds.length) {
    const { data, error } = await supabase
      .from("workspaces")
      .select("id,name")
      .in("id", workspaceIds)
      .order("name");
    if (error) throw new Error("Workspace access could not be verified.");
    for (const workspace of data ?? []) {
      const role = roles.get(workspace.id);
      if (role) workspaces.push({ id: workspace.id, name: workspace.name, role });
    }
  }

  const cookieStore = await cookies();
  const requestedId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const activeWorkspace = resolveActiveWorkspace(workspaces, requestedId);
  const email = authData.user.email ?? "";
  const displayName = typeof authData.user.user_metadata?.display_name === "string"
    ? authData.user.user_metadata.display_name
    : email || "Workspace user";

  return {
    user: { id: authData.user.id, email, displayName },
    workspaces,
    activeWorkspace,
  };
});

export async function requireWorkspaceSession() {
  const session = await getWorkspaceSession();
  if (!session) redirect("/login");
  if (!session.activeWorkspace) redirect("/onboarding");
  return session as WorkspaceSession & { activeWorkspace: WorkspaceSummary };
}

export function workspaceCanManageMembers(role: WorkspaceRole) {
  return role === "owner" || role === "admin";
}
