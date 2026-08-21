import { expect, test } from "@playwright/test";

test.skip(process.env.BUSINESS_DATA_PROVIDER !== "mock", "Prototype smoke tests require the explicit isolated mock provider.");

const routes = [
  { path: "/dashboard", heading: "Business overview" },
  { path: "/orders", heading: "Orders" },
  { path: "/orders/new", heading: "Create order" },
  { path: "/products", heading: "Products" },
  { path: "/marketing", heading: "Marketing" },
  { path: "/expenses", heading: "Expenses" },
  { path: "/cash-settlements", heading: "Cash & settlements" },
  { path: "/reports", heading: "Reports" },
  { path: "/data-checks", heading: "Data checks" },
  { path: "/settings", heading: "Settings" },
];

for (const route of routes) {
  test(`${route.path} renders and has no horizontal overflow`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.goto(route.path);
    await expect(page.getByRole("img", { name: "NexaNotion" }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: route.heading, exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);
    expect(consoleErrors).toEqual([]);
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

test("account menu opens from the keyboard without runtime errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/dashboard");
  const accountMenu = page.getByRole("button", { name: "Account menu for Development user, owner" });
  await accountMenu.focus();
  await expect(accountMenu).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
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

test("dashboard expense chart includes filtered advertising spend", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/dashboard");
  const chartHeading = page.getByRole("heading", { name: "Expense & ad spend breakdown" });
  await expect(chartHeading).toBeVisible();
  await expect(page.getByText("Product cost", { exact: true })).toBeVisible();
  await expect(page.getByText("Courier / transportation", { exact: true })).toBeVisible();
  await expect(page.getByText("Advertising spend", { exact: true })).toBeVisible();
  const chartPanel = chartHeading.locator("xpath=ancestor::section");
  const slices = chartPanel.locator("path.recharts-sector");
  await expect(slices.first()).toBeVisible();
  const fills = await slices.evaluateAll((paths) => paths.map((path) => path.getAttribute("fill")));
  expect(new Set(fills).size).toBe(fills.length);
  const chartSurface = chartPanel.getByRole("application");
  await chartSurface.focus();
  await expect(chartSurface).toBeFocused();
  await page.keyboard.press("ArrowRight");
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  await chartHeading.scrollIntoViewIfNeeded();
  const screenshotPath = `${process.env.TEMP?.replaceAll("\\", "/") ?? "C:/Windows/Temp"}/nexanotion-expense-ad-spend-${testInfo.project.name}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: false });
});
