"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";
import { getPublicAppUrl, getPublicSupabaseEnv } from "@/lib/supabase/env";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createBrowserSupabaseClient() {
  if (browserClient) return browserClient;
  const publicEnv = {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
  getPublicAppUrl(publicEnv);
  const { url, publishableKey } = getPublicSupabaseEnv(publicEnv);
  browserClient = createBrowserClient<Database>(url, publishableKey);
  return browserClient;
}
