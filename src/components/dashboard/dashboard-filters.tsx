"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ORDER_STATUSES, SALES_CHANNELS } from "@/domain/types";

const campaigns = ["all", "Always-on", "July Focus", "Journal Launch", "Planner Week", "Student Bundle"];

function formatUpdatedAt(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function DashboardFilters({ updatedAt }: { updatedAt?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = useSearchParams();
  const updatedAtLabel = formatUpdatedAt(updatedAt);
  function update(key: string, value: string) {
    const next = new URLSearchParams(current.toString());
    if (value === "all") next.delete(key); else next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }
  const selectClass = "w-full bg-white sm:w-auto";
  const rangeLabels: Record<string, string> = { "7d": "Last 7 days", "14d": "Last 14 days", "30d": "Last 30 days", month: "This month" };
  return (
    <div className="panel mb-5 grid grid-cols-2 gap-2 p-3 sm:flex sm:flex-row sm:flex-wrap sm:items-center">
      <div className="col-span-2 flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground sm:col-span-1"><CalendarDays className="size-4 text-primary" /> Reporting filters</div>
      <Select value={current.get("range") ?? "14d"} onValueChange={(value) => update("range", value as string)}><SelectTrigger className={selectClass}><SelectValue>{rangeLabels[current.get("range") ?? "14d"]}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="7d">Last 7 days</SelectItem><SelectItem value="14d">Last 14 days</SelectItem><SelectItem value="30d">Last 30 days</SelectItem><SelectItem value="month">This month</SelectItem></SelectGroup></SelectContent></Select>
      <Select value={current.get("channel") ?? "all"} onValueChange={(value) => update("channel", value as string)}><SelectTrigger className={selectClass}><SelectValue>{current.get("channel") ?? "All channels"}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All channels</SelectItem>{SALES_CHANNELS.map((value) => <SelectItem value={value} key={value}>{value}</SelectItem>)}</SelectGroup></SelectContent></Select>
      <Select value={current.get("status") ?? "all"} onValueChange={(value) => update("status", value as string)}><SelectTrigger className={selectClass}><SelectValue>{current.get("status") ?? "All statuses"}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All statuses</SelectItem>{ORDER_STATUSES.map((value) => <SelectItem value={value} key={value}>{value}</SelectItem>)}</SelectGroup></SelectContent></Select>
      <Select value={current.get("campaign") ?? "all"} onValueChange={(value) => update("campaign", value as string)}><SelectTrigger className={selectClass}><SelectValue>{current.get("campaign") ?? "All campaigns"}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{campaigns.map((value) => <SelectItem value={value} key={value}>{value === "all" ? "All campaigns" : value}</SelectItem>)}</SelectGroup></SelectContent></Select>
      {current.size > 0 && <Button variant="ghost" size="sm" onClick={() => router.replace(pathname)}><RotateCcw /> Reset</Button>}
      {updatedAtLabel ? <span className="ml-auto hidden text-xs text-muted-foreground xl:inline">Updated {updatedAtLabel}</span> : null}
    </div>
  );
}
