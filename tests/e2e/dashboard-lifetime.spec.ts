import { expect, test } from "@playwright/test";

test("dashboard defaults to lifetime and keeps the scope bookmarkable", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/dashboard");
  await expect(page).toHaveTitle(/NexaNotion Business/);
  await expect(page.getByRole("heading", { name: "Business overview" })).toBeVisible();
  await expect(page.getByRole("combobox").first()).toContainText("Lifetime");
  await expect(page.getByText("No prior-period data", { exact: true })).toBeVisible();

  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Last 14 days" }).click();
  await expect(page).toHaveURL(/range=14d/);
  await expect(page.getByRole("combobox").first()).toContainText("Last 14 days");

  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Lifetime" }).click();
  await expect(page).toHaveURL(/range=lifetime/);
  await expect(page.getByRole("combobox").first()).toContainText("Lifetime");
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("dashboard renders cancelled orders in red", async ({ page }) => {
  await page.goto("/dashboard");
  const statusPanel = page.getByRole("heading", { name: "Order status" }).locator("xpath=ancestor::section");
  const cancelledLegendItem = statusPanel.locator(".recharts-legend-item").filter({ hasText: "Cancelled" });

  await expect(cancelledLegendItem).toBeVisible();
  await expect(cancelledLegendItem.locator("path")).toHaveAttribute("fill", "#e15b5b");
  await expect(statusPanel.locator("path.recharts-sector").first()).toBeVisible();
});
