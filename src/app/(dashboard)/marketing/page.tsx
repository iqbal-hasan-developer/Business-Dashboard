import { BadgeDollarSign, MousePointerClick, ShoppingBag, Target } from "lucide-react";
import { AdSpendEntryForm, CampaignEntryForm } from "@/components/marketing/marketing-entry-forms";
import { MarketingFiltersBar } from "@/components/marketing/marketing-filters";
import { MarketingWorkspace } from "@/components/marketing/marketing-workspace";
import { MetricCard } from "@/components/metric-card";
import { PageHeading } from "@/components/page-heading";
import { getBusinessRepository } from "@/data/provider";
import { formatMoney } from "@/domain/money";
import { marketingFiltersSchema } from "@/domain/marketing";
import { dhakaBusinessDate } from "@/domain/reporting-period";
import { requireDashboardUser } from "@/lib/auth/session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const scalar = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function MarketingPage({ searchParams }: { searchParams: SearchParams }) {
  const [repository,user,params]=await Promise.all([getBusinessRepository(),requireDashboardUser(),searchParams]);
  const parsed=marketingFiltersSchema.safeParse({range:scalar(params.range)??"lifetime",start:scalar(params.start),end:scalar(params.end),campaign:scalar(params.campaign),platform:scalar(params.platform)});
  const filters=parsed.success?parsed.data:{range:"lifetime" as const};
  const [data, settings]=await Promise.all([repository.getMarketingWorkspace(filters), repository.getBusinessSettings()]);
  const connected=resolveBusinessDataProvider()==="supabase";
  const allowMockMarketingControls=!connected&&process.env.ENABLE_MOCK_MARKETING_CONTROLS==="true";
  const canManage=connected&&["owner","admin"].includes(user.role);
  const canDelete=(connected&&user.role==="owner")||allowMockMarketingControls;
  const canRecordSpend=connected&&["owner","admin","data_entry"].includes(user.role);
  const lifetimeMetrics=filters.range==="lifetime";
  const costPerResult=lifetimeMetrics&&data.totalResults&&data.totalResults>0?Math.round(data.totalSpend/data.totalResults):null;
  return <>
    <PageHeading title="Marketing" description="Review campaign performance and manage an audited advertising-spend ledger." actions={<div className="flex flex-wrap gap-2"><CampaignEntryForm enabled={canManage}/><AdSpendEntryForm campaigns={data.campaigns} cashAccounts={settings.cashAccounts} date={dhakaBusinessDate()} enabled={canRecordSpend}/></div>}/>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Filtered ad spend" value={formatMoney(data.totalSpend,true)} detail={data.startDate?"Selected date range":"All recorded dates"} icon={BadgeDollarSign} tone="violet"/><MetricCard label="Campaign results" value={data.totalResults==null?"Unavailable":data.totalResults.toLocaleString("en-BD")} detail="Imported campaign-level totals" icon={Target} tone="emerald"/><MetricCard label="Cost per result" value={costPerResult==null?"Unavailable":formatMoney(costPerResult,true)} detail={lifetimeMetrics?"All-time spend / results":"Requires the all-time range"} icon={MousePointerClick} tone="blue"/><MetricCard label="Purchases" value={data.totalPurchases==null?"Unavailable":data.totalPurchases.toLocaleString("en-BD")} detail="Imported campaign-level totals" icon={ShoppingBag} tone="cyan"/></div>
    <MarketingFiltersBar filters={filters} campaigns={data.campaigns} platforms={data.platforms}/>
    <MarketingWorkspace data={data} canEdit={canManage} canDelete={canDelete}/>
  </>;
}
