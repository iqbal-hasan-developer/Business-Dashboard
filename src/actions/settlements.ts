"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/auth/authorization";
import { requireDashboardUser } from "@/lib/auth/session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { settlementEntrySchema, safeSettlementError } from "@/domain/settlements";
import type { Money, SettlementEligibleOrder } from "@/domain/types";
import { recordSteadfastSettlement } from "@/data/settlement-writes";

export type SettlementActionResult = { ok: boolean; message: string; recordId?: string; fieldErrors?: Record<string, string[]> };

function databaseMoney(value: number): Money {
  const poisha = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(poisha)) throw new Error("Settlement money is outside the supported range.");
  return poisha;
}

export async function recordSteadfastSettlementAction(input: unknown): Promise<SettlementActionResult> {
  const parsed = settlementEntrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Review the highlighted values and try again.", fieldErrors: parsed.error.flatten().fieldErrors };
  if (resolveBusinessDataProvider() !== "supabase") return { ok: false, message: "Persistent settlements are unavailable in isolated mock mode." };
  const user = await requireDashboardUser();
  if (!can(user.role, "create") || !["owner", "admin"].includes(user.role)) return { ok: false, message: "Owner or admin access is required." };
  const client = await createServerSupabaseClient();
  try {
    const { data, error } = await client.from("dashboard_steadfast_settlement_eligible_orders")
      .select("order_id,order_number,order_date,customer_name,updated_at,gross_cod_receivable")
      .in("order_id", parsed.data.selectedOrderIds);
    if (error || !data) throw new Error("Unable to refresh eligible orders.");
    const eligibleOrders: SettlementEligibleOrder[] = data.map((row) => ({
      orderId: row.order_id, orderNumber: row.order_number, orderDate: row.order_date,
      customerName: row.customer_name, expectedUpdatedAt: row.updated_at,
      grossCodReceivable: databaseMoney(row.gross_cod_receivable),
    }));
    const recordId = await recordSteadfastSettlement(client, parsed.data, eligibleOrders);
    ["/cash-settlements", "/orders", "/dashboard", "/reports", "/data-checks"].forEach((path) => revalidatePath(path));
    return { ok: true, message: "Steadfast COD settlement confirmed with linked allocations and cash receipt.", recordId };
  } catch (error) {
    return { ok: false, message: safeSettlementError(error) };
  }
}
