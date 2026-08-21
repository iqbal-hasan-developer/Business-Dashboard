"use server";

import { revalidatePath } from "next/cache";
import { classifyHistoricalFunding, payUnpaidSource, recordAccountObservation, recordOwnerCapitalReturn, recordOwnerHeldObservation, recordOwnerHeldTransfer, recordSteadfastObservation, reverseSourceFunding } from "@/data/funding-writes";
import { accountObservationSchema, historicalFundingSchema, ownerCapitalReturnSchema, ownerHeldObservationSchema, ownerHeldTransferSchema, payUnpaidSourceSchema, reverseSourceFundingSchema, steadfastObservationSchema } from "@/domain/funding";
import { requireDashboardUser } from "@/lib/auth/session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type FundingActionResult = { ok: boolean; message: string; fieldErrors?: Record<string, string[]> };

function validation(error: { flatten(): { fieldErrors: Record<string, string[]> } }): FundingActionResult {
  const fieldErrors = error.flatten().fieldErrors;
  return { ok: false, message: Object.values(fieldErrors).flat()[0] ?? "Review the highlighted values.", fieldErrors };
}

async function ownerBoundary() {
  if (resolveBusinessDataProvider() !== "supabase") return { error: "Reconciliation changes are unavailable in mock mode." };
  const user = await requireDashboardUser();
  if (user.role !== "owner") return { error: "Only an owner may post reconciliation evidence." };
  return { client: await createServerSupabaseClient() };
}

function refreshCash() {
  ["/cash-settlements", "/expenses", "/marketing", "/dashboard", "/data-checks"].forEach((path) => revalidatePath(path));
}

function safeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/already has an active|idempotency|duplicate/i.test(message)) return "This source already has funding evidence or this submission was already used.";
  if (/existing cash movement does not match/i.test(message)) return "The selected cash movement does not exactly match the source amount, date, account, and active direction.";
  if (/not authorized|only owners/i.test(message)) return "Only an owner may perform this reconciliation action.";
  return "No reconciliation change was posted. Review the evidence and try again.";
}

export async function classifyHistoricalFundingAction(input: unknown): Promise<FundingActionResult> {
  const parsed = historicalFundingSchema.safeParse(input);
  if (!parsed.success) return validation(parsed.error);
  const gate = await ownerBoundary();
  if (gate.error || !gate.client) return { ok: false, message: gate.error! };
  try {
    await classifyHistoricalFunding(gate.client, parsed.data);
    refreshCash();
    return { ok: true, message: "Historical funding classification posted with audit evidence." };
  } catch (error) {
    return { ok: false, message: safeMessage(error) };
  }
}

export async function recordAccountObservationAction(input: unknown): Promise<FundingActionResult> {
  const parsed = accountObservationSchema.safeParse(input);
  if (!parsed.success) return validation(parsed.error);
  const gate = await ownerBoundary();
  if (gate.error || !gate.client) return { ok: false, message: gate.error! };
  try {
    await recordAccountObservation(gate.client, parsed.data);
    refreshCash();
    return { ok: true, message: "Actual account balance recorded append-only." };
  } catch (error) {
    return { ok: false, message: safeMessage(error) };
  }
}

export async function payUnpaidSourceAction(input: unknown): Promise<FundingActionResult> {
  const parsed = payUnpaidSourceSchema.safeParse(input);
  if (!parsed.success) return validation(parsed.error);
  if (resolveBusinessDataProvider() !== "supabase") return { ok: false, message: "Source payments are unavailable in mock mode." };
  const user = await requireDashboardUser();
  if (!["owner", "admin"].includes(user.role)) return { ok: false, message: "Your dashboard role cannot post this payment." };
  try {
    await payUnpaidSource(await createServerSupabaseClient(), parsed.data);
    refreshCash();
    return { ok: true, message: "Payment posted exactly once with linked funding evidence." };
  } catch (error) {
    return { ok: false, message: safeMessage(error) };
  }
}

export async function reverseSourceFundingAction(input: unknown): Promise<FundingActionResult> {
  const parsed = reverseSourceFundingSchema.safeParse(input);
  if (!parsed.success) return validation(parsed.error);
  const gate = await ownerBoundary();
  if (gate.error || !gate.client) return { ok: false, message: gate.error! };
  try {
    await reverseSourceFunding(gate.client, parsed.data);
    refreshCash();
    return { ok: true, message: "Funding reversal appended; the original record remains in audit history." };
  } catch (error) {
    return { ok: false, message: safeMessage(error) };
  }
}

export async function recordOwnerHeldTransferAction(input: unknown): Promise<FundingActionResult> {
  const parsed = ownerHeldTransferSchema.safeParse(input);
  if (!parsed.success) return validation(parsed.error);
  if (resolveBusinessDataProvider() !== "supabase") return { ok: false, message: "Owner-held transfers are unavailable in mock mode." };
  const user = await requireDashboardUser();
  if (!["owner", "admin"].includes(user.role)) return { ok: false, message: "Your dashboard role cannot post this transfer." };
  try {
    await recordOwnerHeldTransfer(await createServerSupabaseClient(), parsed.data);
    refreshCash();
    return { ok: true, message: "Business cash was transferred to Due from Owner exactly once." };
  } catch (error) {
    return { ok: false, message: safeMessage(error) };
  }
}

export async function recordOwnerHeldObservationAction(input: unknown): Promise<FundingActionResult> {
  const parsed = ownerHeldObservationSchema.safeParse(input);
  if (!parsed.success) return validation(parsed.error);
  const gate = await ownerBoundary();
  if (gate.error || !gate.client) return { ok: false, message: gate.error! };
  try {
    await recordOwnerHeldObservation(gate.client, parsed.data);
    refreshCash();
    return { ok: true, message: "Due from Owner control balance recorded without changing the ledger." };
  } catch (error) {
    return { ok: false, message: safeMessage(error) };
  }
}

export async function recordSteadfastObservationAction(input: unknown): Promise<FundingActionResult> {
  const parsed = steadfastObservationSchema.safeParse(input);
  if (!parsed.success) return validation(parsed.error);
  const gate = await ownerBoundary();
  if (gate.error || !gate.client) return { ok: false, message: gate.error! };
  try {
    await recordSteadfastObservation(gate.client, parsed.data);
    refreshCash();
    return { ok: true, message: "Steadfast control balance recorded without rewriting orders or settlements." };
  } catch (error) {
    return { ok: false, message: safeMessage(error) };
  }
}

export async function recordOwnerCapitalReturnAction(input: unknown): Promise<FundingActionResult> {
  const parsed = ownerCapitalReturnSchema.safeParse(input);
  if (!parsed.success) return validation(parsed.error);
  const gate = await ownerBoundary();
  if (gate.error || !gate.client) return { ok: false, message: gate.error! };
  try {
    await recordOwnerCapitalReturn(gate.client, parsed.data);
    refreshCash();
    return { ok: true, message: "Capital return posted against Due from Owner without affecting profit or cash." };
  } catch (error) {
    return { ok: false, message: safeMessage(error) };
  }
}
