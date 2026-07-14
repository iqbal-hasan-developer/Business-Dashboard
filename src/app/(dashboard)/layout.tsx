import { AppShell } from "@/components/app-shell";
import { requireDashboardUser } from "@/lib/auth/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardUser();
  return <AppShell>{children}</AppShell>;
}
