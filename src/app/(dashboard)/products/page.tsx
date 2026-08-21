import { ExportButton } from "@/components/export-button";
import { PageHeading } from "@/components/page-heading";
import { ProductBusinessForm } from "@/components/products/product-business-form";
import { ProductsTable } from "@/components/products/products-table";
import { getBusinessRepository } from "@/data/provider";
import { requireDashboardUser } from "@/lib/auth/session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";

export default async function ProductsPage() {
  const [repository, user] = await Promise.all([getBusinessRepository(), requireDashboardUser()]);
  const [products, categories] = await Promise.all([repository.getProducts(), repository.getProductCategories()]);
  const canEditPrivateData = resolveBusinessDataProvider() === "supabase" && ["owner", "admin"].includes(user.role);
  const namedProducts = products.map((product) => ({ ...product, category: categories.find((category) => category.id === product.categoryId)?.name ?? "Uncategorised" }));
  return <><PageHeading title="Products" description="Catalog master data and private reference costs. Authoritative inventory value comes only from allocated purchase batches, not mutable product buying prices." actions={<><ExportButton dataset="products" enabled={user.role === "owner"} /><ProductBusinessForm categories={categories} enabled={canEditPrivateData} /></>} /><ProductsTable products={namedProducts} productCategories={categories} canEditPrivateData={canEditPrivateData} /></>;
}
