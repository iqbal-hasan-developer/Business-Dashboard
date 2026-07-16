import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { NewOrderForm } from "@/components/orders/new-order-form";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { getBusinessRepository } from "@/data/provider";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default async function NewOrderPage() {
  if (resolveBusinessDataProvider() === "supabase") {
    return <><PageHeading title="Create order" description="Order creation remains disabled during the read-only development connection checkpoint." actions={<Button variant="outline" size="sm" render={<Link href="/orders" />}><ArrowLeft /> Back to orders</Button>} /><Empty className="panel min-h-80"><EmptyHeader><EmptyMedia variant="icon"><ShieldCheck /></EmptyMedia><EmptyTitle>Order creation is not enabled</EmptyTitle><EmptyDescription>No order, item, financial snapshot, or inventory record will be written during connection verification.</EmptyDescription></EmptyHeader></Empty></>;
  }
  const repository = await getBusinessRepository();
  const [products, orders] = await Promise.all([repository.getProducts(), repository.getOrders()]);
  return <><PageHeading title="Create order" description="Capture the order, preserve financial snapshots, and review it before saving." actions={<Button variant="outline" size="sm" render={<Link href="/orders" />}><ArrowLeft /> Back to orders</Button>} /><NewOrderForm products={products} existingOrderNumbers={orders.map((order) => order.orderNumber)} /></>;
}
