import { ArrowDownRight, ArrowUpRight, Banknote, Boxes, CircleDollarSign, Clock3, PackageCheck, Percent, Receipt, ShoppingCart, TrendingUp, Wallet, WalletCards, Warehouse } from "lucide-react";
import { formatMoney } from "@/domain/money";
import type { DashboardSummary } from "@/domain/types";

export function KpiGrid({ data }: { data: DashboardSummary }) {
  const cards = [
    { label: "Total orders", value: String(data.totalOrders), meta: "+12.5%", positive: true, icon: ShoppingCart, tone: "blue" },
    { label: "Delivered orders", value: String(data.deliveredOrders), meta: `${Math.round((data.deliveredOrders / Math.max(data.totalOrders, 1)) * 100)}% delivery rate`, positive: true, icon: PackageCheck, tone: "emerald" },
    { label: "Pending orders", value: String(data.pendingOrders), meta: "Needs action", positive: false, icon: Clock3, tone: "amber" },
    { label: "Product revenue", value: formatMoney(data.productRevenue), meta: "Delivered items only", positive: true, icon: Receipt, tone: "cyan" },
    { label: "Net revenue", value: formatMoney(data.netRevenue), meta: "Delivered only", positive: true, icon: TrendingUp, tone: "blue" },
    { label: "COGS", value: formatMoney(data.cogs), meta: "Recognized cost", positive: false, icon: Boxes, tone: "violet" },
    { label: "Gross profit", value: formatMoney(data.grossProfit), meta: "Before operating cost", positive: true, icon: CircleDollarSign, tone: "emerald" },
    { label: "Net profit", value: formatMoney(data.netProfit), meta: data.netProfit >= 0 ? "After expenses" : "Loss this period", positive: data.netProfit >= 0, icon: Banknote, tone: data.netProfit >= 0 ? "emerald" : "red" },
    { label: "Profit margin", value: `${(data.profitMargin * 100).toFixed(1)}%`, meta: "Net profit / revenue", positive: data.profitMargin >= 0, icon: Percent, tone: data.profitMargin >= 0 ? "blue" : "red" },
    { label: "Ad spend", value: formatMoney(data.adSpend), meta: "Meta + creators", positive: false, icon: WalletCards, tone: "violet" },
    { label: "Average order value", value: formatMoney(data.averageOrderValue), meta: "Delivered orders", positive: true, icon: ShoppingCart, tone: "cyan" },
    { label: "Cash balance", value: formatMoney(data.cashBalance), meta: "Mock closing balance", positive: true, icon: Wallet, tone: "emerald" },
    { label: "COD receivable", value: formatMoney(data.codReceivable), meta: "Pending settlement", positive: false, icon: Receipt, tone: "amber" },
    { label: "Inventory value", value: formatMoney(data.inventoryValue), meta: "At buying cost", positive: true, icon: Warehouse, tone: "blue" },
  ];
  const toneClass: Record<string, string> = { blue: "bg-blue-50 text-blue-600", emerald: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-600", cyan: "bg-cyan-50 text-cyan-600", violet: "bg-violet-50 text-violet-600", red: "bg-red-50 text-red-600" };
  return <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 2xl:grid-cols-7">{cards.map((card) => <div key={card.label} className="panel min-w-0 p-3 sm:p-4"><div className="flex items-start justify-between gap-2 sm:gap-3"><div className="min-w-0"><p className="truncate text-xs font-medium text-muted-foreground">{card.label}</p><p className="money mt-2 truncate text-lg font-semibold text-slate-950 sm:text-xl">{card.value}</p></div><span className={`grid size-8 shrink-0 place-items-center rounded-lg sm:size-9 ${toneClass[card.tone]}`}><card.icon className="size-4" /></span></div><p className={`mt-2 flex items-center gap-1 truncate text-[10px] sm:text-[11px] ${card.positive ? "text-emerald-600" : "text-muted-foreground"}`}>{card.positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{card.meta}</p></div>)}</div>;
}
