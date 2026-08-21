import "server-only";

import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { businessSettingsRpcArgs, type BusinessSettingsFormValues } from "@/domain/settings";

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export async function updateBusinessFinancialDefaults(client: SupabaseClient, values: BusinessSettingsFormValues) {
  const { error } = await client.rpc("update_business_financial_defaults", businessSettingsRpcArgs(values));
  if (error) throw error;
}
