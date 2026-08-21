"use server";

import { revalidatePath } from "next/cache";
import { businessSettingsFormSchema } from "@/domain/settings";
import { updateBusinessFinancialDefaults } from "@/data/settings-writes";
import { requireDashboardUser } from "@/lib/auth/session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SettingsActionResult = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string[]>;
};

export async function updateBusinessSettingsAction(input: unknown): Promise<SettingsActionResult> {
  const parsed = businessSettingsFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Review the highlighted values and try again.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  if (resolveBusinessDataProvider() !== "supabase") {
    return { ok: false, message: "Persistent settings are unavailable in isolated mock mode." };
  }
  const user = await requireDashboardUser();
  if (user.role !== "owner") return { ok: false, message: "Owner access is required to change business defaults." };

  try {
    await updateBusinessFinancialDefaults(await createServerSupabaseClient(), parsed.data);
    for (const path of ["/settings", "/orders/new"]) revalidatePath(path);
    return { ok: true, message: "Business defaults updated. Existing order snapshots were not changed." };
  } catch {
    return { ok: false, message: "The settings could not be updated. No values were changed." };
  }
}
