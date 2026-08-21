"use server";

import { revalidatePath } from "next/cache";
import { campaignPerformanceSchema, deleteAdSpendSchema, editAdSpendSchema, safeMarketingError } from "@/domain/marketing";
import { deleteAdSpend, editAdSpend, updateCampaignPerformance } from "@/data/marketing-writes";
import { requireDashboardUser } from "@/lib/auth/session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type MarketingActionResult = { ok: boolean; message: string; fieldErrors?: Record<string, string[]> };
const validation = (error: { flatten(): { fieldErrors: Record<string, string[]> } }): MarketingActionResult => {
  const fieldErrors = error.flatten().fieldErrors;
  return { ok: false, message: Object.values(fieldErrors).flat()[0] ?? "Review the highlighted values and try again.", fieldErrors };
};
function refreshMarketing() { ["/marketing", "/dashboard", "/reports", "/data-checks"].forEach((path) => revalidatePath(path)); }
async function boundary(roles: string[]) {
  if (resolveBusinessDataProvider() !== "supabase") return { error: "Persistent marketing changes are unavailable in mock mode." };
  const user = await requireDashboardUser();
  if (!roles.includes(user.role)) return { error: "Your dashboard role cannot perform this action." };
  return { client: await createServerSupabaseClient() };
}
export async function editAdSpendAction(input: unknown): Promise<MarketingActionResult> {
  const parsed=editAdSpendSchema.safeParse(input); if(!parsed.success) return validation(parsed.error); const gate=await boundary(["owner","admin"]); if(gate.error||!gate.client) return {ok:false,message:gate.error!};
  try { await editAdSpend(gate.client,parsed.data); refreshMarketing(); return {ok:true,message:"Spend updated and added to audit history."}; } catch(error){return {ok:false,message:safeMarketingError(error)};}
}
export async function deleteAdSpendAction(input: unknown): Promise<MarketingActionResult> {
  const parsed=deleteAdSpendSchema.safeParse(input); if(!parsed.success) return validation(parsed.error); const gate=await boundary(["owner"]); if(gate.error||!gate.client) return {ok:false,message:gate.error!};
  try { await deleteAdSpend(gate.client,parsed.data); refreshMarketing(); return {ok:true,message:"Spend deleted and preserved in audit history."}; } catch(error){return {ok:false,message:safeMarketingError(error)};}
}
export async function updateCampaignPerformanceAction(input: unknown): Promise<MarketingActionResult> {
  const parsed=campaignPerformanceSchema.safeParse(input); if(!parsed.success) return validation(parsed.error); const gate=await boundary(["owner","admin"]); if(gate.error||!gate.client) return {ok:false,message:gate.error!};
  try { await updateCampaignPerformance(gate.client,parsed.data); refreshMarketing(); return {ok:true,message:"Campaign performance updated and audited."}; } catch(error){return {ok:false,message:safeMarketingError(error)};}
}
