"use client";

import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Pencil, ReceiptText, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteExpenseAction, editExpenseAction } from "@/actions/expenses";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { editExpenseSchema, EXPENSE_CATEGORIES, type EditExpenseValues } from "@/domain/expenses";
import { formatMoney } from "@/domain/money";
import { expenseAccountingClass } from "@/domain/procurement";
import type { Campaign, Expense, ExpenseAuditRecord } from "@/domain/types";

const categoryItems = EXPENSE_CATEGORIES.map(({ key, label }) => ({ value: key, label }));
const knownCategory = (value: string | undefined): EditExpenseValues["categoryKey"] =>
  EXPENSE_CATEGORIES.some((category) => category.key === value) ? value as EditExpenseValues["categoryKey"] : "other";
const moneyInput = (value: number) => `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;

export function ExpenseWorkspace({
  expenses,
  audit,
  campaigns,
  canEdit,
  canDelete,
}: {
  expenses: Expense[];
  audit: ExpenseAuditRecord[];
  campaigns: Campaign[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [deletionReason, setDeletionReason] = useState("");
  const campaignItems = [{ value: "none", label: "None" }, ...campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))];
  const form = useForm<EditExpenseValues>({
    resolver: zodResolver(editExpenseSchema),
    defaultValues: {
      expenseId: "",
      expenseDate: "",
      categoryKey: "operations",
      description: "",
      amount: "0",
      paymentMethod: "",
      campaignId: null,
      salesChannel: "",
      reference: "",
      reason: "",
      expectedUpdatedAt: "",
    },
  });

  function openEdit(expense: Expense) {
    if (!expense.updatedAt) return;
    form.reset({
      expenseId: expense.id,
      expenseDate: expense.date,
      categoryKey: knownCategory(expense.categoryKey),
      description: expense.description,
      amount: moneyInput(expense.amount),
      paymentMethod: expense.paymentMethod ?? "",
      campaignId: expense.campaignId ?? null,
      salesChannel: expense.salesChannel ?? "",
      reference: expense.reference ?? "",
      reason: "",
      expectedUpdatedAt: expense.updatedAt,
    });
    setEditing(expense);
  }

  function save(values: EditExpenseValues) {
    startTransition(async () => {
      const result = await editExpenseAction(values);
      if (!result.ok) {
        toast.error("Expense update failed", { description: result.message });
        return;
      }
      toast.success(result.message);
      setEditing(null);
      router.refresh();
    });
  }

  function remove() {
    if (!deleting?.updatedAt || deletionReason.trim().length < 3) return;
    startTransition(async () => {
      const result = await deleteExpenseAction({ expenseId: deleting.id, reason: deletionReason, expectedUpdatedAt: deleting.updatedAt });
      if (!result.ok) {
        toast.error("Expense deletion failed", { description: result.message });
        return;
      }
      toast.success(result.message);
      setDeleting(null);
      setDeletionReason("");
      router.refresh();
    });
  }

  return <div className="mt-4 flex flex-col gap-4">
    <section className="panel overflow-hidden">
      <div className="border-b p-4"><h2 className="text-sm font-semibold">Cost and procurement ledger</h2><p className="mt-1 text-xs text-muted-foreground">Operating expenses affect profit now. Inventory purchases and freight-in remain procurement assets until allocated inventory is delivered. Advertising stays in Marketing.</p></div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>{expenses.length ? expenses.map((expense) => <TableRow key={expense.id}>
            <TableCell className="whitespace-nowrap">{expense.date}</TableCell>
            <TableCell><span className="inline-flex items-center gap-2"><ReceiptText className="size-3.5 text-muted-foreground" />{expense.category}</span><p className="mt-1 text-[11px] text-muted-foreground">{expenseAccountingClass(expense.categoryKey, expense.accountingClass) === "operating_expense" ? "Operating expense" : "Inventory procurement"}</p></TableCell>
            <TableCell className="min-w-56"><p>{expense.description}</p>{expense.reference ? <p className="mt-1 text-xs text-muted-foreground">Ref: {expense.reference}</p> : null}</TableCell>
            <TableCell className="money text-right font-medium">{formatMoney(expense.amount)}</TableCell>
            <TableCell className="text-right"><div className="flex justify-end gap-1">
              <Button size="sm" variant="outline" disabled={!canEdit || !expense.updatedAt} onClick={() => openEdit(expense)} aria-label={`Edit ${expense.description}`}><Pencil data-icon="inline-start" /> Edit</Button>
              <Button size="sm" variant="ghost" disabled={!canDelete || !expense.updatedAt} onClick={() => { setDeleting(expense); setDeletionReason(""); }} aria-label={`Delete ${expense.description}`}><Trash2 data-icon="inline-start" /> Delete</Button>
            </div></TableCell>
          </TableRow>) : <TableRow><TableCell colSpan={5}><Empty className="min-h-32"><EmptyHeader><EmptyMedia variant="icon"><ReceiptText /></EmptyMedia><EmptyTitle>No expenses recorded</EmptyTitle><EmptyDescription>Use Record expense to add the first operating-expense entry.</EmptyDescription></EmptyHeader></Empty></TableCell></TableRow>}</TableBody>
        </Table>
      </div>
    </section>

    <section className="panel p-4">
      <h2 className="text-sm font-semibold">Procurement allocation workflow</h2>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">Unallocated procurement stays outside profit and known inventory value until the required evidence is complete.</p>
      <ol className="mt-3 grid gap-2 text-xs text-slate-700 sm:grid-cols-3">
        <li className="rounded-lg border p-3"><span className="font-semibold">1. Identify the batch</span><p className="mt-1 text-muted-foreground">Purchase date, supplier, and invoice or reference.</p></li>
        <li className="rounded-lg border p-3"><span className="font-semibold">2. Identify every item</span><p className="mt-1 text-muted-foreground">Product/SKU, received quantity, and supplier unit cost.</p></li>
        <li className="rounded-lg border p-3"><span className="font-semibold">3. Confirm freight and cash</span><p className="mt-1 text-muted-foreground">Batch freight records and the actual paying account. Freight then allocates by merchandise cost.</p></li>
      </ol>
    </section>

    <section className="panel overflow-hidden">
      <div className="border-b p-4"><h2 className="text-sm font-semibold">Expense audit history</h2><p className="mt-1 text-xs text-muted-foreground">Latest edits and deletions, including the required reason.</p></div>
      <div className="divide-y">{audit.length ? audit.map((item) => <div key={item.id} className="grid gap-1 p-4 text-sm sm:grid-cols-[8rem_1fr_auto]">
        <Badge className="w-fit" variant={item.action === "DELETE" ? "destructive" : "outline"}>{item.action}</Badge>
        <div><div className="font-medium">{item.reason}</div><div className="text-xs text-muted-foreground">Expense {item.recordId}</div></div>
        <time className="text-xs text-muted-foreground">{new Date(item.changedAt).toLocaleString("en-BD", { timeZone: "Asia/Dhaka" })}</time>
      </div>) : <p className="p-6 text-center text-sm text-muted-foreground">No expense edits or deletions have been recorded.</p>}</div>
    </section>

    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open && !pending) setEditing(null); }}>
      {editing ? <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
        <DialogHeader><DialogTitle>Edit expense</DialogTitle><DialogDescription>Every correction requires a reason and is stored in audit history.</DialogDescription></DialogHeader>
        <form id="expense-edit" className="overflow-y-auto pr-1" onSubmit={form.handleSubmit(save)}>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(form.formState.errors.expenseDate)}><FieldLabel htmlFor="editExpenseDate">Date</FieldLabel><Input id="editExpenseDate" type="date" aria-invalid={Boolean(form.formState.errors.expenseDate)} {...form.register("expenseDate")} /><FieldError errors={[form.formState.errors.expenseDate]} /></Field>
            <Field data-invalid={Boolean(form.formState.errors.categoryKey)}><FieldLabel htmlFor="editExpenseCategory">Category</FieldLabel><Controller control={form.control} name="categoryKey" render={({ field }) => <Select items={categoryItems} value={field.value} onValueChange={field.onChange}><SelectTrigger id="editExpenseCategory" className="w-full" aria-invalid={Boolean(form.formState.errors.categoryKey)}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{EXPENSE_CATEGORIES.map((category) => <SelectItem key={category.key} value={category.key}>{category.label}</SelectItem>)}</SelectGroup></SelectContent></Select>} /><FieldDescription>Choose Inventory purchase or Freight-in for resale stock acquisition. Those categories do not reduce profit immediately.</FieldDescription><FieldError errors={[form.formState.errors.categoryKey]} /></Field>
            <Field className="sm:col-span-2" data-invalid={Boolean(form.formState.errors.description)}><FieldLabel htmlFor="editExpenseDescription">Description</FieldLabel><Textarea id="editExpenseDescription" aria-invalid={Boolean(form.formState.errors.description)} {...form.register("description")} /><FieldError errors={[form.formState.errors.description]} /></Field>
            <Field data-invalid={Boolean(form.formState.errors.amount)}><FieldLabel htmlFor="editExpenseAmount">Amount (BDT)</FieldLabel><Input id="editExpenseAmount" inputMode="decimal" aria-invalid={Boolean(form.formState.errors.amount)} {...form.register("amount")} /><FieldError errors={[form.formState.errors.amount]} /></Field>
            <Field><FieldLabel htmlFor="editExpensePaymentMethod">Payment method (optional)</FieldLabel><Input id="editExpensePaymentMethod" {...form.register("paymentMethod")} /></Field>
            <Field><FieldLabel htmlFor="editExpenseCampaign">Campaign (optional)</FieldLabel><Controller control={form.control} name="campaignId" render={({ field }) => <Select items={campaignItems} value={field.value ?? "none"} onValueChange={(value) => field.onChange(value === "none" ? null : value)}><SelectTrigger id="editExpenseCampaign" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="none">None</SelectItem>{campaigns.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>)}</SelectGroup></SelectContent></Select>} /></Field>
            <Field><FieldLabel htmlFor="editExpenseSalesChannel">Sales channel (optional)</FieldLabel><Input id="editExpenseSalesChannel" {...form.register("salesChannel")} /></Field>
            <Field className="sm:col-span-2"><FieldLabel htmlFor="editExpenseReference">Reference (optional)</FieldLabel><Input id="editExpenseReference" {...form.register("reference")} /></Field>
            <Field className="sm:col-span-2" data-invalid={Boolean(form.formState.errors.reason)}><FieldLabel htmlFor="editExpenseReason">Reason for change</FieldLabel><Textarea id="editExpenseReason" placeholder="For example: wrong amount, date, or category." aria-invalid={Boolean(form.formState.errors.reason)} {...form.register("reason")} /><FieldError errors={[form.formState.errors.reason]} /></Field>
          </FieldGroup>
        </form>
        <DialogFooter><Button variant="outline" disabled={pending} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" form="expense-edit" disabled={pending}><Save data-icon="inline-start" />{pending ? "Saving…" : "Save audited change"}</Button></DialogFooter>
      </DialogContent> : null}
    </Dialog>

    <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !pending) { setDeleting(null); setDeletionReason(""); } }}>
      {deleting ? <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Delete this ledger record?</AlertDialogTitle><AlertDialogDescription>The applicable operating-expense or procurement total will decrease, while its financial fields and your reason remain in audit history.</AlertDialogDescription></AlertDialogHeader>
        <Field data-invalid={deletionReason.length > 0 && deletionReason.trim().length < 3}><FieldLabel htmlFor="deleteExpenseReason">Reason for deletion</FieldLabel><Textarea id="deleteExpenseReason" value={deletionReason} onChange={(event) => setDeletionReason(event.target.value)} placeholder="For example: duplicate entry or entered by mistake." aria-invalid={deletionReason.length > 0 && deletionReason.trim().length < 3} /></Field>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={pending || deletionReason.trim().length < 3} onClick={remove}><Trash2 data-icon="inline-start" />{pending ? "Deleting…" : "Delete and audit"}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent> : null}
    </AlertDialog>
  </div>;
}
