import { expect, test } from "@playwright/test";

test.describe("Steadfast settlement workspace", () => {
  test("shows the complete read-only mock workflow without exposing credential fields", async ({ page }) => {
    await page.goto("/cash-settlements");
    await expect(page.getByRole("heading", { name: "Cash settlements" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Record Steadfast settlement" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Courier", exact: true })).toHaveValue("Steadfast");
    await expect(page.getByText("Eligible Delivered COD orders")).toBeVisible();
    await expect(page.getByRole("button", { name: "Review and confirm" })).toBeDisabled();
    await expect(page.getByText("Persistent confirmation requires an owner or admin in connected Supabase mode.")).toBeVisible();
    await expect(page.getByLabel(/Masked final digits/)).toHaveAttribute("maxlength", "4");
    await expect(page.getByText("No confirmed batches yet.")).toBeVisible();
  });
});
