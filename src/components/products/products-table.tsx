"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Search, X } from "lucide-react";
import { ProductBusinessForm } from "@/components/products/product-business-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney, multiplyMoney } from "@/domain/money";
import type { Product } from "@/domain/types";

export function ProductsTable({ products, canEditPrivateData }: {
  products: Product[];
  canEditPrivateData: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "all") next.delete(key); else next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const categories = [...new Set(products.map((product) => product.category))];
  const filtered = useMemo(() => {
    const q = (params.get("q") ?? "").toLowerCase();
    return products.filter((product) =>
      (!q || [product.sku, product.name, product.variation].some((value) => value.toLowerCase().includes(q)))
      && (!params.get("category") || params.get("category") === product.category)
      && (!params.get("stock") || (params.get("stock") === "low" ? product.stock <= product.reorderLevel : product.stock > product.reorderLevel))
    );
  }, [params, products]);

  return <>
    <div className="panel mb-4 flex flex-col gap-2 p-3 sm:flex-row sm:flex-wrap">
      <InputGroup className="h-8 w-full bg-white sm:w-72"><InputGroupAddon><Search className="size-4" /></InputGroupAddon><InputGroupInput placeholder="Search SKU or product" value={params.get("q") ?? ""} onChange={(event) => update("q", event.target.value)} /></InputGroup>
      <Select value={params.get("category") ?? "all"} onValueChange={(value) => update("category", value as string)}><SelectTrigger className="w-full bg-white sm:w-44"><SelectValue placeholder="Category" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All categories</SelectItem>{categories.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectGroup></SelectContent></Select>
      <Select value={params.get("stock") ?? "all"} onValueChange={(value) => update("stock", value as string)}><SelectTrigger className="w-full bg-white sm:w-44"><SelectValue placeholder="Stock level" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All stock levels</SelectItem><SelectItem value="low">Low stock</SelectItem><SelectItem value="healthy">Healthy</SelectItem></SelectGroup></SelectContent></Select>
      {params.size > 0 && <Button variant="ghost" size="sm" onClick={() => router.replace(pathname)}><X /> Clear</Button>}
    </div>
    {filtered.length === 0 ? <Empty className="panel min-h-80"><EmptyHeader><EmptyMedia variant="icon"><Search /></EmptyMedia><EmptyTitle>No matching products</EmptyTitle><EmptyDescription>Adjust the active search or stock filters.</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" onClick={() => router.replace(pathname)}>Clear filters</Button></EmptyContent></Empty> : <div className="panel overflow-hidden">
      <div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow><TableHead>SKU / product</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Buying price</TableHead><TableHead className="text-right">Selling price</TableHead><TableHead className="text-right">Stock</TableHead><TableHead className="text-right">Inventory value</TableHead><TableHead className="text-right">Unit profit</TableHead><TableHead className="text-right">Margin</TableHead><TableHead>Status</TableHead><TableHead>Manage</TableHead></TableRow></TableHeader><TableBody>
        {filtered.map((product) => {
          const profit = product.sellingPrice - product.buyingPrice;
          const margin = product.sellingPrice > 0 ? (profit / product.sellingPrice) * 100 : 0;
          return <TableRow key={product.id}><TableCell><p className="font-medium">{product.name}</p><p className="text-xs text-muted-foreground">{product.sku} · {product.variation}</p></TableCell><TableCell>{product.category}</TableCell><TableCell className="money text-right">{formatMoney(product.buyingPrice)}</TableCell><TableCell className="money text-right">{formatMoney(product.sellingPrice)}</TableCell><TableCell className="text-right"><span className="font-medium">{product.stock}</span><p className="text-xs text-muted-foreground">Reorder {product.reorderLevel}</p></TableCell><TableCell className="money text-right">{formatMoney(multiplyMoney(product.buyingPrice, product.stock))}</TableCell><TableCell className="money text-right text-emerald-700">{formatMoney(profit)}</TableCell><TableCell className="text-right">{margin.toFixed(1)}%</TableCell><TableCell>{product.stock <= product.reorderLevel ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700"><AlertTriangle /> Low stock</Badge> : <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Healthy</Badge>}</TableCell><TableCell><ProductBusinessForm product={product} enabled={canEditPrivateData} /></TableCell></TableRow>;
        })}
      </TableBody></Table></div>
      <div className="divide-y md:hidden">{filtered.map((product) => {
        const profit = product.sellingPrice - product.buyingPrice;
        const margin = product.sellingPrice > 0 ? (profit / product.sellingPrice) * 100 : 0;
        return <article className="p-4" key={product.id}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{product.name}</p><p className="mt-1 text-xs text-muted-foreground">{product.sku} · {product.variation}</p></div>{product.stock <= product.reorderLevel ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Low</Badge> : <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Healthy</Badge>}</div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted-foreground">Selling / buying</dt><dd className="money mt-1 font-medium">{formatMoney(product.sellingPrice)} / {formatMoney(product.buyingPrice)}</dd></div><div><dt className="text-muted-foreground">Stock / reorder</dt><dd className="mt-1 font-medium">{product.stock} / {product.reorderLevel}</dd></div><div><dt className="text-muted-foreground">Inventory value</dt><dd className="money mt-1 font-medium">{formatMoney(multiplyMoney(product.buyingPrice, product.stock))}</dd></div><div><dt className="text-muted-foreground">Unit profit</dt><dd className="money mt-1 font-medium text-emerald-700">{formatMoney(profit)} · {margin.toFixed(1)}%</dd></div></dl><div className="mt-4"><ProductBusinessForm product={product} enabled={canEditPrivateData} /></div></article>;
      })}</div>
    </div>}
  </>;
}
