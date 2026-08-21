import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewOrderForm } from "@/components/orders/new-order-form";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { getBusinessRepository } from "@/data/provider";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { dhakaBusinessDate } from "@/domain/reporting-period";
import { requireDashboardUser } from "@/lib/auth/session";

export default async function NewOrderPage() {
  const [repository, user] = await Promise.all([getBusinessRepository(), requireDashboardUser()]);
  const [products, orders, settings] = await Promise.all([repository.getProducts(), repository.getOrders(), repository.getBusinessSettings()]);
  const persistenceEnabled = resolveBusinessDataProvider() === "supabase" && ["owner", "admin", "data_entry"].includes(user.role);
  return <><PageHeading title="Create order" description={persistenceEnabled ? "Save an order and its items atomically through the authenticated database RPC." : "Preview the order workflow in isolated mock mode; saving remains disabled."} actions={<Button variant="outline" size="sm" render={<Link href="/orders" />}><ArrowLeft /> Back to orders</Button>} /><NewOrderForm products={products} settings={settings} existingOrderNumbers={orders.map((order) => order.orderNumber)} initialDate={dhakaBusinessDate()} persistenceEnabled={persistenceEnabled} /></>;
}
