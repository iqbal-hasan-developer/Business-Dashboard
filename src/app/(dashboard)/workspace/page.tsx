import { PageHeading } from "@/components/page-heading";
import { WorkspaceManager } from "@/components/workspaces/workspace-manager";
import { getCurrentWorkspaceManagementData } from "@/data/universal-workspace";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { redirect } from "next/navigation";

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  if (resolveBusinessDataProvider() !== "supabase") redirect("/settings");
  const [{ session, members, invitations }, { notice }] = await Promise.all([getCurrentWorkspaceManagementData(), searchParams]);
  return <div className="space-y-6"><PageHeading title="Workspace & members" description="Manage workspace details, access, roles, and invitations." /><WorkspaceManager session={session} members={members} invitations={invitations} notice={notice} /></div>;
}
