import "server-only";

import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CashMovementValues, CashReversalValues, OwnerCapitalEditValues, OwnerMoneyTakenReversalValues, OwnerMoneyTakenValues } from "@/domain/cash";
import { moneyToDatabaseNumber, parseMoney } from "@/domain/money";

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export async function recordCashMovement(client: SupabaseClient, values: CashMovementValues) {
  const { data, error } = await client.rpc("record_dashboard_cash_movement", {
    p_movement_date: values.movementDate,
    p_transaction_type: values.transactionType,
    p_account_key: values.accountKey,
    p_amount: moneyToDatabaseNumber(parseMoney(values.amount)),
    p_description: values.description,
    p_reference: values.reference,
    p_owner_label: values.ownerLabel,
    p_idempotency_key: values.submissionKey,
  });
  if (error || !data) throw error ?? new Error("Cash movement returned no identifier.");
  return data;
}

export async function reverseCashMovement(client: SupabaseClient, values: CashReversalValues) {
  const { data, error } = await client.rpc("reverse_dashboard_cash_movement", {
    p_original_id: values.movementId,
    p_reason: values.reason,
    p_idempotency_key: values.submissionKey,
  });
  if (error || !data) throw error ?? new Error("Cash reversal returned no identifier.");
  return data;
}

export async function editOwnerCapitalMovement(client: SupabaseClient, values: OwnerCapitalEditValues) {
  const { data, error } = await client.rpc("edit_dashboard_owner_capital_movement", {
    p_original_id: values.movementId,
    p_movement_date: values.movementDate,
    p_transaction_type: values.transactionType,
    p_account_key: values.accountKey,
    p_amount: moneyToDatabaseNumber(parseMoney(values.amount)),
    p_description: values.description,
    p_reference: values.reference,
    p_owner_label: values.ownerLabel,
    p_reason: values.correctionReason,
    p_idempotency_key: values.submissionKey,
  });
  if (error || !data) throw error ?? new Error("Owner-capital correction returned no identifier.");
  return data;
}

export async function recordOwnerMoneyTaken(client: SupabaseClient, values: OwnerMoneyTakenValues) {
  const { data, error } = await client.rpc("record_owner_money_taken", {
    p_event_date: values.eventDate,
    p_owner_label: values.ownerLabel,
    p_amount: moneyToDatabaseNumber(parseMoney(values.amount)),
    p_source_account_key: values.sourceAccountKey,
    p_description: values.description,
    p_reference: values.reference,
    p_idempotency_key: values.submissionKey,
  });
  if (error || !data) throw error ?? new Error("Owner money taken returned no identifier.");
  return data;
}

export async function reverseOwnerMoneyTaken(client: SupabaseClient, values: OwnerMoneyTakenReversalValues) {
  const { data, error } = await client.rpc("reverse_owner_money_taken", {
    p_owner_money_taken_id: values.ownerMoneyTakenId,
    p_reversed_on: values.reversedOn,
    p_reason: values.reason,
    p_idempotency_key: values.submissionKey,
  });
  if (error || !data) throw error ?? new Error("Owner money taken reversal returned no identifier.");
  return data;
}
