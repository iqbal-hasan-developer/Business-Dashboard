import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { settlementRpcArgs, type SettlementEntryValues, type SettlementReversalValues } from "@/domain/settlements";
import type { SettlementEligibleOrder, SettlementEligibleRejectedAdjustment } from "@/domain/types";

export async function recordSteadfastSettlement(
  client: SupabaseClient<Database>,
  values: SettlementEntryValues,
  eligibleOrders: SettlementEligibleOrder[],
  eligibleAdjustments: SettlementEligibleRejectedAdjustment[],
) {
  const { data, error } = await client.rpc("record_steadfast_cod_settlement_v4", settlementRpcArgs(values, eligibleOrders, eligibleAdjustments));
  if (error) throw error;
  if (!data) throw new Error("The settlement RPC did not return a batch identifier.");
  return data;
}

export async function reverseSteadfastSettlement(client: SupabaseClient<Database>, values: SettlementReversalValues) {
  const { data, error } = await client.rpc("reverse_steadfast_cod_settlement", {
    p_settlement_id: values.settlementId,
    p_reversed_on: values.reversedOn,
    p_reason: values.reason,
    p_idempotency_key: values.idempotencyKey,
  });
  if (error) throw error;
  if (!data) throw new Error("The settlement reversal RPC did not return an identifier.");
  return data;
}
