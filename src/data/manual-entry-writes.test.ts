import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createManualOrder, createProductCatalogEntry, recordAdSpendEntry, recordExpenseEntry, updateManualOrderStatuses, updateProductBusinessData, upsertCampaignEntry } from "@/data/manual-entry-writes";
import type { ManualOrderValues, OrderTransitionValues, ProductBusinessValues } from "@/domain/manual-entry";

type Client = Parameters<typeof createManualOrder>[0];

function clientWith(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as unknown as Client;
}

const order: ManualOrderValues = {
  orderNumber: "NNM-1", externalReference: "", orderDate: "2026-07-19", customerName: "Customer",
  customerPhone: "01700000000", customerAddress: "Dhaka address", customerNote: "", customerLocation: "Inside Dhaka",
  courier: "Steadfast", channel: "Other", campaign: "", status: "Pending", paymentMethod: "COD",
  paymentStatus: "Unpaid", settlementStatus: "Awaiting", discount: "0", deliveryCharged: "80",
  courierCostSnapshot: "70", packagingCostSnapshot: "5",
  items: [{ productId: "82100000-0000-4000-8000-000000000001", quantity: 1, actualUnitSellingPrice: "580" }],
};

describe("manual-entry RPC repository", () => {
  it("creates an order only through the installed atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "82400000-0000-4000-8000-000000000001", error: null });
    await expect(createManualOrder(clientWith(rpc), order)).resolves.toBe("82400000-0000-4000-8000-000000000001");
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("create_dashboard_order", expect.objectContaining({ p_items: [expect.objectContaining({ quantity: 1 })] }));
  });

  it("keeps order, payment, and settlement status separate and never sends a refund", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const values: OrderTransitionValues = { orderId: "82400000-0000-4000-8000-000000000001", orderStatus: "Delivered", paymentStatus: "Unpaid", settlementStatus: "Awaiting" };
    await updateManualOrderStatuses(clientWith(rpc), values);
    expect(rpc).toHaveBeenCalledWith("transition_dashboard_order", {
      p_order_id: values.orderId,
      p_order_status: "Delivered",
      p_payment_status: "Unpaid",
      p_settlement_status: "Awaiting",
      p_refund_amount: null,
    });
  });

  it("updates only private product metadata through its authorized RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: order.items[0].productId, error: null });
    const values: ProductBusinessValues = { productId: order.items[0].productId, buyingPrice: "280.25", reorderLevel: 10, skuOverride: "NN-001", variation: "Blue", internalNotes: "Verified" };
    await updateProductBusinessData(clientWith(rpc), values);
    expect(rpc).toHaveBeenCalledWith("set_product_buying_cost", expect.objectContaining({ p_buying_price: 280.25, p_reorder_level: 10 }));
  });

  it("creates products atomically through the new RPC and sends no stock value", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: order.items[0].productId, error: null });
    await createProductCatalogEntry(clientWith(rpc), { name: "Planner", slug: "planner", publicSku: "PUB-1", sellingPrice: "580.25", isActive: true, categoryId: null, buyingPrice: "280.15", reorderLevel: 0, dashboardSku: "DASH-1", variation: "Blue", internalNotes: "Private" });
    expect(rpc).toHaveBeenCalledWith("create_dashboard_product", expect.objectContaining({ p_price: 580.25, p_buying_price: 280.15 }));
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_stock");
  });

  it("uses installed expense, campaign, and ad-spend RPCs with exact decimal values", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "82100000-0000-4000-8000-000000000001", error: null });
    const client = clientWith(rpc);
    await recordExpenseEntry(client, { expenseDate: "2026-07-19", categoryKey: "operations", description: "Packing", amount: "15.25", paymentMethod: "Cash", campaignId: null, salesChannel: "", reference: "" });
    await upsertCampaignEntry(client, { name: "Launch", channel: "Meta", startsOn: "", endsOn: "", budget: "100.50", isActive: true });
    await recordAdSpendEntry(client, { campaignId: "82100000-0000-4000-8000-000000000001", spendDate: "2026-07-19", platform: "Meta", amount: "20.75", sourceReference: "" });
    expect(rpc).toHaveBeenNthCalledWith(1, "record_expense", expect.objectContaining({ p_amount: 15.25 }));
    expect(rpc).toHaveBeenNthCalledWith(2, "upsert_campaign", expect.objectContaining({ p_budget: 100.5 }));
    expect(rpc).toHaveBeenNthCalledWith(3, "record_daily_ad_spend", expect.objectContaining({ p_amount: 20.75 }));
  });

  it("contains no direct table write, service-role, inventory, refund, or return path", () => {
    const repository = readFileSync("src/data/manual-entry-writes.ts", "utf8");
    const actions = readFileSync("src/actions/manual-entry.ts", "utf8");
    const combined = `${repository}\n${actions}`;
    expect(repository.match(/client\.rpc\(/g)).toHaveLength(8);
    expect(combined).not.toMatch(/service[_-]?role|\.from\s*\(|decrement_product_stock|inventory|record_dashboard_refund|record_dashboard_return/i);
    expect(actions).toContain("requireDashboardUser()");
    expect(actions).toContain("resolveBusinessDataProvider() !== \"supabase\"");
    expect(actions).toContain("revalidatePath(path)");
  });
});
