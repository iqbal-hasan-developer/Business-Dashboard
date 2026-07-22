import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { settlementRpcArgs, type SettlementEntryValues } from "@/domain/settlements";
import type { SettlementEligibleOrder } from "@/domain/types";

export async function recordSteadfastSettlement(
  client: SupabaseClient<Database>,
  values: SettlementEntryValues,
  eligibleOrders: SettlementEligibleOrder[],
) {
  const { data, error } = await client.rpc("record_steadfast_cod_settlement", settlementRpcArgs(values, eligibleOrders));
  if (error) throw error;
  if (!data) throw new Error("The settlement RPC did not return a batch identifier.");
  return data;
}
