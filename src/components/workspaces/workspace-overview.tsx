import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { WorkspaceOverview } from "@/domain/workspace-overview";
import type { WorkspaceReportingMetrics } from "@/data/universal-workspace";

const cards = [
  { key: "stores", label: "Stores" },
  { key: "products", label: "Products" },
  { key: "orders", label: "Orders" },
  { key: "customers", label: "Customers" },
  { key: "expenses", label: "Expenses" },
] as const;

const notices: Record<string, string> = {
  "legacy-data-not-migrated": "That legacy dashboard feature is paused until its records are safely mapped into this workspace.",
  "workspace-not-authorized": "You no longer have access to that workspace.",
  "invitation-accepted": "Invitation accepted. You are now in the invited workspace.",
};

function currency(value: number | null, code: string) {
  if (value === null) return "Incomplete";
  try { return new Intl.NumberFormat("en-BD", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(value); }
  catch { return `${code} ${value.toFixed(2)}`; }
}

export function WorkspaceOverviewPage({ data, metrics, period, notice }: { data: WorkspaceOverview; metrics: WorkspaceReportingMetrics | null; period: { startDate: string; endDate: string }; notice?: string }) {
  const isEmpty = data.stores + data.products + data.orders + data.expenses === 0;
  return (
    <div className="space-y-6">
      <PageHeading title={data.workspaceName} description={`Workspace overview · ${data.role} access`} actions={<Button render={<Link href="/workspace" />}>Workspace settings</Button>} />
      {notice && notices[notice] ? <Alert><AlertDescription>{notices[notice]}</AlertDescription></Alert> : null}
      {isEmpty ? (
        <section className="panel space-y-2 p-5 sm:p-6">
          <h2 className="text-base font-semibold">This workspace is ready for data</h2>
          <p className="text-sm text-muted-foreground">No canonical store records are available yet. Existing single-business records are not copied into a workspace automatically; use the documented migration plan before importing them.</p>
          <Button variant="outline" render={<Link href="/workspace" />}>Manage workspace access</Button>
        </section>
      ) : null}
      <section aria-label="Workspace record counts" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => {
          const value = data[card.key];
          return <article className="panel p-4" key={card.key}><p className="text-sm text-muted-foreground">{card.label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value === null ? "Restricted" : value.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">Current workspace records</p></article>;
        })}
      </section>
      <section className="space-y-3">
        <div><h2 className="text-base font-semibold">Financial performance</h2><p className="text-xs text-muted-foreground">{period.startDate} to {period.endDate} · Dhaka business dates</p></div>
        {metrics ? metrics.totals.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.totals.map((total) => <article className="panel space-y-3 p-4" key={total.currency}><h3 className="text-sm font-semibold">{total.currency}</h3><dl className="grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted-foreground">Recognized revenue</dt><dd className="mt-1 font-semibold">{currency(total.revenue, total.currency)}</dd></div><div><dt className="text-muted-foreground">Completed orders</dt><dd className="mt-1 font-semibold">{total.orders}</dd></div><div><dt className="text-muted-foreground">Average order value</dt><dd className="mt-1 font-semibold">{currency(total.average_order_value, total.currency)}</dd></div><div><dt className="text-muted-foreground">Gross profit</dt><dd className="mt-1 font-semibold">{currency(total.gross_profit, total.currency)}</dd></div><div><dt className="text-muted-foreground">Operating expenses</dt><dd className="mt-1 font-semibold">{currency(total.expenses, total.currency)}</dd></div><div><dt className="text-muted-foreground">Net profit</dt><dd className="mt-1 font-semibold">{currency(total.net_profit, total.currency)}</dd></div><div><dt className="text-muted-foreground">Refunds</dt><dd className="mt-1 font-semibold">{currency(total.refunds, total.currency)}</dd></div><div><dt className="text-muted-foreground">Low stock alerts</dt><dd className="mt-1 font-semibold">{metrics.low_stock_count}</dd></div></dl></article>)}</div> : <section className="panel p-5 text-sm text-muted-foreground">No financial entries or completed orders are recorded for this period.</section> : <section className="panel p-5 text-sm text-muted-foreground">Financial metrics are restricted to workspace owners and administrators.</section>}
      </section>
      {metrics && <div className="grid gap-4 lg:grid-cols-2"><section className="panel p-4"><h2 className="text-sm font-semibold">Revenue trend</h2>{metrics.daily_revenue.length ? <ul className="mt-3 divide-y">{metrics.daily_revenue.map((day) => <li className="flex justify-between py-2 text-sm" key={`${day.date}-${day.currency}`}><span>{day.date} · {day.currency}</span><span className="font-medium">{currency(day.revenue, day.currency)}</span></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No recognized sales in this period.</p>}</section><section className="panel p-4"><h2 className="text-sm font-semibold">Best-selling products</h2>{metrics.best_sellers.length ? <ul className="mt-3 divide-y">{metrics.best_sellers.map((product, index) => <li className="flex justify-between gap-3 py-2 text-sm" key={`${product.name}-${product.currency}-${index}`}><span>{product.name} · {product.quantity}</span><span className="font-medium">{currency(product.sales, product.currency)}</span></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No fulfilled order items in this period.</p>}</section><section className="panel p-4"><h2 className="text-sm font-semibold">Customer growth</h2>{metrics.customer_growth.length ? <ul className="mt-3 divide-y">{metrics.customer_growth.map((day) => <li className="flex justify-between py-2 text-sm" key={day.date}><span>{day.date}</span><span className="font-medium">{day.customers}</span></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No new customer profiles in this period.</p>}</section><section className="panel p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Recent orders</h2><Link href="/orders" className="text-xs text-primary">View all</Link></div>{metrics.recent_orders.length ? <ul className="mt-3 divide-y">{metrics.recent_orders.map((order) => <li className="flex justify-between gap-3 py-2 text-sm" key={order.order_number}><span>{order.order_number} · {order.status.replaceAll("_", " ")}</span><span className="font-medium">{currency(order.total, order.currency)}</span></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No orders recorded.</p>}</section></div>}
      <p className="text-xs text-muted-foreground">Revenue comes from recorded financial entries. Gross profit is revenue less discounts, refunds, and COGS. Net profit also includes shipping income and subtracts shipping costs, fees, and operating expense entries. Profit stays marked incomplete when a completed order lacks revenue, COGS, or refund evidence. Taxes and unallocated procurement are excluded; missing entries are not estimated.</p>
    </div>
  );
}
