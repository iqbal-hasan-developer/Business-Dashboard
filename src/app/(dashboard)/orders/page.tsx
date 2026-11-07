import Link from "next/link";
import { Plus } from "lucide-react";
import { ExportButton } from "@/components/export-button";
import { OrdersTable } from "@/components/orders/orders-table";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { getBusinessRepository } from "@/data/provider";
import { requireDashboardUser } from "@/lib/auth/session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { getCurrentWorkspaceCommerceData } from "@/data/universal-workspace";
import { WorkspaceOrdersPage } from "@/components/workspaces/workspace-commerce-pages";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (resolveBusinessDataProvider() === "supabase") {
    const params = await searchParams;
    return <WorkspaceOrdersPage data={await getCurrentWorkspaceCommerceData({ list: "orders", ...params })} />;
  }
  const [repository, user] = await Promise.all([getBusinessRepository(), requireDashboardUser()]);
  const orders = await repository.getOrders();
  return <><PageHeading title="Orders" description="Track order progress, payment state, and courier settlement separately." actions={<><ExportButton dataset="orders" enabled={user.role === "owner"} /><Button size="sm" render={<Link href="/orders/new" />}><Plus /> New order</Button></>} /><OrdersTable orders={orders} /></>;
}
