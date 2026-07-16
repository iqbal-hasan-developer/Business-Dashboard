"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveDashboardUser } from "@/lib/auth/profile";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";

export type LoginState = { error?: string };

const loginSchema = z.object({
  email: z.email(),
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

  let destination = "/dashboard";
  try {
    if (resolveBusinessDataProvider() !== "supabase") {
      return { error: "Dashboard authentication is unavailable in mock mode." };
    }
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

    const next = parsed.data.next;
    destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  } catch {
    return { error: "Dashboard authentication is not configured." };
  }

  redirect(destination);
}

export async function signOut() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}
