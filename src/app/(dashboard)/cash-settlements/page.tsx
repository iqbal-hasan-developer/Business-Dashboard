import { CircleCheckBig, Landmark, Scale, Wallet, WalletCards } from "lucide-react";
import { CapitalFundsWorkspace } from "@/components/cash/capital-funds-workspace";
import { CashWorkspace } from "@/components/cash/cash-workspace";
import { ReconciliationWorkspace } from "@/components/cash/reconciliation-workspace";
import { MetricCard } from "@/components/metric-card";
import { PageHeading } from "@/components/page-heading";
import { SettlementWorkspace } from "@/components/settlements/settlement-workspace";
import { getBusinessRepository } from "@/data/provider";
import { ownerPositionPeriodTotals } from "@/domain/cash";
import { sumMoney } from "@/domain/money";
import { dhakaBusinessDate } from "@/domain/reporting-period";
import { requireDashboardUser } from "@/lib/auth/session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { formatMoney } from "@/domain/money";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const scalar = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const validDate = (value: string | undefined) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? value! : null;

export default async function CashSettlementsPage({ searchParams }: { searchParams: SearchParams }) {
  const [repository, user, params] = await Promise.all([getBusinessRepository(), requireDashboardUser(), searchParams]);
  const [data, cash, settings] = await Promise.all([repository.getCourierSettlementData(), repository.getCashWorkspace(), repository.getBusinessSettings()]);
  const codReceivable = sumMoney(data.eligibleOrders.map((order) => order.grossCodReceivable));
  const activeBatches = data.batches.filter((batch) => !batch.isReversed);
  const settledValue = sumMoney(activeBatches.map((batch) => batch.grossCodAmount));
  const netSettlementReceived = sumMoney(activeBatches.map((batch) => batch.netReceived));
  const connected = resolveBusinessDataProvider() === "supabase";
  const enabled = connected && ["owner", "admin"].includes(user.role);
  const allowMockCashControls = !connected && process.env.ENABLE_MOCK_CASH_CONTROLS === "true";
  const requestedStart = validDate(scalar(params.start));
  const requestedEnd = validDate(scalar(params.end));
  const startDate = requestedStart && requestedEnd && requestedStart <= requestedEnd ? requestedStart : null;
  const endDate = startDate ? requestedEnd : null;
  const periodEntries = startDate && endDate
    ? cash.entries.filter((entry) => entry.movementDate >= startDate && entry.movementDate <= endDate)
    : cash.entries;
  const periodInflow = sumMoney(periodEntries.filter((entry) => entry.signedAmount > 0).map((entry) => entry.signedAmount));
  const periodOutflow = sumMoney(periodEntries.filter((entry) => entry.signedAmount < 0).map((entry) => -entry.signedAmount));
  const ownerPeriod = ownerPositionPeriodTotals(cash.ownerPositionPeriod, startDate, endDate);
  const periodLabel = startDate && endDate ? `${startDate} to ${endDate}` : "Lifetime";
  const today = dhakaBusinessDate();

  return <>
    <PageHeading title="Cash & settlements" description="Cash is posted account movement—not profit, COD receivable, gross COD, revenue, or owner funding." />
    <CapitalFundsWorkspace summary={cash.capitalFunds} owners={cash.ownerHeldBalances} capitalPositions={cash.ownerCapitalPositions} spendingCategories={cash.spendingCategories} steadfast={cash.steadfastReceivable} accounts={cash.accountReconciliation} today={today} enabled={connected && user.role === "owner"} />
    <form className="panel mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end" method="get">
      <label className="grid gap-1 text-sm"><span className="font-medium">Posted from</span><input className="h-9 rounded-lg border bg-background px-3" type="date" name="start" defaultValue={startDate ?? ""} /></label>
      <label className="grid gap-1 text-sm"><span className="font-medium">Posted through</span><input className="h-9 rounded-lg border bg-background px-3" type="date" name="end" defaultValue={endDate ?? ""} /></label>
      <button className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground" type="submit">Apply period</button>
      <a className="inline-flex h-9 items-center justify-center rounded-lg border px-4 text-sm font-medium" href="/cash-settlements">Lifetime</a>
    </form>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard label="Owner money taken" value={formatMoney(ownerPeriod.ownerMoneyTaken)} detail={`${periodLabel}; not a business expense`} icon={WalletCards} tone="amber" />
      <MetricCard label="Capital-return portion" value={formatMoney(ownerPeriod.capitalReturn)} detail={`${periodLabel}; reduces contributed capital, not profit`} icon={Landmark} tone="violet" />
      <MetricCard label="Due-from-Owner portion" value={formatMoney(ownerPeriod.dueCreated)} detail={`${periodLabel}; Due created, not the current Due balance or a business expense`} icon={Scale} tone="red" />
      <MetricCard label="Ledger business cash" value={formatMoney(cash.capitalFunds.ledgerBusinessCash)} detail={`${cash.entries.length} append-only movements; compare with actual cash above`} icon={Wallet} tone="amber" />
      <MetricCard label="Posted cash inflow" value={formatMoney(periodInflow)} detail={periodLabel} icon={Wallet} tone="emerald" />
      <MetricCard label="Posted cash outflow" value={formatMoney(periodOutflow)} detail={periodLabel} icon={Wallet} tone="red" />
      <MetricCard label="COD rows before reconciliation" value={formatMoney(codReceivable)} detail={`${data.eligibleOrders.length} rows; reversed-batch exclusions and active collectible total are shown above`} icon={WalletCards} tone="amber" />
      <MetricCard label="Confirmed gross COD" value={formatMoney(settledValue)} detail="Before courier deductions" icon={CircleCheckBig} tone="blue" />
      <MetricCard label="Net settlement received" value={formatMoney(netSettlementReceived)} detail={`${activeBatches.length} active courier batches`} icon={CircleCheckBig} tone="emerald" />
    </div>
    <ReconciliationWorkspace accounts={cash.accountReconciliation} issues={cash.historicalIssues} fundings={cash.activeFundings} ledger={cash.entries} today={today} enabled={connected && user.role === "owner"} />
    <CashWorkspace data={cash} settings={settings} today={today} enabled={enabled || allowMockCashControls} reversalEnabled={connected && user.role === "owner"} />
    <SettlementWorkspace data={data} enabled={enabled} reversalEnabled={connected && user.role === "owner"} today={today} />
  </>;
}
