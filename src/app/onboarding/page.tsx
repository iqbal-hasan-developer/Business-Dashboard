import { redirect } from "next/navigation";
import { createWorkspaceAction } from "@/actions/workspaces";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getWorkspaceSession } from "@/lib/auth/workspace-session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";

export const metadata = { robots: { index: false, follow: false } };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (resolveBusinessDataProvider() !== "supabase") redirect("/dashboard");
  const session = await getWorkspaceSession();
  if (!session) redirect("/login");
  if (session.workspaces.length) redirect("/dashboard");
  const { error } = await searchParams;
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-4"><section className="w-full max-w-lg rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
    <BrandLogo className="w-48" />
    <h1 className="mt-4 text-2xl font-semibold">Create your workspace</h1>
    <p className="mt-2 text-sm text-muted-foreground">Your account will become the workspace owner. You can invite teammates after setup.</p>
    {error ? <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error === "workspace-name" ? "Enter a workspace name between 1 and 120 characters." : "Workspace setup could not be completed. Please try again."}</p> : null}
    <form action={createWorkspaceAction} className="mt-5 space-y-3"><div className="space-y-2"><Label htmlFor="name">Workspace name</Label><Input id="name" name="name" autoComplete="organization" minLength={1} maxLength={120} required /></div><Button type="submit" className="w-full">Create workspace</Button></form>
  </section></main>;
}
