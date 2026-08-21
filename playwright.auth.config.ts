import { defineConfig, devices } from "@playwright/test";

process.env.BUSINESS_DATA_PROVIDER = "supabase";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "authentication.spec.ts",
  fullyParallel: true,
  workers: 4,
  reporter: "list",
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:3101",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3101",
    url: "http://127.0.0.1:3101/login",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      BUSINESS_DATA_PROVIDER: "supabase",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3101",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      NEXT_DIST_DIR: ".next-playwright-auth",
    },
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
