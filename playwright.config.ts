import { defineConfig, devices } from "@playwright/test";

process.env.BUSINESS_DATA_PROVIDER = "mock";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["authentication.spec.ts", "cash-workspace.spec.ts", "expenses-workspace.spec.ts", "marketing-workspace.spec.ts"],
  fullyParallel: true,
  workers: 4,
  reporter: "list",
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      BUSINESS_DATA_PROVIDER: "mock",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
      NEXT_DIST_DIR: ".next-playwright-mock",
    },
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
