import { describe, expect, it } from "vitest";
import { mapOrder, mapProduct } from "@/data/supabase-repository";
import type { OrderItemRow, OrderRow, ProductBusinessRow, ProductRow } from "@/lib/supabase/database.types";

describe("Supabase repository mapping", () => {
  it("keeps buying cost in the private product companion row", () => {
    const product = { id: "p1", category_id: null, name: "Planner", slug: "planner", sku: "PUBLIC", price: 580, stock: 2, is_active: true, created_at: null, updated_at: null } satisfies ProductRow;
    const business = { product_id: "p1", sku_override: "NN-001", variation: "Blue", buying_price: 280, buying_price_verified_at: "now", buying_price_verified_by: "u1", reorder_level: 4, internal_notes: "private", created_at: "now", updated_at: "now" } satisfies ProductBusinessRow;
    expect(mapProduct(product, business)).toMatchObject({ sku: "NN-001", buyingPrice: 28000, sellingPrice: 58000 });
  });

  it("maps legacy Delivered rows and immutable item snapshots", () => {
    const order = {
      id: "o1", order_number: "NN-1", customer_name: "Customer", customer_phone: "", customer_address: "", customer_note: null, delivery_area: "Inside Dhaka",
      payment_method: "cod", payment_status: "verified", order_status: "delivered", subtotal: 580, delivery_charge: 80, total: 660,
      order_date: null, external_reference: null, customer_location: null, courier: null, sales_channel: null, campaign_id: null,
      campaign_name_snapshot: null, dashboard_order_status: null, dashboard_payment_status: null, settlement_status: null,
      discount_amount: null, refund_amount: null, courier_cost_snapshot: 70, packaging_cost_snapshot: 0, created_at: "2026-07-14T00:00:00Z", updated_at: null,
    } satisfies OrderRow;
    const item = {
      id: "i1", order_id: "o1", product_id: "p1", product_name: "Planner", product_slug: "planner", unit_price: 580,
      quantity: 1, line_total: 580, sku_snapshot: "NN-001", list_price_snapshot: 580, buying_cost_snapshot: 280,
      actual_unit_selling_price: 580, created_at: null,
    } satisfies OrderItemRow;
    expect(mapOrder(order, [item])).toMatchObject({ status: "Delivered", paymentMethod: "COD", paymentStatus: "Paid", items: [{ buyingCostSnapshot: 28000 }] });
  });
});
