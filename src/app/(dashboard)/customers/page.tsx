import { redirect } from "next/navigation";
import { getCurrentWorkspaceCommerceData } from "@/data/universal-workspace";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { WorkspaceCustomersPage } from "@/components/workspaces/workspace-commerce-pages";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (resolveBusinessDataProvider() !== "supabase") redirect("/dashboard");
  const params = await searchParams;
  return <WorkspaceCustomersPage data={await getCurrentWorkspaceCommerceData({ list: "customers", ...params })} />;
}
