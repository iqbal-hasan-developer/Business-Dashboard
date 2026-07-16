import { CircleDollarSign, ReceiptText, Tags, TrendingDown } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeading } from "@/components/page-heading";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/domain/money";
import { getBusinessRepository } from "@/data/provider";

export default async function ExpensesPage() {
  const expenses = await (await getBusinessRepository()).getExpenses();
  const total = expenses.reduce((sum, value) => sum + value.amount, 0);
  const advertising = expenses.filter((expense) => expense.category === "Advertising").reduce((sum, expense) => sum + expense.amount, 0);
  const byCategory = new Map<string, number>();
  expenses.forEach((expense) => byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amount));
  const largest = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];

  return <><PageHeading title="Expenses" description="Review operating outflows separately from order-level courier and product costs." /><div className="grid gap-3 sm:grid-cols-3"><MetricCard label="Total expenses" value={formatMoney(total)} detail={`${expenses.length} recorded entries`} icon={TrendingDown} tone="red" /><MetricCard label="Advertising" value={formatMoney(advertising)} detail="Recorded advertising expenses" icon={CircleDollarSign} tone="violet" /><MetricCard label="Largest category" value={largest?.[0] ?? "None"} detail={largest ? formatMoney(largest[1]) : "No expenses recorded"} icon={Tags} tone="amber" /></div><section className="panel mt-4 overflow-hidden"><div className="border-b p-4"><h2 className="text-sm font-semibold">Expense ledger</h2><p className="mt-1 text-xs text-muted-foreground">Read-only authenticated expense records.</p></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{expenses.length ? expenses.map((expense) => <TableRow key={expense.id}><TableCell>{expense.date}</TableCell><TableCell><span className="inline-flex items-center gap-2"><ReceiptText className="size-3.5 text-muted-foreground" />{expense.category}</span></TableCell><TableCell>{expense.description}</TableCell><TableCell className="money text-right font-medium">{formatMoney(expense.amount)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground">No expenses exist in the development project.</TableCell></TableRow>}</TableBody></Table></div></section></>;
}
