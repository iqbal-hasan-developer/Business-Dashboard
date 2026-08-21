import { expect, test } from "@playwright/test";

test.skip(process.env.BUSINESS_DATA_PROVIDER !== "mock", "Export UI checks require explicit isolated mock mode.");

for (const { path, filename } of [
  { path: "/orders", filename: /^nexanotion-orders-\d{4}-\d{2}-\d{2}\.csv$/ },
  { path: "/products", filename: /^nexanotion-products-\d{4}-\d{2}-\d{2}\.csv$/ },
  { path: "/reports", filename: /^nexanotion-financial-report-\d{4}-\d{2}-\d{2}\.csv$/ },
]) {
  test(`${path} downloads an owner-authorized CSV export`, async ({ page }) => {
    await page.goto(path);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(filename);
  });
}
