import { defineConfig, devices } from "@playwright/test";

process.env.BUSINESS_DATA_PROVIDER = "mock";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["cash-workspace.spec.ts", "expenses-workspace.spec.ts", "marketing-workspace.spec.ts"],
  fullyParallel: false,
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
      BUSINESS_DATA_PROVIDER: "mock",
      ENABLE_MOCK_CASH_CONTROLS: "true",
      ENABLE_MOCK_EXPENSE_CONTROLS: "true",
      ENABLE_MOCK_MARKETING_CONTROLS: "true",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3101",
      NEXT_DIST_DIR: ".next-marketing",
    },
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
