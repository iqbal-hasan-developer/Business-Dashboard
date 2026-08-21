import { expect, test } from "@playwright/test";

test.skip(process.env.BUSINESS_DATA_PROVIDER !== "mock", "Marketing UI checks require isolated mock mode.");

test("marketing exposes filters, performance, spend, and audit sections", async ({ page }) => {
  const consoleErrors: string[]=[]; const pageErrors:string[]=[];
  page.on("console",(message)=>{if(message.type()==="error") consoleErrors.push(message.text());});
  page.on("pageerror",(error)=>pageErrors.push(error.message));
  await page.goto("/marketing");
  await expect(page.getByRole("heading",{name:"Marketing",exact:true})).toBeVisible();
  await expect(page.getByLabel("Date range")).toBeVisible();
  await expect(page.getByRole("heading",{name:"Campaign performance"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Spend history"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Spend audit history"})).toBeVisible();
  await page.getByLabel("Date range").selectOption("7d");
  await page.getByRole("button",{name:"Apply"}).click();
  await expect(page).toHaveURL(/range=7d/);
  await expect(page.getByRole("heading",{name:"Marketing",exact:true})).toBeVisible();
  expect(await page.locator("html").evaluate((element)=>element.scrollWidth>element.clientWidth+1)).toBe(false);
  expect(consoleErrors).toEqual([]); expect(pageErrors).toEqual([]);
});

test("delete dialog accepts the PostgreSQL timestamp and valid audit reason", async ({ page }, testInfo) => {
  await page.goto("/marketing");
  const deleteButton = page.getByRole("button", { name: "Delete Always-on spend" });
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();
  await page.getByLabel("Reason for deletion").fill("Duplicate imported spend");
  await page.getByRole("button", { name: "Delete and audit" }).click();
  await expect(page.getByText("Persistent marketing changes are unavailable in mock mode.")).toBeVisible();
  const screenshotPath = `${process.env.TEMP?.replaceAll("\\", "/") ?? "C:/Windows/Temp"}/nexanotion-marketing-delete-fixed-${testInfo.project.name}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: false });
});
