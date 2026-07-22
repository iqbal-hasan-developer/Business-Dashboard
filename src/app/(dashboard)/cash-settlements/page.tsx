import { CircleCheckBig, ShoppingBag, WalletCards } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeading } from "@/components/page-heading";
import { SettlementWorkspace } from "@/components/settlements/settlement-workspace";
import { getBusinessRepository } from "@/data/provider";
import { sumMoney } from "@/domain/money";
import { dhakaBusinessDate } from "@/domain/reporting-period";
import { getDashboardUser } from "@/lib/auth/session";
import { resolveBusinessDataProvider } from "@/lib/supabase/env";
import { formatMoney } from "@/domain/money";

export default async function CashSettlementsPage() {
  const [data, user] = await Promise.all([(await getBusinessRepository()).getCourierSettlementData(), getDashboardUser()]);
  const codReceivable = sumMoney(data.eligibleOrders.map((order) => order.grossCodReceivable));
  const settledValue = sumMoney(data.batches.map((batch) => batch.grossCodAmount));
  const enabled = resolveBusinessDataProvider() === "supabase" && Boolean(user && ["owner", "admin"].includes(user.role));

  return <>
    <PageHeading title="Cash settlements" description="Confirm immutable Steadfast COD receipts without changing delivery, payment, revenue, COGS, or stock." />
    <div className="grid gap-3 sm:grid-cols-3">
      <MetricCard label="Eligible COD receivable" value={formatMoney(codReceivable)} detail={`${data.eligibleOrders.length} Delivered COD orders`} icon={WalletCards} tone="amber" />
      <MetricCard label="Confirmed gross COD" value={formatMoney(settledValue)} detail={`${data.batches.length} immutable batches`} icon={CircleCheckBig} tone="emerald" />
      <MetricCard label="Courier scope" value="Steadfast" detail="Full-order settlement only" icon={ShoppingBag} tone="blue" />
    </div>
    <SettlementWorkspace data={data} enabled={enabled} today={dhakaBusinessDate()} />
  </>;
}
