import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

test.skip(process.env.BUSINESS_DATA_PROVIDER !== "mock", "Manual-entry fail-closed checks require explicit isolated mock mode.");

test("manual order UI remains usable but cannot persist in mock mode", async ({ page }) => {
  await page.goto("/orders/new");
  await expect(page.getByText("Isolated mock mode", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Courier cost snapshot (BDT)")).toHaveValue("65");
  await expect(page.getByLabel("Packaging cost snapshot (BDT)")).toHaveValue("8");
  await page.getByLabel("Customer location").click();
  await page.getByRole("option", { name: "Outside Dhaka" }).click();
  await expect(page.getByLabel("Courier cost snapshot (BDT)")).toHaveValue("135");
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

test("Paid non-COD orders expose the controlled customer receipt summary and fail closed in mock mode", async ({ page }, testInfo) => {
  const runtimeErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  await page.goto("/orders/o5");
  await expect(page.getByRole("heading", { name: "Customer payment receipt" })).toBeVisible();
  await expect(page.getByText("Records actual non-COD money received.")).toBeVisible();
  await expect(page.getByText("bKash", { exact: true }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Record payment receipt" })).toBeDisabled();
  await page.getByRole("heading", { name: "Customer payment receipt" }).locator("xpath=ancestor::section")
    .screenshot({ path: join(tmpdir(), `nexanotion-customer-payment-${testInfo.project.name}.png`) });
  expect(runtimeErrors).toEqual([]);
});

test("rejected partial-COD evidence stays provisional and separate from product accounting", async ({ page }, testInfo) => {
  const runtimeErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  await page.goto("/orders/o10");
  const rejectedEvidence = page.getByRole("alert").filter({ hasText: "Customer rejected" });
  await expect(rejectedEvidence).toContainText("Partial Delivered");
  await expect(rejectedEvidence.getByText("Collected by Steadfast", { exact: true }).locator("..")).toContainText("৳100");
  await expect(rejectedEvidence.getByText("Courier charge", { exact: true }).locator("..")).toContainText("৳115");
  await expect(rejectedEvidence.getByText("Expected net adjustment", { exact: true }).locator("..")).toContainText("-৳15");
  await expect(rejectedEvidence.getByText("Settlement", { exact: true }).locator("..")).toContainText("Awaiting confirmation");
  await expect(rejectedEvidence.getByText("Product revenue and COGS", { exact: true }).locator("..")).toContainText("৳0");
  await expect(page.getByText("Unpaid", { exact: true }).first()).toBeVisible();
  await rejectedEvidence.screenshot({ path: join(tmpdir(), `nexanotion-rejected-cod-${testInfo.project.name}.png`) });
  expect(runtimeErrors).toEqual([]);
});
