import { Download, Plus } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { ProductsTable } from "@/components/products/products-table";
import { Button } from "@/components/ui/button";
import { getBusinessRepository } from "@/data/provider";

export default async function ProductsPage() {
  const products = await (await getBusinessRepository()).getProducts();
  return <><PageHeading title="Products" description="Review pricing, stock position, reorder levels, and unit economics." actions={<><Button disabled variant="outline" size="sm"><Download /> Export not enabled</Button><Button disabled size="sm"><Plus /> Add product not enabled</Button></>} /><ProductsTable products={products} /></>;
}
