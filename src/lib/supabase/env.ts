export type BusinessDataProvider = "mock" | "supabase";

type RuntimeEnv = Record<string, string | undefined>;

export function resolveBusinessDataProvider(env: RuntimeEnv = process.env): BusinessDataProvider {
  const requested = env.BUSINESS_DATA_PROVIDER?.trim().toLowerCase();
  const production = env.NODE_ENV === "production";

  if (!requested) {
    throw new Error("BUSINESS_DATA_PROVIDER is required.");
  }
  if (requested !== "mock" && requested !== "supabase") {
    throw new Error("BUSINESS_DATA_PROVIDER must be either mock or supabase.");
  }
  if (requested === "mock" && production) {
    throw new Error("Mock business data is disabled in production.");
  }
  return requested;
}

export function getPublicSupabaseEnv(env: RuntimeEnv = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) {
    throw new Error("Required Supabase public environment variables are missing.");
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
  }
  const localTestHost = ["localhost", "127.0.0.1"].includes(parsedUrl.hostname);
  const permittedProtocol = parsedUrl.protocol === "https:" || (parsedUrl.protocol === "http:" && localTestHost);
  if (!permittedProtocol || parsedUrl.username || parsedUrl.password) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not a permitted public endpoint.");
  }
  return { url: parsedUrl.toString().replace(/\/$/, ""), publishableKey };
}

export function getPublicAppUrl(env: RuntimeEnv = process.env) {
  const value = env.NEXT_PUBLIC_APP_URL?.trim();
  if (!value) throw new Error("NEXT_PUBLIC_APP_URL is required.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL must be a valid URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("NEXT_PUBLIC_APP_URL is not a permitted application URL.");
  }
  return url.toString().replace(/\/$/, "");
}

export function assertSupabaseConnectionEnv(env: RuntimeEnv = process.env) {
  if (resolveBusinessDataProvider(env) !== "supabase") {
    throw new Error("The Supabase connection is not enabled.");
  }
  return { ...getPublicSupabaseEnv(env), appUrl: getPublicAppUrl(env) };
}
