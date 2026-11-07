import { redirect } from "next/navigation";
import { getCurrentWorkspaceCommerceData } from "@/data/universal-workspace";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { WorkspaceInventoryPage } from "@/components/workspaces/workspace-commerce-pages";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (resolveBusinessDataProvider() !== "supabase") redirect("/dashboard");
  const params = await searchParams;
  return <WorkspaceInventoryPage data={await getCurrentWorkspaceCommerceData({ list: "inventory", ...params })} />;
}
