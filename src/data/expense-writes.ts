import "server-only";

import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { DeleteExpenseValues, EditExpenseValues } from "@/domain/expenses";
import { moneyToDatabaseNumber, parseMoney } from "@/domain/money";

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;
const optional = (value: string) => value || null;

export async function editExpense(client: SupabaseClient, values: EditExpenseValues) {
  const { data, error } = await client.rpc("edit_dashboard_expense", {
    p_expense_id: values.expenseId,
    p_expense_date: values.expenseDate,
    p_category_key: values.categoryKey,
    p_description: values.description,
    p_amount: moneyToDatabaseNumber(parseMoney(values.amount)),
    p_payment_method: optional(values.paymentMethod),
    p_campaign_id: values.campaignId,
    p_sales_channel: optional(values.salesChannel),
    p_reference: optional(values.reference),
    p_reason: values.reason,
    p_expected_updated_at: values.expectedUpdatedAt,
  });
  if (error || !data) throw error ?? new Error("Expense update returned no identifier.");
  return data;
}

export async function deleteExpense(client: SupabaseClient, values: DeleteExpenseValues) {
  const { data, error } = await client.rpc("delete_dashboard_expense", {
    p_expense_id: values.expenseId,
    p_reason: values.reason,
    p_expected_updated_at: values.expectedUpdatedAt,
  });
  if (error || !data) throw error ?? new Error("Expense deletion returned no identifier.");
  return data;
}
