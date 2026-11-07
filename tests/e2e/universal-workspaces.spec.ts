import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

function localServices() {
  const status = spawnSync("supabase", ["status", "--workdir", "supabase/universal", "--output", "json"], { encoding: "utf8" });
  if (status.status !== 0) throw new Error("The isolated Supabase stack is not running.");
  const services = JSON.parse(status.stdout) as Record<string, string>;
  if (!["localhost", "127.0.0.1", "::1"].includes(new URL(services.API_URL).hostname)) throw new Error("Workspace browser tests require loopback Supabase.");
  return services;
}

test("workspace onboarding, commerce flows, isolation, invitations, switching, and revocation", async ({ page, context, baseURL }) => {
  let phase = "starting isolated test services";
  try {
    const services = localServices();
    const apiUrl = services.API_URL;
    const publishableKey = services.PUBLISHABLE_KEY ?? services.ANON_KEY;
    const serviceRoleKey = services.SERVICE_ROLE_KEY;
    if (!publishableKey || !serviceRoleKey) throw new Error("Local Supabase keys are unavailable.");
    const admin = createClient(apiUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const suffix = randomUUID();
    const accountA = { email: `workspace-a-${suffix}@example.invalid`, password: `isolated-${randomUUID()}-A1!` };
    const accountB = { email: `workspace-b-${suffix}@example.invalid`, password: `isolated-${randomUUID()}-B1!` };

    phase = "registration and owner onboarding";
    await page.goto("/register");
    await page.getByLabel("Name").fill("Workspace Owner A");
    await page.getByLabel("Email").fill(accountA.email);
    await page.getByLabel("Password").fill(accountA.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByLabel("Workspace name").fill("Workspace Alpha");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.getByRole("heading", { name: "Workspace Alpha" })).toBeVisible();
    const workspaceA = await page.getByLabel("Current workspace").inputValue();

    const createdB = await admin.auth.admin.createUser({ email: accountB.email, password: accountB.password, email_confirm: true });
    if (createdB.error || !createdB.data.user) throw new Error("Could not create isolated invitation recipient.");
    const listedUsers = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listedUsers.error) throw new Error("Could not list isolated test accounts.");
    const createdA = listedUsers.data.users.find((user) => user.email?.toLowerCase() === accountA.email.toLowerCase());
    if (!createdA) throw new Error("Could not resolve the isolated workspace owner.");
    const storeA = await admin.from("stores").insert({
      workspace_id: workspaceA, name: "Alpha Test Store", platform: "custom", base_url: "https://alpha.example.invalid", created_by: createdA.id,
    }).select("id").single();
    if (storeA.error) throw new Error("Could not prepare the isolated first workspace store.");
    const clientB = createClient(apiUrl, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const signedB = await clientB.auth.signInWithPassword(accountB);
    if (signedB.error) throw new Error("Could not authenticate isolated invitation owner.");
    const workspaceBResult = await clientB.rpc("create_workspace", { p_name: "Workspace Beta" });
    if (workspaceBResult.error || !workspaceBResult.data) throw new Error("Could not create the second workspace.");
    const storeB = await admin.from("stores").insert({
      workspace_id: workspaceBResult.data, name: "Beta Test Store", platform: "custom", base_url: "https://beta.example.invalid", created_by: createdB.data.user.id,
    }).select("id").single();
    if (storeB.error) throw new Error("Could not prepare the isolated second workspace store.");
    const betaProduct = await admin.from("products").insert({
      workspace_id: workspaceBResult.data, source_store_id: storeB.data.id, name: "BETA-PRIVATE-FIXTURE", status: "active", currency: "BDT", price: 99,
    });
    if (betaProduct.error) throw new Error("Could not prepare the second workspace isolation fixture.");
    const invite = await clientB.rpc("invite_workspace_member", { p_workspace_id: workspaceBResult.data, p_email: accountA.email, p_role: "staff" });
    if (invite.error || !invite.data?.[0]?.invitation_token) throw new Error("Could not create the isolated workspace invitation.");
    const invitationToken = invite.data[0].invitation_token;

    phase = "invitation acceptance and staff permissions";
    await page.goto(`/invitations/accept?token=${encodeURIComponent(invitationToken)}`);
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(page.getByRole("heading", { name: "Workspace Beta" })).toBeVisible();
    await page.goto("/workspace");
    await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Invite a member" })).toHaveCount(0);

    phase = "workspace switching";
    const workspaceSelector = page.getByLabel("Current workspace");
    await expect(workspaceSelector.locator("option")).toHaveCount(2);
    await workspaceSelector.selectOption(workspaceA);
    await expect(page.getByRole("heading", { name: "Workspace Alpha" })).toBeVisible();

    phase = "workspace-scoped product, order, inventory, customer, and expense workflows";
    await page.goto("/products");
    await page.locator('input[name="name"]').first().fill("Alpha Fixture Product");
    await page.locator('input[name="sku"]').first().fill("ALPHA-FIXTURE-001");
    await page.locator('input[name="price"]').first().fill("25");
    await page.locator('input[name="category"]').last().fill("Browser fixtures");
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(page).toHaveURL(/\/products\?notice=product-saved/);
    await expect(page.getByText("Alpha Fixture Product").first()).toBeVisible();
    const editProduct = page.locator("details").filter({ has: page.locator("summary", { hasText: "Alpha Fixture Product" }) }).first();
    await editProduct.locator('input[name="brand"]').fill("Browser verified brand");
    await editProduct.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/\/products\?notice=product-saved/);

    const pageProducts = Array.from({ length: 26 }, (_, index) => ({
      workspace_id: workspaceA, source_store_id: storeA.data.id, name: `PageFixture ${String(index).padStart(2, "0")}`,
      sku: `PAGE-${index}`, status: "active", currency: "BDT", price: index + 1,
    }));
    const seededProducts = await admin.from("products").insert(pageProducts);
    if (seededProducts.error) throw new Error("Could not prepare isolated pagination fixtures.");
    await page.goto("/products?q=PageFixture");
    await expect(page.getByText("26 results · Page 1 of 2")).toBeVisible();
    await page.getByRole("link", { name: "Next" }).click();
    await expect(page.getByText("26 results · Page 2 of 2")).toBeVisible();
    await page.goto("/products?q=Alpha+Fixture&category=Browser+fixtures&minAmount=25&maxAmount=25&status=active&sort=price&direction=asc");
    await expect(page.getByText("Alpha Fixture Product").first()).toBeVisible();
    await expect(page.getByText("BETA-PRIVATE-FIXTURE")).toHaveCount(0);
    await page.goto("/products?category=Browser+fixtures&stockStatus=untracked");
    await expect(page.getByText("Alpha Fixture Product").first()).toBeVisible();

    phase = "workspace expense creation and filtering";
    await page.goto("/expenses");
    const expenseForm = page.locator("form").filter({ has: page.locator('input[name="description"]') }).first();
    await expenseForm.locator('input[name="category"]').fill("E2E-Office");
    await expenseForm.locator('input[name="description"]').fill("Isolated expense fixture");
    await expenseForm.locator('input[name="amount"]').fill("7.5");
    const expenseDate = await expenseForm.locator('input[name="expense_date"]').inputValue();
    await page.getByRole("button", { name: "Save expense" }).click();
    await expect(page).toHaveURL(/\/expenses\?notice=expense-saved/);
    const expenseQuery = new URLSearchParams({ category: "E2E-Office", status: "paid", sort: "amount", direction: "desc", startDate: expenseDate, endDate: expenseDate, minAmount: "7", maxAmount: "8" });
    await page.goto(`/expenses?${expenseQuery}`);
    await expect(page.getByText("Isolated expense fixture")).toBeVisible();

    phase = "order creation, listing, and payment/status filters";
    await page.goto("/orders/new");
    await page.locator('input[name="order_number"]').fill("E2E-ALPHA-ORDER");
    await page.locator('input[name="customer_name"]').fill("Alpha Buyer E2E");
    await page.locator('input[name="customer_phone"]').fill("01700001234");
    await page.locator('select[name="store_id"]').selectOption(storeA.data.id);
    await page.locator('select[name="variant_id"]').selectOption({ label: "Alpha Fixture Product · Default · ALPHA-FIXTURE-001" });
    await page.locator('input[name="quantity"]').fill("1");
    await page.getByRole("button", { name: "Create pending order" }).click();
    await expect(page).toHaveURL(/\/orders\?notice=order-created/);
    await page.goto("/orders?status=pending&paymentStatus=pending&q=E2E-ALPHA-ORDER");
    await expect(page.getByText("E2E-ALPHA-ORDER")).toBeVisible();
    const orderRow = page.locator("tr").filter({ hasText: "E2E-ALPHA-ORDER" }).first();
    await orderRow.locator('select[name="status"]').selectOption("confirmed");
    await orderRow.locator('select[name="payment_status"]').selectOption("paid");
    await orderRow.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/orders\?notice=order-updated/);
    await page.goto("/orders?status=confirmed&paymentStatus=paid&q=E2E-ALPHA-ORDER&sort=total&direction=asc");
    await expect(page.getByText("E2E-ALPHA-ORDER")).toBeVisible();
    const storedOrder = await admin.from("orders").select("customer_id,store_id").eq("workspace_id", workspaceA).eq("order_number", "E2E-ALPHA-ORDER").single();
    if (storedOrder.error || !storedOrder.data.customer_id) throw new Error("Could not resolve the isolated order's workspace customer.");
    await page.goto(`/orders?customerId=${storedOrder.data.customer_id}&storeId=${storedOrder.data.store_id}`);
    await expect(page.getByText("E2E-ALPHA-ORDER")).toBeVisible();
    await page.goto(`/orders?storeId=${storeB.data.id}`);
    await expect(page.getByText("0 results · Page 1 of 1")).toBeVisible();

    phase = "workspace inventory adjustment and customer search";
    await page.goto("/inventory");
    await page.locator('select[name="variant_id"]').selectOption({ label: "Alpha Fixture Product · Default · ALPHA-FIXTURE-001" });
    await page.locator('select[name="store_id"]').selectOption(storeA.data.id);
    await page.locator('input[name="quantity_delta"]').fill("3");
    await page.locator('input[name="reason"]').fill("Isolated browser fixture adjustment");
    await page.getByRole("button", { name: "Record adjustment" }).click();
    await expect(page).toHaveURL(/\/inventory\?notice=stock-adjusted/);
    await page.goto("/inventory?category=Browser+fixtures&stockStatus=in_stock&minStock=3&maxStock=3");
    await expect(page.getByText("Alpha Fixture Product").first()).toBeVisible();
    await page.goto("/products?category=Browser+fixtures&stockStatus=in_stock&minStock=3&maxStock=3");
    await expect(page.getByText("Alpha Fixture Product").first()).toBeVisible();
    await page.goto("/customers?q=Alpha+Buyer");
    await expect(page.getByText("Alpha Buyer E2E")).toBeVisible();
    const noOrderCustomer = await admin.from("customers").insert({ workspace_id: workspaceA, store_id: storeA.data.id, full_name: "No Order E2E" });
    if (noOrderCustomer.error) throw new Error("Could not prepare the no-order customer fixture.");
    await page.goto("/customers?activity=without_orders&minOrders=0&maxOrders=0");
    await expect(page.getByText("No Order E2E")).toBeVisible();

    phase = "workspace dashboard, report, and CSV isolation";
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Workspace Alpha" })).toBeVisible();
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    const exportResponse = await page.request.get(new URL("/exports/products", baseURL!).toString());
    if (!exportResponse.ok()) throw new Error("Workspace product export failed.");
    const exportBody = await exportResponse.text();
    if (!exportBody.includes("Alpha Fixture Product") || exportBody.includes("BETA-PRIVATE-FIXTURE")) {
      throw new Error("Workspace product export failed its isolation check.");
    }

    phase = "revoked workspace access";
    const removed = await clientB.rpc("remove_workspace_member", { p_workspace_id: workspaceBResult.data, p_user_id: createdA.id });
    if (removed.error) throw new Error("Could not revoke the isolated workspace membership.");
    await context.addCookies([{ name: "active_workspace_id", value: workspaceBResult.data, url: baseURL!, httpOnly: true, sameSite: "Lax" }]);
    await page.goto(`/dashboard?workspaceId=${encodeURIComponent(workspaceBResult.data)}`);
    await expect(page.getByRole("heading", { name: "Workspace Alpha" })).toBeVisible();
    await expect(page.getByLabel("Current workspace").locator("option")).toHaveCount(1);
  } catch {
    throw new Error(`Workspace browser flow failed during ${phase}; authentication and invitation values were omitted.`);
  }
});
