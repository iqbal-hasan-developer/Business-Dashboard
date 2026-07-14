import { CircleDollarSign, Download, Plus, ReceiptText, Tags, TrendingDown } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeading } from "@/components/page-heading";
import { PrototypeAction } from "@/components/prototype-action";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/domain/money";
import { getBusinessRepository } from "@/data/provider";

export default async function ExpensesPage() {
  const expenses = await (await getBusinessRepository()).getExpenses(); const total = expenses.reduce((sum, value) => sum + value.amount, 0);
  return <><PageHeading title="Expenses" description="Record operating outflows separately from order-level courier and product costs." actions={<><PrototypeAction message="Expense export prepared" variant="outline" size="sm"><Download /> Export</PrototypeAction><PrototypeAction message="Expense draft created" size="sm"><Plus /> Add expense</PrototypeAction></>} /><div className="grid gap-3 sm:grid-cols-3"><MetricCard label="Total expenses" value={formatMoney(total)} detail="5 recorded entries" icon={TrendingDown} tone="red" /><MetricCard label="Advertising" value="৳5,600" detail="Meta Ads + creator" icon={CircleDollarSign} tone="violet" /><MetricCard label="Largest category" value="Advertising" detail="66.9% of expense total" icon={Tags} tone="amber" /></div><section className="panel mt-4 overflow-hidden"><div className="border-b p-4"><h2 className="text-sm font-semibold">Expense ledger</h2><p className="mt-1 text-xs text-muted-foreground">Every entry will carry audit fields in Phase 2.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{expenses.map((expense) => <TableRow key={expense.id}><TableCell>{expense.date}</TableCell><TableCell><span className="inline-flex items-center gap-2"><ReceiptText className="size-3.5 text-muted-foreground" />{expense.category}</span></TableCell><TableCell>{expense.description}</TableCell><TableCell className="money text-right font-medium">{formatMoney(expense.amount)}</TableCell></TableRow>)}</TableBody></Table></div></section></>;
}
