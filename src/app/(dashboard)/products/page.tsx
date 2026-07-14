import { Download, Plus } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { ProductsTable } from "@/components/products/products-table";
import { Button } from "@/components/ui/button";
import { getBusinessRepository } from "@/data/provider";

export default async function ProductsPage() {
  const products = await (await getBusinessRepository()).getProducts();
  return <><PageHeading title="Products" description="Manage pricing, stock position, reorder levels, and unit economics." actions={<><Button variant="outline" size="sm"><Download /> Export</Button><Button size="sm"><Plus /> Add product</Button></>} /><ProductsTable products={products} /></>;
}
