import { CircleDollarSign, PackageOpen, Ship, TrendingDown, TriangleAlert } from "lucide-react";
import { ExpenseEntryForm } from "@/components/expenses/expense-entry-form";
import { ExpenseWorkspace } from "@/components/expenses/expense-workspace";
import { MetricCard } from "@/components/metric-card";
import { PageHeading } from "@/components/page-heading";
import { getBusinessRepository } from "@/data/provider";
import { formatMoney } from "@/domain/money";
import { summarizeExpenseAccounting } from "@/domain/procurement";
import { dhakaBusinessDate } from "@/domain/reporting-period";
import { requireDashboardUser } from "@/lib/auth/session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";

export default async function ExpensesPage() {
  const [repository, user] = await Promise.all([getBusinessRepository(), requireDashboardUser()]);
  const [expenses, campaigns, marketing, audit, settings] = await Promise.all([
    repository.getExpenses(),
    repository.getCampaigns(),
    repository.getMarketingWorkspace(),
    repository.getExpenseAuditHistory(),
    repository.getBusinessSettings(),
  ]);
  const connected = resolveBusinessDataProvider() === "supabase";
  const allowMockControls = !connected && process.env.ENABLE_MOCK_EXPENSE_CONTROLS === "true";
  const canManage = (connected && ["owner", "admin"].includes(user.role)) || allowMockControls;
  const canDelete = (connected && user.role === "owner") || allowMockControls;
  const accounting = summarizeExpenseAccounting(expenses);

  return <>
    <PageHeading
      title="Expenses"
      description="Operating costs, advertising, and inventory procurement are separated so purchases are not deducted twice."
      actions={<ExpenseEntryForm campaigns={campaigns} cashAccounts={settings.cashAccounts} date={dhakaBusinessDate()} enabled={canManage} />}
    />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <MetricCard label="Operating expenses" value={formatMoney(accounting.operatingExpenses)} detail="Period costs included in Net Profit" icon={TrendingDown} tone="red" />
      <MetricCard label="Advertising spend" value={formatMoney(marketing.totalSpend)} detail="From the Marketing spend ledger" icon={CircleDollarSign} tone="violet" />
      <MetricCard label="Inventory purchases" value={formatMoney(accounting.inventoryPurchases)} detail="Asset cost; not an immediate expense" icon={PackageOpen} tone="blue" />
      <MetricCard label="Freight-in" value={formatMoney(accounting.freightIn)} detail="Capitalized supplier transport" icon={Ship} tone="cyan" />
      <MetricCard label="Unallocated procurement" value={formatMoney(accounting.unallocatedProcurement)} detail="Needs product, quantity, and batch allocation" icon={TriangleAlert} tone="amber" />
    </div>
    <ExpenseWorkspace expenses={expenses} audit={audit} campaigns={campaigns} canEdit={canManage} canDelete={canDelete} />
  </>;
}
