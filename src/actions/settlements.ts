"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/auth/authorization";
import { requireDashboardUser } from "@/lib/auth/session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { settlementEntrySchema, settlementReversalSchema, safeSettlementError } from "@/domain/settlements";
import type { Money, SettlementEligibleOrder, SettlementEligibleRejectedAdjustment } from "@/domain/types";
import { databaseNumericToMoney } from "@/data/authoritative-reporting";
import { recordSteadfastSettlement, reverseSteadfastSettlement } from "@/data/settlement-writes";

export type SettlementActionResult = { ok: boolean; message: string; recordId?: string; fieldErrors?: Record<string, string[]> };

function databaseMoney(value: number): Money {
  return databaseNumericToMoney(value);
}

export async function recordSteadfastSettlementAction(input: unknown): Promise<SettlementActionResult> {
  const parsed = settlementEntrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Review the highlighted values and try again.", fieldErrors: parsed.error.flatten().fieldErrors };
  if (resolveBusinessDataProvider() !== "supabase") return { ok: false, message: "Persistent settlements are unavailable in isolated mock mode." };
  const user = await requireDashboardUser();
  if (!can(user.role, "create") || !["owner", "admin"].includes(user.role)) return { ok: false, message: "Owner or admin access is required." };
  const client = await createServerSupabaseClient();
  try {
    const [ordersResult, adjustmentsResult] = await Promise.all([
      parsed.data.selectedOrderIds.length
        ? client.from("dashboard_steadfast_settlement_eligible_orders")
          .select("order_id,order_number,order_date,customer_name,updated_at,gross_cod_receivable")
          .in("order_id", parsed.data.selectedOrderIds)
        : Promise.resolve({ data: [], error: null }),
      parsed.data.selectedAdjustmentIds.length
        ? client.from("dashboard_steadfast_settlement_eligible_rejected_adjustments")
          .select("adjustment_id,order_id,order_number,order_date,customer_name,tracking_code,expected_created_at,gross_cod_recovery,courier_charge,expected_net_adjustment")
          .in("adjustment_id", parsed.data.selectedAdjustmentIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (ordersResult.error || adjustmentsResult.error || !ordersResult.data || !adjustmentsResult.data) throw new Error("Unable to refresh eligible settlement items.");
    const eligibleOrders: SettlementEligibleOrder[] = ordersResult.data.map((row) => ({
      orderId: row.order_id, orderNumber: row.order_number, orderDate: row.order_date,
      customerName: row.customer_name, expectedUpdatedAt: row.updated_at,
      grossCodReceivable: databaseMoney(row.gross_cod_receivable),
    }));
    const eligibleAdjustments: SettlementEligibleRejectedAdjustment[] = adjustmentsResult.data.map((row) => ({
      adjustmentId: row.adjustment_id, orderId: row.order_id, orderNumber: row.order_number,
      orderDate: row.order_date, customerName: row.customer_name, trackingCode: row.tracking_code,
      expectedCreatedAt: row.expected_created_at,
      grossCodRecovery: databaseMoney(row.gross_cod_recovery),
      courierCharge: databaseMoney(row.courier_charge),
      expectedNetAdjustment: databaseMoney(row.expected_net_adjustment),
    }));
    const recordId = await recordSteadfastSettlement(client, parsed.data, eligibleOrders, eligibleAdjustments);
    ["/cash-settlements", "/orders", "/dashboard", "/reports", "/data-checks"].forEach((path) => revalidatePath(path));
    return { ok: true, message: parsed.data.receiptTreatment === "owner_held_business_funds"
      ? "Steadfast COD settlement confirmed with exact Due-from-Owner allocations."
      : "Steadfast COD settlement confirmed with linked allocations and cash receipt.", recordId };
  } catch (error) {
    return { ok: false, message: safeSettlementError(error) };
  }
}

export async function reverseSteadfastSettlementAction(input: unknown): Promise<SettlementActionResult> {
  const parsed = settlementReversalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "A valid date and reversal reason are required.", fieldErrors: parsed.error.flatten().fieldErrors };
  if (resolveBusinessDataProvider() !== "supabase") return { ok: false, message: "Settlement reversal is unavailable in isolated mock mode." };
  const user = await requireDashboardUser();
  if (user.role !== "owner") return { ok: false, message: "Only the owner may reverse a confirmed settlement." };
  try {
    const recordId = await reverseSteadfastSettlement(await createServerSupabaseClient(), parsed.data);
    ["/cash-settlements", "/orders", "/dashboard", "/reports", "/data-checks"].forEach((path) => revalidatePath(path));
    return { ok: true, message: "Settlement receipt reversal evidence appended; affected orders returned to Awaiting.", recordId };
  } catch (error) {
    return { ok: false, message: safeSettlementError(error) };
  }
}
