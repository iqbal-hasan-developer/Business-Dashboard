import { AppShell } from "@/components/app-shell";
import { requireDashboardUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireDashboardUser();
  return <AppShell user={user}>{children}</AppShell>;
}
