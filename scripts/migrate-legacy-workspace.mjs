import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";

const { Client } = pg;
const PAGE_SIZE = 200;
const UUID_NAMESPACE = "9930a74a-8252-4ab7-a88d-8f9293cf1c21";
const REQUIRED = {
  dashboard_user_profiles: ["user_id", "role", "is_active"],
  categories: ["id", "name", "slug", "is_active"],
  products: ["id", "category_id", "name", "slug", "sku", "price", "stock", "is_active", "created_at", "updated_at"],
  product_business_data: ["product_id", "sku_override", "variation", "buying_price", "buying_price_verified_at", "reorder_level", "internal_notes"],
  orders: ["id", "order_number", "customer_name", "customer_phone", "customer_address", "delivery_area", "customer_note", "payment_method", "payment_status", "order_status", "subtotal", "delivery_charge", "total", "created_at"],
  order_items: ["id", "order_id", "product_id", "product_name", "unit_price", "quantity", "line_total"],
  expenses: ["id", "expense_date", "category_key", "accounting_class", "description", "amount", "created_at"],
};
const UNSUPPORTED_KEYS = {
  audit_history: ["id"], business_lookup_values: ["lookup_type", "lookup_key"], business_settings: ["setting_key"],
  contact_messages: ["id"], dashboard_user_profiles: ["user_id"],
  campaigns: ["id"], cash_account_balance_observations: ["id"], cash_movements: ["id"], daily_ad_spend: ["id"],
  financial_source_funding_reversals: ["id"], financial_source_fundings: ["id"], inventory_restoration_movements: ["id"],
  order_financial_adjustments: ["id"], order_item_financial_allocations: ["id"], order_item_inventory_consumptions: ["id"],
  order_item_refund_allocations: ["id"], order_item_return_allocations: ["id"], order_return_events: ["id"],
  order_return_inspections: ["id"], owner_capital_return_events: ["id"], owner_held_balance_observations: ["id"],
  owner_held_fund_events: ["id"], owner_money_taken_events: ["id"], owner_non_cash_capital_events: ["id"],
  procurement_expense_allocations: ["id"], purchase_batch_items: ["id"], purchase_batches: ["id"],
  rejected_cod_adjustment_settlement_allocations: ["id"], rejected_cod_courier_adjustments: ["id"],
  settlement_order_allocations: ["id"], settlement_receipt_allocations: ["id"], settlement_records: ["id"],
  settlement_reversals: ["id"], steadfast_receivable_observations: ["id"],
};
const STATUS_MAP = new Map([
  ["pending", "pending"], ["confirmed", "confirmed"], ["processing", "processing"], ["dispatched", "processing"],
  ["shipped", "processing"], ["delivered", "fulfilled"], ["cancelled", "cancelled"], ["canceled", "cancelled"],
  ["returned", "returned"], ["refunded", "refunded"], ["partially refunded", "partially_refunded"],
]);
const PAYMENT_MAP = new Map([
  ["pending", "pending"], ["unpaid", "pending"], ["paid", "paid"], ["verified", "paid"],
  ["partially paid", "partially_paid"], ["partially_paid", "partially_paid"], ["refunded", "refunded"], ["failed", "failed"],
]);

export function isLoopbackPostgresUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return ["postgres:", "postgresql:"].includes(url.protocol)
      && ["localhost", "127.0.0.1", "::1"].includes(hostname);
  } catch { return false; }
}

function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}
function digest(value) { return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex"); }
function uuidV5(namespace, name) {
  const bytes = Buffer.from(namespace.replaceAll("-", ""), "hex");
  const result = createHash("sha1").update(bytes).update(name).digest().subarray(0, 16);
  result[6] = (result[6] & 15) | 80; result[8] = (result[8] & 63) | 128;
  const hex = result.toString("hex");
  return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
}
function quote(value) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error("Invalid legacy identifier.");
  return '"' + value + '"';
}
function numberText(value, nullable = false, positive = false) {
  if (value === null || value === undefined || value === "") {
    if (nullable) return null;
    throw new Error("missing_numeric");
  }
  const text = String(value).trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(text) || (positive && decimalUnits(text) <= 0n)) {
    throw new Error("invalid_numeric");
  }
  return text;
}
export function decimalUnits(value) {
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(whole) * 1_000_000n + BigInt((fraction + "000000").slice(0, 6));
}
function timestamp(value) {
  return value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null;
}
function dateOnly(value) {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(new Date(text + "T00:00:00Z").getTime()) ? text : null;
}
function normalizedPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}
function rowKey(row, keys) { return keys.length === 1 ? String(row[keys[0]]) : JSON.stringify(keys.map((key) => row[key] ?? null)); }

async function exists(client, table) {
  const result = await client.query("select exists(select 1 from information_schema.tables where table_schema='public' and table_name=$1) as found", [table]);
  return result.rows[0].found;
}
async function columns(client, table) {
  const result = await client.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1", [table]);
  return new Set(result.rows.map((row) => row.column_name));
}
async function count(client, table) {
  const result = await client.query("select count(*)::bigint as count from public." + quote(table));
  return Number(result.rows[0].count);
}
async function* pageRows(client, table, keys) {
  let cursor = null;
  while (true) {
    const names = keys.map(quote);
    const comparison = cursor === null ? "" : " and (" + names.join(",") + ") > (" + keys.map((_, i) => "$" + (i + 1)).join(",") + ")";
    const values = cursor === null ? [PAGE_SIZE] : cursor.concat([PAGE_SIZE]);
    const limit = "$" + values.length;
    const result = await client.query(
      "select * from public." + quote(table) + " where true" + comparison + " order by " + names.join(",") + " limit " + limit,
      values,
    );
    if (!result.rows.length) return;
    for (const row of result.rows) yield row;
    cursor = keys.map((key) => result.rows.at(-1)[key]);
    if (result.rows.length < PAGE_SIZE) return;
  }
}

async function verifySource(source) {
  for (const [table, required] of Object.entries(REQUIRED)) {
    if (!await exists(source, table)) throw new Error("Legacy source is missing public." + table + ".");
    const actual = await columns(source, table);
    if (required.some((column) => !actual.has(column))) throw new Error("Legacy source " + table + " does not match the reviewed schema mapping.");
  }
  for (const relation of ["order_financial_snapshots", "dashboard_active_source_fundings"]) {
    if (!await exists(source, relation)) throw new Error("Legacy source is missing required relation public." + relation + ".");
  }
}
async function verifyMapping(source, target, mapping) {
  const profile = await source.query("select role::text as role, is_active from public.dashboard_user_profiles where user_id=$1", [mapping.sourceOwnerId]);
  if (!profile.rows[0] || profile.rows[0].role.toLowerCase() !== "owner" || !profile.rows[0].is_active) {
    throw new Error("The explicit legacy owner must be an active legacy owner profile.");
  }
  const workspace = await target.query(
    "select w.id from public.workspaces w join public.workspace_memberships m on m.workspace_id=w.id where w.id=$1 and m.user_id=$2 and m.role='owner' and m.is_active",
    [mapping.workspaceId, mapping.targetOwnerId],
  );
  if (!workspace.rows.length) throw new Error("The explicit target user must own the target workspace.");
  const store = await target.query(
    "select id from public.stores where id=$1 and workspace_id=$2 and platform='custom' and connection_status='disconnected' and base_url ~* '^https://[a-z0-9.-]+[.]invalid/?$'",
    [mapping.storeId, mapping.workspaceId],
  );
  if (!store.rows.length) throw new Error("The target store must be a disconnected custom store with an .invalid URL.");
  const migrations = await target.query("select count(*)::int as count from universal_migrations.schema_versions where version >= '202611040001' and version <= '202611070007'");
  if (migrations.rows[0].count !== 7) throw new Error("Apply all universal schema migrations before importing legacy rows.");
  await target.query("select count(*)::int from public.legacy_import_runs");
}
async function sourceSummary(source) {
  const tables = {};
  for (const table of Object.keys(REQUIRED).concat(["order_financial_snapshots"], Object.keys(UNSUPPORTED_KEYS))) {
    if (tables[table] === undefined && await exists(source, table)) tables[table] = await count(source, table);
  }
  const duplicateOrders = await source.query("select count(*)::int as count from (select order_number from public.orders group by order_number having count(*)>1) d");
  const orphanItems = await source.query(
    "select count(*)::int as count from public.order_items i left join public.orders o on o.id=i.order_id left join public.products p on p.id=i.product_id where i.order_id is null or i.product_id is null or o.id is null or p.id is null",
  );
  const missingDates = await source.query("select count(*)::int as count from public.orders where coalesce(order_date,created_at) is null");
  const phoneConflicts = await source.query(
    "select count(*)::int as count from (select regexp_replace(coalesce(customer_phone,''),'[^0-9]','','g') phone from public.orders where length(regexp_replace(coalesce(customer_phone,''),'[^0-9]','','g'))>=7 group by 1 having count(distinct lower(btrim(customer_name)))>1) c",
  );
  return { tables, checks: {
    duplicate_order_numbers: Number(duplicateOrders.rows[0].count),
    orphan_order_items: Number(orphanItems.rows[0].count),
    missing_order_dates: Number(missingDates.rows[0].count),
    ambiguous_customer_phones: Number(phoneConflicts.rows[0].count),
  } };
}
async function putHold(target, workspaceId, table, id, reason) {
  await target.query(
    "insert into public.legacy_import_holds(workspace_id,source_table,source_id,reason_code) values($1,$2,$3,$4) on conflict(workspace_id,source_table,source_id) do update set reason_code=excluded.reason_code,last_seen_at=now(),resolved_at=null",
    [workspaceId, table, id, reason],
  );
}
async function clearHold(target, workspaceId, table, id) {
  await target.query("update public.legacy_import_holds set resolved_at=now(),last_seen_at=now() where workspace_id=$1 and source_table=$2 and source_id=$3 and resolved_at is null", [workspaceId, table, id]);
}
async function identityState(target, workspaceId, table, id, rowHash) {
  const result = await target.query("select source_hash from public.legacy_import_records where workspace_id=$1 and source_table=$2 and source_id=$3", [workspaceId, table, id]);
  return !result.rows.length ? "new" : result.rows[0].source_hash === rowHash ? "same" : "changed";
}
async function saveIdentity(target, workspaceId, sourceTable, sourceId, targetTable, targetId, rowHash) {
  await target.query(
    "insert into public.legacy_import_records(workspace_id,source_table,source_id,target_table,target_id,source_hash) values($1,$2,$3,$4,$5,$6) on conflict(workspace_id,source_table,source_id) do nothing",
    [workspaceId, sourceTable, sourceId, targetTable, targetId, rowHash],
  );
}
function counts() { return { products: { imported: 0, skipped: 0 }, orders: { imported: 0, skipped: 0 }, expenses: { imported: 0, skipped: 0 }, holds: 0, rejected: 0, failed_operations: 0 }; }
function outcomeCounts(totals) {
  return {
    records_imported: totals.products.imported + totals.orders.imported + totals.expenses.imported,
    records_already_imported: totals.products.skipped + totals.orders.skipped + totals.expenses.skipped,
    records_held: totals.holds,
    records_rejected: totals.rejected,
    records_requiring_manual_intervention: totals.holds + totals.rejected,
    failed_operations: totals.failed_operations,
  };
}
function destinationFailureReason(error) {
  if (error?.message === "target_id_conflict") return "destination_id_conflict";
  if (error?.message === "target_order_conflict") return "destination_order_conflict";
  if (error?.message === "customer_name_missing") return "customer_name_missing";
  if (error?.message === "customer_identity_conflict") return "customer_identity_conflict";
  if (error?.message === "order_item_identity_conflict") return "order_item_identity_conflict";
  if (error?.code === "23505") return "destination_unique_constraint_conflict";
  if (error?.code === "23503") return "destination_relationship_constraint";
  if (["23502", "23514", "22003", "22P02"].includes(error?.code)) return "destination_constraint_violation";
  return "destination_write_failed";
}
function recordPreflight(ctx, sourceTable, sourceId, destinationTable, destinationId, action, reason = null, relatedRecords = []) {
  if (!ctx.preflight) return;
  const key = `${sourceTable}:${sourceId}`;
  ctx.preflight.set(key, {
    source_table: sourceTable, source_id: String(sourceId),
    expected_destination_table: destinationTable, expected_destination_id: destinationId == null ? null : String(destinationId),
    expected_action: action, reason, related_records: relatedRecords,
    manual_intervention_required: action === "held" || action === "rejected",
  });
}

async function importProduct(source, target, row, ctx, totals) {
  const id = String(row.id);
  const b = await source.query("select * from public.product_business_data where product_id=$1", [id]);
  const business = b.rows[0] || null;
  const c = row.category_id ? await source.query("select name,slug,is_active from public.categories where id=$1", [row.category_id]) : { rows: [] };
  const category = c.rows[0] || null;
  const rowHash = digest({ product: row, business });
  const state = await identityState(target, ctx.workspaceId, "products", id, rowHash);
  if (state === "same") { totals.products.skipped++; recordPreflight(ctx, "products", id, "products", id, "skipped", "already_imported"); return; }
  if (state === "changed") { await putHold(target, ctx.workspaceId, "products", id, "source_changed_after_import"); totals.holds++; recordPreflight(ctx, "products", id, "products", id, "held", "source_changed_after_import"); return; }
  if (row.is_active === null || row.is_active === undefined) { await putHold(target, ctx.workspaceId, "products", id, "product_status_missing"); totals.holds++; recordPreflight(ctx, "products", id, "products", id, "held", "product_status_missing"); return; }
  let price;
  try { price = numberText(row.price); } catch { await putHold(target, ctx.workspaceId, "products", id, "product_price_invalid"); totals.holds++; recordPreflight(ctx, "products", id, "products", id, "held", "product_price_invalid"); return; }
  const createdAt = timestamp(row.created_at) || timestamp(row.updated_at);
  const name = String(row.name || "").trim();
  if (!createdAt || !name) { await putHold(target, ctx.workspaceId, "products", id, "product_name_or_timestamp_missing"); totals.holds++; recordPreflight(ctx, "products", id, "products", id, "held", "product_name_or_timestamp_missing"); return; }
  const variantId = uuidV5(UUID_NAMESPACE, "legacy-product-variant:" + id);
  const sku = business && business.sku_override ? String(business.sku_override).trim() : row.sku || null;
  const variantName = business && business.variation ? String(business.variation).trim() : "Default";
  const categoryName = category && category.is_active !== false ? category.name : null;
  if (row.category_id && !category) { await putHold(target, ctx.workspaceId, "products.category", id, "orphan_category_reference"); totals.holds++; }
  let cost = null;
  if (business && business.buying_price_verified_at) {
    if (business.buying_price === null || business.buying_price === undefined) {
      await putHold(target, ctx.workspaceId, "product_business_data", id, "verified_cost_missing"); totals.holds++;
    } else {
      try { cost = numberText(business.buying_price); } catch { await putHold(target, ctx.workspaceId, "product_business_data", id, "verified_cost_invalid"); totals.holds++; }
    }
  } else if (business && (business.buying_price !== null || business.internal_notes)) {
    await putHold(target, ctx.workspaceId, "product_business_data", id, "unverified_private_cost_or_notes"); totals.holds++;
  }
  const image = typeof row.image_url === "string" && row.image_url.startsWith("https://") ? row.image_url : null;
  if (row.image_url && !image) { await putHold(target, ctx.workspaceId, "products.image", id, "image_reference_not_https"); totals.holds++; }
  let stock = null;
  try { stock = numberText(row.stock, true); } catch { await putHold(target, ctx.workspaceId, "products.stock", id, "invalid_stock_count"); totals.holds++; }
  let reorder = "0";
  if (business && business.reorder_level != null) {
    try { reorder = numberText(business.reorder_level); }
    catch { await putHold(target, ctx.workspaceId, "product_business_data", id, "reorder_level_invalid"); totals.holds++; }
  }
  await target.query("begin");
  try {
    if ((await target.query("select id from public.products where id=$1", [id])).rows.length) throw new Error("target_id_conflict");
    await target.query(
      "insert into public.products(id,workspace_id,source_store_id,sku,name,description,category,image_urls,status,currency,price,source_metadata,created_at,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'BDT',$10,$11::jsonb,$12,$13)",
      [id, ctx.workspaceId, ctx.storeId, sku, name, row.description || null, categoryName, image ? [image] : [],
        row.is_active ? "active" : "archived", price,
        JSON.stringify({ origin: "legacy_import", legacy_slug: row.slug || null, legacy_category_slug: category ? category.slug : null }),
        createdAt, timestamp(row.updated_at) || createdAt],
    );
    await target.query(
      "insert into public.product_variants(id,workspace_id,product_id,sku,name,currency,price,attributes,reorder_level,source_metadata,created_at,updated_at) values($1,$2,$3,$4,$5,'BDT',$6,$7::jsonb,$8,$9::jsonb,$10,$11)",
      [variantId, ctx.workspaceId, id, sku, variantName || "Default", price,
        JSON.stringify(business && business.variation ? { legacy_variation: business.variation } : {}),
        reorder, JSON.stringify({ origin: "legacy_import" }), createdAt, timestamp(business && business.updated_at) || createdAt],
    );
    await target.query(
      "insert into public.product_variant_costs(workspace_id,product_variant_id,cost_price,private_notes,updated_by) values($1,$2,$3,$4,$5)",
      [ctx.workspaceId, variantId, cost, business ? business.internal_notes || null : null, ctx.targetOwnerId],
    );
    if (stock !== null && decimalUnits(stock) >= 0n) {
      await target.query(
        "insert into public.inventory_levels(workspace_id,store_id,product_variant_id,quantity,reorder_level,source,observed_at) values($1,$2,$3,$4,$5,'manual_count',$6)",
        [ctx.workspaceId, ctx.storeId, variantId, stock, reorder, timestamp(row.updated_at) || createdAt],
      );
      if (decimalUnits(stock) > 0n) await target.query(
        "insert into public.inventory_movements(workspace_id,store_id,product_variant_id,movement_type,quantity_delta,idempotency_key,source_reference,note,actor_id,created_at) values($1,$2,$3,'adjustment',$4,$5,$6,'Opening count imported from legacy stock',$7,$8)",
        [ctx.workspaceId, ctx.storeId, variantId, stock, "legacy:products:" + id + ":opening-stock", "legacy:products:" + id, ctx.targetOwnerId, timestamp(row.updated_at) || createdAt],
      );
    } else if (stock === null) {
      await putHold(target, ctx.workspaceId, "products.stock", id, "stock_count_missing"); totals.holds++;
    }
    await saveIdentity(target, ctx.workspaceId, "products", id, "products", id, rowHash);
    if (business) await saveIdentity(target, ctx.workspaceId, "product_business_data", id, "product_variant_costs", variantId, digest(business));
    await target.query("commit");
    await clearHold(target, ctx.workspaceId, "products", id);
    totals.products.imported++;
    recordPreflight(ctx, "products", id, "products", id, "imported", null, [{ table: "product_variants", id: variantId }, { table: "inventory_levels", id: variantId }]);
  } catch (error) {
    await target.query("rollback");
    const reason = destinationFailureReason(error);
    await putHold(target, ctx.workspaceId, "products", id, reason);
    totals.holds++;
    totals.rejected++;
    totals.failed_operations++;
    recordPreflight(ctx, "products", id, "products", id, "rejected", reason);
  }
}

async function customerForOrder(target, order, ctx) {
  const phone = String(order.customer_phone || "").trim();
  const normalized = normalizedPhone(phone);
  const name = String(order.customer_name || "").trim();
  if (!name) throw new Error("customer_name_missing");
  const identity = normalized ? "phone:" + digest(normalized) : "order:" + order.id;
  const id = uuidV5(UUID_NAMESPACE, "legacy-customer:" + identity);
  const date = timestamp(order.order_date) || timestamp(order.created_at);
  const existing = await target.query("select full_name,phone from public.customers where id=$1", [id]);
  if (existing.rows.length && (existing.rows[0].full_name !== name || normalizedPhone(existing.rows[0].phone) !== normalized)) {
    throw new Error("customer_identity_conflict");
  }
  if (!existing.rows.length) {
    await target.query(
      "insert into public.customers(id,workspace_id,store_id,external_id,phone,full_name,shipping_address,source_metadata,first_seen_at,last_seen_at,created_at,updated_at) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$9,$9,$9) on conflict(id) do nothing",
      [id, ctx.workspaceId, ctx.storeId, "legacy-contact:" + digest(identity), normalized ? phone : null, name,
        JSON.stringify({ address: order.customer_address || "", area: order.delivery_area || "" }),
        JSON.stringify({ origin: "legacy_order_snapshot", identity_hash: digest(identity) }), date],
    );
  } else {
    await target.query("update public.customers set first_seen_at=least(first_seen_at,$2),last_seen_at=greatest(last_seen_at,$2),updated_at=now() where id=$1 and workspace_id=$3", [id, date, ctx.workspaceId]);
  }
  return id;
}
function orderStates(order) {
  const raw = String(order.dashboard_order_status || order.order_status || "").trim().toLowerCase();
  const status = STATUS_MAP.get(raw);
  const payment = PAYMENT_MAP.get(String(order.dashboard_payment_status || order.payment_status || "").trim().toLowerCase());
  if (!status) throw new Error("order_status_unmapped");
  if (!payment) throw new Error("payment_status_unmapped");
  return { status, payment, raw };
}
async function importOrder(source, target, order, ctx, totals) {
  const id = String(order.id);
  const children = await source.query("select * from public.order_items where order_id=$1 order by id", [id]);
  const items = children.rows;
  const snapshots = await source.query("select * from public.order_financial_snapshots where order_id=$1", [id]);
  const snapshot = snapshots.rows[0] || null;
  const rowHash = digest({ order, items, snapshot });
  const state = await identityState(target, ctx.workspaceId, "orders", id, rowHash);
  if (state === "same") { totals.orders.skipped++; recordPreflight(ctx, "orders", id, "orders", id, "skipped", "already_imported"); return; }
  if (state === "changed") { await putHold(target, ctx.workspaceId, "orders", id, "source_changed_after_import"); totals.holds++; recordPreflight(ctx, "orders", id, "orders", id, "held", "source_changed_after_import"); return; }
  const duplicateNumber = await source.query("select count(*)::int as count from public.orders where order_number=$1", [order.order_number]);
  if (duplicateNumber.rows[0].count > 1) { await putHold(target, ctx.workspaceId, "orders", id, "duplicate_order_number"); totals.holds++; recordPreflight(ctx, "orders", id, "orders", id, "held", "duplicate_order_number"); return; }
  if (!items.length || items.some((item) => !item.product_id || !item.product_name || Number(item.quantity) <= 0)) {
    await putHold(target, ctx.workspaceId, "orders", id, "order_item_snapshot_missing_or_invalid"); totals.holds++; recordPreflight(ctx, "orders", id, "orders", id, "held", "order_item_snapshot_missing_or_invalid", items.map((item) => ({ table: "order_items", id: item.id }))); return;
  }
  const placedAt = timestamp(order.order_date) || timestamp(order.created_at);
  if (!placedAt) { await putHold(target, ctx.workspaceId, "orders", id, "order_date_missing"); totals.holds++; recordPreflight(ctx, "orders", id, "orders", id, "held", "order_date_missing"); return; }
  let mapped;
  try { mapped = orderStates(order); } catch (error) { await putHold(target, ctx.workspaceId, "orders", id, error.message); totals.holds++; recordPreflight(ctx, "orders", id, "orders", id, "held", error.message); return; }
  let refund;
  let total;
  try {
    refund = numberText(order.refund_amount || 0);
    total = numberText(order.total);
    numberText(order.subtotal);
    numberText(order.discount_amount || 0);
    numberText(order.delivery_charge || 0);
    numberText(order.courier_cost_snapshot, true);
  } catch {
    await putHold(target, ctx.workspaceId, "orders", id, "order_amount_invalid"); totals.holds++; recordPreflight(ctx, "orders", id, "orders", id, "held", "order_amount_invalid"); return;
  }
  if (decimalUnits(refund) > decimalUnits(total)) { await putHold(target, ctx.workspaceId, "orders", id, "refund_exceeds_order_total"); totals.holds++; recordPreflight(ctx, "orders", id, "orders", id, "held", "refund_exceeds_order_total"); return; }
  const productIds = Array.from(new Set(items.map((item) => item.product_id)));
  const variants = await target.query("select id,product_id from public.product_variants where workspace_id=$1 and product_id=any($2::uuid[])", [ctx.workspaceId, productIds]);
  const variantByProduct = new Map(variants.rows.map((variant) => [variant.product_id, variant.id]));
  if (productIds.some((productId) => !variantByProduct.has(productId))) {
    await putHold(target, ctx.workspaceId, "orders", id, "order_product_not_imported"); totals.holds++; recordPreflight(ctx, "orders", id, "orders", id, "held", "order_product_not_imported", productIds.map((productId) => ({ table: "products", id: productId }))); return;
  }
  await target.query("begin");
  try {
    const customerId = await customerForOrder(target, order, ctx);
    const collision = await target.query("select id from public.orders where id=$1 or (workspace_id=$2 and store_id=$3 and order_number=$4)", [id, ctx.workspaceId, ctx.storeId, String(order.order_number)]);
    if (collision.rows.length) throw new Error("target_order_conflict");
    await target.query(
      "insert into public.orders(id,workspace_id,store_id,customer_id,order_number,status,payment_status,fulfillment_status,payment_method,currency,subtotal,discount_total,shipping_total,shipping_cost,refund_total,total,customer_name_snapshot,customer_phone_snapshot,shipping_address_snapshot,source,source_status,source_metadata,placed_at,created_at,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'BDT',$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,'legacy_import',$19,$20::jsonb,$21,$22,$23)",
      [id, ctx.workspaceId, ctx.storeId, customerId, String(order.order_number), mapped.status, mapped.payment,
        mapped.status === "fulfilled" ? "fulfilled" : mapped.status === "cancelled" ? "cancelled" : "unfulfilled",
        order.payment_method || null, numberText(order.subtotal), numberText(order.discount_amount || 0),
        numberText(order.delivery_charge || 0), numberText(order.courier_cost_snapshot, true), refund, total,
        order.customer_name, order.customer_phone,
        JSON.stringify({ address: order.customer_address || null, area: order.delivery_area || null }),
        mapped.raw, JSON.stringify({ origin: "legacy_import", legacy_external_reference: order.external_reference || null,
          legacy_courier: order.courier || null, legacy_sales_channel: order.sales_channel || null,
          legacy_campaign_id: order.campaign_id || null, legacy_campaign_name: order.campaign_name_snapshot || null,
          legacy_settlement_status: order.settlement_status || null, legacy_customer_note: order.customer_note || null }),
        placedAt, timestamp(order.created_at) || placedAt, timestamp(order.updated_at) || placedAt],
    );
    for (const item of items) {
      const itemId = String(item.id);
      const itemHash = digest(item);
      const prior = await identityState(target, ctx.workspaceId, "order_items", itemId, itemHash);
      if (prior !== "new") throw new Error("order_item_identity_conflict");
      const unitCost = snapshot && snapshot.cogs_complete && item.buying_cost_snapshot != null
        ? numberText(item.buying_cost_snapshot, true) : null;
      const image = typeof item.product_image_url === "string" && item.product_image_url.startsWith("https://") ? item.product_image_url : null;
      await target.query(
        "insert into public.order_items(id,workspace_id,order_id,product_variant_id,product_name_snapshot,sku_snapshot,image_url_snapshot,quantity,unit_price,unit_cost,discount_total,tax_total,line_total,source_metadata,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,0,$11,$12::jsonb,$13)",
        [itemId, ctx.workspaceId, id, variantByProduct.get(item.product_id), item.product_name,
          item.sku_snapshot || null, image, numberText(item.quantity, false, true),
          numberText(item.actual_unit_selling_price ?? item.unit_price), unitCost, numberText(item.line_total),
          JSON.stringify({ origin: "legacy_import", legacy_product_id: item.product_id, legacy_product_slug: item.product_slug || null }),
          timestamp(item.created_at) || placedAt],
      );
      await saveIdentity(target, ctx.workspaceId, "order_items", itemId, "order_items", itemId, itemHash);
    }
    if (decimalUnits(refund) > 0n) {
      const refundId = uuidV5(UUID_NAMESPACE, "legacy-refund:" + id);
      await target.query(
        "insert into public.refunds(id,workspace_id,order_id,amount,currency,status,reason,refunded_at) values($1,$2,$3,$4,'BDT','pending','Imported order-level refund total requires transaction evidence',$5)",
        [refundId, ctx.workspaceId, id, refund, null],
      );
      await saveIdentity(target, ctx.workspaceId, "orders.refund_total", id, "refunds", refundId, digest(refund));
      await putHold(target, ctx.workspaceId, "orders.refund_total", id, "refund_transaction_evidence_missing");
      totals.holds++;
    }
    if (snapshot && snapshot.recognition_status === "Delivered") {
      const entries = [
        ["revenue", snapshot.product_revenue], ["shipping_income", snapshot.delivery_revenue],
        ["discount", snapshot.discount_amount],
      ];
      if (snapshot.cogs_complete && snapshot.cogs != null) entries.push(["cogs", snapshot.cogs]);
      if (snapshot.courier_cost != null) entries.push(["shipping_cost", snapshot.courier_cost]);
      if (snapshot.packaging_cost != null) entries.push(["shipping_cost", snapshot.packaging_cost]);
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        if (entry[1] == null || (entry[0] !== "cogs" && decimalUnits(numberText(entry[1])) === 0n)) continue;
        const entryId = uuidV5(UUID_NAMESPACE, "legacy-financial:" + id + ":" + entry[0] + ":" + index);
        await target.query(
          "insert into public.financial_entries(id,workspace_id,store_id,order_id,entry_type,amount,currency,effective_at,source_type,source_reference,idempotency_key,note,created_at) values($1,$2,$3,$4,$5,$6,'BDT',$7,'calculated',$8,$9,$10,$11)",
          [entryId, ctx.workspaceId, ctx.storeId, id, entry[0], numberText(entry[1]),
            timestamp(snapshot.recognized_at) || placedAt, "legacy-snapshot:" + id,
            "legacy:order:" + id + ":" + entry[0] + ":" + index,
            "Imported immutable legacy delivery snapshot", timestamp(snapshot.created_at) || placedAt],
        );
        await saveIdentity(target, ctx.workspaceId, "order_financial_snapshots", id + ":" + index,
          "financial_entries", entryId, digest({ order: id, entry }));
      }
      if (!snapshot.cogs_complete || snapshot.cogs == null) {
        await putHold(target, ctx.workspaceId, "order_financial_snapshots", id, "cogs_incomplete"); totals.holds++;
      }
    } else if (["fulfilled", "partially_refunded", "refunded"].includes(mapped.status)) {
      await putHold(target, ctx.workspaceId, "order_financial_snapshots", id, "delivered_financial_snapshot_missing"); totals.holds++;
    }
    await saveIdentity(target, ctx.workspaceId, "legacy_order_customer", id, "customers", customerId,
      digest({ phone: normalizedPhone(order.customer_phone), name: order.customer_name }));
    await saveIdentity(target, ctx.workspaceId, "orders", id, "orders", id, rowHash);
    await target.query("commit");
    await clearHold(target, ctx.workspaceId, "orders", id);
    totals.orders.imported++;
    recordPreflight(ctx, "orders", id, "orders", id, "imported", null, [
      { table: "customers", id: customerId }, ...items.map((item) => ({ table: "order_items", id: item.id })),
    ]);
  } catch (error) {
    await target.query("rollback");
    const reason = destinationFailureReason(error);
    await putHold(target, ctx.workspaceId, "orders", id, reason);
    totals.holds++;
    totals.rejected++;
    totals.failed_operations++;
    recordPreflight(ctx, "orders", id, "orders", id, "rejected", reason, items.map((item) => ({ table: "order_items", id: item.id })));
  }
}

async function importExpense(source, target, row, ctx, totals) {
  const id = String(row.id);
  const rowHash = digest(row);
  const state = await identityState(target, ctx.workspaceId, "expenses", id, rowHash);
  if (state === "same") { totals.expenses.skipped++; recordPreflight(ctx, "expenses", id, "expenses", id, "skipped", "already_imported"); return; }
  if (state === "changed") { await putHold(target, ctx.workspaceId, "expenses", id, "source_changed_after_import"); totals.holds++; recordPreflight(ctx, "expenses", id, "expenses", id, "held", "source_changed_after_import"); return; }
  let amount;
  try { amount = numberText(row.amount, false, true); } catch { await putHold(target, ctx.workspaceId, "expenses", id, "expense_amount_invalid"); totals.holds++; recordPreflight(ctx, "expenses", id, "expenses", id, "held", "expense_amount_invalid"); return; }
  const classes = new Set(["operating_expense", "inventory_purchase", "freight_in", "unallocated_procurement"]);
  const category = classes.has(row.accounting_class) ? row.accounting_class : "other";
  const fundingRows = await source.query(
    "select funding_treatment from public.dashboard_active_source_fundings where source_type='expense' and source_id=$1",
    [id],
  );
  const funding = fundingRows.rows.length === 1 ? fundingRows.rows[0].funding_treatment : null;
  const paid = ["business_account_paid", "owner_paid_personally", "owner_held_business_funds"].includes(funding);
  const status = funding === "unpaid" ? "unpaid" : paid ? "paid" : "draft";
  if (!funding || ["historical_business_paid_account_unknown", "already_represented"].includes(funding)) {
    await putHold(target, ctx.workspaceId, "expenses.funding", id, "expense_funding_needs_reconciliation"); totals.holds++;
  }
  const created = timestamp(row.created_at) || timestamp(row.updated_at);
  const expenseDate = dateOnly(row.expense_date);
  if (!created || !expenseDate) { await putHold(target, ctx.workspaceId, "expenses", id, "expense_date_missing_or_invalid"); totals.holds++; recordPreflight(ctx, "expenses", id, "expenses", id, "held", "expense_date_missing_or_invalid"); return; }
  await target.query("begin");
  try {
    if ((await target.query("select id from public.expenses where id=$1", [id])).rows.length) throw new Error("target_id_conflict");
    await target.query(
      "insert into public.expenses(id,workspace_id,store_id,category,description,amount,currency,expense_date,status,accounting_class,source,source_reference,payment_method,metadata,created_by,created_at,updated_at) values($1,$2,$3,$4,$5,$6,'BDT',$7,$8,$9,'imported',$10,$11,$12::jsonb,$13,$14,$14)",
      [id, ctx.workspaceId, ctx.storeId, String(row.category_key || "other").slice(0, 120),
        String(row.description || "").slice(0, 1000) || "Imported legacy expense", amount, expenseDate,
        status, category, id, row.payment_method || null,
        JSON.stringify({ origin: "legacy_import", legacy_accounting_class: row.accounting_class || null,
          legacy_campaign_id: row.campaign_id || null, legacy_sales_channel: row.sales_channel || null,
          legacy_reference: row.reference || null, legacy_funding_treatment: funding || null }),
        ctx.targetOwnerId, created],
    );
    const entryType = category === "operating_expense" ? "expense" : category === "inventory_purchase" ? "inventory_purchase" : category === "freight_in" ? "freight_in" : null;
    if (entryType) {
      const entryId = uuidV5(UUID_NAMESPACE, "legacy-expense-financial:" + id);
      await target.query(
        "insert into public.financial_entries(id,workspace_id,store_id,entry_type,amount,currency,effective_at,source_type,source_reference,idempotency_key,note) values($1,$2,$3,$4,$5,'BDT',$6,'manual',$7,$8,$9)",
        [entryId, ctx.workspaceId, ctx.storeId, entryType, amount,
          new Date(expenseDate + "T12:00:00+06:00").toISOString(),
          "legacy-expense:" + id, "legacy:expense:" + id, "Imported legacy expense"],
      );
    }
    await saveIdentity(target, ctx.workspaceId, "expenses", id, "expenses", id, rowHash);
    await target.query("commit");
    await clearHold(target, ctx.workspaceId, "expenses", id);
    totals.expenses.imported++;
    recordPreflight(ctx, "expenses", id, "expenses", id, "imported");
  } catch (error) {
    await target.query("rollback");
    const reason = destinationFailureReason(error);
    await putHold(target, ctx.workspaceId, "expenses", id, reason);
    totals.holds++;
    totals.rejected++;
    totals.failed_operations++;
    recordPreflight(ctx, "expenses", id, "expenses", id, "rejected", reason);
  }
}

async function holdUnsupported(source, target, workspaceId, totals, ctx) {
  for (const table of Object.keys(UNSUPPORTED_KEYS)) {
    if (!await exists(source, table)) continue;
    for await (const row of pageRows(source, table, UNSUPPORTED_KEYS[table])) {
      await putHold(target, workspaceId, table, rowKey(row, UNSUPPORTED_KEYS[table]),
        table === "dashboard_user_profiles" ? "membership_requires_explicit_invitation" : "legacy_entity_not_mapped_to_universal_accounting");
      totals.holds++;
      recordPreflight(ctx, table, rowKey(row, UNSUPPORTED_KEYS[table]), null, null, "held", table === "dashboard_user_profiles" ? "membership_requires_explicit_invitation" : "legacy_entity_not_mapped_to_universal_accounting");
    }
  }
  for await (const category of pageRows(source, "categories", ["id"])) {
    await putHold(target, workspaceId, "categories", String(category.id), "category_slug_and_status_not_represented");
    totals.holds++;
    recordPreflight(ctx, "categories", category.id, null, null, "held", "category_slug_and_status_not_represented");
  }
}

export function createSimulationTarget(target, ctx) {
  let savepoint = 0;
  const stack = [];
  return {
    async query(sql, values) {
      const statement = String(sql).trim().toLowerCase();
      if (statement === "begin") {
        const name = `preflight_${++savepoint}`;
        stack.push(name);
        return target.query(`savepoint ${name}`);
      }
      if (statement === "commit") {
        const name = stack.pop();
        return name ? target.query(`release savepoint ${name}`) : { rows: [] };
      }
      if (statement === "rollback") {
        const name = stack.pop();
        if (!name) throw new Error("Unexpected rollback outside a simulated row transaction.");
        await target.query(`rollback to savepoint ${name}`);
        return target.query(`release savepoint ${name}`);
      }
      if (statement.startsWith("insert into public.legacy_import_holds")) {
        recordPreflight(ctx, values?.[1], values?.[2], null, null, "held", values?.[3]);
      }
      if (statement.startsWith("insert into public.legacy_import_records")) {
        recordPreflight(ctx, values?.[1], values?.[2], values?.[3], values?.[4], "imported");
      }
      return target.query(sql, values);
    },
  };
}
async function completeRun(target, runId, workspaceId, totals) {
  const holds = await target.query("select count(*)::int as count from public.legacy_import_holds where workspace_id=$1 and resolved_at is null", [workspaceId]);
  const targetCounts = {};
  for (const table of ["products", "product_variants", "customers", "orders", "order_items", "refunds", "expenses", "inventory_levels", "financial_entries"]) {
    const result = await target.query("select count(*)::bigint as count from public." + quote(table) + " where workspace_id=$1", [workspaceId]);
    targetCounts[table] = Number(result.rows[0].count);
  }
  const status = holds.rows[0].count ? "completed_with_holds" : "completed";
  await target.query("update public.legacy_import_runs set status=$2,finished_at=now(),current_stage=null,last_completed_stage='complete',summary=$3::jsonb where id=$1",
    [runId, status, JSON.stringify({ ...totals, ...outcomeCounts(totals), last_completed_stage: "complete", target_counts_after: targetCounts, active_holds: holds.rows[0].count })]);
  return { status, activeHolds: holds.rows[0].count, targetCounts };
}

async function recordRunStage(target, runId, stage, completed, totals) {
  await target.query(
    "update public.legacy_import_runs set current_stage=$2,last_completed_stage=$3,summary=$4::jsonb where id=$1",
    [runId, stage, completed, JSON.stringify({ ...totals, ...outcomeCounts(totals), last_completed_stage: completed })],
  );
}

export async function migrateLegacyWorkspace(source, target, options) {
  const ctx = options;
  await verifySource(source);
  await verifyMapping(source, target, ctx);
  const summary = await sourceSummary(source);
  const fingerprint = digest({ tables: summary.tables, checks: summary.checks, sourceOwnerId: ctx.sourceOwnerId });
  const runId = ctx.runId || randomUUID();
  ctx.write("Source row counts: " + canonical(summary.tables) + "\n");
  ctx.write("Preflight checks: " + canonical(summary.checks) + "\n");
  ctx.write("Explicit owner, workspace, and disconnected store mapping verified.\n");
  if (!ctx.apply) {
    const preflight = new Map();
    const simulationContext = { ...ctx, preflight };
    const simulatedTarget = createSimulationTarget(target, simulationContext);
    const totals = counts();
    await target.query("begin");
    try {
      for await (const row of pageRows(source, "products", ["id"])) await importProduct(source, simulatedTarget, row, simulationContext, totals);
      for await (const row of pageRows(source, "orders", ["id"])) await importOrder(source, simulatedTarget, row, simulationContext, totals);
      for await (const row of pageRows(source, "expenses", ["id"])) await importExpense(source, simulatedTarget, row, simulationContext, totals);
      await holdUnsupported(source, simulatedTarget, ctx.workspaceId, totals, simulationContext);
    } finally {
      await target.query("rollback");
    }
    const relatedOrders = new Map();
    for await (const order of pageRows(source, "orders", ["id"])) {
      const items = await source.query("select id,product_id from public.order_items where order_id=$1 order by id", [order.id]);
      for (const item of items.rows) {
        const parent = preflight.get(`orders:${order.id}`);
        const status = parent?.expected_action === "imported" || parent?.expected_action === "skipped" ? "imported" : "held";
        const reason = status === "held" ? "parent_order_not_imported" : null;
        recordPreflight(simulationContext, "order_items", item.id, "order_items", item.id, status, reason, [{ table: "orders", id: order.id }, { table: "products", id: item.product_id }]);
        if (!relatedOrders.has(String(order.id))) relatedOrders.set(String(order.id), []);
        relatedOrders.get(String(order.id)).push(item.id);
      }
    }
    const report = [...preflight.values()].sort((a, b) => a.source_table.localeCompare(b.source_table) || a.source_id.localeCompare(b.source_id));
    for (const row of report) if (row.expected_action === "held" || row.expected_action === "rejected") row.manual_intervention_required = true;
    ctx.write("DRY RUN: shared apply transformations ran in a rollback-only target transaction; no source or target rows were persisted.\n");
    ctx.write("Row-level preflight report (JSON Lines):\n");
    for (const row of report) ctx.write(JSON.stringify(row) + "\n");
    ctx.write(`Preflight rows: ${report.length}; imported ${report.filter((row) => row.expected_action === "imported").length}; skipped ${report.filter((row) => row.expected_action === "skipped").length}; held ${report.filter((row) => row.expected_action === "held").length}; rejected ${report.filter((row) => row.expected_action === "rejected").length}.\n`);
    ctx.write("To apply or resume this import, use --apply --run-id " + runId + ".\n");
    return { mode: "dry-run", runId, fingerprint, summary, preflight: report, totals };
  }
  let currentStage = "products";
  let lastCompletedStage = null;
  const totals = counts();
  await target.query("select pg_advisory_lock(741596204501)");
  try {
    const prior = await target.query("select * from public.legacy_import_runs where id=$1", [runId]);
    if (prior.rows.length) {
      const row = prior.rows[0];
      if (row.source_fingerprint !== fingerprint || row.workspace_id !== ctx.workspaceId
        || row.store_id !== ctx.storeId || row.source_owner_id !== ctx.sourceOwnerId || row.target_owner_id !== ctx.targetOwnerId) {
        throw new Error("Resume run does not match its source and workspace mapping.");
      }
      await target.query("update public.legacy_import_runs set status='running',finished_at=null,current_stage='products' where id=$1", [runId]);
      const last = await target.query("select last_completed_stage from public.legacy_import_runs where id=$1", [runId]);
      lastCompletedStage = last.rows[0]?.last_completed_stage ?? null;
    } else {
      await target.query(
        "insert into public.legacy_import_runs(id,source_fingerprint,workspace_id,store_id,source_owner_id,target_owner_id,status,current_stage) values($1,$2,$3,$4,$5,$6,'running','products')",
        [runId, fingerprint, ctx.workspaceId, ctx.storeId, ctx.sourceOwnerId, ctx.targetOwnerId],
      );
    }
    ctx.write("Importing products and opening stock...\n");
    for await (const row of pageRows(source, "products", ["id"])) await importProduct(source, target, row, ctx, totals);
    ctx.write("Products: " + totals.products.imported + " imported, " + totals.products.skipped + " unchanged.\n");
    lastCompletedStage = "products";
    currentStage = "orders";
    await recordRunStage(target, runId, currentStage, lastCompletedStage, totals);
    ctx.write("Importing orders and customer snapshots...\n");
    for await (const row of pageRows(source, "orders", ["id"])) await importOrder(source, target, row, ctx, totals);
    ctx.write("Orders: " + totals.orders.imported + " imported, " + totals.orders.skipped + " unchanged.\n");
    lastCompletedStage = "orders";
    currentStage = "expenses";
    await recordRunStage(target, runId, currentStage, lastCompletedStage, totals);
    ctx.write("Importing expenses and retaining unsupported entities as holds...\n");
    for await (const row of pageRows(source, "expenses", ["id"])) await importExpense(source, target, row, ctx, totals);
    ctx.write("Expenses: " + totals.expenses.imported + " imported, " + totals.expenses.skipped + " unchanged.\n");
    lastCompletedStage = "expenses";
    currentStage = "holds";
    await recordRunStage(target, runId, currentStage, lastCompletedStage, totals);
    await holdUnsupported(source, target, ctx.workspaceId, totals, ctx);
    ctx.write("Holds: " + totals.holds + " retained; " + totals.rejected + " rejected; " + totals.failed_operations + " failed row writes.\n");
    lastCompletedStage = "holds";
    currentStage = "completion";
    await recordRunStage(target, runId, currentStage, lastCompletedStage, totals);
    const finished = await completeRun(target, runId, ctx.workspaceId, totals);
    ctx.write("Import " + runId + ": " + finished.status + "; products " + totals.products.imported + " imported/"
      + totals.products.skipped + " unchanged; orders " + totals.orders.imported + " imported/"
      + totals.orders.skipped + " unchanged; expenses " + totals.expenses.imported + " imported/"
      + totals.expenses.skipped + " unchanged; " + finished.activeHolds + " active holds.\n");
    ctx.write("Target workspace counts after import: " + canonical(finished.targetCounts) + "\n");
    return { mode: "apply", runId, fingerprint, totals, ...finished };
  } catch (error) {
    totals.failed_operations++;
    await target.query(
      "update public.legacy_import_runs set status='failed',finished_at=now(),current_stage=$2,summary=$3::jsonb where id=$1",
      [runId, currentStage, JSON.stringify({ ...totals, ...outcomeCounts(totals), failure_stage: currentStage, last_completed_stage: lastCompletedStage, safe_to_resume: true })],
    );
    throw error;
  } finally {
    await target.query("select pg_advisory_unlock(741596204501)");
  }
}

function connectionIdentity(value) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (["localhost", "127.0.0.1", "::1"].includes(hostname) ? "loopback" : hostname)
    + ":" + (url.port || "5432") + "/" + url.pathname;
}
async function main() {
  if (process.argv.includes("--report")) {
    const targetUrl = process.env.UNIVERSAL_DATABASE_URL;
    const workspaceId = process.env.TARGET_WORKSPACE_ID;
    if (!targetUrl || !workspaceId || !isLoopbackPostgresUrl(targetUrl)) {
      throw new Error("Set a loopback UNIVERSAL_DATABASE_URL and explicit TARGET_WORKSPACE_ID to inspect import holds.");
    }
    const target = new Client({ connectionString: targetUrl, application_name: "legacy-workspace-hold-report" });
    await target.connect();
    try {
      const runs = await target.query(
        "select id,status,current_stage,last_completed_stage,summary,started_at,finished_at from public.legacy_import_runs where workspace_id=$1 order by started_at desc limit 25",
        [workspaceId],
      );
      process.stdout.write("Recent legacy import runs: " + runs.rows.length + "\n");
      for (const run of runs.rows) process.stdout.write(JSON.stringify({ ...run, safe_resume: ["running", "failed"].includes(run.status) }) + "\n");
      const result = await target.query(
        "select source_table,source_id,reason_code,last_seen_at from public.legacy_import_holds where workspace_id=$1 and resolved_at is null order by source_table,source_id",
        [workspaceId],
      );
      process.stdout.write("Active legacy import holds: " + result.rows.length + "\n");
      for (const row of result.rows) process.stdout.write(JSON.stringify(row) + "\n");
    } finally { await target.end(); }
    return;
  }
  const sourceUrl = process.env.LEGACY_SOURCE_DATABASE_URL;
  const targetUrl = process.env.UNIVERSAL_DATABASE_URL;
  const mapping = {
    sourceOwnerId: process.env.LEGACY_OWNER_USER_ID, targetOwnerId: process.env.TARGET_OWNER_USER_ID,
    workspaceId: process.env.TARGET_WORKSPACE_ID, storeId: process.env.TARGET_STORE_ID,
  };
  if (!sourceUrl || !targetUrl || Object.values(mapping).some((value) => !value)) {
    throw new Error("Set explicit source/target database URLs, legacy owner, target owner, workspace, and disconnected import store.");
  }
  if (!isLoopbackPostgresUrl(sourceUrl) || !isLoopbackPostgresUrl(targetUrl)) {
    throw new Error("Legacy migration is loopback-only; remote and production databases are refused.");
  }
  if (connectionIdentity(sourceUrl) === connectionIdentity(targetUrl)) throw new Error("Legacy source and universal target must be separate local databases.");
  const index = process.argv.indexOf("--run-id");
  const runId = index >= 0 ? process.argv[index + 1] : undefined;
  if (runId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) {
    throw new Error("--run-id must be a UUID.");
  }
  const source = new Client({ connectionString: sourceUrl, application_name: "legacy-workspace-preflight" });
  const target = new Client({ connectionString: targetUrl, application_name: "legacy-workspace-import" });
  await source.connect(); await target.connect();
  try {
    await source.query("begin isolation level repeatable read read only");
    const result = await migrateLegacyWorkspace(source, target, {
      ...mapping, apply: process.argv.includes("--apply"), runId,
      write: (message) => process.stdout.write(message),
    });
    await source.query("commit");
    if (result.mode === "dry-run") process.stdout.write("Dry-run ID: " + result.runId + "\n");
  } catch (error) {
    await source.query("rollback").catch(() => undefined);
    process.stderr.write((error instanceof Error ? error.message : "Legacy migration failed.") + "\n");
    process.exitCode = 1;
  } finally {
    await source.end(); await target.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
