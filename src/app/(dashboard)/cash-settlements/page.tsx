import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  CircleCheckBig,
  Scale,
  TriangleAlert,
} from "lucide-react";
import { CapitalFundsWorkspace } from "@/components/cash/capital-funds-workspace";
import { CashWorkspace } from "@/components/cash/cash-workspace";
import { ReconciliationWorkspace } from "@/components/cash/reconciliation-workspace";
import { Button } from "@/components/ui/button";
import { SettlementWorkspace } from "@/components/settlements/settlement-workspace";
import { getBusinessRepository } from "@/data/provider";
import { ownerPositionPeriodTotals } from "@/domain/cash";
import { formatMoney, sumMoney } from "@/domain/money";
import { dhakaBusinessDate } from "@/domain/reporting-period";
import type { CapitalFundsSummary } from "@/domain/types";
import { requireDashboardUser } from "@/lib/auth/session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const scalar = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;
const validDate = (value: string | undefined) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? value! : null;
const pageLinks = [
  ["summary", "Summary"],
  ["owner-position", "Owner position"],
  ["period-activity", "Period activity"],
  ["reconciliation", "Reconciliation"],
  ["accounts", "Accounts"],
  ["owner-records", "Owner records"],
  ["cash-ledger", "Cash ledger"],
  ["settlement", "Settlement"],
] as const;

function EssentialMetric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "warning" | "positive";
}) {
  return (
    <div className="min-w-0 rounded-xl border bg-background p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p
        className={`money mt-2 text-2xl font-semibold tracking-tight ${tone === "warning" ? "text-amber-700" : tone === "positive" ? "text-emerald-700" : "text-foreground"}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function SupportingFacts({ summary }: { summary: CapitalFundsSummary }) {
  const facts = [
    [
      "Historical investment",
      formatMoney(summary.historicalOwnerInvestment),
      "Lifetime owner contributions",
    ],
    [
      "Capital returned",
      formatMoney(summary.totalCapitalReturned),
      "Owner distribution; not an expense",
    ],
    [
      "Known inventory value",
      formatMoney(summary.knownInventoryValue),
      "Excluded from available funds",
    ],
    [
      "Ledger business cash",
      formatMoney(summary.ledgerBusinessCash),
      "Compare with observed actuals",
    ],
    [
      "Confirmed source-paid spending",
      formatMoney(summary.confirmedPaidSourceSpending),
      "No account or owner guessed",
    ],
    [
      "Verified courier deductions",
      formatMoney(summary.verifiedCourierFulfilmentSpending),
      "Independent settlement evidence",
    ],
  ] as const;
  return (
    <dl className="grid divide-y rounded-xl border bg-background sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-3">
      {facts.map(([label, value, detail]) => (
        <div
          className="border-t p-4 first:border-t-0 sm:[&:nth-child(-n+2)]:border-t-0 xl:[&:nth-child(-n+3)]:border-t-0"
          key={label}
        >
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="money mt-1 font-semibold">{value}</dd>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
      ))}
    </dl>
  );
}

export default async function CashSettlementsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [repository, user, params] = await Promise.all([
    getBusinessRepository(),
    requireDashboardUser(),
    searchParams,
  ]);
  const [data, cash, settings] = await Promise.all([
    repository.getCourierSettlementData(),
    repository.getCashWorkspace(),
    repository.getBusinessSettings(),
  ]);
  const codReceivable = sumMoney(
    data.eligibleOrders.map((order) => order.grossCodReceivable),
  );
  const activeBatches = data.batches.filter((batch) => !batch.isReversed);
  const settledValue = sumMoney(
    activeBatches.map((batch) => batch.grossCodAmount),
  );
  const netSettlementReceived = sumMoney(
    activeBatches.map((batch) => batch.netReceived),
  );
  const connected = resolveBusinessDataProvider() === "supabase";
  const enabled = connected && ["owner", "admin"].includes(user.role);
  const allowMockCashControls =
    !connected && process.env.ENABLE_MOCK_CASH_CONTROLS === "true";
  const requestedStart = validDate(scalar(params.start));
  const requestedEnd = validDate(scalar(params.end));
  const startDate =
    requestedStart && requestedEnd && requestedStart <= requestedEnd
      ? requestedStart
      : null;
  const endDate = startDate ? requestedEnd : null;
  const periodEntries =
    startDate && endDate
      ? cash.entries.filter(
          (entry) =>
            entry.movementDate >= startDate && entry.movementDate <= endDate,
        )
      : cash.entries;
  const periodInflow = sumMoney(
    periodEntries
      .filter((entry) => entry.signedAmount > 0)
      .map((entry) => entry.signedAmount),
  );
  const periodOutflow = sumMoney(
    periodEntries
      .filter((entry) => entry.signedAmount < 0)
      .map((entry) => -entry.signedAmount),
  );
  const ownerPeriod = ownerPositionPeriodTotals(
    cash.ownerPositionPeriod,
    startDate,
    endDate,
  );
  const periodLabel =
    startDate && endDate ? `${startDate} to ${endDate}` : "Lifetime";
  const today = dhakaBusinessDate();
  const summary = cash.capitalFunds;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 pb-8">
      <header className="panel overflow-hidden">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between lg:p-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              Accounting operations
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              Cash &amp; settlements
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Monitor cash, owner positions, and courier settlements without
              mixing posted movement with profit, revenue, or receivables.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="size-4" /> As of{" "}
              <span className="font-medium text-foreground">{today}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" render={<a href="#reconciliation" />}>
                <Scale /> Review reconciliation
              </Button>
              <Button render={<a href="#settlement" />}>
                <CircleCheckBig /> Record settlement
              </Button>
            </div>
          </div>
        </div>
      </header>
      <nav
        aria-label="On this page"
        className="panel sticky top-16 z-20 -mt-2 overflow-x-auto bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-background/85"
      >
        <div className="flex min-w-max items-center gap-1 py-2">
          <span className="px-3 text-xs font-semibold text-muted-foreground">On this page</span>
          {pageLinks.map(([id, label]) => (
            <a className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`#${id}`} key={id}>{label}</a>
          ))}
        </div>
      </nav>

      <section
        id="summary"
        className="scroll-mt-32 space-y-4"
        aria-labelledby="summary-heading"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            Overview
          </p>
          <h2 id="summary-heading" className="mt-1 text-xl font-semibold">
            Financial position at a glance
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Essential balances first; supporting evidence remains directly
            below.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <EssentialMetric
            label="Available / receivable funds"
            value={
              summary.totalAvailableReceivableFunds === null
                ? "Controls needed"
                : formatMoney(summary.totalAvailableReceivableFunds)
            }
            detail="Actual cash + Due from owners + confirmed Steadfast"
            tone={
              summary.totalAvailableReceivableFunds === null
                ? "warning"
                : "positive"
            }
          />
          <EssentialMetric
            label="Current contributed capital"
            value={formatMoney(summary.currentContributedCapital)}
            detail="Contributions less formal capital returns"
          />
          <EssentialMetric
            label="Due from owners"
            value={formatMoney(summary.actualDueFromOwners)}
            detail={`Owner-held ledger ${formatMoney(summary.ledgerDueFromOwners)}`}
            tone={summary.actualDueFromOwners ? "warning" : "default"}
          />
          <EssentialMetric
            label="Steadfast control"
            value={
              summary.confirmedSteadfastReceivable === null
                ? "Control needed"
                : formatMoney(summary.confirmedSteadfastReceivable)
            }
            detail={`Active order-derived ${formatMoney(summary.calculatedSteadfastReceivable)}`}
            tone={
              summary.confirmedSteadfastReceivable === null
                ? "warning"
                : "default"
            }
          />
        </div>
        <div className="panel grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Lifetime business cash spending
            </p>
            <p className="money mt-1 text-2xl font-semibold">
              {summary.totalBusinessCashSpending === null
                ? "Unavailable"
                : formatMoney(summary.totalBusinessCashSpending)}
            </p>
          </div>
          <span className="hidden text-xl text-muted-foreground lg:block">
            =
          </span>
          <div>
            <p className="text-xs text-muted-foreground">
              Confirmed source-paid spending
            </p>
            <p className="money mt-1 text-xl font-semibold">
              {formatMoney(summary.confirmedPaidSourceSpending)}
            </p>
          </div>
          <span className="hidden text-xl text-muted-foreground lg:block">
            +
          </span>
          <div>
            <p className="text-xs text-muted-foreground">
              Verified courier deductions
            </p>
            <p className="money mt-1 text-xl font-semibold">
              {formatMoney(summary.verifiedCourierFulfilmentSpending)}
            </p>
          </div>
        </div>
        <SupportingFacts summary={summary} />
      </section>

      <div id="owner-position" className="scroll-mt-32">
      <CapitalFundsWorkspace
        summary={summary}
        owners={cash.ownerHeldBalances}
          capitalPositions={cash.ownerCapitalPositions}
          spendingCategories={cash.spendingCategories}
          steadfast={cash.steadfastReceivable}
          accounts={cash.accountReconciliation}
          today={today}
          enabled={connected && user.role === "owner"}
        />
      </div>

      <section
        id="period-activity"
        className="scroll-mt-32 space-y-3"
        aria-labelledby="period-activity-heading"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            Period activity
          </p>
          <h2
            id="period-activity-heading"
            className="mt-1 text-xl font-semibold"
          >
            Posted movement for {periodLabel.toLowerCase()}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Change the posted-date window without changing lifetime owner
            balances.
          </p>
        </div>
        <div className="panel overflow-hidden">
          <form
            className="grid gap-3 border-b bg-muted/20 p-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
            method="get"
          >
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Posted from</span>
              <input
                className="h-9 rounded-lg border bg-background px-3"
                type="date"
                name="start"
                defaultValue={startDate ?? ""}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Posted through</span>
              <input
                className="h-9 rounded-lg border bg-background px-3"
                type="date"
                name="end"
                defaultValue={endDate ?? ""}
              />
            </label>
            <button
              className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
              type="submit"
            >
              Apply period
            </button>
            <a
              className="inline-flex h-9 items-center justify-center rounded-lg border bg-background px-4 text-sm font-medium"
              href="/cash-settlements"
            >
              Lifetime
            </a>
          </form>
          <div className="grid gap-4 p-5 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-center">
            <div className="rounded-xl bg-emerald-50 p-4">
              <p className="flex items-center gap-2 text-xs font-medium text-emerald-800">
                <ArrowDown className="size-4" /> Posted cash inflow
              </p>
              <p className="money mt-2 text-2xl font-semibold text-emerald-900">
                {formatMoney(periodInflow)}
              </p>
            </div>
            <span className="hidden text-2xl text-muted-foreground lg:block">
              −
            </span>
            <div className="rounded-xl bg-rose-50 p-4">
              <p className="flex items-center gap-2 text-xs font-medium text-rose-800">
                <ArrowUp className="size-4" /> Posted cash outflow
              </p>
              <p className="money mt-2 text-2xl font-semibold text-rose-900">
                {formatMoney(periodOutflow)}
              </p>
            </div>
            <span className="hidden text-2xl text-muted-foreground lg:block">
              =
            </span>
            <div className="rounded-xl bg-blue-50 p-4">
              <p className="flex items-center gap-2 text-xs font-medium text-blue-800">
                <ArrowRight className="size-4" /> Net posted movement
              </p>
              <p className="money mt-2 text-2xl font-semibold text-blue-950">
                {formatMoney(periodInflow - periodOutflow)}
              </p>
            </div>
          </div>
          <dl className="grid border-t text-sm sm:grid-cols-3 sm:divide-x">
            <div className="flex items-center justify-between gap-3 p-4 sm:block">
              <dt className="text-muted-foreground">Owner money taken</dt>
              <dd className="money mt-1 font-semibold">
                {formatMoney(ownerPeriod.ownerMoneyTaken)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t p-4 sm:block sm:border-t-0">
              <dt className="text-muted-foreground">Capital-return portion</dt>
              <dd className="money mt-1 font-semibold">
                {formatMoney(ownerPeriod.capitalReturn)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t p-4 sm:block sm:border-t-0">
              <dt className="text-muted-foreground">Due-from-Owner portion</dt>
              <dd className="money mt-1 font-semibold">
                {formatMoney(ownerPeriod.dueCreated)}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section
        id="reconciliation"
        className="scroll-mt-32 space-y-3"
        aria-labelledby="reconciliation-heading"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            Reconciliation
          </p>
          <h2
            id="reconciliation-heading"
            className="mt-1 text-xl font-semibold"
          >
            Evidence and control checks
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ledger, observed actual, and difference remain separate. Nothing is
            auto-adjusted.
          </p>
        </div>
        {summary.unresolvedReconciliationDifference === null ||
        summary.unresolvedReconciliationDifference !== 0 ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium">Control attention remains visible</p>
              <p className="mt-1 text-sm">
                Record or review actual balances before treating ledger cash as
                currently available.
              </p>
            </div>
          </div>
        ) : null}
        <ReconciliationWorkspace
          accounts={cash.accountReconciliation}
          issues={cash.historicalIssues}
          fundings={cash.activeFundings}
          ledger={cash.entries}
          today={today}
          enabled={connected && user.role === "owner"}
        />
      </section>

      <CashWorkspace
        data={cash}
        settings={settings}
        today={today}
        enabled={enabled || allowMockCashControls}
        reversalEnabled={connected && user.role === "owner"}
      />

      <section
        id="settlement"
        className="scroll-mt-32 space-y-3"
        aria-labelledby="settlement-heading"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            Settlement
          </p>
          <h2 id="settlement-heading" className="mt-1 text-xl font-semibold">
            Record and audit courier settlement
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review eligible Delivered COD orders, then confirm one immutable
            batch.
          </p>
        </div>
        <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground">
              COD rows before reconciliation
            </p>
            <p className="money mt-1 font-semibold">
              {formatMoney(codReceivable)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.eligibleOrders.length} eligible rows
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Confirmed gross COD</p>
            <p className="money mt-1 font-semibold">
              {formatMoney(settledValue)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Before courier deductions
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Net settlement received</p>
            <p className="money mt-1 font-semibold">
              {formatMoney(netSettlementReceived)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeBatches.length} active batches
            </p>
          </div>
        </div>
        <SettlementWorkspace
          data={data}
          enabled={enabled}
          reversalEnabled={connected && user.role === "owner"}
          today={today}
        />
      </section>
    </div>
  );
}
