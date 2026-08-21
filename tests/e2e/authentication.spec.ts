import { expect, test } from "@playwright/test";

test.skip(process.env.BUSINESS_DATA_PROVIDER === "mock", "Authentication smoke tests require the fail-closed or Supabase provider.");

test.describe("fail-closed dashboard authentication", () => {
  test("protects direct private-route navigation without horizontal overflow", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?.*next=%2Fdashboard/);
    await expect(page.getByRole("img", { name: "NexaNotion" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Business Dashboard" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);
    expect(consoleErrors).toEqual([]);
  });

  test("returns a safe error for credentials that are not the development owner", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("not-the-owner@example.invalid");
    await page.getByLabel("Password").fill("not-a-real-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.locator('[data-slot="alert"]')).toContainText(/Invalid email address or password|Dashboard authentication is not configured/);
    await expect(page).toHaveURL(/\/login/);
  });

  for (const path of ["/products", "/orders", "/orders/new", "/marketing", "/expenses", "/cash-settlements", "/reports", "/data-checks", "/settings", "/exports/orders", "/exports/products", "/exports/financial-report"]) {
    test(`denies an anonymous request to ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?/);
    });
  }
});
