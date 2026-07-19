import "server-only";

import type { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildManualOrderRpcArgs,
  type ManualOrderValues,
  type OrderTransitionValues,
  type ProductBusinessValues,
} from "@/domain/manual-entry";
import { moneyToDatabaseNumber, parseMoney } from "@/domain/money";

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export async function createManualOrder(client: SupabaseClient, values: ManualOrderValues) {
  const { data, error } = await client.rpc("create_dashboard_order", buildManualOrderRpcArgs(values));
  if (error || !data) throw error ?? new Error("Order creation returned no identifier.");
  return data;
}

export async function updateManualOrderStatuses(client: SupabaseClient, values: OrderTransitionValues) {
  const { error } = await client.rpc("transition_dashboard_order", {
    p_order_id: values.orderId,
    p_order_status: values.orderStatus,
    p_payment_status: values.paymentStatus,
    p_settlement_status: values.settlementStatus,
    p_refund_amount: null,
  });
  if (error) throw error;
}

export async function updateProductBusinessData(client: SupabaseClient, values: ProductBusinessValues) {
  const { data, error } = await client.rpc("set_product_buying_cost", {
    p_product_id: values.productId,
    p_buying_price: moneyToDatabaseNumber(parseMoney(values.buyingPrice)),
    p_reorder_level: values.reorderLevel,
    p_sku_override: values.skuOverride || null,
    p_variation: values.variation || null,
    p_internal_notes: values.internalNotes || null,
  });
  if (error || !data) throw error ?? new Error("Product update returned no identifier.");
  return data;
}
