"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ACTIVE_WORKSPACE_COOKIE, asUniversalClient, getAuthenticatedWorkspaceUser, getWorkspaceSession, requireWorkspaceSession, workspaceCanManageMembers } from "@/lib/auth/workspace-session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type WorkspaceActionState = { error?: string; message?: string; invitePath?: string };

const workspaceNameSchema = z.string().trim().min(1).max(120);
const uuidSchema = z.string().uuid();
const inviteSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(["admin", "manager", "staff", "viewer"]),
});

function safeCookieOptions() {
  return { path: "/", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const };
}

export async function createWorkspaceAction(formData: FormData) {
  const identity = await getAuthenticatedWorkspaceUser();
  if (!identity) redirect("/login");
  const parsedName = workspaceNameSchema.safeParse(formData.get("name"));
  if (!parsedName.success) redirect("/onboarding?error=workspace-name");

  const current = await getWorkspaceSession();
  if (!current) redirect("/login");
  if (current.workspaces.length) redirect("/dashboard");

  const supabase = asUniversalClient(await createServerSupabaseClient());
  const { data: workspaceId, error } = await supabase.rpc("create_workspace", { p_name: parsedName.data });
  if (error || !workspaceId) redirect("/onboarding?error=workspace-create");
  (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, workspaceId, safeCookieOptions());
  revalidatePath("/");
  redirect("/dashboard");
}

export async function switchWorkspaceAction(formData: FormData) {
  const session = await getWorkspaceSession();
  if (!session) redirect("/login");
  const requestedId = uuidSchema.safeParse(formData.get("workspaceId"));
  if (!requestedId.success) redirect("/dashboard?notice=workspace-not-authorized");

  const workspace = session.workspaces.find((candidate) => candidate.id === requestedId.data);
  if (!workspace) redirect("/dashboard?notice=workspace-not-authorized");
  (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, workspace.id, safeCookieOptions());
  revalidatePath("/");
  redirect("/dashboard");
}

export async function updateWorkspaceNameAction(formData: FormData) {
  const session = await requireWorkspaceSession();
  if (!workspaceCanManageMembers(session.activeWorkspace.role)) redirect("/workspace?notice=permission-denied");
  const parsedName = workspaceNameSchema.safeParse(formData.get("name"));
  if (!parsedName.success) redirect("/workspace?notice=invalid-name");

  const supabase = asUniversalClient(await createServerSupabaseClient());
  const { error } = await supabase.from("workspaces").update({ name: parsedName.data }).eq("id", session.activeWorkspace.id);
  if (error) redirect("/workspace?notice=workspace-update-failed");
  revalidatePath("/");
  redirect("/workspace?notice=workspace-updated");
}

export async function inviteWorkspaceMemberAction(_state: WorkspaceActionState, formData: FormData): Promise<WorkspaceActionState> {
  const session = await requireWorkspaceSession();
  if (!workspaceCanManageMembers(session.activeWorkspace.role)) return { error: "Only workspace owners or administrators can invite members." };
  if (process.env.NODE_ENV !== "development") return { error: "Invitation email delivery is not configured. Development links are disabled in this environment." };
  const parsed = inviteSchema.safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!parsed.success) return { error: "Enter a valid email address and role." };

  const supabase = asUniversalClient(await createServerSupabaseClient());
  const { data, error } = await supabase.rpc("invite_workspace_member", {
    p_workspace_id: session.activeWorkspace.id,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });
  const invitation = data?.[0];
  if (error || !invitation?.invitation_token) return { error: "The invitation could not be created. Check the address and try again." };
  revalidatePath("/workspace");
  return { message: "Invitation created. Share this link only with the intended email address.", invitePath: `/invitations/accept?token=${encodeURIComponent(invitation.invitation_token)}` };
}

export async function acceptWorkspaceInvitationAction(_state: WorkspaceActionState, formData: FormData): Promise<WorkspaceActionState> {
  const identity = await getAuthenticatedWorkspaceUser();
  if (!identity) return { error: "Sign in before accepting this invitation." };
  const token = z.string().min(60).max(100).safeParse(formData.get("token"));
  if (!token.success) return { error: "This invitation is invalid or has expired." };

  const supabase = asUniversalClient(await createServerSupabaseClient());
  const { data: workspaceId, error } = await supabase.rpc("accept_workspace_invitation", { p_token: token.data });
  if (error || !workspaceId) return { error: "This invitation is invalid, expired, revoked, or belongs to another email." };

  (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, workspaceId, safeCookieOptions());
  revalidatePath("/");
  redirect("/dashboard?notice=invitation-accepted");
}

async function manageMembershipRpc(
  rpc: "revoke_workspace_invitation" | "set_workspace_member_role" | "remove_workspace_member" | "transfer_workspace_ownership",
  formData: FormData,
) {
  const session = await requireWorkspaceSession();
  const supabase = asUniversalClient(await createServerSupabaseClient());
  const base = { p_workspace_id: session.activeWorkspace.id };
  let result;
  if (rpc === "revoke_workspace_invitation") {
    if (!workspaceCanManageMembers(session.activeWorkspace.role)) return { error: "Permission denied." };
    const id = uuidSchema.safeParse(formData.get("invitationId"));
    if (!id.success) return { error: "Invitation not found." };
    result = await supabase.rpc(rpc, { ...base, p_invitation_id: id.data });
  } else if (rpc === "transfer_workspace_ownership") {
    if (session.activeWorkspace.role !== "owner") return { error: "Only the current owner can transfer ownership." };
    const id = uuidSchema.safeParse(formData.get("userId"));
    if (!id.success) return { error: "Member not found." };
    result = await supabase.rpc(rpc, { ...base, p_new_owner_id: id.data });
  } else {
    if (!workspaceCanManageMembers(session.activeWorkspace.role)) return { error: "Permission denied." };
    const id = uuidSchema.safeParse(formData.get("userId"));
    if (!id.success) return { error: "Member not found." };
    if (rpc === "set_workspace_member_role") {
      const role = z.enum(["admin", "manager", "staff", "viewer"]).safeParse(formData.get("role"));
      if (!role.success) return { error: "Choose a valid role." };
      result = await supabase.rpc(rpc, { ...base, p_user_id: id.data, p_role: role.data });
    } else {
      result = await supabase.rpc(rpc, { ...base, p_user_id: id.data });
    }
  }
  if (result.error) return { error: "The membership change was denied or could not be completed." };
  revalidatePath("/workspace");
  return { message: "Workspace access updated." };
}

export async function revokeWorkspaceInvitationAction(formData: FormData) {
  const result = await manageMembershipRpc("revoke_workspace_invitation", formData);
  redirect(result.error ? "/workspace?notice=permission-denied" : "/workspace?notice=invitation-revoked");
}

export async function setWorkspaceMemberRoleAction(formData: FormData) {
  const result = await manageMembershipRpc("set_workspace_member_role", formData);
  redirect(result.error ? "/workspace?notice=permission-denied" : "/workspace?notice=member-role-updated");
}

export async function removeWorkspaceMemberAction(formData: FormData) {
  const result = await manageMembershipRpc("remove_workspace_member", formData);
  redirect(result.error ? "/workspace?notice=permission-denied" : "/workspace?notice=member-removed");
}

export async function transferWorkspaceOwnershipAction(formData: FormData) {
  const result = await manageMembershipRpc("transfer_workspace_ownership", formData);
  redirect(result.error ? "/workspace?notice=permission-denied" : "/workspace?notice=ownership-transferred");
}
