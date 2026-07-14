import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleAlert, DatabaseZap, RefreshCw } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { PrototypeAction } from "@/components/prototype-action";
import { Button } from "@/components/ui/button";

const checks = [
  { name: "Order item revenue reconciliation", detail: "All order product revenue matches its item rows.", result: "Passed", tone: "pass" },
  { name: "Order item COGS reconciliation", detail: "All product COGS matches its item buying-cost snapshots.", result: "Passed", tone: "pass" },
  { name: "Unknown SKU links", detail: "No order items reference a SKU outside the product catalogue.", result: "Passed", tone: "pass" },
  { name: "Duplicate order numbers", detail: "All mock internal order numbers are unique.", result: "Passed", tone: "pass" },
  { name: "Delivered order settlement", detail: "NNM-20260704-0013 is Delivered while settlement is Awaiting.", result: "1 issue", tone: "warn" },
  { name: "Low-stock products", detail: "Two products are at or below their reorder level.", result: "2 issues", tone: "warn" },
];

export default function DataChecksPage() {
  return <><PageHeading title="Data checks" description="Surface financial inconsistencies before they distort reporting." actions={<PrototypeAction message="All mock checks rerun" variant="outline" size="sm"><RefreshCw /> Run checks</PrototypeAction>} /><div className="mb-4 grid gap-3 sm:grid-cols-3"><div className="panel flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><CheckCircle2 className="size-4" /></span><div><p className="text-xl font-semibold">4</p><p className="text-xs text-muted-foreground">Checks passed</p></div></div><div className="panel flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-lg bg-amber-50 text-amber-600"><AlertTriangle className="size-4" /></span><div><p className="text-xl font-semibold">3</p><p className="text-xs text-muted-foreground">Records need attention</p></div></div><div className="panel flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-lg bg-blue-50 text-primary"><DatabaseZap className="size-4" /></span><div><p className="text-xl font-semibold">14</p><p className="text-xs text-muted-foreground">Orders scanned</p></div></div></div><section className="panel overflow-hidden"><div className="divide-y">{checks.map((check) => <div key={check.name} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><span className={`grid size-9 shrink-0 place-items-center rounded-lg ${check.tone === "pass" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>{check.tone === "pass" ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}</span><div className="min-w-0 flex-1"><h2 className="text-sm font-medium">{check.name}</h2><p className="mt-1 text-xs text-muted-foreground">{check.detail}</p></div><span className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${check.tone === "pass" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{check.result}</span></div>)}</div></section><div className="mt-4 flex justify-end"><Button variant="outline" size="sm" render={<Link href="/orders/o13" />}>Review unsettled order <ArrowRight /></Button></div></>;
}
