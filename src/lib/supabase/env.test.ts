import { describe, expect, it } from "vitest";
import { getPublicSupabaseEnv, resolveBusinessDataProvider } from "@/lib/supabase/env";

describe("business data provider", () => {
  it("uses mock only outside production", () => {
    expect(resolveBusinessDataProvider({ NODE_ENV: "development" })).toBe("mock");
    expect(() => resolveBusinessDataProvider({ NODE_ENV: "production", BUSINESS_DATA_PROVIDER: "mock" })).toThrow(/disabled/);
  });

  it("fails closed when production Supabase variables are absent", () => {
    expect(resolveBusinessDataProvider({ NODE_ENV: "production" })).toBe("supabase");
    expect(() => getPublicSupabaseEnv({ NODE_ENV: "production" })).toThrow(/missing/);
  });

  it("accepts the documented Supabase public variables", () => {
    expect(getPublicSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable" }))
      .toEqual({ url: "https://example.supabase.co", publishableKey: "publishable" });
  });
});
