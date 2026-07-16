import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { assertSupabaseConnectionEnv } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = assertSupabaseConnectionEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies. The proxy refreshes them.
        }
      },
    },
  });
}
