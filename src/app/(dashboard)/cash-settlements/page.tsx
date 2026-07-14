import { CircleCheckBig, Clock3, Download, WalletCards } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeading } from "@/components/page-heading";
import { PrototypeAction } from "@/components/prototype-action";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calculateOrderFinancials } from "@/domain/calculations";
import { formatMoney } from "@/domain/money";
import { getBusinessRepository } from "@/data/provider";

export default async function CashSettlementsPage() {
  const orders = (await (await getBusinessRepository()).getOrders()).filter((order) => order.paymentMethod === "COD").slice(0, 8);
  return <><PageHeading title="Cash settlements" description="Reconcile courier collections without conflating delivery and payment states." actions={<PrototypeAction message="Settlement report prepared" variant="outline" size="sm"><Download /> Export</PrototypeAction>} /><div className="grid gap-3 sm:grid-cols-3"><MetricCard label="COD receivable" value="৳5,240" detail="Awaiting or partially settled" icon={WalletCards} tone="amber" /><MetricCard label="Settled this period" value="৳4,870" detail="4 completed settlements" icon={CircleCheckBig} tone="emerald" /><MetricCard label="Average settlement age" value="2.4 days" detail="Across unsettled deliveries" icon={Clock3} tone="blue" /></div><section className="panel mt-4 overflow-hidden"><div className="border-b p-4"><h2 className="text-sm font-semibold">Courier settlement queue</h2><p className="mt-1 text-xs text-muted-foreground">COD order total and courier status shown side by side.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Customer</TableHead><TableHead>Order status</TableHead><TableHead>Settlement</TableHead><TableHead className="text-right">COD amount</TableHead></TableRow></TableHeader><TableBody>{orders.map((order) => <TableRow key={order.id}><TableCell className="font-medium">{order.orderNumber}</TableCell><TableCell>{order.customerName}</TableCell><TableCell><StatusBadge value={order.status} /></TableCell><TableCell><StatusBadge value={order.settlementStatus} /></TableCell><TableCell className="money text-right font-medium">{formatMoney(calculateOrderFinancials(order).orderTotal)}</TableCell></TableRow>)}</TableBody></Table></div></section></>;
}
