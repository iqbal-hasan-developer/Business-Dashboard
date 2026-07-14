export type BusinessDataProvider = "mock" | "supabase";

type RuntimeEnv = Record<string, string | undefined>;

export function resolveBusinessDataProvider(env: RuntimeEnv = process.env): BusinessDataProvider {
  const requested = env.BUSINESS_DATA_PROVIDER?.trim().toLowerCase();
  const production = env.NODE_ENV === "production";

  if (requested && requested !== "mock" && requested !== "supabase") {
    throw new Error("BUSINESS_DATA_PROVIDER must be either mock or supabase.");
  }
  if (requested === "mock" && production) {
    throw new Error("Mock business data is disabled in production.");
  }
  if (requested === "supabase" || production) return "supabase";
  return "mock";
}

export function getPublicSupabaseEnv(env: RuntimeEnv = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) {
    throw new Error("Required Supabase public environment variables are missing.");
  }
  return { url, publishableKey };
}
