"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveDashboardUser } from "@/lib/auth/profile";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";

export type LoginState = { error?: string };

const DEMO_EMAIL = "demo@nexanotion.online";
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

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error || !data.user) return { error: "Invalid email address or password." };

    const { data: profile, error: profileError } = await supabase
      .from("dashboard_user_profiles")
      .select("user_id,email,display_name,role,is_active")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (profileError || !resolveDashboardUser(data.user, profile)) {
      await supabase.auth.signOut();
      return { error: "This account is not authorized for the dashboard." };
    }
  } catch {
    return { error: "Dashboard authentication is not configured." };
  }

  redirect(destination);
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
