import { DashboardBottom } from "@/components/dashboard/dashboard-bottom";
import { DashboardChartsLazy } from "@/components/dashboard/dashboard-charts-lazy";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { PageHeading } from "@/components/page-heading";
import { getBusinessRepository } from "@/data/provider";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] : undefined;
  const repository = await getBusinessRepository();
  const data = await repository.getDashboard({ range: value("range"), channel: value("channel"), status: value("status"), campaign: value("campaign") });
  return <><PageHeading title="Business overview" description="See what is selling, what is settled, and where profit needs attention." /><DashboardFilters updatedAt={data.generatedAt} /><KpiGrid data={data.summary} comparison={data.comparison} /><DashboardChartsLazy data={data} /><DashboardBottom data={data} /></>;
}
