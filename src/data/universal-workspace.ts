import "server-only";

import { asUniversalClient, requireWorkspaceSession } from "@/lib/auth/workspace-session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { workspaceCanManageMembers } from "@/lib/auth/workspace-session";
import { readWorkspaceOverview, type WorkspaceOverview } from "@/domain/workspace-overview";

export type { WorkspaceOverview } from "@/domain/workspace-overview";

export async function getCurrentWorkspaceOverview(): Promise<WorkspaceOverview> {
  const session = await requireWorkspaceSession();
  const supabase = asUniversalClient(await createServerSupabaseClient());
  return readWorkspaceOverview({
    async count(table, workspaceId) {
      const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
      if (error) throw new Error("Workspace data could not be loaded.");
      return count ?? 0;
    },
  }, session.activeWorkspace.id, session.activeWorkspace.name, session.activeWorkspace.role);
}

export async function getCurrentWorkspaceReportingMetrics(startDate: string, endDate: string) {
  const session = await requireWorkspaceSession();
  if (!['owner', 'admin'].includes(session.activeWorkspace.role)) return { session, metrics: null };
  const supabase = asUniversalClient(await createServerSupabaseClient());
  const { data, error } = await supabase.rpc("workspace_reporting_metrics", {
    p_workspace_id: session.activeWorkspace.id,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) throw new Error("Workspace financial reporting could not be loaded.");
  return { session, metrics: data as WorkspaceReportingMetrics };
}

export type WorkspaceReportingMetrics = {
  totals: Array<{
    currency: string; orders: number; average_order_value: number; missing_revenue_orders: number; missing_cogs_orders: number;
    missing_refund_orders: number; missing_shipping_cost_orders: number; revenue: number;
    discounts: number; refunds: number; cogs: number; shipping_income: number;
    shipping_cost: number; fees: number; expenses: number; gross_profit: number | null; net_profit: number | null;
  }>;
  daily_revenue: Array<{ date: string; currency: string; revenue: number }>;
  best_sellers: Array<{ name: string; quantity: number; sales: number; currency: string }>;
  low_stock_count: number;
  customer_growth: Array<{ date: string; customers: number }>;
  recent_orders: Array<{ order_number: string; status: string; payment_status: string; currency: string; total: number; placed_at: string }>;
};

export type WorkspaceMember = { user_id: string; email: string | null; role: string; is_active: boolean; created_at: string };
export type PendingWorkspaceInvitation = { id: string; invited_email: string; role: string; expires_at: string; created_at: string };

export async function getCurrentWorkspaceManagementData() {
  const session = await requireWorkspaceSession();
  const supabase = asUniversalClient(await createServerSupabaseClient());
  const memberResult = await supabase.rpc("list_workspace_members", { p_workspace_id: session.activeWorkspace.id });
  if (memberResult.error) throw new Error("Workspace members could not be loaded.");
  let invitations: PendingWorkspaceInvitation[] = [];
  if (workspaceCanManageMembers(session.activeWorkspace.role)) {
    const invitationResult = await supabase.from("workspace_invitations")
      .select("id,invited_email,role,expires_at,created_at")
      .eq("workspace_id", session.activeWorkspace.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (invitationResult.error) throw new Error("Workspace invitations could not be loaded.");
    invitations = invitationResult.data ?? [];
  }
  return { session, members: memberResult.data as WorkspaceMember[], invitations };
}

export type WorkspaceCommerceList = "products" | "orders" | "customers" | "inventory" | "expenses";
export type WorkspaceCommerceListOptions = {
  list?: WorkspaceCommerceList; q?: string; page?: string | number; status?: string; sort?: string; direction?: string;
  category?: string; paymentStatus?: string; startDate?: string; endDate?: string; minAmount?: string; maxAmount?: string; activity?: string;
  stockStatus?: string; minStock?: string; maxStock?: string; customer?: string; customerId?: string; storeId?: string; minOrders?: string; maxOrders?: string;
};
type PaginatedQuery = {
  or(filters: string): PaginatedQuery;
  ilike(column: string, pattern: string): PaginatedQuery;
  eq(column: string, value: string): PaginatedQuery;
  gte(column: string, value: string | number): PaginatedQuery;
  lte(column: string, value: string | number): PaginatedQuery;
  is(column: string, value: null): PaginatedQuery;
  not(column: string, operator: string, value: string): PaginatedQuery;
  order(column: string, options: { ascending: boolean }): PaginatedQuery;
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; count: number | null; error: unknown }>;
};
const COMMERCE_PAGE_SIZE = 25;
const sortColumns: Record<WorkspaceCommerceList, Record<string, string>> = {
  products: { updated: "updated_at", name: "name", sku: "sku", price: "price", stock: "stock_quantity" },
  orders: { date: "placed_at", number: "order_number", total: "total" },
  customers: { activity: "last_seen_at", name: "full_name", created: "created_at" },
  inventory: { name: "name", sku: "sku", price: "price", stock: "stock_quantity" },
  expenses: { date: "expense_date", amount: "amount", category: "category" },
};
type ProductListRow = { id: string; name: string; sku: string | null; category: string | null; brand: string | null; image_urls: string[]; status: string; currency: string; price: number | null; created_at: string; updated_at: string; stock_quantity: number | null; tracked_variant_count: number; stock_status: string };
type VariantListRow = { id: string; product_id: string; sku: string | null; barcode: string | null; name: string; attributes: Record<string, unknown>; currency: string; price: number; reorder_level: number; product_name?: string; category?: string | null; tracked_store_count?: number; stock_quantity?: number | null; low_stock_store_count?: number; stock_status?: string };
type OrderListRow = { id: string; store_id: string; customer_id: string | null; order_number: string; status: string; payment_status: string; fulfillment_status: string; payment_method: string | null; currency: string; total: number; refund_total: number; customer_name_snapshot: string | null; customer_phone_snapshot: string | null; placed_at: string };
type CustomerListRow = { id: string; full_name: string; email: string | null; phone: string | null; notes: string | null; first_seen_at: string; last_seen_at: string; order_count?: number };
type ExpenseListRow = { id: string; category: string; description: string; amount: number; currency: string; expense_date: string; status: string; accounting_class: string; payment_method: string | null; receipt_reference: string | null; notes: string | null };

function searchTerm(value: string) {
  return value.trim().slice(0, 100).replace(/[\\%_(),."]/g, "\\$&");
}

export function normalizeCommercePage(value: string | number | undefined) {
  const page = Number.parseInt(String(value ?? "1"), 10);
  return Math.max(1, Math.min(10000, Number.isFinite(page) ? page : 1));
}

export function escapeCommerceSearch(value: string) {
  return searchTerm(value);
}

export function normalizeCommerceDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

export function normalizeCommerceAmount(value: string | undefined) {
  return value && /^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/.test(value) ? value : null;
}

export function normalizeCommerceRange(min: string | undefined, max: string | undefined) {
  const lower = normalizeCommerceAmount(min); const upper = normalizeCommerceAmount(max);
  return lower && upper && Number(lower) > Number(upper) ? { min: null, max: null } : { min: lower, max: upper };
}

export function normalizeCommerceDateRange(startValue: string | undefined, endValue: string | undefined) {
  const start = normalizeCommerceDate(startValue); const end = normalizeCommerceDate(endValue);
  return start && end && start > end ? { start: null, end: null } : { start, end };
}

export function normalizeCommerceIntegerRange(minimum: string | undefined, maximum: string | undefined) {
  const parse = (value: string | undefined) => value && /^(?:0|[1-9]\d{0,6})$/.test(value) ? Number(value) : null;
  const min = parse(minimum); const max = parse(maximum);
  return min !== null && max !== null && min > max ? { min: null, max: null } : { min, max };
}

export function normalizeCommerceId(value: string | undefined) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

export function normalizeCommerceSort(list: WorkspaceCommerceList, sort: string | undefined, direction: string | undefined) {
  const allowed = sortColumns[list];
  const key = Object.hasOwn(allowed, sort ?? "") ? sort! : Object.keys(allowed)[0];
  const defaultDirection = list === "inventory" ? "asc" : "desc";
  return { key, column: allowed[key], direction: direction === "asc" || direction === "desc" ? direction : defaultDirection };
}

export async function getCurrentWorkspaceCommerceData(options: WorkspaceCommerceListOptions = {}) {
  const session = await requireWorkspaceSession();
  const supabase = asUniversalClient(await createServerSupabaseClient());
  const workspaceId = session.activeWorkspace.id;
  const list = options.list;
  const q = searchTerm(options.q ?? "");
  const requestedPage = normalizeCommercePage(options.page);
  const from = (requestedPage - 1) * COMMERCE_PAGE_SIZE;
  const to = from + COMMERCE_PAGE_SIZE - 1;
  let listQuery: PaginatedQuery | null = null;
  if (list === "products") {
    listQuery = supabase.from("workspace_product_stock").select("id,name,sku,category,brand,image_urls,status,currency,price,created_at,updated_at,stock_quantity,tracked_variant_count,stock_status", { count: "exact" })
      .eq("workspace_id", workspaceId);
    if (q) listQuery = listQuery.or(`name.ilike."%${q}%",sku.ilike."%${q}%"`);
    if (["active", "draft", "archived"].includes(options.status ?? "")) listQuery = listQuery.eq("status", options.status!);
    if (options.category?.trim()) listQuery = listQuery.eq("category", options.category.trim().slice(0, 120));
    const range = normalizeCommerceRange(options.minAmount, options.maxAmount);
    if (range.min) listQuery = listQuery.gte("price", range.min);
    if (range.max) listQuery = listQuery.lte("price", range.max);
    if (["in_stock", "low_stock", "out_of_stock", "untracked"].includes(options.stockStatus ?? "")) listQuery = listQuery.eq("stock_status", options.stockStatus!);
    const stockRange = normalizeCommerceRange(options.minStock, options.maxStock);
    if (stockRange.min) listQuery = listQuery.gte("stock_quantity", stockRange.min);
    if (stockRange.max) listQuery = listQuery.lte("stock_quantity", stockRange.max);
  } else if (list === "orders") {
    listQuery = supabase.from("workspace_order_list").select("id,store_id,customer_id,customer_name,order_number,status,payment_status,fulfillment_status,payment_method,currency,total,refund_total,customer_name_snapshot,customer_phone_snapshot,placed_at", { count: "exact" })
      .eq("workspace_id", workspaceId);
    if (q) listQuery = listQuery.or(`order_number.ilike."%${q}%",customer_name_snapshot.ilike."%${q}%",customer_phone_snapshot.ilike."%${q}%"`);
    if (["pending", "confirmed", "processing", "fulfilled", "cancelled", "returned", "refunded", "partially_refunded"].includes(options.status ?? "")) listQuery = listQuery.eq("status", options.status!);
    if (["pending", "authorized", "partially_paid", "paid", "partially_refunded", "refunded", "failed"].includes(options.paymentStatus ?? "")) listQuery = listQuery.eq("payment_status", options.paymentStatus!);
    const customerId = normalizeCommerceId(options.customerId);
    const storeId = normalizeCommerceId(options.storeId);
    if (customerId) listQuery = listQuery.eq("customer_id", customerId);
    if (storeId) listQuery = listQuery.eq("store_id", storeId);
    const customer = searchTerm(options.customer ?? "");
    if (customer) listQuery = listQuery.ilike("customer_name", `%${customer}%`);
    const { start, end } = normalizeCommerceDateRange(options.startDate, options.endDate);
    if (start) listQuery = listQuery.gte("placed_at", `${start}T00:00:00+06:00`);
    if (end) listQuery = listQuery.lte("placed_at", `${end}T23:59:59.999+06:00`);
    const range = normalizeCommerceRange(options.minAmount, options.maxAmount);
    if (range.min) listQuery = listQuery.gte("total", range.min);
    if (range.max) listQuery = listQuery.lte("total", range.max);
  } else if (list === "customers") {
    listQuery = supabase.from("workspace_customer_order_counts").select("id,full_name,email,phone,notes,first_seen_at,last_seen_at,created_at,order_count", { count: "exact" })
      .eq("workspace_id", workspaceId);
    if (q) listQuery = listQuery.or(`full_name.ilike."%${q}%",email.ilike."%${q}%",phone.ilike."%${q}%"`);
    const { start, end } = normalizeCommerceDateRange(options.startDate, options.endDate);
    if (start) listQuery = listQuery.gte("created_at", `${start}T00:00:00+06:00`);
    if (end) listQuery = listQuery.lte("created_at", `${end}T23:59:59.999+06:00`);
    if (options.activity === "with_orders") listQuery = listQuery.gte("order_count", 1);
    if (options.activity === "without_orders") listQuery = listQuery.eq("order_count", "0");
    const orderRange = normalizeCommerceIntegerRange(options.minOrders, options.maxOrders);
    if (orderRange.min !== null) listQuery = listQuery.gte("order_count", orderRange.min);
    if (orderRange.max !== null) listQuery = listQuery.lte("order_count", orderRange.max);
  } else if (list === "inventory") {
    listQuery = supabase.from("workspace_inventory_stock").select("id,workspace_id,product_id,sku,barcode,name,attributes,currency,price,reorder_level,product_name,category,tracked_store_count,stock_quantity,low_stock_store_count,stock_status", { count: "exact" })
      .eq("workspace_id", workspaceId);
    if (q) listQuery = listQuery.or(`name.ilike."%${q}%",product_name.ilike."%${q}%",sku.ilike."%${q}%",barcode.ilike."%${q}%`);
    if (options.category?.trim()) listQuery = listQuery.eq("category", options.category.trim().slice(0, 120));
    if (["in_stock", "low_stock", "out_of_stock", "untracked"].includes(options.stockStatus ?? "")) listQuery = listQuery.eq("stock_status", options.stockStatus!);
    const stockRange = normalizeCommerceRange(options.minStock, options.maxStock);
    if (stockRange.min) listQuery = listQuery.gte("stock_quantity", stockRange.min);
    if (stockRange.max) listQuery = listQuery.lte("stock_quantity", stockRange.max);
  } else if (list === "expenses") {
    listQuery = supabase.from("expenses").select("id,category,description,amount,currency,expense_date,status,accounting_class,payment_method,receipt_reference,notes", { count: "exact" })
      .eq("workspace_id", workspaceId);
    if (q) listQuery = listQuery.or(`description.ilike."%${q}%",category.ilike."%${q}%"`);
    if (["draft", "unpaid", "paid", "void"].includes(options.status ?? "")) listQuery = listQuery.eq("status", options.status!);
    if (options.category?.trim()) listQuery = listQuery.eq("category", options.category.trim().slice(0, 120));
    if (options.paymentStatus === "has_method") listQuery = listQuery.not("payment_method", "is", "null");
    if (options.paymentStatus === "no_method") listQuery = listQuery.is("payment_method", null);
    const { start, end } = normalizeCommerceDateRange(options.startDate, options.endDate);
    if (start) listQuery = listQuery.gte("expense_date", start);
    if (end) listQuery = listQuery.lte("expense_date", end);
    const range = normalizeCommerceRange(options.minAmount, options.maxAmount);
    if (range.min) listQuery = listQuery.gte("amount", range.min);
    if (range.max) listQuery = listQuery.lte("amount", range.max);
  }
  if (list && !listQuery) throw new Error("Workspace list type is invalid.");
  const sort = list ? normalizeCommerceSort(list, options.sort, options.direction) : null;
  const sortKey = sort?.key ?? "";
  const sortField = sort?.column;
  const ascending = sort?.direction === "asc";
  if (listQuery && sortField) listQuery = listQuery.order(sortField, { ascending }).order("id", { ascending: true });
  const pageResult = listQuery ? await listQuery.range(from, to) : null;
  const totalCount = pageResult?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / COMMERCE_PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const pagedRows = pageResult && currentPage !== requestedPage
    ? await listQuery!.range((currentPage - 1) * COMMERCE_PAGE_SIZE, currentPage * COMMERCE_PAGE_SIZE - 1)
    : pageResult;
  if (pagedRows?.error) throw new Error("Workspace commerce data could not be loaded.");
  const mainRows = pagedRows?.data ?? null;
  const pageIds = Array.isArray(mainRows) ? mainRows.map((value) => (value as { id: string }).id) : [];
  const productIds = list === "inventory" && Array.isArray(mainRows) ? mainRows.map((value) => (value as { product_id: string }).product_id) : pageIds;
  const variantIds = list === "inventory" && Array.isArray(mainRows) ? pageIds : [];
  const [products, variants, inventory, movements, stores, orderStores, orders, orderItems, customers, expenses] = await Promise.all([
    list === "products" ? Promise.resolve({ data: mainRows, error: null }) : list === "inventory" ? (productIds.length ? supabase.from("products").select("id,name,sku,category,brand,image_urls,status,currency,price,created_at,updated_at")
      .eq("workspace_id", workspaceId).in("id", productIds) : Promise.resolve({ data: [], error: null })) : supabase.from("products").select("id,name,sku,category,brand,image_urls,status,currency,price,created_at,updated_at")
      .eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(250),
    list === "inventory" ? Promise.resolve({ data: mainRows, error: null }) : list === "products" ? (productIds.length ? supabase.from("product_variants").select("id,product_id,sku,barcode,name,attributes,currency,price,reorder_level")
      .eq("workspace_id", workspaceId).in("product_id", productIds).order("name") : Promise.resolve({ data: [], error: null })) : supabase.from("product_variants").select("id,product_id,sku,barcode,name,attributes,currency,price,reorder_level")
      .eq("workspace_id", workspaceId).order("name").limit(500),
    list === "inventory" ? (variantIds.length ? supabase.from("inventory_levels").select("store_id,product_variant_id,quantity,reorder_level,observed_at")
      .eq("workspace_id", workspaceId).in("product_variant_id", variantIds) : Promise.resolve({ data: [], error: null })) : supabase.from("inventory_levels").select("store_id,product_variant_id,quantity,reorder_level,observed_at")
      .eq("workspace_id", workspaceId).limit(1000),
    supabase.from("inventory_movements").select("id,store_id,product_variant_id,movement_type,quantity_delta,note,created_at")
      .eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(100),
    supabase.from("stores").select("id,name").eq("workspace_id", workspaceId).eq("is_active", true).order("name"),
    supabase.from("stores").select("id,name").eq("workspace_id", workspaceId).order("name"),
    list === "orders" ? Promise.resolve({ data: mainRows, error: null }) : supabase.from("workspace_order_list").select("id,store_id,customer_id,customer_name,order_number,status,payment_status,fulfillment_status,payment_method,currency,total,refund_total,customer_name_snapshot,customer_phone_snapshot,placed_at")
      .eq("workspace_id", workspaceId).order("placed_at", { ascending: false }).limit(250),
    list === "orders" ? (pageIds.length ? supabase.from("order_items").select("id,order_id,product_name_snapshot,sku_snapshot,quantity,unit_price,line_total")
      .eq("workspace_id", workspaceId).in("order_id", pageIds).limit(2000) : Promise.resolve({ data: [], error: null })) : supabase.from("order_items").select("id,order_id,product_name_snapshot,sku_snapshot,quantity,unit_price,line_total")
      .eq("workspace_id", workspaceId).limit(2000),
    list === "customers" ? Promise.resolve({ data: mainRows, error: null }) : supabase.from("workspace_customer_order_counts").select("id,workspace_id,full_name,email,phone,notes,first_seen_at,last_seen_at,created_at,order_count")
      .eq("workspace_id", workspaceId).order("last_seen_at", { ascending: false }).limit(500),
    list === "expenses" ? Promise.resolve({ data: mainRows, error: null }) : supabase.from("expenses").select("id,category,description,amount,currency,expense_date,status,accounting_class,payment_method,receipt_reference,notes")
      .eq("workspace_id", workspaceId).order("expense_date", { ascending: false }).limit(500),
  ]);
  if ([products, variants, inventory, movements, stores, orderStores, orders, orderItems, customers, expenses].some((result) => result.error)) {
    throw new Error("Workspace commerce data could not be loaded.");
  }
  return {
    session,
    products: (products.data ?? []) as ProductListRow[],
    variants: (list === "inventory" ? mainRows ?? [] : variants.data ?? []) as VariantListRow[],
    inventory: inventory.data ?? [],
    movements: movements.data ?? [],
    stores: stores.data ?? [],
    orderStores: orderStores.data ?? [],
    orders: (orders.data ?? []) as OrderListRow[],
    orderItems: orderItems.data ?? [],
    customers: (customers.data ?? []) as CustomerListRow[],
    expenses: (expenses.data ?? []) as ExpenseListRow[],
    pagination: list ? {
      list, page: currentPage, pageSize: COMMERCE_PAGE_SIZE, totalCount, totalPages, q: options.q?.trim() ?? "",
      status: options.status ?? "", sort: sortKey, direction: ascending ? "asc" : "desc", category: options.category ?? "",
      paymentStatus: options.paymentStatus ?? "", startDate: normalizeCommerceDateRange(options.startDate, options.endDate).start ?? "", endDate: normalizeCommerceDateRange(options.startDate, options.endDate).end ?? "",
      minAmount: normalizeCommerceRange(options.minAmount, options.maxAmount).min ?? "", maxAmount: normalizeCommerceRange(options.minAmount, options.maxAmount).max ?? "", activity: options.activity ?? "",
      stockStatus: options.stockStatus ?? "", minStock: normalizeCommerceRange(options.minStock, options.maxStock).min ?? "", maxStock: normalizeCommerceRange(options.minStock, options.maxStock).max ?? "",
      customer: options.customer?.trim() ?? "", customerId: normalizeCommerceId(options.customerId) ?? "", storeId: normalizeCommerceId(options.storeId) ?? "",
      minOrders: normalizeCommerceIntegerRange(options.minOrders, options.maxOrders).min?.toString() ?? "", maxOrders: normalizeCommerceIntegerRange(options.minOrders, options.maxOrders).max?.toString() ?? "",
    } : null,
  };
}
