import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "universal-workspaces.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  timeout: 240_000,
  expect: { timeout: 10_000 },
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3000", trace: "off", screenshot: "off", video: "off" },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
