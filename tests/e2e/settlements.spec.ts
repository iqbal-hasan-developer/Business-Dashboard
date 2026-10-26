import { expect, test } from "@playwright/test";

test.describe("Steadfast settlement workspace", () => {
  test("selecting an eligible order does not crash while settlement amounts are incomplete", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/cash-settlements");
    const order = page.getByRole("checkbox", { name: /^Select / }).first();
    await order.check();

    await expect(order).toBeChecked();
    await expect(page.getByText("Runtime Error", { exact: true })).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("builds a responsive two-owner allocation and reconciles exact remaining amount", async ({ page }) => {
    await page.goto("/cash-settlements");
    await page.getByRole("checkbox", { name: /^Select / }).first().check();
    const gross = await page.getByLabel("Gross COD").inputValue();

    await page.getByLabel("Settlement receipt destination").click();
    await page.getByRole("option", { name: "Business funds held by owners" }).click();
    await page.getByLabel("Allocation 1 owner").click();
    await page.getByRole("option", { name: "Rifat" }).click();
    await page.getByLabel("Allocation 1 amount").fill((Number(gross) - 1).toFixed(2));
    await page.getByRole("button", { name: "Add owner" }).click();
    await page.getByLabel("Allocation 2 owner").click();
    await page.getByRole("option", { name: "Nasim" }).click();
    await page.getByLabel("Allocation 2 amount").fill("1.00");

    await expect(page.getByText("Remaining to allocate").locator("..")).toContainText(/Remaining to allocate\s*৳0/);
    await expect(page.getByRole("button", { name: "Remove allocation 1" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Remove allocation 2" })).toBeEnabled();
    let warning = "";
    page.once("dialog", async (dialog) => { warning = dialog.message(); await dialog.dismiss(); });
    await page.getByRole("link", { name: "Dashboard", exact: true }).evaluate((link: HTMLAnchorElement) => link.click());
    expect(warning).toContain("unconfirmed settlement allocations");
    await expect(page).toHaveURL(/cash-settlements/);
  });

  test("shows the complete read-only mock workflow without exposing credential fields", async ({ page }) => {
    await page.goto("/cash-settlements");
    await expect(page.getByRole("heading", { name: "Cash & settlements" })).toBeVisible();
    const capitalPanel = page.getByRole("region", { name: "Capital, Spending & Available Funds" });
    await expect(page.getByText("Ledger business cash", { exact: true })).toBeVisible();
    await capitalPanel.getByText("View capital and spending audit detail", { exact: true }).click();
    const auditMetrics = capitalPanel.getByTestId("capital-audit-metrics");
    await expect(auditMetrics.getByText("Total historical investment", { exact: true })).toBeVisible();
    await expect(auditMetrics.getByText("Total capital returned", { exact: true })).toBeVisible();
    await expect(auditMetrics.getByText("Current contributed capital", { exact: true })).toBeVisible();
    await expect(auditMetrics.getByText("Confirmed source-paid spending", { exact: true })).toBeVisible();
    await expect(auditMetrics.getByText("Verified courier deductions", { exact: true })).toBeVisible();
    await expect(auditMetrics.getByText("Overall business cash spending", { exact: true })).toBeVisible();
    await expect(auditMetrics.getByText("Total available / receivable funds", { exact: true })).toBeVisible();
    await expect(auditMetrics.getByText("Unresolved reconciliation difference", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Owner investment, capital returns, and Due" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Business spending by source category" })).toBeVisible();
    await page.getByRole("heading", { name: "View Steadfast order composition" }).click();
    await expect(page.getByText("Current calculated receivable", { exact: true })).toBeVisible();
    await expect(page.getByText("Post-observation receivable", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Return owner capital" })).toBeDisabled();
    await expect(page.getByRole("heading", { name: "Account reconciliation" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Record actual" }).first()).toBeDisabled();
    await expect(page.getByRole("heading", { name: "Historical cash reconciliation" })).toBeVisible();
    await expect(page.getByText("No unresolved historical funding")).toBeVisible();
    await page.getByRole("heading", { name: "View active source funding" }).click();
    await expect(page.getByRole("heading", { name: "Cash account balances" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Owner records and money taken" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nasim" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Rifat" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ikbal" })).toBeVisible();
    const nasimCard = page.getByRole("heading", { name: "Nasim" }).locator("..");
    const rifatCard = page.getByRole("heading", { name: "Rifat" }).locator("..");
    const ikbalCard = page.getByRole("heading", { name: "Ikbal" }).locator("..");
    await expect(nasimCard).toContainText(/Historical investment\s*৳15,120\.00/);
    await expect(nasimCard).toContainText(/Capital returned\s*৳15,120\.00/);
    await expect(nasimCard).toContainText(/Current contributed capital\s*৳0\.00/);
    await expect(nasimCard).toContainText(/Due from Owner\s*৳7,714\.00/);
    await expect(rifatCard).toContainText(/Historical investment\s*৳33,600\.00/);
    await expect(rifatCard).toContainText(/Capital returned\s*৳10,000\.00/);
    await expect(rifatCard).toContainText(/Current contributed capital\s*৳23,600\.00/);
    await expect(rifatCard).toContainText(/Due from Owner\s*৳0\.00/);
    await expect(ikbalCard).toContainText(/Historical investment\s*৳0\.00/);
    await expect(ikbalCard).toContainText(/Capital returned\s*৳0\.00/);
    await expect(ikbalCard).toContainText(/Current contributed capital\s*৳0\.00/);
    await expect(ikbalCard).toContainText(/Due from Owner\s*৳1,000\.00/);
    await expect(page.getByText("Owner money taken", { exact: true }).locator("..")).toContainText("৳33,834");
    await expect(page.getByText("Capital-return portion", { exact: true }).locator("..")).toContainText("৳25,120");
    await expect(page.getByText("Due-from-Owner portion", { exact: true }).locator("..")).toContainText("৳8,714");
    await page.getByRole("heading", { name: "View owner money taken history" }).click();
    await page.getByRole("heading", { name: "View genuine owner-investment records" }).click();
    await expect(page.getByRole("button", { name: /Edit Owner investment for Nasim/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Delete Owner investment for Nasim/ })).toBeDisabled();
    await page.getByRole("heading", { name: "View append-only cash ledger" }).click();
    await expect(page.getByRole("button", { name: "Record cash movement" })).toBeDisabled();
    await expect(page.getByRole("heading", { name: "Record Steadfast settlement" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Courier", exact: true })).toHaveValue("Steadfast");
    await expect(page.getByRole("heading", { name: "Eligible Delivered COD orders" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Review and confirm" })).toBeDisabled();
    await expect(page.getByText("Persistent confirmation requires an owner or admin in connected Supabase mode.")).toBeVisible();
    await expect(page.getByLabel(/Masked final digits/)).toHaveAttribute("maxlength", "4");
    await expect(page.getByText("No confirmed batches yet.")).toBeVisible();
    await expect(page.getByText("Opening owner investment").first()).toBeVisible();
    await expect(page.getByText("Manage above")).toBeVisible();
  });

  test("filters owner-money-taken classifications by their effective dates", async ({ page }) => {
    await page.goto("/cash-settlements?start=2026-08-21&end=2026-08-21");
    await expect(page.getByText("Owner money taken", { exact: true }).locator("..")).toContainText("৳11,000");
    await expect(page.getByText("Capital-return portion", { exact: true }).locator("..")).toContainText("৳10,000");
    await expect(page.getByText("Due-from-Owner portion", { exact: true }).locator("..")).toContainText("৳1,000");
  });
});
