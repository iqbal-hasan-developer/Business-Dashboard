// @vitest-environment node

import { describe, expect, it } from "vitest";
import { validateDeploymentEnv } from "./verify-deployment-env.mjs";

const validProduction = {
  VERCEL_ENV: "production",
  BUSINESS_DATA_PROVIDER: "supabase",
  NEXT_PUBLIC_APP_URL: "https://dashboard.nexanotion.online",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
};

describe("deployment environment preflight", () => {
  it("accepts a complete production-safe contract", () => {
    expect(validateDeploymentEnv(validProduction)).toEqual({ errors: [], warnings: [] });
  });

  it("accepts standalone mock demo deployments when ENABLE_MOCK_DEMO is true", () => {
    const result = validateDeploymentEnv({
      VERCEL_ENV: "production",
      BUSINESS_DATA_PROVIDER: "mock",
      ENABLE_MOCK_DEMO: "true",
      NEXT_PUBLIC_APP_URL: "https://business-dashboard.vercel.app",
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([expect.stringMatching(/ENABLE_MOCK_DEMO is active/)]);
  });

  it("handles accidental surrounding quotes on URLs", () => {
    expect(validateDeploymentEnv({
      ...validProduction,
      NEXT_PUBLIC_APP_URL: '"https://dashboard.nexanotion.online"',
    })).toEqual({ errors: [], warnings: [] });
  });

  it("rejects missing production variables", () => {
    const result = validateDeploymentEnv({ VERCEL_ENV: "production" });
    expect(result.errors).toHaveLength(4);
  });

  it("rejects mock mode and test-only controls on Vercel", () => {
    const result = validateDeploymentEnv({
      ...validProduction,
      BUSINESS_DATA_PROVIDER: "mock",
      ENABLE_MOCK_EXPENSE_CONTROLS: "true",
      ENABLE_MOCK_MARKETING_CONTROLS: "true",
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/must be supabase/),
      expect.stringMatching(/ENABLE_MOCK_EXPENSE_CONTROLS/),
      expect.stringMatching(/ENABLE_MOCK_MARKETING_CONTROLS/),
    ]));
  });

  it("rejects insecure production origins and public service-role exposure", () => {
    const serviceRolePayload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
    const result = validateDeploymentEnv({
      ...validProduction,
      NEXT_PUBLIC_APP_URL: "http://dashboard.nexanotion.online",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `header.${serviceRolePayload}.signature`,
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/NEXT_PUBLIC_APP_URL must use HTTPS/),
      expect.stringMatching(/must not contain a Supabase secret or service-role key/),
    ]));
  });

  it("allows an unconfigured Preview deployment to build but remain fail-closed", () => {
    const result = validateDeploymentEnv({ VERCEL_ENV: "preview" });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([expect.stringMatching(/remain fail-closed/)]);
  });
});
