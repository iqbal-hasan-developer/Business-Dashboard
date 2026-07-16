import { BadgeDollarSign, Eye, MousePointerClick, Target } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeading } from "@/components/page-heading";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { formatMoney } from "@/domain/money";
import { getBusinessRepository } from "@/data/provider";

export default async function MarketingPage() {
  const data = await (await getBusinessRepository()).getDashboard();
  const roas = data.summary.adSpend > 0 ? data.summary.productRevenue / data.summary.adSpend : 0;
  return <><PageHeading title="Marketing" description="Connect campaign spend to delivered revenue and order acquisition." /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Ad spend" value={formatMoney(data.summary.adSpend)} detail="Current reporting window" icon={BadgeDollarSign} tone="violet" /><MetricCard label="Delivered product revenue" value={formatMoney(data.summary.productRevenue)} detail="Delivered orders only" icon={Target} tone="emerald" /><MetricCard label="Return on ad spend" value={`${roas.toFixed(2)}×`} detail="Product revenue / ad spend" icon={MousePointerClick} tone="blue" /><MetricCard label="Orders" value={String(data.summary.totalOrders)} detail="Current reporting window" icon={Eye} tone="cyan" /></div><Empty className="panel mt-4 min-h-72"><EmptyHeader><EmptyMedia variant="icon"><BadgeDollarSign /></EmptyMedia><EmptyTitle>Campaign detail is read-only and not yet connected</EmptyTitle><EmptyDescription>Summary figures above come from authenticated development data. Campaign editing and exports remain disabled.</EmptyDescription></EmptyHeader></Empty></>;
}
