import { BadgeDollarSign, Eye, MousePointerClick, Plus, Target } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeading } from "@/components/page-heading";
import { PrototypeAction } from "@/components/prototype-action";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney, parseMoney } from "@/domain/money";

const campaigns = [
  { name: "July Focus", channel: "Meta Ads", spend: "1850", revenue: "4200", orders: 6, status: "Active" },
  { name: "Journal Launch", channel: "Meta Ads", spend: "1240", revenue: "2870", orders: 4, status: "Active" },
  { name: "Planner Week", channel: "Facebook Page", spend: "760", revenue: "2130", orders: 3, status: "Completed" },
  { name: "Student Bundle", channel: "Creator", spend: "1750", revenue: "990", orders: 1, status: "Review" },
];

export default function MarketingPage() {
  return <><PageHeading title="Marketing" description="Connect campaign spend to delivered revenue and order acquisition." actions={<PrototypeAction message="Campaign draft created" size="sm"><Plus /> New campaign</PrototypeAction>} /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Ad spend" value="৳5,600" detail="Current reporting window" icon={BadgeDollarSign} tone="violet" /><MetricCard label="Attributed revenue" value="৳10,190" detail="Delivered orders only" icon={Target} tone="emerald" /><MetricCard label="Return on ad spend" value="1.82×" detail="Revenue / campaign spend" icon={MousePointerClick} tone="blue" /><MetricCard label="Attributed orders" value="14" detail="Across 4 campaigns" icon={Eye} tone="cyan" /></div><section className="panel mt-4 overflow-hidden"><div className="border-b p-4"><h2 className="text-sm font-semibold">Campaign performance</h2><p className="mt-1 text-xs text-muted-foreground">Mock attribution for prototype validation.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Campaign</TableHead><TableHead>Channel</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Spend</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">ROAS</TableHead></TableRow></TableHeader><TableBody>{campaigns.map((campaign) => <TableRow key={campaign.name}><TableCell className="font-medium">{campaign.name}</TableCell><TableCell>{campaign.channel}</TableCell><TableCell><Badge variant="outline" className={campaign.status === "Review" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>{campaign.status}</Badge></TableCell><TableCell className="money text-right">{formatMoney(parseMoney(campaign.spend))}</TableCell><TableCell className="money text-right">{formatMoney(parseMoney(campaign.revenue))}</TableCell><TableCell className="text-right">{campaign.orders}</TableCell><TableCell className="text-right font-medium">{(Number(campaign.revenue) / Number(campaign.spend)).toFixed(2)}×</TableCell></TableRow>)}</TableBody></Table></div></section></>;
}
