import { CircleCheckBig, ShoppingBag, WalletCards } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeading } from "@/components/page-heading";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calculateOrderFinancials } from "@/domain/calculations";
import { formatMoney } from "@/domain/money";
import { getBusinessRepository } from "@/data/provider";

export default async function CashSettlementsPage() {
  const codOrders = (await (await getBusinessRepository()).getOrders())
    .filter((order) => order.paymentMethod === "COD");
  const delivered = codOrders.filter((order) => order.status === "Delivered");
  const unsettled = delivered.filter((order) => order.settlementStatus !== "Settled");
  const settled = delivered.filter((order) => order.settlementStatus === "Settled");
  const total = (orders: typeof codOrders) => orders.reduce((sum, order) => sum + calculateOrderFinancials(order).orderTotal, 0);

  return <><PageHeading title="Cash settlements" description="Reconcile courier collections without conflating delivery and payment states." /><div className="grid gap-3 sm:grid-cols-3"><MetricCard label="COD receivable" value={formatMoney(total(unsettled))} detail={`${unsettled.length} delivered orders awaiting settlement`} icon={WalletCards} tone="amber" /><MetricCard label="Settled COD value" value={formatMoney(total(settled))} detail={`${settled.length} delivered orders settled`} icon={CircleCheckBig} tone="emerald" /><MetricCard label="COD orders" value={String(codOrders.length)} detail="Current authenticated result set" icon={ShoppingBag} tone="blue" /></div><section className="panel mt-4 overflow-hidden"><div className="border-b p-4"><h2 className="text-sm font-semibold">Courier settlement queue</h2><p className="mt-1 text-xs text-muted-foreground">COD order total and courier status shown side by side.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Customer</TableHead><TableHead>Order status</TableHead><TableHead>Settlement</TableHead><TableHead className="text-right">COD amount</TableHead></TableRow></TableHeader><TableBody>{codOrders.length ? codOrders.slice(0, 8).map((order) => <TableRow key={order.id}><TableCell className="font-medium">{order.orderNumber}</TableCell><TableCell>{order.customerName}</TableCell><TableCell><StatusBadge value={order.status} /></TableCell><TableCell><StatusBadge value={order.settlementStatus} /></TableCell><TableCell className="money text-right font-medium">{formatMoney(calculateOrderFinancials(order).orderTotal)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No COD orders exist in the development project.</TableCell></TableRow>}</TableBody></Table></div></section></>;
}
