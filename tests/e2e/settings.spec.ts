import { expect, test } from "@playwright/test";

test.skip(process.env.BUSINESS_DATA_PROVIDER !== "mock", "Settings default checks require explicit isolated mock mode.");

test("owner-approved business defaults are visible and fail closed in mock mode", async ({ page }) => {
  await page.goto("/settings");

  await expect(page.getByLabel("Currency")).toHaveValue("BDT");
  await expect(page.getByLabel("Timezone")).toHaveValue("Asia/Dhaka");
  await expect(page.getByLabel("Default courier")).toHaveValue("Steadfast");
  await expect(page.getByLabel("Inside Dhaka courier cost (BDT)")).toHaveValue("65");
  await expect(page.getByLabel("Outside Dhaka courier cost (BDT)")).toHaveValue("115");
  await expect(page.getByLabel("Packaging cost (BDT)")).toHaveValue("2");
  await expect(page.getByLabel("Tax / VAT default (%)")).toHaveValue("0");

  for (const label of ["Cash", "bKash", "Nagad", "Bank", "Steadfast"]) {
    await expect(page.getByText(label, { exact: true }).last()).toBeVisible();
  }

  await expect(page.getByRole("button", { name: "Review changes" })).toBeDisabled();
});
