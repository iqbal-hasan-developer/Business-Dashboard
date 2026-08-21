"use server";

import { revalidatePath } from "next/cache";
import { recordCustomerPaymentReceipt } from "@/data/customer-payment-writes";
import { customerPaymentReceiptSchema, safeCustomerPaymentReceiptError } from "@/domain/customer-payments";
import { requireDashboardUser } from "@/lib/auth/session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CustomerPaymentReceiptActionResult = {
  ok: boolean;
  message: string;
  recordId?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function recordCustomerPaymentReceiptAction(input: unknown): Promise<CustomerPaymentReceiptActionResult> {
  const parsed = customerPaymentReceiptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Review the receipt date and reference.", fieldErrors: parsed.error.flatten().fieldErrors };
  if (resolveBusinessDataProvider() !== "supabase") return { ok: false, message: "Persistent customer receipts are unavailable in isolated mock mode." };
  const user = await requireDashboardUser();
  if (!["owner", "admin"].includes(user.role)) return { ok: false, message: "Owner or admin access is required." };
  try {
    const recordId = await recordCustomerPaymentReceipt(await createServerSupabaseClient(), parsed.data);
    for (const path of [`/orders/${parsed.data.orderId}`, "/orders", "/cash-settlements", "/dashboard", "/reports", "/data-checks"]) revalidatePath(path);
    return { ok: true, message: "Customer payment receipt recorded in the linked cash account.", recordId };
  } catch (error) {
    return { ok: false, message: safeCustomerPaymentReceiptError(error) };
  }
}
