import {
  ArrowDownRight, ArrowUpRight, Banknote, Boxes, CircleDollarSign, Clock3,
  Minus, PackageCheck, Percent, Receipt, ShieldCheck, ShoppingCart, TrendingUp,
  Wallet, WalletCards, Warehouse,
} from "lucide-react";
import { formatMoney } from "@/domain/money";
import type { DashboardComparison, DashboardReportingStatus, DashboardSummary, Money } from "@/domain/types";

type Direction = "positive" | "negative" | "neutral";
type CardTone = "blue" | "emerald" | "amber" | "cyan" | "violet" | "red";

function financialValue(value: Money | null) {
  return value === null ? "—" : formatMoney(value);
}

function unavailableMeta(reporting: DashboardReportingStatus) {
  return reporting.financialState === "incomplete" ? "Incomplete cost data" : "Delivered-only accounting";
}

export function KpiGrid({
  data,
  comparison,
  reporting,
}: {
  data: DashboardSummary;
  comparison: DashboardComparison;
  reporting: DashboardReportingStatus;
}) {
  const change = comparison.totalOrdersChangePercent;
  const totalOrdersDirection: Direction = !comparison.hasPriorPeriodData || change === null || change === 0
    ? "neutral"
    : change > 0 ? "positive" : "negative";
  const totalOrdersMeta = comparison.hasPriorPeriodData && change !== null
    ? `${change > 0 ? "+" : ""}${change.toFixed(1)}%`
    : "No prior-period data";
  const unavailable = unavailableMeta(reporting);
  const connected = reporting.sources.financialSummary !== "mock";
  const cards: Array<{
    label: string;
    value: string;
    meta: string;
    direction: Direction;
    icon: typeof ShoppingCart;
    tone: CardTone;
  }> = [
    { label: "Total orders", value: String(data.totalOrders), meta: totalOrdersMeta, direction: totalOrdersDirection, icon: ShoppingCart, tone: "blue" },
    { label: "Delivered orders", value: String(data.deliveredOrders), meta: data.deliveredOrders === 0 ? "No delivered orders" : `${Math.round((data.deliveredOrders / Math.max(data.totalOrders, 1)) * 100)}% delivery rate`, direction: data.deliveredOrders === 0 ? "neutral" : "positive", icon: PackageCheck, tone: "emerald" },
    { label: "Pending orders", value: String(data.pendingOrders), meta: data.pendingOrders === 0 ? "No pending orders" : "Needs action", direction: data.pendingOrders === 0 ? "neutral" : "negative", icon: Clock3, tone: "amber" },
    { label: "Product revenue", value: financialValue(data.productRevenue), meta: data.productRevenue === null ? unavailable : data.productRevenue === 0 ? "No delivered revenue" : connected ? "Snapshot-backed" : "Delivered items only", direction: data.productRevenue && data.productRevenue > 0 ? "positive" : "neutral", icon: Receipt, tone: "cyan" },
    { label: "Net revenue", value: financialValue(data.netRevenue), meta: data.netRevenue === null ? unavailable : data.netRevenue === 0 ? "No recognized revenue" : connected ? "Refund-adjusted" : "Delivered only", direction: data.netRevenue && data.netRevenue > 0 ? "positive" : "neutral", icon: TrendingUp, tone: "blue" },
    { label: "COGS", value: financialValue(data.cogs), meta: data.cogs === null ? unavailable : data.cogs === 0 ? "No recognized cost" : "Snapshot-backed", direction: data.cogs && data.cogs > 0 ? "negative" : "neutral", icon: Boxes, tone: "violet" },
    { label: "Gross profit", value: financialValue(data.grossProfit), meta: data.grossProfit === null ? unavailable : data.grossProfit === 0 ? "No recognized profit" : "After COGS", direction: data.grossProfit === null || data.grossProfit === 0 ? "neutral" : data.grossProfit > 0 ? "positive" : "negative", icon: CircleDollarSign, tone: "emerald" },
    { label: "Contribution profit", value: financialValue(data.contributionProfit), meta: data.contributionProfit === null ? unavailable : data.contributionProfit === 0 ? "No contribution profit" : "After fulfillment", direction: data.contributionProfit === null || data.contributionProfit === 0 ? "neutral" : data.contributionProfit > 0 ? "positive" : "negative", icon: CircleDollarSign, tone: "cyan" },
    { label: "Operating expenses", value: formatMoney(data.operatingExpenses), meta: data.operatingExpenses === 0 ? "No expenses recorded" : "Filtered expense ledger", direction: data.operatingExpenses === 0 ? "neutral" : "negative", icon: Receipt, tone: "violet" },
    { label: "Net profit", value: financialValue(data.netProfit), meta: data.netProfit === null ? unavailable : data.netProfit === 0 ? "No recognized profit" : data.netProfit > 0 ? "After expenses" : "Loss this period", direction: data.netProfit === null || data.netProfit === 0 ? "neutral" : data.netProfit > 0 ? "positive" : "negative", icon: Banknote, tone: data.netProfit === null || data.netProfit >= 0 ? "emerald" : "red" },
    { label: "Profit margin", value: data.profitMargin === null ? "—" : `${(data.profitMargin * 100).toFixed(1)}%`, meta: data.profitMargin === null && reporting.financialState === "available" && data.netRevenue === 0 ? "No revenue for margin" : data.profitMargin === null ? unavailable : "Net profit / revenue", direction: data.profitMargin === null || data.profitMargin === 0 ? "neutral" : data.profitMargin > 0 ? "positive" : "negative", icon: Percent, tone: data.profitMargin === null || data.profitMargin >= 0 ? "blue" : "red" },
    { label: "Ad spend", value: formatMoney(data.adSpend), meta: data.adSpend === 0 ? "No ad spend recorded" : "Filtered spend ledger", direction: data.adSpend === 0 ? "neutral" : "negative", icon: WalletCards, tone: "violet" },
    { label: "Average order value", value: financialValue(data.averageOrderValue), meta: data.averageOrderValue === null ? unavailable : data.deliveredOrders === 0 ? "No delivered orders" : "Recognized Net Revenue", direction: data.averageOrderValue && data.averageOrderValue > 0 ? "positive" : "neutral", icon: ShoppingCart, tone: "cyan" },
    { label: "Cash balance", value: formatMoney(data.cashBalance), meta: data.cashBalance === 0 ? "No cash movements recorded" : "Cash movement ledger", direction: data.cashBalance === 0 ? "neutral" : data.cashBalance > 0 ? "positive" : "negative", icon: Wallet, tone: "emerald" },
    { label: "COD receivable", value: formatMoney(data.codReceivable), meta: data.codReceivable === 0 ? "No COD receivable" : "Adjusted Delivered snapshots", direction: data.codReceivable === 0 ? "neutral" : "negative", icon: Receipt, tone: "amber" },
    { label: "Inventory value", value: formatMoney(data.inventoryValue), meta: data.inventoryValue === 0 ? "No inventory value recorded" : "Current stock at buying cost", direction: data.inventoryValue === 0 ? "neutral" : "positive", icon: Warehouse, tone: "blue" },
  ];
  const toneClass: Record<CardTone, string> = { blue: "bg-blue-50 text-blue-600", emerald: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-600", cyan: "bg-cyan-50 text-cyan-600", violet: "bg-violet-50 text-violet-600", red: "bg-red-50 text-red-600" };
  return <><div className={`mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${reporting.financialState === "incomplete" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-100 bg-blue-50 text-blue-800"}`}><ShieldCheck className="mt-0.5 size-4 shrink-0" /><span>{reporting.financialMessage}</span></div><div className="grid grid-cols-2 gap-3 xl:grid-cols-4 2xl:grid-cols-8">{cards.map((card) => {
    const MetaIcon = card.direction === "positive" ? ArrowUpRight : card.direction === "negative" ? ArrowDownRight : Minus;
    return <div key={card.label} className="panel min-w-0 p-3 sm:p-4"><div className="flex items-start justify-between gap-2 sm:gap-3"><div className="min-w-0"><p className="truncate text-xs font-medium text-muted-foreground">{card.label}</p><p className="money mt-2 truncate text-lg font-semibold text-slate-950 sm:text-xl">{card.value}</p></div><span className={`grid size-8 shrink-0 place-items-center rounded-lg sm:size-9 ${toneClass[card.tone]}`}><card.icon className="size-4" /></span></div><p className={`mt-2 flex items-center gap-1 truncate text-[10px] sm:text-[11px] ${card.direction === "positive" ? "text-emerald-600" : "text-muted-foreground"}`}><MetaIcon className="size-3" />{card.meta}</p></div>;
  })}</div></>;
}
