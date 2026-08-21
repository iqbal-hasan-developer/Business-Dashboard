import "server-only";

import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CampaignPerformanceValues, DeleteAdSpendValues, EditAdSpendValues } from "@/domain/marketing";
import { moneyToDatabaseNumber, parseMoney } from "@/domain/money";

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;
const optional = (value: string) => value || null;

export async function editAdSpend(client: SupabaseClient, values: EditAdSpendValues) {
  const { data, error } = await client.rpc("edit_dashboard_ad_spend", { p_spend_id: values.spendId, p_campaign_id: values.campaignId, p_spend_date: values.spendDate, p_platform: values.platform, p_amount: moneyToDatabaseNumber(parseMoney(values.amount)), p_source_reference: optional(values.sourceReference), p_reason: values.reason, p_expected_updated_at: values.expectedUpdatedAt });
  if (error || !data) throw error ?? new Error("Spend update returned no identifier."); return data;
}

export async function deleteAdSpend(client: SupabaseClient, values: DeleteAdSpendValues) {
  const { data, error } = await client.rpc("delete_dashboard_ad_spend", { p_spend_id: values.spendId, p_reason: values.reason, p_expected_updated_at: values.expectedUpdatedAt });
  if (error || !data) throw error ?? new Error("Spend deletion returned no identifier."); return data;
}

export async function updateCampaignPerformance(client: SupabaseClient, values: CampaignPerformanceValues) {
  const { data, error } = await client.rpc("update_dashboard_campaign_performance", { p_campaign_id: values.campaignId, p_results_count: values.resultsCount ?? null, p_result_type: optional(values.resultType), p_impressions: values.impressions ?? null, p_reach: values.reach ?? null, p_total_messaging_contacts: values.totalMessagingContacts ?? null, p_new_messaging_contacts: values.newMessagingContacts ?? null, p_purchases: values.purchases ?? null, p_attribution_setting: optional(values.attributionSetting), p_source_reference: optional(values.sourceReference), p_reason: values.reason, p_expected_updated_at: values.expectedUpdatedAt });
  if (error || !data) throw error ?? new Error("Campaign update returned no identifier."); return data;
}
