import { Filter, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import type { Campaign, MarketingFilters } from "@/domain/types";

export function MarketingFiltersBar({ filters, campaigns, platforms }: { filters: MarketingFilters; campaigns: Campaign[]; platforms: string[] }) {
  return <form className="panel mt-4 grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-6" method="get">
    <Field><FieldLabel htmlFor="marketing-range">Date range</FieldLabel><select id="marketing-range" name="range" defaultValue={filters.range ?? "lifetime"} className="h-8 rounded-lg border bg-transparent px-2 text-sm"><option value="lifetime">All time</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="month">This month</option><option value="custom">Custom</option></select></Field>
    <Field><FieldLabel htmlFor="marketing-start">Start date</FieldLabel><Input id="marketing-start" name="start" type="date" defaultValue={filters.start} /></Field>
    <Field><FieldLabel htmlFor="marketing-end">End date</FieldLabel><Input id="marketing-end" name="end" type="date" defaultValue={filters.end} /></Field>
    <Field><FieldLabel htmlFor="marketing-campaign">Campaign</FieldLabel><select id="marketing-campaign" name="campaign" defaultValue={filters.campaign ?? "all"} className="h-8 min-w-0 rounded-lg border bg-transparent px-2 text-sm"><option value="all">All campaigns</option>{campaigns.map((campaign)=><option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></Field>
    <Field><FieldLabel htmlFor="marketing-platform">Platform</FieldLabel><select id="marketing-platform" name="platform" defaultValue={filters.platform ?? "all"} className="h-8 rounded-lg border bg-transparent px-2 text-sm"><option value="all">All platforms</option>{platforms.map((platform)=><option key={platform} value={platform}>{platform}</option>)}</select></Field>
    <div className="flex items-end gap-2"><Button type="submit"><Filter data-icon="inline-start" />Apply</Button><Button nativeButton={false} render={<a href="/marketing" />} variant="outline" size="icon" aria-label="Reset marketing filters"><RotateCcw /></Button></div>
  </form>;
}
