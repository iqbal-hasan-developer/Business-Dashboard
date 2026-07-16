import { AlertTriangle, CheckCircle2, CircleAlert, DatabaseZap } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { getBusinessRepository } from "@/data/provider";

export default async function DataChecksPage() {
  const repository = await getBusinessRepository();
  const [orders, products] = await Promise.all([repository.getOrders(), repository.getProducts()]);
  const productIds = new Set(products.map((product) => product.id));
  const orderNumbers = new Set<string>();
  let duplicateOrderNumbers = 0;
  orders.forEach((order) => orderNumbers.has(order.orderNumber) ? duplicateOrderNumbers++ : orderNumbers.add(order.orderNumber));
  const missingProductLinks = orders.flatMap((order) => order.items).filter((item) => item.productId === "unknown" || !productIds.has(item.productId)).length;
  const deliveredWithoutItems = orders.filter((order) => order.status === "Delivered" && order.items.length === 0).length;
  const lowStock = products.filter((product) => product.stock <= product.reorderLevel).length;
  const checks = [
    { name: "Duplicate order numbers", detail: `${duplicateOrderNumbers} duplicate order numbers found.`, count: duplicateOrderNumbers },
    { name: "Missing product links", detail: `${missingProductLinks} order items have an unknown product link.`, count: missingProductLinks },
    { name: "Delivered orders without items", detail: `${deliveredWithoutItems} Delivered orders have no item rows.`, count: deliveredWithoutItems },
    { name: "Low-stock products", detail: `${lowStock} products are at or below their reorder level.`, count: lowStock },
  ];
  const issues = checks.reduce((sum, check) => sum + check.count, 0);
  const passed = checks.filter((check) => check.count === 0).length;

  return <><PageHeading title="Data checks" description="Read-only checks against the authenticated development result set." /><div className="mb-4 grid gap-3 sm:grid-cols-3"><div className="panel flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><CheckCircle2 className="size-4" /></span><div><p className="text-xl font-semibold">{passed}</p><p className="text-xs text-muted-foreground">Checks passed</p></div></div><div className="panel flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-lg bg-amber-50 text-amber-600"><AlertTriangle className="size-4" /></span><div><p className="text-xl font-semibold">{issues}</p><p className="text-xs text-muted-foreground">Records need attention</p></div></div><div className="panel flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-lg bg-blue-50 text-primary"><DatabaseZap className="size-4" /></span><div><p className="text-xl font-semibold">{orders.length}</p><p className="text-xs text-muted-foreground">Orders scanned</p></div></div></div><section className="panel overflow-hidden"><div className="divide-y">{checks.map((check) => <div key={check.name} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><span className={`grid size-9 shrink-0 place-items-center rounded-lg ${check.count === 0 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>{check.count === 0 ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}</span><div className="min-w-0 flex-1"><h2 className="text-sm font-medium">{check.name}</h2><p className="mt-1 text-xs text-muted-foreground">{check.detail}</p></div><span className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${check.count === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{check.count === 0 ? "Passed" : `${check.count} issue${check.count === 1 ? "" : "s"}`}</span></div>)}</div></section></>;
}
