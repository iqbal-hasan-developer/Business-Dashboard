import "server-only";

import type { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildManualOrderRpcArgs,
  buildManualOrderEditRpcArgs,
  type AdSpendEntryValues,
  type CampaignEntryValues,
  type ExpenseEntryValues,
  type ManualOrderValues,
  type ManualOrderEditValues,
  type OrderTransitionValues,
  type ProductCatalogValues,
  type ProductBusinessValues,
} from "@/domain/manual-entry";
import { moneyToDatabaseNumber, parseMoney } from "@/domain/money";

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function optional(value: string) { return value || null; }

function catalogArgs(values: ProductCatalogValues) {
  return {
    p_name: values.name,
    p_slug: values.slug,
    p_sku: values.publicSku,
    p_price: moneyToDatabaseNumber(parseMoney(values.sellingPrice)),
    p_is_active: values.isActive,
    p_category_id: values.categoryId,
    p_buying_price: moneyToDatabaseNumber(parseMoney(values.buyingPrice)),
    p_reorder_level: values.reorderLevel,
    p_dashboard_sku: optional(values.dashboardSku),
    p_variation: optional(values.variation),
    p_internal_notes: optional(values.internalNotes),
  };
}

export async function createManualOrder(client: SupabaseClient, values: ManualOrderValues) {
  const { data, error } = await client.rpc("create_dashboard_order", buildManualOrderRpcArgs(values));
  if (error || !data) throw error ?? new Error("Order creation returned no identifier.");
  return data;
}

export async function updateManualOrder(client: SupabaseClient, values: ManualOrderEditValues) {
  const { data, error } = await client.rpc("update_dashboard_order", buildManualOrderEditRpcArgs(values));
  if (error || !data) throw error ?? new Error("Order update returned no identifier.");
  return data;
}

export async function updateManualOrderStatuses(client: SupabaseClient, values: OrderTransitionValues) {
  const { error } = await client.rpc("transition_dashboard_order", {
    p_order_id: values.orderId,
    p_order_status: values.orderStatus,
    p_payment_status: values.paymentStatus,
    p_settlement_status: null,
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

export async function createProductCatalogEntry(client: SupabaseClient, values: ProductCatalogValues) {
  const { data, error } = await client.rpc("create_dashboard_product", catalogArgs(values));
  if (error || !data) throw error ?? new Error("Product creation returned no identifier.");
  return data;
}

export async function updateProductCatalogEntry(client: SupabaseClient, values: ProductCatalogValues) {
  if (!values.productId) throw new Error("Product identifier is required for update.");
  const { data, error } = await client.rpc("update_dashboard_product", {
    p_product_id: values.productId,
    ...catalogArgs(values),
  });
  if (error || !data) throw error ?? new Error("Product update returned no identifier.");
  return data;
}

export async function recordExpenseEntry(client: SupabaseClient, values: ExpenseEntryValues) {
  const { data, error } = await client.rpc("record_expense", {
    p_expense_date: values.expenseDate,
    p_category_key: values.categoryKey,
    p_description: values.description,
    p_amount: moneyToDatabaseNumber(parseMoney(values.amount)),
    p_payment_method: optional(values.paymentMethod),
    p_campaign_id: values.campaignId,
    p_sales_channel: optional(values.salesChannel),
    p_reference: optional(values.reference),
  });
  if (error || !data) throw error ?? new Error("Expense creation returned no identifier.");
  return data;
}

export async function upsertCampaignEntry(client: SupabaseClient, values: CampaignEntryValues) {
  const { data, error } = await client.rpc("upsert_campaign", {
    p_id: values.campaignId ?? null,
    p_name: values.name,
    p_channel: values.channel,
    p_starts_on: optional(values.startsOn),
    p_ends_on: optional(values.endsOn),
    p_budget: moneyToDatabaseNumber(parseMoney(values.budget)),
    p_is_active: values.isActive,
  });
  if (error || !data) throw error ?? new Error("Campaign save returned no identifier.");
  return data;
}

export async function recordAdSpendEntry(client: SupabaseClient, values: AdSpendEntryValues) {
  const { data, error } = await client.rpc("record_daily_ad_spend", {
    p_campaign_id: values.campaignId,
    p_spend_date: values.spendDate,
    p_platform: values.platform,
    p_amount: moneyToDatabaseNumber(parseMoney(values.amount)),
    p_source_reference: optional(values.sourceReference),
  });
  if (error || !data) throw error ?? new Error("Advertising spend returned no identifier.");
  return data;
}
