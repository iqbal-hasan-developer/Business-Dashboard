"use client";

import { useActionState } from "react";
import Link from "next/link";
import { acceptWorkspaceInvitationAction, type WorkspaceActionState } from "@/actions/workspaces";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptWorkspaceInvitationAction, {} satisfies WorkspaceActionState);
  return <div className="mt-5 space-y-4">
    {state.error ? <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert> : null}
    <form action={action}><input type="hidden" name="token" value={token} /><Button className="w-full" disabled={pending}>{pending ? "Checking invitation…" : "Accept invitation"}</Button></form>
    <p className="text-center text-sm text-muted-foreground">Need an account? <Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/register?next=${encodeURIComponent(`/invitations/accept?token=${token}`)}`}>Create one with the invited email</Link></p>
  </div>;
}
