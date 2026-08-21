import { PageHeading } from "@/components/page-heading";
import { SettingsForm } from "@/components/settings/settings-form";
import { getBusinessRepository } from "@/data/provider";
import { requireDashboardUser } from "@/lib/auth/session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";

export default async function SettingsPage() {
  const [repository, user] = await Promise.all([getBusinessRepository(), requireDashboardUser()]);
  const settings = await repository.getBusinessSettings();
  const enabled = resolveBusinessDataProvider() === "supabase" && user.role === "owner";
  return <><PageHeading title="Settings" description="Manage owner-approved defaults without rewriting historical order snapshots." /><SettingsForm settings={settings} enabled={enabled} /></>;
}
