import { expect, test } from "@playwright/test";

const routes = [
  { path: "/dashboard", heading: "Business overview" },
  { path: "/orders", heading: "Orders" },
  { path: "/orders/new", heading: "Create order" },
  { path: "/products", heading: "Products" },
];

for (const route of routes) {
  test(`${route.path} renders and has no horizontal overflow`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { name: route.heading, exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);
  });
}

test("order filters and new-order calculations work", async ({ page }) => {
  await page.goto("/orders");
  await page.getByPlaceholder("Search orders").fill("Nusrat");
  await expect(page).toHaveURL(/q=Nusrat/);
  await page.goto("/orders/new");
  await expect(page.getByText("Live financial summary")).toBeVisible();
  await expect(page.getByText("৳580").first()).toBeVisible();
});

test("dashboard recognizes Product Revenue only for Delivered orders", async ({ page }) => {
  await page.goto("/dashboard");
  const productRevenue = page.getByText("Product revenue", { exact: true });
  await expect(productRevenue.locator("xpath=following-sibling::p")).toHaveText("৳8,920");
  await expect(page.getByText("Delivered items only", { exact: true })).toBeVisible();

  await page.goto("/dashboard?status=Pending");
  const filteredProductRevenue = page.getByText("Product revenue", { exact: true });
  await expect(filteredProductRevenue.locator("xpath=following-sibling::p")).toHaveText("৳0");
});
