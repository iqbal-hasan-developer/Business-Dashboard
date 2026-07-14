"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardData } from "@/domain/types";

const DashboardCharts = dynamic(() => import("@/components/dashboard/dashboard-charts"), { ssr: false, loading: () => <div className="mt-5 grid gap-4 xl:grid-cols-2"><Skeleton className="h-80 rounded-xl" /><Skeleton className="h-80 rounded-xl" /></div> });

export function DashboardChartsLazy({ data }: { data: Pick<DashboardData, "trend" | "statusBreakdown" | "adSpendTrend" | "topProducts" | "expenseBreakdown"> }) {
  return <DashboardCharts data={data} />;
}
