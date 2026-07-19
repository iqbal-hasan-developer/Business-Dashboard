import { expect, test } from "@playwright/test";

test.skip(process.env.BUSINESS_DATA_PROVIDER !== "mock", "Manual-entry fail-closed checks require explicit isolated mock mode.");

test("manual order UI remains usable but cannot persist in mock mode", async ({ page }) => {
  await page.goto("/orders/new");
  await expect(page.getByText("Isolated mock mode", { exact: true })).toBeVisible();
  await page.getByLabel("Order number").fill("NNM-MOCK-UNSAVED");
  await page.getByLabel("Customer name").fill("Mock Customer");
  await page.getByLabel("Customer phone").fill("01700000000");
  await page.getByLabel("Customer address").fill("Mock-only address");
  await page.getByRole("button", { name: "Review order" }).click();
  await expect(page.getByRole("dialog")).toContainText("Mock mode cannot persist this order.");
  await expect(page.getByRole("button", { name: "Save order" })).toBeDisabled();
});

test("unsupported product and status writes stay disabled in mock mode", async ({ page }) => {
  await page.goto("/products");
  await expect(page.getByRole("button", { name: "Add product unavailable" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Edit costs" }).first()).toBeDisabled();
  await page.goto("/orders/o1");
  await expect(page.getByRole("button", { name: "Save statuses" })).toBeDisabled();
});
