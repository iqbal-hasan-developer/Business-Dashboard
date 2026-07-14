import { Download, FileBarChart, FileSpreadsheet, PackageCheck, ReceiptText, WalletCards } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { PrototypeAction } from "@/components/prototype-action";

const reports = [
  { title: "Profit & loss", description: "Delivered revenue, COGS, courier cost, expenses, and net profit.", icon: FileBarChart },
  { title: "Order reconciliation", description: "Order totals compared with item-level revenue and COGS snapshots.", icon: PackageCheck },
  { title: "Settlement aging", description: "COD receivables grouped by courier settlement age.", icon: WalletCards },
  { title: "Expense ledger", description: "Auditable expense detail by date, category, and description.", icon: ReceiptText },
  { title: "Inventory valuation", description: "Stock on hand valued at current buying price.", icon: FileSpreadsheet },
];

export default function ReportsPage() {
  return <><PageHeading title="Reports" description="Export review-ready business summaries from a single source of truth." /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{reports.map((report) => <article key={report.title} className="panel flex min-h-48 flex-col p-5"><span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-primary"><report.icon className="size-5" /></span><h2 className="mt-5 text-sm font-semibold">{report.title}</h2><p className="mt-2 flex-1 text-xs leading-5 text-muted-foreground">{report.description}</p><PrototypeAction message={`${report.title} export prepared`} variant="outline" size="sm" className="mt-4 w-fit"><Download /> Export mock CSV</PrototypeAction></article>)}</div></>;
}
