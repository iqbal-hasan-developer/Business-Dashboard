"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asUniversalClient, requireWorkspaceSession } from "@/lib/auth/workspace-session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string) {
  const result = formData.get(key);
  return typeof result === "string" ? result.trim() : "";
}
function amount(formData: FormData, key: string) {
  const text = value(formData, key);
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(text)) throw new Error("Enter a valid non-negative amount.");
  return Number(text);
}
function canManage(role: string) { return ["owner", "admin", "manager"].includes(role); }

export async function saveWorkspaceProduct(formData: FormData) {
  const session = await requireWorkspaceSession();
  if (!canManage(session.activeWorkspace.role)) throw new Error("Catalog manager access is required.");
  const name = value(formData, "name");
  const price = amount(formData, "price");
  const cost = value(formData, "cost_price");
  const reorder = value(formData, "reorder_level") || "0";
  if (!name || name.length > 500 || !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(reorder)) throw new Error("Product values are invalid.");
  const supabase = asUniversalClient(await createServerSupabaseClient());
  const { error } = await supabase.rpc("save_workspace_product", {
    p_workspace_id: session.activeWorkspace.id,
    p_product_id: value(formData, "product_id") || null,
    p_variant_id: value(formData, "variant_id") || null,
    p_name: name,
    p_description: value(formData, "description") || null,
    p_sku: value(formData, "sku") || null,
    p_category: value(formData, "category") || null,
    p_brand: value(formData, "brand") || null,
    p_image_urls: value(formData, "image_url") ? [value(formData, "image_url")] : [],
    p_status: value(formData, "status") || "active",
    p_currency: value(formData, "currency") || "BDT",
    p_price: price,
    p_cost_price: cost ? amount(formData, "cost_price") : null,
    p_barcode: value(formData, "barcode") || null,
    p_variant_name: value(formData, "variant_name") || "Default",
    p_attributes: {},
    p_reorder_level: Number(reorder),
  });
  if (error) throw new Error("Product could not be saved.");
  revalidatePath("/products");
  revalidatePath("/inventory");
  redirect("/products?notice=product-saved");
}

export async function archiveWorkspaceProduct(formData: FormData) {
  const session = await requireWorkspaceSession();
  if (!canManage(session.activeWorkspace.role)) throw new Error("Catalog manager access is required.");
  const supabase = asUniversalClient(await createServerSupabaseClient());
  const { error } = await supabase.rpc("archive_workspace_product", {
    p_workspace_id: session.activeWorkspace.id,
    p_product_id: value(formData, "product_id"),
  });
  if (error) throw new Error("Product could not be archived.");
  revalidatePath("/products");
  revalidatePath("/inventory");
  redirect("/products?notice=product-archived");
}

export async function updateWorkspaceOrderStatus(formData: FormData) {
  const session = await requireWorkspaceSession();
  if (session.activeWorkspace.role === "viewer") throw new Error("Order manager access is required.");
  const status = value(formData, "status");
  const paymentStatus = value(formData, "payment_status");
  const validStatuses = ["pending", "confirmed", "processing", "fulfilled", "cancelled", "returned", "refunded", "partially_refunded"];
  const validPayments = ["pending", "authorized", "partially_paid", "paid", "partially_refunded", "refunded", "failed"];
  if (!validStatuses.includes(status) || !validPayments.includes(paymentStatus)) throw new Error("Order status is invalid.");
  const supabase = asUniversalClient(await createServerSupabaseClient());
  const { error } = await supabase.rpc("set_workspace_order_status", {
    p_workspace_id: session.activeWorkspace.id,
    p_order_id: value(formData, "order_id"),
    p_status: status,
    p_payment_status: paymentStatus,
  });
  if (error) throw new Error("Order status could not be updated.");
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  redirect("/orders?notice=order-updated");
}

export async function recordWorkspaceRefund(formData: FormData) {
  const session = await requireWorkspaceSession();
  if (!canManage(session.activeWorkspace.role)) throw new Error("Refund recording requires manager access.");
  const reason = value(formData, "reason");
  if (!reason || reason.length > 500) throw new Error("A refund reason is required.");
  const supabase = asUniversalClient(await createServerSupabaseClient());
  const { error } = await supabase.rpc("record_workspace_refund", {
    p_workspace_id: session.activeWorkspace.id,
    p_order_id: value(formData, "order_id"),
    p_amount: amount(formData, "amount"),
    p_reason: reason,
  });
  if (error) throw new Error("Refund could not be recorded.");
  revalidatePath("/orders");
  revalidatePath("/customers");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  redirect("/orders?notice=refund-recorded");
}

export async function saveWorkspaceCustomerNotes(formData: FormData) {
  const session = await requireWorkspaceSession();
  if (!canManage(session.activeWorkspace.role)) throw new Error("Customer notes require manager access.");
  const notes = value(formData, "notes");
  if (notes.length > 2000) throw new Error("Customer notes are too long.");
  const supabase = asUniversalClient(await createServerSupabaseClient());
  const { error } = await supabase.rpc("save_workspace_customer_notes", {
    p_workspace_id: session.activeWorkspace.id,
    p_customer_id: value(formData, "customer_id"),
    p_notes: notes || null,
  });
  if (error) throw new Error("Customer notes could not be saved.");
  revalidatePath("/customers");
  redirect("/customers?notice=customer-notes-saved");
}

export async function createWorkspaceOrder(formData: FormData) {
  const session = await requireWorkspaceSession();
  if (session.activeWorkspace.role === "viewer") throw new Error("Order entry access is required.");
  const quantity = value(formData, "quantity");
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(quantity) || Number(quantity) <= 0) throw new Error("Enter a valid item quantity.");
  const unitPrice = value(formData, "unit_price");
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(unitPrice)) throw new Error("Enter a valid unit price.");
  const supabase = asUniversalClient(await createServerSupabaseClient());
  const { error } = await supabase.rpc("create_workspace_order", {
    p_workspace_id: session.activeWorkspace.id,
    p_store_id: value(formData, "store_id"),
    p_order_number: value(formData, "order_number"),
    p_customer_name: value(formData, "customer_name"),
    p_customer_phone: value(formData, "customer_phone") || null,
    p_customer_address: { address: value(formData, "customer_address") },
    p_payment_method: value(formData, "payment_method") || null,
    p_items: [{ variant_id: value(formData, "variant_id"), quantity: Number(quantity), unit_price: Number(unitPrice) }],
    p_discount: amount(formData, "discount"),
    p_shipping_total: amount(formData, "shipping_total"),
    p_shipping_cost: amount(formData, "shipping_cost"),
    p_tax_total: amount(formData, "tax_total"),
  });
  if (error) throw new Error("Order could not be created. Check that the store, product, and amounts are valid.");
  for (const path of ["/orders", "/customers", "/inventory", "/dashboard", "/reports"]) revalidatePath(path);
  redirect("/orders?notice=order-created");
}

export async function adjustWorkspaceInventory(formData: FormData) {
  const session = await requireWorkspaceSession();
  if (!canManage(session.activeWorkspace.role)) throw new Error("Inventory manager access is required.");
  const deltaText = value(formData, "quantity_delta");
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(deltaText) || Number(deltaText) === 0) throw new Error("Enter a non-zero stock adjustment.");
  const reason = value(formData, "reason");
  if (!reason || reason.length > 500) throw new Error("A short adjustment reason is required.");
  const supabase = asUniversalClient(await createServerSupabaseClient());
  const { error } = await supabase.rpc("adjust_workspace_inventory", {
    p_workspace_id: session.activeWorkspace.id,
    p_store_id: value(formData, "store_id"),
    p_variant_id: value(formData, "variant_id"),
    p_quantity_delta: Number(deltaText),
    p_idempotency_key: crypto.randomUUID(),
    p_reason: reason,
  });
  if (error) throw new Error("Inventory could not be adjusted.");
  revalidatePath("/inventory");
  revalidatePath("/products");
  redirect("/inventory?notice=stock-adjusted");
}

export async function createWorkspaceExpense(formData: FormData) {
  const session = await requireWorkspaceSession();
  if (!canManage(session.activeWorkspace.role)) throw new Error("Expense manager access is required.");
  const date = value(formData, "expense_date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Enter a valid expense date.");
  const supabase = asUniversalClient(await createServerSupabaseClient());
  const { error } = await supabase.rpc("save_workspace_expense", {
    p_workspace_id: session.activeWorkspace.id,
    p_expense_id: value(formData, "expense_id") || null,
    p_category: value(formData, "category"),
    p_description: value(formData, "description"),
    p_amount: amount(formData, "amount"),
    p_currency: value(formData, "currency") || "BDT",
    p_expense_date: date,
    p_status: value(formData, "status") || "paid",
    p_accounting_class: value(formData, "accounting_class") || "operating_expense",
    p_payment_method: value(formData, "payment_method") || null,
    p_receipt_reference: value(formData, "receipt_reference") || null,
    p_notes: value(formData, "notes") || null,
  });
  if (error) throw new Error("Expense could not be saved.");
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  redirect("/expenses?notice=expense-saved");
}
