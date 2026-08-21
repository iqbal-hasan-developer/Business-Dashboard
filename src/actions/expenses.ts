"use server";

import { revalidatePath } from "next/cache";
import { deleteExpense, editExpense } from "@/data/expense-writes";
import { deleteExpenseSchema, editExpenseSchema, safeExpenseError } from "@/domain/expenses";
import { requireDashboardUser } from "@/lib/auth/session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ExpenseActionResult = { ok: boolean; message: string; fieldErrors?: Record<string, string[]> };

const validation = (error: { flatten(): { fieldErrors: Record<string, string[]> } }): ExpenseActionResult => {
  const fieldErrors = error.flatten().fieldErrors;
  return { ok: false, message: Object.values(fieldErrors).flat()[0] ?? "Review the highlighted values and try again.", fieldErrors };
};

function refreshExpenses() {
  ["/expenses", "/dashboard", "/reports", "/data-checks"].forEach((path) => revalidatePath(path));
}

async function boundary(roles: string[]) {
  if (resolveBusinessDataProvider() !== "supabase") return { error: "Persistent expense changes are unavailable in mock mode." };
  const user = await requireDashboardUser();
  if (!roles.includes(user.role)) return { error: "Your dashboard role cannot perform this action." };
  return { client: await createServerSupabaseClient() };
}

export async function editExpenseAction(input: unknown): Promise<ExpenseActionResult> {
  const parsed = editExpenseSchema.safeParse(input);
  if (!parsed.success) return validation(parsed.error);
  const gate = await boundary(["owner", "admin"]);
  if (gate.error || !gate.client) return { ok: false, message: gate.error! };
  try {
    await editExpense(gate.client, parsed.data);
    refreshExpenses();
    return { ok: true, message: "Expense updated and added to audit history." };
  } catch (error) {
    return { ok: false, message: safeExpenseError(error) };
  }
}

export async function deleteExpenseAction(input: unknown): Promise<ExpenseActionResult> {
  const parsed = deleteExpenseSchema.safeParse(input);
  if (!parsed.success) return validation(parsed.error);
  const gate = await boundary(["owner"]);
  if (gate.error || !gate.client) return { ok: false, message: gate.error! };
  try {
    await deleteExpense(gate.client, parsed.data);
    refreshExpenses();
    return { ok: true, message: "Expense deleted and preserved in audit history." };
  } catch (error) {
    return { ok: false, message: safeExpenseError(error) };
  }
}
