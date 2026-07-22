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

test("all manual-entry writes fail closed in explicit mock mode", async ({ page }) => {
  await page.goto("/products");
  await expect(page.getByRole("button", { name: "Add product" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Edit", exact: true }).first()).toBeDisabled();
  await page.goto("/expenses");
  await expect(page.getByRole("button", { name: "Record expense" })).toBeDisabled();
  await page.goto("/marketing");
  await expect(page.getByRole("button", { name: "New campaign" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Record ad spend" })).toBeDisabled();
  await page.goto("/orders/o1");
  await expect(page.getByRole("button", { name: "Save statuses" })).toBeDisabled();
});

test("eligible orders expose a prefilled edit form while recognized orders stay locked", async ({ page }) => {
  await page.goto("/orders/o2");
  await page.getByRole("link", { name: "Edit order" }).click();
  await expect(page).toHaveURL(/\/orders\/o2\/edit/);
  await expect(page.getByText("Isolated mock mode", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Order number")).toHaveValue("NNM-20260714-0002");
  await expect(page.getByLabel("Order number")).toBeDisabled();
  await expect(page.getByLabel("Customer name")).toHaveValue("Fahim Ahmed");
  await expect(page.getByText("Statuses stay separate", { exact: true })).toBeVisible();
  await page.getByLabel("Customer phone").fill("01700000000");
  await page.getByLabel("Customer address").fill("Mock-only address");
  await page.getByLabel("Quantity").fill("3");
  await expect(page.getByRole("button", { name: "Review changes" })).toBeEnabled();
  await page.getByRole("button", { name: "Review changes" }).click();
  await expect(page.getByRole("dialog")).toContainText("Operational statuses and recognized financial records remain unchanged.");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
  await page.getByRole("button", { name: "Keep editing" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/\/orders\/o2$/);

  await page.goto("/orders/o1");
  await expect(page.getByText("Ordinary editing is locked", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit order" })).toHaveCount(0);
  await page.goto("/orders/o1/edit");
  await expect(page.getByText("Order locked", { exact: true })).toBeVisible();
});
