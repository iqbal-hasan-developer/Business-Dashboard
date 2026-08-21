import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { EditOrderForm } from "@/components/orders/new-order-form";
import { PageHeading } from "@/components/page-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { getBusinessRepository } from "@/data/provider";
import { isOrderOrdinarilyEditable } from "@/domain/manual-entry";
import { requireDashboardUser } from "@/lib/auth/session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [repository, user] = await Promise.all([getBusinessRepository(), requireDashboardUser()]);
  const [order, products, settings] = await Promise.all([
    repository.getOrder(id),
    repository.getProducts(),
    repository.getBusinessSettings(),
  ]);
  if (!order) notFound();

  const persistenceEnabled = resolveBusinessDataProvider() === "supabase"
    && ["owner", "admin"].includes(user.role);
  const editable = isOrderOrdinarilyEditable(order) && (!persistenceEnabled || Boolean(order.updatedAt));
  const back = <Link href={`/orders/${order.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><ArrowLeft data-icon="inline-start" /> Back to order</Link>;

  if (!editable) {
    return <><PageHeading title={`Edit ${order.orderNumber}`} description="Ordinary editing is unavailable for this order." actions={back} /><Alert><AlertTriangle /><AlertTitle>Order locked</AlertTitle><AlertDescription>Delivered, returned, refunded, or financially snapshotted orders require a future controlled correction workflow. No recognized financial snapshot can be rewritten.</AlertDescription></Alert></>;
  }

  return <><PageHeading title={`Edit ${order.orderNumber}`} description={persistenceEnabled ? "Update ordinary order fields and items atomically; statuses remain unchanged." : "Preview the edit workflow in isolated mock mode; saving remains disabled."} actions={back} /><EditOrderForm order={order} products={products} settings={settings} existingOrderNumbers={[order.orderNumber]} persistenceEnabled={persistenceEnabled} /></>;
}
