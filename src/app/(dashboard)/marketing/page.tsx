import { BadgeDollarSign, Eye, MousePointerClick, Target } from "lucide-react";
import { AdSpendEntryForm, CampaignEntryForm } from "@/components/marketing/marketing-entry-forms";
import { MetricCard } from "@/components/metric-card";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBusinessRepository } from "@/data/provider";
import { formatMoney } from "@/domain/money";
import { dhakaBusinessDate } from "@/domain/reporting-period";
import { requireDashboardUser } from "@/lib/auth/session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";

export default async function MarketingPage() {
  const [repository, user] = await Promise.all([getBusinessRepository(), requireDashboardUser()]);
  const [data, campaigns] = await Promise.all([repository.getDashboard(), repository.getCampaigns()]);
  const connected = resolveBusinessDataProvider() === "supabase";
  const canManage = connected && ["owner", "admin"].includes(user.role);
  const canRecordSpend = connected && ["owner", "admin", "data_entry"].includes(user.role);
  const productRevenue = data.summary.productRevenue;
  const roas = productRevenue !== null && data.summary.adSpend > 0 ? productRevenue / data.summary.adSpend : null;
  return <><PageHeading title="Marketing" description="Manage campaigns and record daily spend through authenticated database RPCs." actions={<div className="flex gap-2"><CampaignEntryForm enabled={canManage} /><AdSpendEntryForm campaigns={campaigns} date={dhakaBusinessDate()} enabled={canRecordSpend} /></div>} /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Ad spend" value={formatMoney(data.summary.adSpend)} detail="Authoritative spend ledger" icon={BadgeDollarSign} tone="violet" /><MetricCard label="Delivered product revenue" value={productRevenue === null ? "Unavailable" : formatMoney(productRevenue)} detail="Snapshot-backed recognition" icon={Target} tone="emerald" /><MetricCard label="Return on ad spend" value={roas === null ? "Unavailable" : `${roas.toFixed(2)}×`} detail="Product revenue / ad spend" icon={MousePointerClick} tone="blue" /><MetricCard label="Orders" value={String(data.summary.totalOrders)} detail="Current operational window" icon={Eye} tone="cyan" /></div><section className="panel mt-4 overflow-hidden"><div className="border-b p-4"><h2 className="text-sm font-semibold">Campaigns</h2><p className="mt-1 text-xs text-muted-foreground">Daily spend can be attached only to an existing campaign.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Campaign</TableHead><TableHead>Channel</TableHead><TableHead>Dates</TableHead><TableHead className="text-right">Budget</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{campaigns.length ? campaigns.map((campaign) => <TableRow key={campaign.id}><TableCell className="font-medium">{campaign.name}</TableCell><TableCell>{campaign.channel || "Unspecified"}</TableCell><TableCell>{campaign.startsOn || "Open"} – {campaign.endsOn || "Open"}</TableCell><TableCell className="money text-right">{formatMoney(campaign.budget)}</TableCell><TableCell><Badge variant="outline">{campaign.isActive ? "Active" : "Inactive"}</Badge></TableCell></TableRow>) : <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No campaigns exist yet. Create one before recording ad spend.</TableCell></TableRow>}</TableBody></Table></div></section></>;
}
