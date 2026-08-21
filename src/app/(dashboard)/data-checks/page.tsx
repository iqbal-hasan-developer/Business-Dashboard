import { AlertTriangle, CheckCircle2, CircleAlert, DatabaseZap } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { getBusinessRepository } from "@/data/provider";

export default async function DataChecksPage() {
  const repository = await getBusinessRepository();
  const data = await repository.getDashboard();
  const quality = data.dataQuality;
  const checks = [
    { name: "Order items with missing links", count: quality.orderItemsWithMissingLinks },
    { name: "Duplicate order numbers", count: quality.duplicateOrderNumbers },
    { name: "Products with missing SKU", count: quality.productsWithMissingSku },
    { name: "Duplicate product SKUs", count: quality.duplicateProductSkus },
    { name: "Delivered orders without items", count: quality.deliveredOrdersWithoutItems },
    { name: "Delivered orders missing recognition snapshots", count: quality.deliveredOrdersMissingFinancialSnapshot },
    { name: "Snapshot Product Revenue mismatches", count: quality.snapshotProductRevenueMismatches },
    { name: "Snapshot COGS mismatches", count: quality.snapshotCogsMismatches },
    { name: "Inventory purchases recorded as operating expense", count: quality.inventoryPurchasesRecordedAsOperatingExpense },
    { name: "Supplier freight recorded as operating expense", count: quality.supplierFreightRecordedAsOperatingExpense },
    { name: "Delivered items missing immutable landed-cost split", count: quality.deliveredItemsMissingLandedCostSnapshot },
    { name: "Purchase batches missing quantity", count: quality.procurementBatchesMissingQuantity },
    { name: "Purchase batches missing SKU/product", count: quality.procurementBatchesMissingProduct },
    { name: "Freight-in waiting for merchandise-cost allocation", count: quality.unallocatedFreightIn },
    { name: "Negative or invalid landed unit cost", count: quality.invalidLandedCost },
    { name: "Purchase batch allocation not reconciling", count: quality.purchaseBatchAllocationMismatches },
    { name: "Advertising duplicated in Expenses and Marketing", count: quality.advertisingDuplicatedInExpenses },
    { name: "Order fulfillment duplicated in Expenses", count: quality.fulfillmentDuplicatedInExpenses },
    { name: "Inventory valuation not reconciling with batch movements", count: quality.inventoryValuationMismatches },
    { name: "Procurement records waiting for batch/product allocation", count: quality.unallocatedProcurementRecords },
    { name: "Procurement records missing a linked cash outflow", count: quality.procurementRecordsMissingCashMovement },
    { name: "Delivered orders missing COGS", count: data.reporting.deliveredOrdersMissingCogs },
    { name: "Delivered orders missing fulfillment costs", count: data.reporting.deliveredOrdersMissingFulfillmentCosts },
    { name: "Filtered summary/detail reconciliation", count: data.reporting.summaryMatchesOrderDetails ? 0 : 1 },
    { name: "Global RPC/view reconciliation", count: data.reporting.globalReconciliationMatches ? 0 : 1 },
  ];
  const issues = checks.reduce((sum, check) => sum + check.count, 0);
  const passed = checks.filter((check) => check.count === 0).length;

  return <><PageHeading title="Data checks" description="Read-only checks from authoritative reconciliation and data-quality views." /><div className="mb-4 grid gap-3 sm:grid-cols-3"><div className="panel flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><CheckCircle2 className="size-4" /></span><div><p className="text-xl font-semibold">{passed}</p><p className="text-xs text-muted-foreground">Checks passed</p></div></div><div className="panel flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-lg bg-amber-50 text-amber-600"><AlertTriangle className="size-4" /></span><div><p className="text-xl font-semibold">{issues}</p><p className="text-xs text-muted-foreground">Signals need review</p></div></div><div className="panel flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-lg bg-blue-50 text-primary"><DatabaseZap className="size-4" /></span><div><p className="text-xl font-semibold">{checks.length}</p><p className="text-xs text-muted-foreground">Authoritative checks</p></div></div></div><section className="panel overflow-hidden"><div className="divide-y">{checks.map((check) => <div key={check.name} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><span className={`grid size-9 shrink-0 place-items-center rounded-lg ${check.count === 0 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>{check.count === 0 ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}</span><div className="min-w-0 flex-1"><h2 className="text-sm font-medium">{check.name}</h2><p className="mt-1 text-xs text-muted-foreground">{check.count === 0 ? "No issue detected." : `${check.count} signal${check.count === 1 ? "" : "s"} require review.`}</p></div><span className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${check.count === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{check.count === 0 ? "Passed" : `${check.count} issue${check.count === 1 ? "" : "s"}`}</span></div>)}</div></section></>;
}
