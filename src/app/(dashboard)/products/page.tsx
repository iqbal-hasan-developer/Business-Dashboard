import { Download, Plus } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { ProductsTable } from "@/components/products/products-table";
import { Button } from "@/components/ui/button";
import { getBusinessRepository } from "@/data/provider";
import { requireDashboardUser } from "@/lib/auth/session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";

export default async function ProductsPage() {
  const [repository, user] = await Promise.all([getBusinessRepository(), requireDashboardUser()]);
  const products = await repository.getProducts();
  const canEditPrivateData = resolveBusinessDataProvider() === "supabase" && ["owner", "admin"].includes(user.role);
  return <><PageHeading title="Products" description="Edit private buying-cost metadata safely; public catalogue creation, price, and stock remain storefront-owned." actions={<><Button disabled variant="outline" size="sm"><Download /> Export not enabled</Button><Button disabled size="sm" title="No installed authenticated RPC safely creates a storefront product"><Plus /> Add product unavailable</Button></>} /><ProductsTable products={products} canEditPrivateData={canEditPrivateData} /></>;
}
