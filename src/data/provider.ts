import "server-only";

import type { BusinessRepository } from "@/data/repository";
import { mockRepository } from "@/data/repository";
import { SupabaseBusinessRepository } from "@/data/supabase-repository";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getBusinessRepository(): Promise<BusinessRepository> {
  if (resolveBusinessDataProvider() === "mock") return mockRepository;
  return new SupabaseBusinessRepository(await createServerSupabaseClient());
}
