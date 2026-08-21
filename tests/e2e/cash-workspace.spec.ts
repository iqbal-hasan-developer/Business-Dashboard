import { expect, test } from "@playwright/test";

test.describe("cash workspace controls", () => {
  test("shows the complete lifetime owner money taken history", async ({ page }) => {
    await page.goto("/cash-settlements");

    const history = page.getByRole("region", { name: "Owner money taken history" });
    await expect(history).toBeVisible();
    await expect(history.getByRole("row")).toHaveCount(7);
    await expect(history.getByText("2026-07-21", { exact: true })).toBeVisible();
    await expect(history.getByText("2026-07-23", { exact: true })).toBeVisible();
    await expect(history.getByText("2026-07-26", { exact: true })).toBeVisible();
    await expect(history.getByText("Ref: SFC-30826633", { exact: true })).toBeVisible();
    await expect(history.getByText("Ref: SFC-30935216", { exact: true })).toBeVisible();
    await expect(history.getByText("Legacy classification", { exact: true })).toHaveCount(3);
    await expect(history.getByRole("button", { name: "Reverse", exact: true })).toHaveCount(3);
  });

  test("keeps the owner Select controlled when its empty value is replaced", async ({ page }) => {
    const selectControlErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("uncontrolled value state of Select")) {
        selectControlErrors.push(message.text());
      }
    });

    await page.goto("/cash-settlements");
    await page.getByRole("button", { name: "Record cash movement" }).click();

    const ownerSelect = page.getByLabel("Owner", { exact: true });
    await ownerSelect.click();
    await page.getByRole("option", { name: "Nasim", exact: true }).click();

    await expect(ownerSelect).toContainText("Nasim");
    expect(selectControlErrors).toEqual([]);
  });

  test("previews the atomic capital-return and Due-from-Owner split before posting", async ({ page }) => {
    await page.goto("/cash-settlements");
    await page.getByRole("button", { name: "Record money taken by owner" }).click();

    await page.getByLabel("Amount (BDT)", { exact: true }).fill("11000");
    await page.getByLabel("Description", { exact: true }).fill("Owner withdrawal classification check");
    await page.getByRole("button", { name: "Review split" }).click();

    const dialog = page.getByRole("dialog", { name: "Confirm money taken by owner" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Capital returned", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Increase in Due from Owner", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Cash-account effect", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Profit effect", { exact: true })).toBeVisible();
  });
});
