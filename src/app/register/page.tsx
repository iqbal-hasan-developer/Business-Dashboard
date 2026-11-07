import { BrandLogo } from "@/components/brand-logo";
import { RegisterForm } from "@/components/auth/register-form";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { redirect } from "next/navigation";

export const metadata = { robots: { index: false, follow: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (resolveBusinessDataProvider() !== "supabase") redirect("/login");
  const { next } = await searchParams;
  const nextPath = next?.startsWith("/") && !next.startsWith("//") ? next : "/onboarding";
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm sm:p-8">
        <BrandLogo className="w-48" />
        <h1 className="mt-3 text-2xl font-semibold text-slate-950">Create your account</h1>
        <p className="mt-2 text-sm text-muted-foreground">Then create a workspace or accept an invitation.</p>
        <RegisterForm nextPath={nextPath} />
      </section>
    </main>
  );
}
