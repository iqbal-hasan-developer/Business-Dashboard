import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewOrderForm } from "@/components/orders/new-order-form";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { getBusinessRepository } from "@/data/provider";

export default async function NewOrderPage() {
  const repository = await getBusinessRepository();
  const [products, orders] = await Promise.all([repository.getProducts(), repository.getOrders()]);
  return <><PageHeading title="Create order" description="Capture the order, preserve financial snapshots, and review it before saving." actions={<Button variant="outline" size="sm" render={<Link href="/orders" />}><ArrowLeft /> Back to orders</Button>} /><NewOrderForm products={products} existingOrderNumbers={orders.map((order) => order.orderNumber)} /></>;
}
