import { describe, expect, it } from "vitest";
import { assertSupabaseConnectionEnv, getPublicAppUrl, getPublicSupabaseEnv, resolveBusinessDataProvider } from "@/lib/supabase/env";

describe("business data provider", () => {
  it("allows mock only when explicitly selected outside production", () => {
    expect(resolveBusinessDataProvider({ NODE_ENV: "development", BUSINESS_DATA_PROVIDER: "mock" })).toBe("mock");
    expect(() => resolveBusinessDataProvider({ NODE_ENV: "development" })).toThrow(/required/);
    expect(() => resolveBusinessDataProvider({ NODE_ENV: "production", BUSINESS_DATA_PROVIDER: "mock" })).toThrow(/disabled/);
  });

  it("fails closed when the Supabase connection contract is incomplete", () => {
    expect(() => assertSupabaseConnectionEnv({ NODE_ENV: "production" })).toThrow(/BUSINESS_DATA_PROVIDER/);
    expect(() => assertSupabaseConnectionEnv({ NODE_ENV: "development", BUSINESS_DATA_PROVIDER: "supabase" })).toThrow(/missing/);
  });

  it("accepts the documented Supabase public variables", () => {
    expect(getPublicSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable" }))
      .toEqual({ url: "https://example.supabase.co", publishableKey: "publishable" });
    expect(getPublicAppUrl({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" })).toBe("http://localhost:3000");
  });

  it("rejects malformed or credential-bearing public URLs", () => {
    expect(() => getPublicSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: "not-a-url", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable" })).toThrow(/valid URL/);
    expect(() => getPublicSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://example.com", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable" })).toThrow(/permitted/);
    expect(() => getPublicAppUrl({ NEXT_PUBLIC_APP_URL: "https://user:password@example.com" })).toThrow(/permitted/);
  });
});
