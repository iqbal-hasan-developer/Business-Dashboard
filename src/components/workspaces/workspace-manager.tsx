"use client";

import { useActionState } from "react";
import { useState } from "react";
import { Copy, Shield, UserMinus } from "lucide-react";
import { inviteWorkspaceMemberAction, removeWorkspaceMemberAction, revokeWorkspaceInvitationAction, setWorkspaceMemberRoleAction, transferWorkspaceOwnershipAction, updateWorkspaceNameAction, type WorkspaceActionState } from "@/actions/workspaces";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PendingWorkspaceInvitation, WorkspaceMember } from "@/data/universal-workspace";
import type { WorkspaceSession } from "@/lib/auth/workspace-session";

const initialInviteState: WorkspaceActionState = {};

function InvitationForm() {
  const [state, action, pending] = useActionState(inviteWorkspaceMemberAction, initialInviteState);
  const [copied, setCopied] = useState(false);
  async function copyInvite() {
    if (!state.invitePath) return;
    await navigator.clipboard.writeText(`${window.location.origin}${state.invitePath}`);
    setCopied(true);
  }
  return <div className="space-y-3">
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
      <div className="space-y-2"><Label htmlFor="invite-email">Email address</Label><Input id="invite-email" name="email" type="email" autoComplete="email" maxLength={320} required /></div>
      <div className="space-y-2"><Label htmlFor="invite-role">Role</Label><select id="invite-role" name="role" defaultValue="staff" className="h-9 w-full rounded-md border bg-background px-3 text-sm"><option value="admin">Administrator</option><option value="manager">Manager</option><option value="staff">Staff</option><option value="viewer">Viewer</option></select></div>
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create invite"}</Button>
    </form>
    {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
    {state.invitePath ? <Alert><AlertDescription className="flex flex-col gap-2"><span>{state.message}</span><code className="break-all rounded bg-muted px-2 py-1 text-xs">{state.invitePath}</code><Button type="button" variant="outline" size="sm" onClick={copyInvite} className="w-fit"><Copy className="size-4" />{copied ? "Copied" : "Copy secure invite link"}</Button><span className="text-xs">The invited person must sign in with {" "}the address above. This link is shown once.</span></AlertDescription></Alert> : null}
  </div>;
}

function MemberRow({ member, session }: { member: WorkspaceMember; session: WorkspaceSession }) {
  const current = member.user_id === session.user.id;
  const canManage = session.activeWorkspace?.role === "owner" || session.activeWorkspace?.role === "admin";
  const canTransfer = session.activeWorkspace?.role === "owner" && !current && member.is_active;
  return <tr className="border-t">
    <td className="px-3 py-3"><div className="font-medium">{member.email ?? "Workspace member"}{current ? " (you)" : ""}</div><div className="max-w-56 truncate text-xs text-muted-foreground" title={member.user_id}>{member.user_id}</div></td>
    <td className="px-3 py-3"><span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs capitalize"><Shield className="size-3" />{member.role}</span></td>
    <td className="px-3 py-3 text-xs">{member.is_active ? "Active" : "Inactive"}</td>
    <td className="px-3 py-3"><div className="flex flex-wrap gap-2">
      {canManage && !current && member.role !== "owner" ? <form action={setWorkspaceMemberRoleAction} className="flex items-center gap-1"><input type="hidden" name="userId" value={member.user_id} /><select aria-label={`Role for ${member.email ?? member.user_id}`} name="role" defaultValue={member.role} className="h-8 rounded-md border bg-background px-2 text-xs"><option value="admin">Admin</option><option value="manager">Manager</option><option value="staff">Staff</option><option value="viewer">Viewer</option></select><Button size="sm" variant="outline" type="submit">Save</Button></form> : null}
      {canManage && !current && member.role !== "owner" ? <form action={removeWorkspaceMemberAction}><input type="hidden" name="userId" value={member.user_id} /><Button size="sm" variant="outline" type="submit" aria-label={`Remove ${member.email ?? "member"}`}><UserMinus className="size-4" />Remove</Button></form> : null}
      {canTransfer ? <form action={transferWorkspaceOwnershipAction}><input type="hidden" name="userId" value={member.user_id} /><Button size="sm" variant="outline" type="submit">Transfer ownership</Button></form> : null}
    </div></td>
  </tr>;
}

function PendingInviteRow({ invitation }: { invitation: PendingWorkspaceInvitation }) {
  return <tr className="border-t"><td className="px-3 py-3">{invitation.invited_email}</td><td className="px-3 py-3 capitalize">{invitation.role}</td><td className="px-3 py-3 text-xs">Expires {new Date(invitation.expires_at).toLocaleDateString()}</td><td className="px-3 py-3"><form action={revokeWorkspaceInvitationAction}><input type="hidden" name="invitationId" value={invitation.id} /><Button type="submit" size="sm" variant="outline">Revoke</Button></form></td></tr>;
}

export function WorkspaceManager({ session, members, invitations, notice }: { session: WorkspaceSession; members: WorkspaceMember[]; invitations: PendingWorkspaceInvitation[]; notice?: string }) {
  const role = session.activeWorkspace?.role;
  const canManage = role === "owner" || role === "admin";
  const notices: Record<string, string> = { "workspace-updated": "Workspace name updated.", "member-role-updated": "Member role updated.", "member-removed": "Member access removed.", "invitation-revoked": "Invitation revoked.", "ownership-transferred": "Workspace ownership transferred.", "permission-denied": "Your role cannot perform that workspace change.", "workspace-update-failed": "Workspace details could not be updated.", "invalid-name": "Enter a workspace name between 1 and 120 characters." };
  return <div className="space-y-6">
    {notice && notices[notice] ? <Alert variant={notice === "permission-denied" || notice === "workspace-update-failed" ? "destructive" : "default"}><AlertDescription>{notices[notice]}</AlertDescription></Alert> : null}
    <section className="panel space-y-4 p-4 sm:p-6">
      <div><h2 className="font-semibold">Workspace details</h2><p className="mt-1 text-sm text-muted-foreground">Workspace access is verified from your signed-in account on every request.</p></div>
      <form action={updateWorkspaceNameAction} className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="min-w-0 flex-1 space-y-2"><Label htmlFor="workspace-name">Name</Label><Input id="workspace-name" name="name" defaultValue={session.activeWorkspace?.name} maxLength={120} required disabled={!canManage} /></div>{canManage ? <Button type="submit">Save name</Button> : null}</form>
    </section>
    <section className="panel space-y-4 p-4 sm:p-6">
      <div><h2 className="font-semibold">Members</h2><p className="mt-1 text-sm text-muted-foreground">{members.length} workspace {members.length === 1 ? "member" : "members"}. Access changes take effect immediately.</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[42rem] text-left text-sm"><thead><tr className="text-xs text-muted-foreground"><th className="px-3 pb-2 font-medium">Account</th><th className="px-3 pb-2 font-medium">Role</th><th className="px-3 pb-2 font-medium">Status</th><th className="px-3 pb-2 font-medium">Actions</th></tr></thead><tbody>{members.map((member) => <MemberRow key={member.user_id} member={member} session={session} />)}</tbody></table></div>
    </section>
    {canManage ? <section className="panel space-y-4 p-4 sm:p-6"><div><h2 className="font-semibold">Invite a member</h2><p className="mt-1 text-sm text-muted-foreground">Invites expire after seven days and are bound to the selected email. In development, you can copy a one-time link.</p></div><InvitationForm /></section> : null}
    {canManage && invitations.length ? <section className="panel space-y-4 p-4 sm:p-6"><div><h2 className="font-semibold">Pending invitations</h2><p className="mt-1 text-sm text-muted-foreground">Only token hashes are stored; existing links cannot be recovered.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[36rem] text-left text-sm"><thead><tr className="text-xs text-muted-foreground"><th className="px-3 pb-2 font-medium">Email</th><th className="px-3 pb-2 font-medium">Role</th><th className="px-3 pb-2 font-medium">Expiry</th><th className="px-3 pb-2 font-medium">Action</th></tr></thead><tbody>{invitations.map((invitation) => <PendingInviteRow key={invitation.id} invitation={invitation} />)}</tbody></table></div></section> : null}
    {role === "owner" ? <p className="text-xs text-muted-foreground">An active owner must remain in every workspace. Ownership transfer is available to the current owner.</p> : null}
  </div>;
}
