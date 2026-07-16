import {
  ArrowDownRight, ArrowUpRight, Banknote, Boxes, CircleDollarSign, Clock3,
  Minus, PackageCheck, Percent, Receipt, ShoppingCart, TrendingUp, Wallet,
  WalletCards, Warehouse,
} from "lucide-react";
import { formatMoney } from "@/domain/money";
import type { DashboardComparison, DashboardSummary } from "@/domain/types";

type Direction = "positive" | "negative" | "neutral";
type CardTone = "blue" | "emerald" | "amber" | "cyan" | "violet" | "red";

export function KpiGrid({ data, comparison }: { data: DashboardSummary; comparison: DashboardComparison }) {
  const change = comparison.totalOrdersChangePercent;
  const totalOrdersDirection: Direction = !comparison.hasPriorPeriodData || change === null || change === 0
    ? "neutral"
    : change > 0 ? "positive" : "negative";
  const totalOrdersMeta = comparison.hasPriorPeriodData && change !== null
    ? `${change > 0 ? "+" : ""}${change.toFixed(1)}%`
    : "No prior-period data";
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
    { label: "Product revenue", value: formatMoney(data.productRevenue), meta: data.productRevenue === 0 ? "No delivered revenue" : "Delivered items only", direction: data.productRevenue === 0 ? "neutral" : "positive", icon: Receipt, tone: "cyan" },
    { label: "Net revenue", value: formatMoney(data.netRevenue), meta: data.netRevenue === 0 ? "No recognized revenue" : "Delivered only", direction: data.netRevenue === 0 ? "neutral" : "positive", icon: TrendingUp, tone: "blue" },
    { label: "COGS", value: formatMoney(data.cogs), meta: data.cogs === 0 ? "No recognized cost" : "Recognized cost", direction: data.cogs === 0 ? "neutral" : "negative", icon: Boxes, tone: "violet" },
    { label: "Gross profit", value: formatMoney(data.grossProfit), meta: data.grossProfit === 0 ? "No recognized profit" : "Before operating cost", direction: data.grossProfit === 0 ? "neutral" : "positive", icon: CircleDollarSign, tone: "emerald" },
    { label: "Net profit", value: formatMoney(data.netProfit), meta: data.netProfit === 0 ? "No recognized profit" : data.netProfit > 0 ? "After expenses" : "Loss this period", direction: data.netProfit === 0 ? "neutral" : data.netProfit > 0 ? "positive" : "negative", icon: Banknote, tone: data.netProfit >= 0 ? "emerald" : "red" },
    { label: "Profit margin", value: `${(data.profitMargin * 100).toFixed(1)}%`, meta: data.netRevenue === 0 ? "No revenue for margin" : "Net profit / revenue", direction: data.netRevenue === 0 || data.profitMargin === 0 ? "neutral" : data.profitMargin > 0 ? "positive" : "negative", icon: Percent, tone: data.profitMargin >= 0 ? "blue" : "red" },
    { label: "Ad spend", value: formatMoney(data.adSpend), meta: data.adSpend === 0 ? "No ad spend recorded" : "Meta + creators", direction: data.adSpend === 0 ? "neutral" : "negative", icon: WalletCards, tone: "violet" },
    { label: "Average order value", value: formatMoney(data.averageOrderValue), meta: data.deliveredOrders === 0 ? "No delivered orders" : "Delivered orders", direction: data.deliveredOrders === 0 ? "neutral" : "positive", icon: ShoppingCart, tone: "cyan" },
    { label: "Cash balance", value: formatMoney(data.cashBalance), meta: data.cashBalance === 0 ? "No cash movements recorded" : "Recorded movements", direction: data.cashBalance === 0 ? "neutral" : "positive", icon: Wallet, tone: "emerald" },
    { label: "COD receivable", value: formatMoney(data.codReceivable), meta: data.codReceivable === 0 ? "No COD receivable" : "Pending settlement", direction: data.codReceivable === 0 ? "neutral" : "negative", icon: Receipt, tone: "amber" },
    { label: "Inventory value", value: formatMoney(data.inventoryValue), meta: data.inventoryValue === 0 ? "No inventory value recorded" : "At buying cost", direction: data.inventoryValue === 0 ? "neutral" : "positive", icon: Warehouse, tone: "blue" },
  ];
  const toneClass: Record<CardTone, string> = { blue: "bg-blue-50 text-blue-600", emerald: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-600", cyan: "bg-cyan-50 text-cyan-600", violet: "bg-violet-50 text-violet-600", red: "bg-red-50 text-red-600" };
  return <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 2xl:grid-cols-7">{cards.map((card) => {
    const MetaIcon = card.direction === "positive" ? ArrowUpRight : card.direction === "negative" ? ArrowDownRight : Minus;
    return <div key={card.label} className="panel min-w-0 p-3 sm:p-4"><div className="flex items-start justify-between gap-2 sm:gap-3"><div className="min-w-0"><p className="truncate text-xs font-medium text-muted-foreground">{card.label}</p><p className="money mt-2 truncate text-lg font-semibold text-slate-950 sm:text-xl">{card.value}</p></div><span className={`grid size-8 shrink-0 place-items-center rounded-lg sm:size-9 ${toneClass[card.tone]}`}><card.icon className="size-4" /></span></div><p className={`mt-2 flex items-center gap-1 truncate text-[10px] sm:text-[11px] ${card.direction === "positive" ? "text-emerald-600" : "text-muted-foreground"}`}><MetaIcon className="size-3" />{card.meta}</p></div>;
  })}</div>;
}
