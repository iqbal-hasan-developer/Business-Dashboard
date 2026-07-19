"use client";

import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { recordExpenseAction } from "@/actions/manual-entry";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createSubmissionGuard, expenseEntrySchema, type ExpenseEntryValues } from "@/domain/manual-entry";
import type { Campaign } from "@/domain/types";

export function ExpenseEntryForm({ campaigns, date, enabled }: { campaigns: Campaign[]; date: string; enabled: boolean }) {
  const [open, setOpen] = useState(false); const [pending, startTransition] = useTransition(); const [guard] = useState(createSubmissionGuard);
  const form = useForm<ExpenseEntryValues>({ resolver: zodResolver(expenseEntrySchema), defaultValues: { expenseDate: date, categoryKey: "operations", description: "", amount: "0", paymentMethod: "", campaignId: null, salesChannel: "", reference: "" } });
  function save(values: ExpenseEntryValues) { if (!enabled || !guard.tryLock()) return; startTransition(async () => { try { const result = await recordExpenseAction(values); if (!result.ok) { toast.error("Expense was not recorded", { description: result.message }); return; } toast.success("Expense recorded"); form.reset({ ...values, description: "", amount: "0", reference: "" }); setOpen(false); } finally { guard.release(); } }); }
  return <Dialog open={open} onOpenChange={setOpen}><Button size="sm" disabled={!enabled} onClick={() => setOpen(true)} title={enabled ? "Record expense" : "Connected owner/admin mode required"}><Plus /> Record expense</Button><DialogContent><DialogHeader><DialogTitle>Record expense</DialogTitle><DialogDescription>Creates one authenticated operating-expense ledger entry. It does not create a cash movement.</DialogDescription></DialogHeader><form id="expense-entry" className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit(save)}><Field><FieldLabel>Date</FieldLabel><Input type="date" {...form.register("expenseDate")} /></Field><Field><FieldLabel>Category</FieldLabel><Input placeholder="operations" {...form.register("categoryKey")} /><FieldError errors={[form.formState.errors.categoryKey]} /></Field><Field className="sm:col-span-2"><FieldLabel>Description</FieldLabel><Textarea {...form.register("description")} /><FieldError errors={[form.formState.errors.description]} /></Field><Field><FieldLabel>Amount (BDT)</FieldLabel><Input inputMode="decimal" {...form.register("amount")} /><FieldError errors={[form.formState.errors.amount]} /></Field><Field><FieldLabel>Payment method (optional)</FieldLabel><Input {...form.register("paymentMethod")} /></Field><Field><FieldLabel>Campaign (optional)</FieldLabel><Controller control={form.control} name="campaignId" render={({ field }) => <Select value={field.value ?? "none"} onValueChange={(value) => field.onChange(value === "none" ? null : value)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{campaigns.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>)}</SelectContent></Select>} /></Field><Field><FieldLabel>Sales channel (optional)</FieldLabel><Input {...form.register("salesChannel")} /></Field><Field className="sm:col-span-2"><FieldLabel>Reference (optional)</FieldLabel><Input {...form.register("reference")} /></Field></form><DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button><Button type="submit" form="expense-entry" disabled={pending || !enabled}><Save />{pending ? "Saving…" : "Save expense"}</Button></DialogFooter></DialogContent></Dialog>;
}
