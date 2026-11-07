"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { asUniversalClient } from "@/lib/auth/workspace-session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { getPublicAppUrl } from "@/lib/supabase/env";

export type LoginState = { error?: string };

const DEMO_EMAIL = "demo@example.invalid";
const DEMO_PASSWORD = "DemoUser2026!";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

export async function signIn(_state: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });
  if (!parsed.success) return { error: "Enter a valid email address and password." };

  const next = parsed.data.next;
  const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  if (resolveBusinessDataProvider() === "mock") {
    if (parsed.data.email.toLowerCase() === DEMO_EMAIL.toLowerCase() && parsed.data.password === DEMO_PASSWORD) {
      const cookieStore = await cookies();
      cookieStore.set("demo_auth_session", "active", {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      redirect(destination);
    }
    return { error: `Invalid demo credentials. Use ${DEMO_EMAIL} and ${DEMO_PASSWORD}.` };
  }

  let hasWorkspace = false;
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error || !data.user) return { error: "Invalid email address or password." };

    const universal = asUniversalClient(supabase);
    const { data: memberships, error: membershipError } = await universal
      .from("workspace_memberships")
      .select("workspace_id")
      .eq("user_id", data.user.id)
      .eq("is_active", true)
      .limit(1);
    if (membershipError) {
      await supabase.auth.signOut();
      return { error: "Workspace access could not be verified. Please try again." };
    }
    hasWorkspace = !!memberships?.length;
  } catch {
    return { error: "Dashboard authentication is not configured." };
  }

  if (!hasWorkspace && !destination.startsWith("/invitations/accept")) redirect("/onboarding");
  redirect(destination);
}

export type RegistrationState = { error?: string; message?: string };

const registrationSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(320),
  password: z.string().min(10).max(128),
  next: z.string().optional(),
});

function safeInternalPath(value?: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/onboarding";
}

export async function signUp(_state: RegistrationState, formData: FormData): Promise<RegistrationState> {
  if (resolveBusinessDataProvider() !== "supabase") {
    return { error: "Account registration is available when Supabase authentication is configured." };
  }
  const parsed = registrationSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });
  if (!parsed.success) return { error: "Enter your name, a valid email, and a password of at least 10 characters." };

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { display_name: parsed.data.displayName },
        emailRedirectTo: `${getPublicAppUrl()}/auth/callback?next=${encodeURIComponent(safeInternalPath(parsed.data.next))}`,
      },
    });
    if (error) return { error: "We could not create this account. Check the details and try again." };
    if (data.session) redirect(safeInternalPath(parsed.data.next));
    return { message: "Account created. Confirm your email, then sign in to create your workspace." };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return { error: "Account registration is not available right now." };
  }
}

export async function signOut() {
  if (resolveBusinessDataProvider() === "mock") {
    const cookieStore = await cookies();
    cookieStore.delete("demo_auth_session");
    redirect("/login");
  }

  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}
