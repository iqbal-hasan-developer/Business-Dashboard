import { DashboardBottom } from "@/components/dashboard/dashboard-bottom";
import { DashboardChartsLazy } from "@/components/dashboard/dashboard-charts-lazy";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { PageHeading } from "@/components/page-heading";
import { getBusinessRepository } from "@/data/provider";
import { getCurrentWorkspaceOverview } from "@/data/universal-workspace";
import { WorkspaceOverviewPage } from "@/components/workspaces/workspace-overview";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { getCurrentWorkspaceReportingMetrics } from "@/data/universal-workspace";
import { dhakaBusinessDate, resolveReportingPeriod } from "@/domain/reporting-period";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (resolveBusinessDataProvider() === "supabase") {
    const referenceDate = dhakaBusinessDate();
    const period = resolveReportingPeriod(referenceDate, "30d");
    const [data, reporting] = await Promise.all([
      getCurrentWorkspaceOverview(),
      getCurrentWorkspaceReportingMetrics(period.startDate, period.endDate),
    ]);
    const notice = typeof params.notice === "string" ? params.notice : undefined;
    return <WorkspaceOverviewPage data={data} metrics={reporting.metrics} period={period} notice={notice} />;
  }
  const value = (key: string) => typeof params[key] === "string" ? params[key] : undefined;
  const repository = await getBusinessRepository();
  const data = await repository.getDashboard({ range: value("range") ?? "lifetime", channel: value("channel"), status: value("status"), campaign: value("campaign") });
  return <><PageHeading title="Business overview" description="See what is selling, what is settled, and where profit needs attention." /><DashboardFilters updatedAt={data.generatedAt} campaigns={data.campaigns} /><KpiGrid data={data.summary} comparison={data.comparison} reporting={data.reporting} /><DashboardChartsLazy data={data} /><DashboardBottom data={data} /></>;
}
