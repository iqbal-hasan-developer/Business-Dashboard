import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { OrdersTable } from "@/components/orders/orders-table";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { getBusinessRepository } from "@/data/provider";

export default async function OrdersPage() {
  const orders = await (await getBusinessRepository()).getOrders();
  return <><PageHeading title="Orders" description="Track order progress, payment state, and courier settlement separately." actions={<><Button variant="outline" size="sm"><Download /> Export</Button><Button size="sm" render={<Link href="/orders/new" />}><Plus /> New order</Button></>} /><OrdersTable orders={orders} /></>;
}
