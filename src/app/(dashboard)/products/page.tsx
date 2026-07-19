import { Download } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { ProductBusinessForm } from "@/components/products/product-business-form";
import { ProductsTable } from "@/components/products/products-table";
import { Button } from "@/components/ui/button";
import { getBusinessRepository } from "@/data/provider";
import { requireDashboardUser } from "@/lib/auth/session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";

export default async function ProductsPage() {
  const [repository, user] = await Promise.all([getBusinessRepository(), requireDashboardUser()]);
  const [products, categories] = await Promise.all([repository.getProducts(), repository.getProductCategories()]);
  const canEditPrivateData = resolveBusinessDataProvider() === "supabase" && ["owner", "admin"].includes(user.role);
  const namedProducts = products.map((product) => ({ ...product, category: categories.find((category) => category.id === product.categoryId)?.name ?? "Uncategorised" }));
  return <><PageHeading title="Products" description="Create and edit catalog details and private costs through authenticated owner/admin RPCs. Inventory remains disabled." actions={<><Button disabled variant="outline" size="sm"><Download /> Export not enabled</Button><ProductBusinessForm categories={categories} enabled={canEditPrivateData} /></>} /><ProductsTable products={namedProducts} productCategories={categories} canEditPrivateData={canEditPrivateData} /></>;
}
