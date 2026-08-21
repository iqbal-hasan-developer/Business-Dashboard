"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/domain/money";
import type { DashboardData } from "@/domain/types";

const colors = ["#3157d5", "#18b6c9", "#21a779", "#f2a93b", "#7357d9", "#e15b5b", "#68758c", "#f07d52"];
const orderStatusColors: Partial<Record<DashboardData["statusBreakdown"][number]["status"], string>> = {
  Cancelled: "#e15b5b",
};
const expenseSliceColor = (index: number) => `hsl(${Math.round((index * 137.508 + 212) % 360)} 68% 52%)`;
const axis = { fontSize: 11, fill: "#7a879b" };
const moneyTooltip = (value: unknown) => {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === null || candidate === undefined ? "Unavailable" : formatMoney(Number(candidate));
};
const compactMoney = (value: number) => `৳${(value / 100000).toFixed(value >= 100000 ? 1 : 2)}k`;

function Panel({ title, subtitle, children, className = "", emptyMessage }: { title: string; subtitle: string; children: React.ReactNode; className?: string; emptyMessage?: string }) {
  return <section className={`panel min-w-0 p-4 ${className}`}><div className="mb-4"><h2 className="text-sm font-semibold text-slate-950">{title}</h2><p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p></div><div className="h-64">{emptyMessage ? <div className="grid h-full place-items-center rounded-lg border border-dashed px-6 text-center text-xs leading-5 text-muted-foreground">{emptyMessage}</div> : children}</div></section>;
}

export default function DashboardCharts({ data }: { data: Pick<DashboardData, "trend" | "statusBreakdown" | "adSpendTrend" | "topProducts" | "expenseBreakdown" | "reporting"> }) {
  return <div className="mt-5 grid gap-4 xl:grid-cols-12">
    <Panel title="Revenue & contribution profit" subtitle="Delivered-order recognition by day" className="xl:col-span-8"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.trend} margin={{ left: 0, right: 12, top: 8 }}><CartesianGrid stroke="#edf0f5" vertical={false} /><XAxis dataKey="date" tick={axis} axisLine={false} tickLine={false} /><YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={compactMoney} /><Tooltip formatter={moneyTooltip} contentStyle={{ borderRadius: 10, borderColor: "#e4e8f0", fontSize: 12 }} /><Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} /><Line name="Net revenue" type="monotone" dataKey="revenue" stroke="#3157d5" strokeWidth={2.5} dot={false} /><Line name="Contribution profit" type="monotone" dataKey="profit" stroke="#21a779" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></Panel>
    <Panel title="Order status" subtitle="Current operational mix" className="xl:col-span-4" emptyMessage={data.statusBreakdown.length ? undefined : "No orders match the operational filters."}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.statusBreakdown} dataKey="count" nameKey="status" innerRadius={52} outerRadius={78} paddingAngle={3}>{data.statusBreakdown.map((entry, index) => <Cell key={entry.status} fill={orderStatusColors[entry.status] ?? colors[index % colors.length]} />)}</Pie><Tooltip contentStyle={{ borderRadius: 10, borderColor: "#e4e8f0", fontSize: 12 }} /><Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} /></PieChart></ResponsiveContainer></Panel>
    <Panel title="Revenue vs ad spend" subtitle="Daily efficiency signal" className="xl:col-span-5"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.adSpendTrend}><CartesianGrid stroke="#edf0f5" vertical={false} /><XAxis dataKey="date" tick={axis} axisLine={false} tickLine={false} /><YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={compactMoney} /><Tooltip formatter={moneyTooltip} contentStyle={{ borderRadius: 10, borderColor: "#e4e8f0", fontSize: 12 }} /><Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} /><Bar name="Revenue" dataKey="revenue" fill="#3157d5" radius={[4, 4, 0, 0]} /><Bar name="Ad spend" dataKey="adSpend" fill="#a894ed" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></Panel>
    <Panel title="Top products" subtitle="Refund-adjusted recognized product revenue" className="xl:col-span-4" emptyMessage={data.topProducts.length ? undefined : "No recognized product revenue in this period."}><ResponsiveContainer width="100%" height="100%"><BarChart data={data.topProducts} layout="vertical" margin={{ left: 12 }}><CartesianGrid stroke="#edf0f5" horizontal={false} /><XAxis type="number" hide /><YAxis type="category" dataKey="name" tick={axis} width={92} axisLine={false} tickLine={false} /><Tooltip formatter={moneyTooltip} contentStyle={{ borderRadius: 10, borderColor: "#e4e8f0", fontSize: 12 }} /><Bar dataKey="revenue" fill="#18b6c9" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></Panel>
    <Panel title="Expense & ad spend breakdown" subtitle="Delivered product, courier, and packaging costs plus advertising and operating expenses" className="xl:col-span-3" emptyMessage={data.expenseBreakdown.length ? undefined : "No recognized costs or expenses match the filters."}><ResponsiveContainer width="100%" height="100%"><PieChart accessibilityLayer><Pie data={data.expenseBreakdown} dataKey="amount" nameKey="category" innerRadius={48} outerRadius={74} isAnimationActive={false}>{data.expenseBreakdown.map((entry, index) => <Cell key={entry.category} fill={expenseSliceColor(index)} />)}</Pie><Tooltip formatter={moneyTooltip} contentStyle={{ borderRadius: 10, borderColor: "#e4e8f0", fontSize: 12 }} /><Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} /></PieChart></ResponsiveContainer></Panel>
  </div>;
}
