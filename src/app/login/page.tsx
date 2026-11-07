import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { BrandLogo } from "@/components/brand-logo";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
        <BrandLogo className="w-48" />
        <h1 className="mt-3 text-2xl font-semibold text-slate-950">Sign in</h1>
        <p className="mt-2 text-sm text-muted-foreground">Continue to your workspace.</p>
        {reason === "configuration" ? <p role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">The private development connection is not configured on this machine.</p> : null}
        {reason === "confirmation" ? <p role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">The confirmation link could not be verified. Request a new link or sign in again.</p> : null}
        <Suspense fallback={<div className="mt-6 h-52 animate-pulse rounded-xl bg-muted" />}><LoginForm allowRegistration={resolveBusinessDataProvider() === "supabase"} /></Suspense>
      </section>
    </main>
  );
}
