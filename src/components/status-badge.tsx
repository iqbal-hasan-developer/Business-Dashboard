import { Badge } from "@/components/ui/badge";
import type { OrderStatus, PaymentStatus, SettlementStatus } from "@/domain/types";

const tones: Record<OrderStatus | PaymentStatus | SettlementStatus, string> = {
  Pending: "border-amber-200 bg-amber-50 text-amber-700",
  Confirmed: "border-blue-200 bg-blue-50 text-blue-700",
  Dispatched: "border-violet-200 bg-violet-50 text-violet-700",
  Delivered: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Cancelled: "border-slate-200 bg-slate-50 text-slate-600",
  Returned: "border-orange-200 bg-orange-50 text-orange-700",
  Refunded: "border-cyan-200 bg-cyan-50 text-cyan-700",
  "Failed Delivery": "border-red-200 bg-red-50 text-red-700",
  Unpaid: "border-amber-200 bg-amber-50 text-amber-700",
  Paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Partially Paid": "border-violet-200 bg-violet-50 text-violet-700",
  "Not Applicable": "border-slate-200 bg-slate-50 text-slate-600",
  Awaiting: "border-amber-200 bg-amber-50 text-amber-700",
  "Partially Settled": "border-violet-200 bg-violet-50 text-violet-700",
  Settled: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Refund Due": "border-red-200 bg-red-50 text-red-700",
};

export function StatusBadge({ value }: { value: OrderStatus | PaymentStatus | SettlementStatus }) {
  return <Badge variant="outline" className={tones[value]}>{value}</Badge>;
}
