"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/auth/authorization";
import { requireDashboardUser } from "@/lib/auth/session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  manualOrderSchema,
  orderTransitionSchema,
  productBusinessSchema,
  safeManualEntryError,
} from "@/domain/manual-entry";
import {
  createManualOrder,
  updateManualOrderStatuses,
  updateProductBusinessData,
} from "@/data/manual-entry-writes";

export type ManualEntryActionResult = {
  ok: boolean;
  message: string;
  recordId?: string;
  fieldErrors?: Record<string, string[]>;
};

function safeWriteError(error: unknown, duplicateLabel?: string): ManualEntryActionResult {
  return { ok: false, message: safeManualEntryError(error, duplicateLabel) };
}

function validationResult(error: { flatten(): { fieldErrors: Record<string, string[]> } }): ManualEntryActionResult {
  return { ok: false, message: "Review the highlighted values and try again.", fieldErrors: error.flatten().fieldErrors };
}

async function requirePersistentWrite(permission: "create" | "update", roles?: readonly string[]) {
  if (resolveBusinessDataProvider() !== "supabase") {
    return { error: { ok: false, message: "Persistent writes are unavailable in isolated mock mode." } as ManualEntryActionResult };
  }
  const user = await requireDashboardUser();
  if (!can(user.role, permission) || (roles && !roles.includes(user.role))) {
    return { error: { ok: false, message: "Your dashboard role is not allowed to perform this update." } as ManualEntryActionResult };
  }
  return { client: await createServerSupabaseClient() };
}

export async function createOrderAction(input: unknown): Promise<ManualEntryActionResult> {
  const parsed = manualOrderSchema.safeParse(input);
  if (!parsed.success) return validationResult(parsed.error);
  const boundary = await requirePersistentWrite("create", ["owner", "admin", "data_entry"]);
  if (boundary.error) return boundary.error;
  try {
    const orderId = await createManualOrder(boundary.client, parsed.data);
    for (const path of ["/orders", `/orders/${orderId}`, "/dashboard", "/cash-settlements", "/reports", "/data-checks"]) {
      revalidatePath(path);
    }
    return { ok: true, message: "Order saved successfully.", recordId: orderId };
  } catch (error) {
    return safeWriteError(error, "That order number already exists. Use a unique order number.");
  }
}

export async function updateOrderStatusesAction(input: unknown): Promise<ManualEntryActionResult> {
  const parsed = orderTransitionSchema.safeParse(input);
  if (!parsed.success) return validationResult(parsed.error);
  const boundary = await requirePersistentWrite("update", ["owner", "admin"]);
  if (boundary.error) return boundary.error;
  try {
    await updateManualOrderStatuses(boundary.client, parsed.data);
    for (const path of ["/orders", `/orders/${parsed.data.orderId}`, "/dashboard", "/cash-settlements", "/reports", "/data-checks"]) {
      revalidatePath(path);
    }
    return { ok: true, message: "Order, payment, and settlement statuses updated." };
  } catch (error) {
    return safeWriteError(error);
  }
}

export async function updateProductBusinessAction(input: unknown): Promise<ManualEntryActionResult> {
  const parsed = productBusinessSchema.safeParse(input);
  if (!parsed.success) return validationResult(parsed.error);
  const boundary = await requirePersistentWrite("update", ["owner", "admin"]);
  if (boundary.error) return boundary.error;
  try {
    const productId = await updateProductBusinessData(boundary.client, parsed.data);
    for (const path of ["/products", "/orders/new", "/dashboard", "/reports"]) revalidatePath(path);
    return { ok: true, message: "Private product details updated.", recordId: productId };
  } catch (error) {
    return safeWriteError(error);
  }
}
