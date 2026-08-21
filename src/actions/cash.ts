"use server";

import { revalidatePath } from "next/cache";
import { editOwnerCapitalMovement, recordCashMovement, recordOwnerMoneyTaken, reverseCashMovement, reverseOwnerMoneyTaken } from "@/data/cash-writes";
import { cashMovementSchema, cashReversalSchema, ownerCapitalEditSchema, ownerMoneyTakenReversalSchema, ownerMoneyTakenSchema, safeCashError } from "@/domain/cash";
import { requireDashboardUser } from "@/lib/auth/session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CashActionResult = {
  ok: boolean;
  message: string;
  recordId?: string;
  fieldErrors?: Record<string, string[]>;
};

function revalidateCash() {
  for (const path of ["/cash-settlements", "/dashboard", "/reports", "/data-checks"]) revalidatePath(path);
}

export async function recordCashMovementAction(input: unknown): Promise<CashActionResult> {
  const parsed = cashMovementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Review the highlighted cash values and try again.", fieldErrors: parsed.error.flatten().fieldErrors };
  if (resolveBusinessDataProvider() !== "supabase") return { ok: false, message: "Persistent cash entries are unavailable in isolated mock mode." };
  const user = await requireDashboardUser();
  if (!["owner", "admin"].includes(user.role)) return { ok: false, message: "Owner or admin access is required to record cash movements." };
  try {
    const recordId = await recordCashMovement(await createServerSupabaseClient(), parsed.data);
    revalidateCash();
    return { ok: true, message: "Cash movement recorded in the append-only ledger.", recordId };
  } catch (error) {
    return { ok: false, message: safeCashError(error) };
  }
}

export async function reverseCashMovementAction(input: unknown): Promise<CashActionResult> {
  const parsed = cashReversalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "A valid entry and reversal reason are required.", fieldErrors: parsed.error.flatten().fieldErrors };
  if (resolveBusinessDataProvider() !== "supabase") return { ok: false, message: "Cash reversal is unavailable in isolated mock mode." };
  const user = await requireDashboardUser();
  if (user.role !== "owner") return { ok: false, message: "Only the owner may reverse a cash entry." };
  try {
    const recordId = await reverseCashMovement(await createServerSupabaseClient(), parsed.data);
    revalidateCash();
    return { ok: true, message: "A reversing entry was appended. The original record remains unchanged.", recordId };
  } catch (error) {
    return { ok: false, message: safeCashError(error) };
  }
}

export async function editOwnerCapitalMovementAction(input: unknown): Promise<CashActionResult> {
  const parsed = ownerCapitalEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Review the highlighted owner-capital values and try again.", fieldErrors: parsed.error.flatten().fieldErrors };
  if (resolveBusinessDataProvider() !== "supabase") return { ok: false, message: "Owner-capital editing is unavailable in isolated mock mode." };
  const user = await requireDashboardUser();
  if (user.role !== "owner") return { ok: false, message: "Only the owner may edit an owner-capital record." };
  try {
    const recordId = await editOwnerCapitalMovement(await createServerSupabaseClient(), parsed.data);
    revalidateCash();
    return { ok: true, message: "The corrected owner-capital record replaced the original in active totals.", recordId };
  } catch (error) {
    return { ok: false, message: safeCashError(error) };
  }
}

export async function deleteOwnerCapitalMovementAction(input: unknown): Promise<CashActionResult> {
  const parsed = cashReversalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "A valid owner-capital record and deletion reason are required.", fieldErrors: parsed.error.flatten().fieldErrors };
  if (resolveBusinessDataProvider() !== "supabase") return { ok: false, message: "Owner-capital deletion is unavailable in isolated mock mode." };
  const user = await requireDashboardUser();
  if (user.role !== "owner") return { ok: false, message: "Only the owner may delete an owner-capital record." };
  try {
    const recordId = await reverseCashMovement(await createServerSupabaseClient(), parsed.data);
    revalidateCash();
    return { ok: true, message: "The record was removed from active owner capital and preserved in audit history.", recordId };
  } catch (error) {
    return { ok: false, message: safeCashError(error) };
  }
}

export async function recordOwnerMoneyTakenAction(input: unknown): Promise<CashActionResult> {
  const parsed = ownerMoneyTakenSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Review the highlighted owner-money-taken values.", fieldErrors: parsed.error.flatten().fieldErrors };
  if (resolveBusinessDataProvider() !== "supabase") return { ok: false, message: "Owner-money-taken posting is unavailable in mock mode." };
  const user = await requireDashboardUser();
  if (!["owner", "admin"].includes(user.role)) return { ok: false, message: "Owner or admin access is required." };
  try {
    const recordId = await recordOwnerMoneyTaken(await createServerSupabaseClient(), parsed.data);
    revalidateCash();
    return { ok: true, message: "Cash, capital return, and Due from Owner were posted atomically.", recordId };
  } catch (error) {
    return { ok: false, message: safeCashError(error) };
  }
}

export async function reverseOwnerMoneyTakenAction(input: unknown): Promise<CashActionResult> {
  const parsed = ownerMoneyTakenReversalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "A valid event, date, and reversal reason are required.", fieldErrors: parsed.error.flatten().fieldErrors };
  if (resolveBusinessDataProvider() !== "supabase") return { ok: false, message: "Owner-money-taken reversal is unavailable in mock mode." };
  const user = await requireDashboardUser();
  if (user.role !== "owner") return { ok: false, message: "Only the owner may reverse this transaction." };
  try {
    const recordId = await reverseOwnerMoneyTaken(await createServerSupabaseClient(), parsed.data);
    revalidateCash();
    return { ok: true, message: "Linked cash, capital, and Due effects were reversed exactly.", recordId };
  } catch (error) {
    return { ok: false, message: safeCashError(error) };
  }
}
