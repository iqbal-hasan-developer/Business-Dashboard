import type { LucideIcon } from "lucide-react";

export function MetricCard({ label, value, detail, icon: Icon, tone = "blue" }: { label: string; value: string; detail: string; icon: LucideIcon; tone?: "blue" | "emerald" | "amber" | "violet" | "cyan" | "red" }) {
  const tones = { blue: "bg-blue-50 text-blue-600", emerald: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-600", violet: "bg-violet-50 text-violet-600", cyan: "bg-cyan-50 text-cyan-600", red: "bg-red-50 text-red-600" };
  return <div className="panel p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="money mt-2 text-xl font-semibold text-slate-950">{value}</p><p className="mt-2 text-xs text-muted-foreground">{detail}</p></div><span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tones[tone]}`}><Icon className="size-4" /></span></div></div>;
}
