"use server";

import { revalidatePath } from "next/cache";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  adSpendEntrySchema,
  campaignEntrySchema,
  expenseEntrySchema,
  manualOrderSchema,
  manualOrderEditSchema,
  orderTransitionSchema,
  productBusinessSchema,
  productCatalogSchema,
  safeManualEntryError,
} from "@/domain/manual-entry";
import {
  createProductCatalogEntry,
  createManualOrder,
  updateManualOrder,
  recordAdSpendEntry,
  recordExpenseEntry,
  updateProductCatalogEntry,
  updateManualOrderStatuses,
  updateProductBusinessData,
  upsertCampaignEntry,
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

function revalidate(paths: string[]) { paths.forEach((path) => revalidatePath(path)); }

export async function saveProductAction(input: unknown): Promise<ManualEntryActionResult> {
  const parsed = productCatalogSchema.safeParse(input);
  if (!parsed.success) return validationResult(parsed.error);
  const boundary = await requirePersistentWrite();
  if (boundary.error) return boundary.error;
  try {
    const productId = parsed.data.productId
      ? await updateProductCatalogEntry(boundary.client, parsed.data)
      : await createProductCatalogEntry(boundary.client, parsed.data);
    revalidate(["/products", "/orders/new", "/dashboard", "/reports", "/data-checks"]);
    return { ok: true, message: parsed.data.productId ? "Product updated successfully." : "Product created successfully.", recordId: productId };
  } catch (error) {
    return safeWriteError(error, "That slug, public SKU, or dashboard SKU already exists.");
  }
}

export async function recordExpenseAction(input: unknown): Promise<ManualEntryActionResult> {
  const parsed = expenseEntrySchema.safeParse(input);
  if (!parsed.success) return validationResult(parsed.error);
  const boundary = await requirePersistentWrite();
  if (boundary.error) return boundary.error;
  try {
    const recordId = await recordExpenseEntry(boundary.client, parsed.data);
    revalidate(["/expenses", "/dashboard", "/reports"]);
    return { ok: true, message: "Expense recorded successfully.", recordId };
  } catch (error) { return safeWriteError(error); }
}

export async function saveCampaignAction(input: unknown): Promise<ManualEntryActionResult> {
  const parsed = campaignEntrySchema.safeParse(input);
  if (!parsed.success) return validationResult(parsed.error);
  const boundary = await requirePersistentWrite();
  if (boundary.error) return boundary.error;
  try {
    const recordId = await upsertCampaignEntry(boundary.client, parsed.data);
    revalidate(["/marketing", "/dashboard", "/reports"]);
    return { ok: true, message: "Campaign saved successfully.", recordId };
  } catch (error) { return safeWriteError(error); }
}

export async function recordAdSpendAction(input: unknown): Promise<ManualEntryActionResult> {
  const parsed = adSpendEntrySchema.safeParse(input);
  if (!parsed.success) return validationResult(parsed.error);
  const boundary = await requirePersistentWrite();
  if (boundary.error) return boundary.error;
  try {
    const recordId = await recordAdSpendEntry(boundary.client, parsed.data);
    revalidate(["/marketing", "/dashboard", "/reports"]);
    return { ok: true, message: "Advertising spend recorded successfully.", recordId };
  } catch (error) { return safeWriteError(error); }
}

function validationResult(error: { flatten(): { fieldErrors: Record<string, string[]> } }): ManualEntryActionResult {
  return { ok: false, message: "Review the highlighted values and try again.", fieldErrors: error.flatten().fieldErrors };
}

type PersistentWriteBoundary =
  | { error: ManualEntryActionResult; client?: never }
  | { error?: never; client: Awaited<ReturnType<typeof createServerSupabaseClient>> };

async function requirePersistentWrite(): Promise<PersistentWriteBoundary> {
  const message = resolveBusinessDataProvider() === "supabase"
    ? "This legacy action is unavailable in workspace mode. Use the workspace-scoped control."
    : "Persistent writes are unavailable in isolated mock mode.";
  return { error: { ok: false, message } as ManualEntryActionResult };
}

export async function createOrderAction(input: unknown): Promise<ManualEntryActionResult> {
  const parsed = manualOrderSchema.safeParse(input);
  if (!parsed.success) return validationResult(parsed.error);
  const boundary = await requirePersistentWrite();
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

export async function updateOrderAction(input: unknown): Promise<ManualEntryActionResult> {
  const parsed = manualOrderEditSchema.safeParse(input);
  if (!parsed.success) return validationResult(parsed.error);
  const boundary = await requirePersistentWrite();
  if (boundary.error) return boundary.error;
  try {
    const orderId = await updateManualOrder(boundary.client, parsed.data);
    for (const path of ["/orders", `/orders/${orderId}`, `/orders/${orderId}/edit`, "/dashboard", "/reports", "/data-checks"]) {
      revalidatePath(path);
    }
    return { ok: true, message: "Order updated successfully.", recordId: orderId };
  } catch (error) {
    return safeWriteError(error, "A duplicate order number prevents this update.");
  }
}

export async function updateOrderStatusesAction(input: unknown): Promise<ManualEntryActionResult> {
  const parsed = orderTransitionSchema.safeParse(input);
  if (!parsed.success) return validationResult(parsed.error);
  const boundary = await requirePersistentWrite();
  if (boundary.error) return boundary.error;
  try {
    await updateManualOrderStatuses(boundary.client, parsed.data);
    for (const path of ["/orders", `/orders/${parsed.data.orderId}`, "/dashboard", "/cash-settlements", "/reports", "/data-checks"]) {
      revalidatePath(path);
    }
    return { ok: true, message: "Order and payment statuses updated. Settlement status remains evidence-controlled." };
  } catch (error) {
    return safeWriteError(error);
  }
}

export async function updateProductBusinessAction(input: unknown): Promise<ManualEntryActionResult> {
  const parsed = productBusinessSchema.safeParse(input);
  if (!parsed.success) return validationResult(parsed.error);
  const boundary = await requirePersistentWrite();
  if (boundary.error) return boundary.error;
  try {
    const productId = await updateProductBusinessData(boundary.client, parsed.data);
    for (const path of ["/products", "/orders/new", "/dashboard", "/reports"]) revalidatePath(path);
    return { ok: true, message: "Private product details updated.", recordId: productId };
  } catch (error) {
    return safeWriteError(error);
  }
}
