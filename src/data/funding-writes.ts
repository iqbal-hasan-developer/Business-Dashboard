import "server-only";

import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AccountObservationValues, HistoricalFundingValues, OwnerCapitalReturnReversalValues, OwnerCapitalReturnValues, OwnerHeldObservationValues, OwnerHeldTransferReversalValues, OwnerHeldTransferValues, PayUnpaidSourceValues, ReverseSourceFundingValues, SteadfastObservationValues } from "@/domain/funding";
import { moneyToDatabaseNumber, parseMoney } from "@/domain/money";

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export async function classifyHistoricalFunding(client: SupabaseClient, values: HistoricalFundingValues) {
  const { data, error } = await client.rpc("classify_historical_financial_source", {
    p_source_type: values.sourceType,
    p_source_id: values.sourceId,
    p_funding_treatment: values.fundingTreatment,
    p_payment_date: values.paymentDate || null,
    p_business_account_key: values.businessAccountKey || null,
    p_owner_label: values.ownerLabel || null,
    p_existing_cash_movement_id: values.existingCashMovementId || null,
    p_notes: values.notes,
    p_idempotency_key: values.submissionKey,
  });
  if (error || !data) throw error ?? new Error("Historical funding classification returned no identifier.");
  return data;
}

export async function recordAccountObservation(client: SupabaseClient, values: AccountObservationValues) {
  const { data, error } = await client.rpc("record_cash_account_balance_observation", {
    p_account_key: values.accountKey,
    p_observed_on: values.observedOn,
    p_actual_balance: moneyToDatabaseNumber(parseMoney(values.actualBalance)),
    p_reason: values.reason,
    p_idempotency_key: values.submissionKey,
  });
  if (error || !data) throw error ?? new Error("Account observation returned no identifier.");
  return data;
}

export async function payUnpaidSource(client: SupabaseClient, values: PayUnpaidSourceValues) {
  const { data, error } = await client.rpc("pay_unpaid_financial_source", {
    p_source_type: values.sourceType,
    p_source_id: values.sourceId,
    p_funding_treatment: values.fundingTreatment,
    p_payment_date: values.paymentDate,
    p_business_account_key: values.businessAccountKey || null,
    p_owner_label: values.ownerLabel || null,
    p_reason: values.reason,
    p_idempotency_key: values.submissionKey,
  });
  if (error || !data) throw error ?? new Error("Source payment returned no identifier.");
  return data;
}

export async function reverseSourceFunding(client: SupabaseClient, values: ReverseSourceFundingValues) {
  const { data, error } = await client.rpc("reverse_financial_source_funding", {
    p_funding_id: values.fundingId,
    p_reversed_on: values.reversedOn,
    p_reason: values.reason,
    p_idempotency_key: values.submissionKey,
  });
  if (error || !data) throw error ?? new Error("Funding reversal returned no identifier.");
  return data;
}

export async function recordOwnerHeldTransfer(client: SupabaseClient, values: OwnerHeldTransferValues) {
  const { data, error } = await client.rpc("record_owner_held_fund_transfer", {
    p_transfer_date: values.transferDate,
    p_owner_label: values.ownerLabel,
    p_business_account_key: values.businessAccountKey,
    p_amount: moneyToDatabaseNumber(parseMoney(values.amount)),
    p_reason: values.reason,
    p_idempotency_key: values.submissionKey,
  });
  if (error || !data) throw error ?? new Error("Owner-held transfer returned no identifier.");
  return data;
}

export async function recordOwnerHeldObservation(client: SupabaseClient, values: OwnerHeldObservationValues) {
  const { data, error } = await client.rpc("record_owner_held_balance_observation", {
    p_owner_label: values.ownerLabel,
    p_observed_on: values.observedOn,
    p_actual_due: moneyToDatabaseNumber(parseMoney(values.actualDue)),
    p_reason: values.reason,
    p_idempotency_key: values.submissionKey,
  });
  if (error || !data) throw error ?? new Error("Owner-held observation returned no identifier.");
  return data;
}

export async function recordSteadfastObservation(client: SupabaseClient, values: SteadfastObservationValues) {
  const { data, error } = await client.rpc("record_steadfast_receivable_observation", {
    p_observed_on: values.observedOn,
    p_actual_receivable: moneyToDatabaseNumber(parseMoney(values.actualReceivable)),
    p_reason: values.reason,
    p_idempotency_key: values.submissionKey,
  });
  if (error || !data) throw error ?? new Error("Steadfast observation returned no identifier.");
  return data;
}

export async function recordOwnerCapitalReturn(client: SupabaseClient, values: OwnerCapitalReturnValues) {
  const { data, error } = await client.rpc("record_owner_capital_return_from_held", {
    p_return_date: values.returnDate,
    p_owner_label: values.ownerLabel,
    p_amount: moneyToDatabaseNumber(parseMoney(values.amount)),
    p_reason: values.reason,
    p_idempotency_key: values.submissionKey,
  });
  if (error || !data) throw error ?? new Error("Owner capital return returned no identifier.");
  return data;
}

export async function reverseOwnerCapitalReturn(client: SupabaseClient, values: OwnerCapitalReturnReversalValues) {
  const { data, error } = await client.rpc("reverse_owner_capital_return_from_held", {
    p_capital_return_id: values.capitalReturnId,
    p_reversed_on: values.reversedOn,
    p_reason: values.reason,
    p_idempotency_key: values.submissionKey,
  });
  if (error || !data) throw error ?? new Error("Owner capital return reversal returned no identifier.");
  return data;
}

export async function reverseOwnerHeldTransfer(client: SupabaseClient, values: OwnerHeldTransferReversalValues) {
  const { data, error } = await client.rpc("reverse_owner_held_fund_transfer", {
    p_owner_held_event_id: values.ownerHeldEventId,
    p_reversed_on: values.reversedOn,
    p_reason: values.reason,
    p_idempotency_key: values.submissionKey,
  });
  if (error || !data) throw error ?? new Error("Owner-held transfer reversal returned no identifier.");
  return data;
}
