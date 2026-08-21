import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManualOrderValues } from "@/domain/manual-entry";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  provider: vi.fn(),
  requireUser: vi.fn(),
  createClient: vi.fn(),
  createOrder: vi.fn(),
  updateOrder: vi.fn(),
  updateStatuses: vi.fn(),
  updateProduct: vi.fn(),
  createProduct: vi.fn(),
  updateCatalog: vi.fn(),
  recordExpense: vi.fn(),
  saveCampaign: vi.fn(),
  recordAdSpend: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/env", () => ({ resolveBusinessDataProvider: mocks.provider }));
vi.mock("@/lib/auth/session", () => ({ requireDashboardUser: mocks.requireUser }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.createClient }));
vi.mock("@/data/manual-entry-writes", () => ({
  createManualOrder: mocks.createOrder,
  updateManualOrder: mocks.updateOrder,
  updateManualOrderStatuses: mocks.updateStatuses,
  updateProductBusinessData: mocks.updateProduct,
  createProductCatalogEntry: mocks.createProduct,
  updateProductCatalogEntry: mocks.updateCatalog,
  recordExpenseEntry: mocks.recordExpense,
  upsertCampaignEntry: mocks.saveCampaign,
  recordAdSpendEntry: mocks.recordAdSpend,
}));

import { createOrderAction, recordExpenseAction, saveProductAction, updateOrderAction, updateOrderStatusesAction } from "@/actions/manual-entry";
import { toManualOrderEditValues } from "@/domain/manual-entry";

const order: ManualOrderValues = {
  orderNumber: "NNM-20260719-001", externalReference: "", orderDate: "2026-07-19", customerName: "Customer",
  customerPhone: "01700000000", customerAddress: "Dhaka address", customerNote: "", customerLocation: "Inside Dhaka",
  courier: "Steadfast", channel: "Other", campaign: "", status: "Pending", paymentMethod: "COD",
  paymentStatus: "Unpaid", settlementStatus: "Awaiting", discount: "0", deliveryCharged: "80",
  courierCostSnapshot: "70", packagingCostSnapshot: "5",
  items: [{ productId: "82100000-0000-4000-8000-000000000001", quantity: 1, actualUnitSellingPrice: "580" }],
};

describe("manual-entry server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.provider.mockReturnValue("supabase");
    mocks.requireUser.mockResolvedValue({ id: "u1", email: "owner@example.invalid", displayName: "Owner", role: "owner" });
    mocks.createClient.mockResolvedValue({ rpc: vi.fn() });
  });

  it("fails closed before obtaining a client in explicit mock mode", async () => {
    mocks.provider.mockReturnValue("mock");
    const result = await createOrderAction(order);
    expect(result).toEqual({ ok: false, message: "Persistent writes are unavailable in isolated mock mode." });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it("uses the authenticated client once and revalidates affected order pages", async () => {
    const client = { rpc: vi.fn() };
    mocks.createClient.mockResolvedValue(client);
    mocks.createOrder.mockResolvedValue("82400000-0000-4000-8000-000000000001");
    const result = await createOrderAction(order);
    expect(result).toMatchObject({ ok: true, recordId: "82400000-0000-4000-8000-000000000001" });
    expect(mocks.createOrder).toHaveBeenCalledOnce();
    expect(mocks.createOrder).toHaveBeenCalledWith(client, order);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/orders");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("keeps data-entry users from changing payment or settlement through this owner slice", async () => {
    mocks.requireUser.mockResolvedValue({ id: "u2", email: "entry@example.invalid", displayName: "Entry", role: "data_entry" });
    const result = await updateOrderStatusesAction({
      orderId: "82400000-0000-4000-8000-000000000001",
      orderStatus: "Delivered",
      paymentStatus: "Unpaid",
      settlementStatus: "Awaiting",
    });
    expect(result.ok).toBe(false);
    expect(mocks.updateStatuses).not.toHaveBeenCalled();
  });

  it("returns a safe duplicate-order message", async () => {
    mocks.createOrder.mockRejectedValue({ code: "23505", message: "constraint details" });
    const result = await createOrderAction(order);
    expect(result).toEqual({ ok: false, message: "That order number already exists. Use a unique order number." });
  });

  it("updates an eligible order once through the authenticated owner client", async () => {
    const client = { rpc: vi.fn() };
    mocks.createClient.mockResolvedValue(client);
    const values = toManualOrderEditValues(order, "82400000-0000-4000-8000-000000000001", "2026-07-22T10:00:00+00:00");
    mocks.updateOrder.mockResolvedValue(values.orderId);
    const result = await updateOrderAction(values);
    expect(result).toMatchObject({ ok: true, recordId: values.orderId });
    expect(mocks.updateOrder).toHaveBeenCalledOnce();
    expect(mocks.updateOrder).toHaveBeenCalledWith(client, values);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/orders/${values.orderId}`);
  });

  it("fails edit closed for data-entry users and preserves a safe stale-edit error", async () => {
    const values = toManualOrderEditValues(order, "82400000-0000-4000-8000-000000000001", "2026-07-22T10:00:00+00:00");
    mocks.requireUser.mockResolvedValue({ id: "u2", email: "entry@example.invalid", displayName: "Entry", role: "data_entry" });
    expect((await updateOrderAction(values)).ok).toBe(false);
    expect(mocks.updateOrder).not.toHaveBeenCalled();
    mocks.requireUser.mockResolvedValue({ id: "u1", email: "owner@example.invalid", displayName: "Owner", role: "owner" });
    mocks.updateOrder.mockRejectedValue({ code: "40001", message: "private details" });
    expect((await updateOrderAction(values)).message).toMatch(/changed after you opened/);
  });

  it("fails product and expense writes closed in mock mode", async () => {
    mocks.provider.mockReturnValue("mock");
    const product = await saveProductAction({ name: "Planner", slug: "planner", publicSku: "PUB-1", sellingPrice: "100", isActive: true, categoryId: null, buyingPrice: "50", reorderLevel: 0, dashboardSku: "", variation: "", internalNotes: "" });
    const expense = await recordExpenseAction({ expenseDate: "2026-07-19", categoryKey: "operations", description: "Packing", amount: "10", paymentMethod: "", campaignId: null, salesChannel: "", reference: "", fundingTreatment: "unpaid", paymentDate: "", businessAccountKey: "", ownerLabel: "", submissionKey: "00000000-0000-4000-8000-000000000091" });
    expect(product.ok).toBe(false); expect(expense.ok).toBe(false);
    expect(mocks.createProduct).not.toHaveBeenCalled(); expect(mocks.recordExpense).not.toHaveBeenCalled();
  });

  it("uses the owner JWT client for product and expense writes and revalidates their pages", async () => {
    const client = { rpc: vi.fn() }; mocks.createClient.mockResolvedValue(client);
    mocks.createProduct.mockResolvedValue("82100000-0000-4000-8000-000000000001");
    mocks.recordExpense.mockResolvedValue("82200000-0000-4000-8000-000000000001");
    const product = await saveProductAction({ name: "Planner", slug: "planner", publicSku: "PUB-1", sellingPrice: "100", isActive: true, categoryId: null, buyingPrice: "50", reorderLevel: 0, dashboardSku: "", variation: "", internalNotes: "" });
    const expense = await recordExpenseAction({ expenseDate: "2026-07-19", categoryKey: "operations", description: "Packing", amount: "10", paymentMethod: "", campaignId: null, salesChannel: "", reference: "", fundingTreatment: "business_account_paid", paymentDate: "2026-07-19", businessAccountKey: "cash", ownerLabel: "", submissionKey: "00000000-0000-4000-8000-000000000092" });
    expect(product.ok).toBe(true); expect(expense.ok).toBe(true);
    expect(mocks.createProduct).toHaveBeenCalledWith(client, expect.objectContaining({ publicSku: "PUB-1" }));
    expect(mocks.recordExpense).toHaveBeenCalledWith(client, expect.objectContaining({ amount: "10" }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/products");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/expenses");
  });
});
