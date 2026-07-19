import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calculateLineCogs, calculateLineRevenue, calculateOrderFinancials } from "@/domain/calculations";
import { formatMoney } from "@/domain/money";
import { getBusinessRepository } from "@/data/provider";
import { OrderStatusForm } from "@/components/orders/order-status-form";
import { requireDashboardUser } from "@/lib/auth/session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [repository, user] = await Promise.all([getBusinessRepository(), requireDashboardUser()]);
  const order = await repository.getOrder(id);
  if (!order) notFound();
  const canUpdateStatuses = resolveBusinessDataProvider() === "supabase" && ["owner", "admin"].includes(user.role);
  const finance = calculateOrderFinancials(order);
  const facts = [["Order date", order.orderDate], ["Sales channel", order.channel], ["Customer", order.customerName], ["Customer phone", order.customerPhone ?? "—"], ["Customer address", order.customerAddress ?? "—"], ["Customer note", order.customerNote ?? "—"], ["Location", order.customerLocation], ["Courier", order.courier], ["External reference", order.externalReference ?? "—"], ["Campaign", order.campaign], ["Payment method", order.paymentMethod]];
  return <><PageHeading title={order.orderNumber} description="Order details and immutable financial snapshots." actions={<Button variant="outline" size="sm" render={<Link href="/orders" />}><ArrowLeft /> Back</Button>} /><div className="grid gap-4 xl:grid-cols-12"><section className="panel p-5 xl:col-span-7"><div className="flex flex-wrap gap-2"><StatusBadge value={order.status} /><StatusBadge value={order.paymentStatus} /><StatusBadge value={order.settlementStatus} /></div><dl className="mt-6 grid gap-x-6 gap-y-5 sm:grid-cols-2">{facts.map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>)}</dl></section><section className="panel p-5 xl:col-span-5"><h2 className="text-sm font-semibold">Financial summary</h2><dl className="mt-4 space-y-3">{[["Product subtotal", finance.productSubtotal], ["Product revenue", finance.productRevenue], ["Delivery charged", order.deliveryCharged], ["Discount", -order.discount], ["Order total", finance.orderTotal], ["Refund", -order.refundAmount], ["Net revenue", finance.netRevenue], ["Recognized COGS", -finance.recognizedCogs], ["Contribution profit", finance.contributionProfit]].map(([label, value], index) => <div key={String(label)} className={`flex justify-between text-sm ${index === 4 || index === 8 ? "border-t pt-3 font-semibold" : ""}`}><dt className="text-muted-foreground">{label}</dt><dd className="money">{formatMoney(value as number)}</dd></div>)}</dl></section></div><OrderStatusForm order={order} enabled={canUpdateStatuses} /><section className="panel mt-4 overflow-hidden"><div className="border-b p-4"><h2 className="text-sm font-semibold">Order items</h2><p className="mt-1 text-xs text-muted-foreground">Prices and buying costs are transaction snapshots.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>SKU / product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Unit price</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">COGS</TableHead></TableRow></TableHeader><TableBody>{order.items.map((item) => <TableRow key={item.id}><TableCell><p className="font-medium">{item.productNameSnapshot}</p><p className="text-xs text-muted-foreground">{item.skuSnapshot}</p></TableCell><TableCell className="text-right">{item.quantity}</TableCell><TableCell className="money text-right">{formatMoney(item.actualUnitSellingPrice)}</TableCell><TableCell className="money text-right">{formatMoney(calculateLineRevenue(item))}</TableCell><TableCell className="money text-right">{formatMoney(calculateLineCogs(item))}</TableCell></TableRow>)}</TableBody></Table></div></section></>;
}
