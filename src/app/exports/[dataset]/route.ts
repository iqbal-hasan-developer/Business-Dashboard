import { buildFinancialReportCsv, buildOrdersCsv, buildProductsCsv } from "@/domain/exports";
import { dhakaBusinessDate, resolveReportingPeriod } from "@/domain/reporting-period";
import { getBusinessRepository } from "@/data/provider";
import { getDashboardUser } from "@/lib/auth/session";
import { asUniversalClient, getWorkspaceSession } from "@/lib/auth/workspace-session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";

const datasets = ["orders", "products", "customers", "inventory", "expenses", "financial-report"] as const;
type ExportDataset = typeof datasets[number];

class ExportLimitError extends Error {}

function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^\s*[=+@-]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
function csv(rows: Array<Array<unknown>>) { return rows.map((row) => row.map(csvCell).join(",")).join("\r\n"); }
function csvResponse(contents: string, dataset: ExportDataset) {
  const filename = `commerce-${dataset}-${dhakaBusinessDate()}.csv`;
  return new Response(`\uFEFF${contents}`, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
async function pagedRows(supabase: ReturnType<typeof asUniversalClient>, table: "orders" | "products" | "customers" | "inventory_levels" | "expenses", columns: string, workspaceId: string, orderColumn: string) {
  const rows: Array<Record<string, unknown>> = [];
  for (let start = 0; start < 20_000; start += 1_000) {
    const { data, error } = await supabase.from(table).select(columns).eq("workspace_id", workspaceId)
      .order(orderColumn, { ascending: false }).range(start, start + 999);
    if (error) throw new Error("Workspace export could not be prepared.");
    const batch = (data ?? []) as unknown as Array<Record<string, unknown>>;
    rows.push(...batch);
    if (batch.length < 1_000) return rows;
  }
  throw new ExportLimitError("This export exceeds the 20,000-row safety limit. Filter the report before exporting.");
}
function dateParam(value: string | null, fallback: string) {
  const timestamp = value ? Date.parse(`${value}T00:00:00Z`) : Number.NaN;
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(timestamp)
    && new Date(timestamp).toISOString().slice(0, 10) === value ? value : fallback;
}

export async function GET(request: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const { dataset: requested } = await params;
  if (!datasets.includes(requested as ExportDataset)) return Response.json({ error: "Export not found." }, { status: 404 });
  const dataset = requested as ExportDataset;
  if (resolveBusinessDataProvider() === "supabase") {
    const session = await getWorkspaceSession();
    if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
    if (!session.activeWorkspace) return Response.json({ error: "An authorized workspace is required." }, { status: 403 });
    if (dataset === "financial-report" && !["owner", "admin"].includes(session.activeWorkspace.role)) {
      return Response.json({ error: "Owner or administrator access is required." }, { status: 403 });
    }
    const supabase = asUniversalClient(await createServerSupabaseClient());
    const workspaceId = session.activeWorkspace.id;
    try {
      if (dataset === "orders") {
        const rows = await pagedRows(supabase, "orders", "order_number,status,payment_status,fulfillment_status,currency,subtotal,discount_total,shipping_total,refund_total,total,placed_at", workspaceId, "placed_at");
        return csvResponse(csv([["order_number", "status", "payment_status", "fulfillment_status", "currency", "subtotal", "discount", "shipping", "refunds", "total", "placed_at"], ...rows.map((row) => [row.order_number, row.status, row.payment_status, row.fulfillment_status, row.currency, row.subtotal, row.discount_total, row.shipping_total, row.refund_total, row.total, row.placed_at])]), dataset);
      }
      if (dataset === "products") {
        const rows = await pagedRows(supabase, "products", "name,sku,category,brand,status,currency,price,created_at,updated_at", workspaceId, "updated_at");
        return csvResponse(csv([["name", "sku", "category", "brand", "status", "currency", "price", "created_at", "updated_at"], ...rows.map((row) => [row.name, row.sku, row.category, row.brand, row.status, row.currency, row.price, row.created_at, row.updated_at])]), dataset);
      }
      if (dataset === "customers") {
        const rows = await pagedRows(supabase, "customers", "full_name,first_seen_at,last_seen_at", workspaceId, "last_seen_at");
        return csvResponse(csv([["customer_name", "first_seen_at", "last_seen_at"], ...rows.map((row) => [row.full_name, row.first_seen_at, row.last_seen_at])]), dataset);
      }
      if (dataset === "expenses") {
        const rows = await pagedRows(supabase, "expenses", "category,description,amount,currency,expense_date,status,accounting_class,payment_method,receipt_reference", workspaceId, "expense_date");
        return csvResponse(csv([["category", "description", "amount", "currency", "expense_date", "status", "accounting_class", "payment_method", "receipt_reference"], ...rows.map((row) => [row.category, row.description, row.amount, row.currency, row.expense_date, row.status, row.accounting_class, row.payment_method, row.receipt_reference])]), dataset);
      }
      if (dataset === "inventory") {
        const rows = await pagedRows(supabase, "inventory_levels", "store_id,product_variant_id,quantity,reorder_level,observed_at", workspaceId, "observed_at");
        return csvResponse(csv([["store_id", "product_variant_id", "quantity", "reorder_level", "observed_at"], ...rows.map((row) => [row.store_id, row.product_variant_id, row.quantity, row.reorder_level, row.observed_at])]), dataset);
      }
      const params = new URL(request.url).searchParams;
      const today = dhakaBusinessDate();
      const defaults = resolveReportingPeriod(today, "30d");
      const startDate = dateParam(params.get("start"), defaults.startDate);
      const endDate = dateParam(params.get("end"), today);
      if (startDate > endDate || endDate > today || (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000 > 366) return Response.json({ error: "Invalid reporting dates." }, { status: 400 });
      const { data, error } = await supabase.rpc("workspace_reporting_metrics", { p_workspace_id: workspaceId, p_start_date: startDate, p_end_date: endDate });
      if (error) throw new Error("Workspace export could not be prepared.");
      const result = data as { totals: Array<Record<string, unknown>> };
      const totals = result.totals ?? [];
      return csvResponse(csv([["currency", "completed_orders", "average_order_value", "revenue", "discounts", "refunds", "cogs", "shipping_income", "shipping_cost", "fees", "operating_expenses", "gross_profit", "net_profit", "start_date", "end_date"], ...totals.map((row) => [row.currency, row.orders, row.average_order_value, row.revenue, row.discounts, row.refunds, row.cogs, row.shipping_income, row.shipping_cost, row.fees, row.expenses, row.gross_profit, row.net_profit, startDate, endDate])]), dataset);
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Unable to prepare the export." }, {
        status: error instanceof ExportLimitError ? 413 : 500,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
  }

  const user = await getDashboardUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "owner") return Response.json({ error: "Owner access is required." }, { status: 403 });
  try {
    const repository = await getBusinessRepository();
    if (dataset === "orders") return csvResponse(buildOrdersCsv(await repository.getOrders()), dataset);
    if (dataset === "products") {
      const [products, categories] = await Promise.all([repository.getProducts(), repository.getProductCategories()]);
      return csvResponse(buildProductsCsv(products, categories), dataset);
    }
    if (dataset === "financial-report") return csvResponse(buildFinancialReportCsv(await repository.getDashboard()), dataset);
    return Response.json({ error: "This export is available in workspace mode." }, { status: 409 });
  } catch {
    return Response.json({ error: "Unable to prepare the export." }, { status: 500 });
  }
}
