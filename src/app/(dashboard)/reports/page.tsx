import { CheckCircle2, CircleAlert, Download, ShieldCheck } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { getBusinessRepository } from "@/data/provider";
import { formatMoney } from "@/domain/money";
import type { Money } from "@/domain/types";

function optionalMoney(value: Money | null) {
  return value === null ? "Incomplete cost data" : formatMoney(value);
}

export default async function ReportsPage() {
  const repository = await getBusinessRepository();
  const data = await repository.getDashboard();
  const metrics = [
    ["Product Revenue", optionalMoney(data.summary.productRevenue)],
    ["Net Revenue", optionalMoney(data.summary.netRevenue)],
    ["COGS", optionalMoney(data.summary.cogs)],
    ["Gross Profit", optionalMoney(data.summary.grossProfit)],
    ["Contribution Profit", optionalMoney(data.summary.contributionProfit)],
    ["Ad Spend", formatMoney(data.summary.adSpend)],
    ["Operating Expenses", formatMoney(data.summary.operatingExpenses)],
    ["Net Profit", optionalMoney(data.summary.netProfit)],
    ["Profit Margin", data.summary.profitMargin === null
      ? data.reporting.financialState === "available" ? "No revenue for margin" : "Incomplete cost data"
      : `${(data.summary.profitMargin * 100).toFixed(2)}%`],
    ["Refund adjustments included", formatMoney(data.reporting.recognizedRefundAmount)],
  ];
  const checks = [
    ["Filtered summary matches recognized order rows", data.reporting.summaryMatchesOrderDetails],
    ["Global RPC matches reconciliation view", data.reporting.globalReconciliationMatches],
    ["Data-quality counts are zero", data.reporting.dataQualityAllZero],
  ] as const;

  return <><PageHeading title="Reports" description="Read-only snapshot-backed financial reporting from authenticated database contracts." actions={<Button disabled variant="outline" size="sm"><Download /> Export not enabled</Button>} /><section className="panel mb-4 p-4"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-primary"><ShieldCheck className="size-4" /></span><div><h2 className="text-sm font-semibold">Authoritative reporting scope</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{data.reporting.financialMessage}</p></div></div></section><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{metrics.map(([label, value]) => <article key={label} className="panel p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="money mt-2 text-base font-semibold text-slate-950">{value}</p></article>)}</div><div className="mt-4 grid gap-4 xl:grid-cols-2"><section className="panel p-4"><h2 className="text-sm font-semibold">Reconciliation</h2><div className="mt-3 space-y-2">{checks.map(([label, passed]) => <div key={label} className={`flex items-center gap-2 rounded-lg border p-3 text-xs ${passed ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{passed ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}{label}</div>)}</div></section><section className="panel p-4"><h2 className="text-sm font-semibold">Installed response contracts</h2><dl className="mt-3 space-y-2 text-xs"><div><dt className="font-medium">Financial summary</dt><dd className="text-muted-foreground">{data.reporting.sources.financialSummary}</dd></div><div><dt className="font-medium">Recognized order detail and refunds</dt><dd className="text-muted-foreground">{data.reporting.sources.orderFinancials}</dd></div><div><dt className="font-medium">Daily chart</dt><dd className="text-muted-foreground">{data.reporting.sources.dailyFinancials}</dd></div><div><dt className="font-medium">Reconciliation</dt><dd className="text-muted-foreground">{data.reporting.sources.reconciliation}</dd></div><div><dt className="font-medium">Data quality</dt><dd className="text-muted-foreground">{data.reporting.sources.dataQuality}</dd></div></dl></section></div></>;
}
