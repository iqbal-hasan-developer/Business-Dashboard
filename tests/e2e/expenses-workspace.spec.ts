import { expect, test } from "@playwright/test";

test.skip(process.env.BUSINESS_DATA_PROVIDER !== "mock", "Expense UI checks require isolated mock mode.");

test("expenses separate procurement, advertising, and audited operating controls", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/expenses");
  await expect(page.getByRole("heading", { name: "Expenses", exact: true })).toBeVisible();
  await expect(page.getByText("From the Marketing spend ledger")).toBeVisible();
  await expect(page.getByText("৳125", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Expense audit history" })).toBeVisible();

  const temp = process.env.TEMP?.replaceAll("\\", "/") ?? "C:/Windows/Temp";
  await page.screenshot({ path: `${temp}/nexanotion-expenses-overview-${testInfo.project.name}.png`, fullPage: false });

  await page.getByRole("button", { name: "Record expense" }).click();
  await page.getByLabel("Category").click();
  await expect(page.getByRole("option", { name: "Inventory purchase" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Freight-in / supplier transportation" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Non-inventory business transportation" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Other expenses" })).toBeVisible();
  await page.screenshot({ path: `${temp}/nexanotion-expenses-categories-${testInfo.project.name}.png`, fullPage: false });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Edit Packing supplies" }).click();
  await expect(page.getByRole("heading", { name: "Edit expense" })).toBeVisible();
  await expect(page.getByLabel("Reason for change")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Delete Packing supplies" }).click();
  await page.getByLabel("Reason for deletion").fill("Duplicate expense entry");
  await page.getByRole("button", { name: "Delete and audit" }).click();
  await expect(page.getByText("Persistent expense changes are unavailable in mock mode.")).toBeVisible();

  expect(await page.locator("html").evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(false);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: `${temp}/nexanotion-expenses-workspace-${testInfo.project.name}.png`, fullPage: false });
});
