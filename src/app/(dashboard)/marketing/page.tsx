import { BadgeDollarSign, Eye, MousePointerClick, Target } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeading } from "@/components/page-heading";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { formatMoney } from "@/domain/money";
import { getBusinessRepository } from "@/data/provider";

export default async function MarketingPage() {
  const data = await (await getBusinessRepository()).getDashboard();
  const productRevenue = data.summary.productRevenue;
  const roas = productRevenue !== null && data.summary.adSpend > 0 ? productRevenue / data.summary.adSpend : null;
  return <><PageHeading title="Marketing" description="Connect campaign spend to delivered revenue and order acquisition." /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Ad spend" value={formatMoney(data.summary.adSpend)} detail="Authoritative spend ledger" icon={BadgeDollarSign} tone="violet" /><MetricCard label="Delivered product revenue" value={productRevenue === null ? "Unavailable" : formatMoney(productRevenue)} detail="Snapshot-backed recognition" icon={Target} tone="emerald" /><MetricCard label="Return on ad spend" value={roas === null ? "Unavailable" : `${roas.toFixed(2)}×`} detail="Product revenue / ad spend" icon={MousePointerClick} tone="blue" /><MetricCard label="Orders" value={String(data.summary.totalOrders)} detail="Current operational window" icon={Eye} tone="cyan" /></div><Empty className="panel mt-4 min-h-72"><EmptyHeader><EmptyMedia variant="icon"><BadgeDollarSign /></EmptyMedia><EmptyTitle>Campaign editing remains disabled</EmptyTitle><EmptyDescription>Summary figures use authenticated authoritative reporting. Campaign mutation and exports are not enabled.</EmptyDescription></EmptyHeader></Empty></>;
}
