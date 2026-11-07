import { redirect } from "next/navigation";
import { AcceptInvitationForm } from "@/components/workspaces/accept-invitation-form";
import { BrandLogo } from "@/components/brand-logo";
import { getAuthenticatedWorkspaceUser } from "@/lib/auth/workspace-session";

export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const [{ token }, user] = await Promise.all([searchParams, getAuthenticatedWorkspaceUser()]);
  if (!token || token.length < 60 || token.length > 100) redirect("/login?reason=invitation");
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invitations/accept?token=${token}`)}`);
  return <main className="grid min-h-screen place-items-center bg-slate-50 px-4"><section className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
    <BrandLogo className="w-48" /><h1 className="mt-4 text-2xl font-semibold">Join a workspace</h1>
    <p className="mt-2 text-sm text-muted-foreground">Signed in as {user.email || "your account"}. The invitation only works for its intended, confirmed email address.</p>
    <AcceptInvitationForm token={token} />
  </section></main>;
}
