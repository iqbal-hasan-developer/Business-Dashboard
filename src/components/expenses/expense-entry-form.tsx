"use client";

import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { recordExpenseAction } from "@/actions/manual-entry";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EXPENSE_CATEGORIES } from "@/domain/expenses";
import { FUNDING_TREATMENT_LABELS, FUNDING_TREATMENTS } from "@/domain/funding";
import { OWNER_NAMES } from "@/domain/cash";
import { createSubmissionGuard, expenseEntrySchema, type ExpenseEntryValues } from "@/domain/manual-entry";
import type { Campaign } from "@/domain/types";

const categoryItems = EXPENSE_CATEGORIES.map(({ key, label }) => ({ value: key, label }));

export function ExpenseEntryForm({ campaigns, cashAccounts, date, enabled }: {
  campaigns: Campaign[];
  cashAccounts: Array<{ key: string; label: string }>;
  date: string;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [guard] = useState(createSubmissionGuard);
  const campaignItems = [{ value: "none", label: "None" }, ...campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))];
  const form = useForm<ExpenseEntryValues>({
    resolver: zodResolver(expenseEntrySchema),
    defaultValues: {
      expenseDate: date,
      categoryKey: "operations",
      description: "",
      amount: "0",
      paymentMethod: "",
      campaignId: null,
      salesChannel: "",
      reference: "",
      fundingTreatment: "business_account_paid",
      paymentDate: date,
      businessAccountKey: cashAccounts[0]?.key ?? "",
      ownerLabel: "",
      submissionKey: crypto.randomUUID(),
    },
  });
  const fundingTreatment = useWatch({ control: form.control, name: "fundingTreatment" });

  function save(values: ExpenseEntryValues) {
    if (!enabled || !guard.tryLock()) return;
    startTransition(async () => {
      try {
        const result = await recordExpenseAction(values);
        if (!result.ok) {
          toast.error("Expense was not recorded", { description: result.message });
          return;
        }
        toast.success("Expense recorded");
        form.reset({ ...values, description: "", amount: "0", reference: "", submissionKey: crypto.randomUUID() });
        setOpen(false);
      } finally {
        guard.release();
      }
    });
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <Button size="sm" disabled={!enabled} onClick={() => setOpen(true)} title={enabled ? "Record expense" : "Connected owner/admin mode required"}>
      <Plus data-icon="inline-start" /> Record expense
    </Button>
    <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto]">
      <DialogHeader>
        <DialogTitle>Record expense</DialogTitle>
        <DialogDescription>Creates one authenticated cost record. Inventory purchase and Freight-in are procurement assets; advertising stays in Marketing.</DialogDescription>
      </DialogHeader>
      <form id="expense-entry" className="overflow-y-auto pr-1" onSubmit={form.handleSubmit(save)}>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(form.formState.errors.expenseDate)}>
            <FieldLabel htmlFor="expenseDate">Date</FieldLabel>
            <Input id="expenseDate" type="date" aria-invalid={Boolean(form.formState.errors.expenseDate)} {...form.register("expenseDate")} />
            <FieldError errors={[form.formState.errors.expenseDate]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.categoryKey)}>
            <FieldLabel htmlFor="expenseCategory">Category</FieldLabel>
            <Controller control={form.control} name="categoryKey" render={({ field }) => <Select items={categoryItems} value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="expenseCategory" className="w-full" aria-invalid={Boolean(form.formState.errors.categoryKey)}><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{EXPENSE_CATEGORIES.map((category) => <SelectItem key={category.key} value={category.key}>{category.label}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>} />
            <FieldDescription>Choose Inventory purchase or Freight-in for resale stock acquisition. Those amounts stay out of Operating Expenses until valid Delivered COGS recognition.</FieldDescription>
            <FieldError errors={[form.formState.errors.categoryKey]} />
          </Field>
          <Field className="sm:col-span-2" data-invalid={Boolean(form.formState.errors.description)}>
            <FieldLabel htmlFor="expenseDescription">Description</FieldLabel>
            <Textarea id="expenseDescription" aria-invalid={Boolean(form.formState.errors.description)} {...form.register("description")} />
            <FieldError errors={[form.formState.errors.description]} />
          </Field>
          <Field data-invalid={Boolean(form.formState.errors.amount)}>
            <FieldLabel htmlFor="expenseAmount">Amount (BDT)</FieldLabel>
            <Input id="expenseAmount" inputMode="decimal" aria-invalid={Boolean(form.formState.errors.amount)} {...form.register("amount")} />
            <FieldError errors={[form.formState.errors.amount]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="expensePaymentMethod">Payment method (optional)</FieldLabel>
            <Input id="expensePaymentMethod" {...form.register("paymentMethod")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="expenseCampaign">Campaign (optional)</FieldLabel>
            <Controller control={form.control} name="campaignId" render={({ field }) => <Select items={campaignItems} value={field.value ?? "none"} onValueChange={(value) => field.onChange(value === "none" ? null : value)}>
              <SelectTrigger id="expenseCampaign" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem value="none">None</SelectItem>{campaigns.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>} />
          </Field>
          <Field>
            <FieldLabel htmlFor="expenseSalesChannel">Sales channel (optional)</FieldLabel>
            <Input id="expenseSalesChannel" {...form.register("salesChannel")} />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="expenseReference">Reference (optional)</FieldLabel>
            <Input id="expenseReference" {...form.register("reference")} />
          </Field>
          <Field className="sm:col-span-2" data-invalid={Boolean(form.formState.errors.fundingTreatment)}>
            <FieldLabel htmlFor="expenseFundingTreatment">How was this paid?</FieldLabel>
            <Controller control={form.control} name="fundingTreatment" render={({ field }) => <Select value={field.value} onValueChange={(value) => {
              field.onChange(value);
              if (value === "unpaid") {
                form.setValue("paymentDate", "");
                form.setValue("businessAccountKey", "");
                form.setValue("ownerLabel", "");
              } else {
                form.setValue("paymentDate", form.getValues("paymentDate") || date);
                if (value === "business_account_paid") form.setValue("ownerLabel", "");
                if (value === "owner_paid_personally" || value === "owner_held_business_funds") form.setValue("businessAccountKey", "");
              }
            }}><SelectTrigger id="expenseFundingTreatment" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{FUNDING_TREATMENTS.map((treatment) => <SelectItem key={treatment} value={treatment}>{FUNDING_TREATMENT_LABELS[treatment]}</SelectItem>)}</SelectContent></Select>} />
            <FieldDescription>Business-account payments reduce cash. Personal owner payments create non-cash capital. Owner-held business funds reduce Due from Owner. Unpaid costs create no payment movement.</FieldDescription>
            <FieldError errors={[form.formState.errors.fundingTreatment]} />
          </Field>
          {fundingTreatment !== "unpaid" ? <Field data-invalid={Boolean(form.formState.errors.paymentDate)}>
            <FieldLabel htmlFor="expensePaymentDate">Payment date</FieldLabel>
            <Input id="expensePaymentDate" type="date" aria-invalid={Boolean(form.formState.errors.paymentDate)} {...form.register("paymentDate")} />
            <FieldError errors={[form.formState.errors.paymentDate]} />
          </Field> : null}
          {fundingTreatment === "business_account_paid" ? <Field data-invalid={Boolean(form.formState.errors.businessAccountKey)}>
            <FieldLabel htmlFor="expenseBusinessAccount">Paid from account</FieldLabel>
            <Controller control={form.control} name="businessAccountKey" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger id="expenseBusinessAccount" className="w-full"><SelectValue placeholder="Choose account" /></SelectTrigger><SelectContent>{cashAccounts.map((account) => <SelectItem key={account.key} value={account.key}>{account.label}</SelectItem>)}</SelectContent></Select>} />
            <FieldError errors={[form.formState.errors.businessAccountKey]} />
          </Field> : null}
          {fundingTreatment === "owner_paid_personally" || fundingTreatment === "owner_held_business_funds" ? <Field data-invalid={Boolean(form.formState.errors.ownerLabel)}>
            <FieldLabel htmlFor="expenseOwner">{fundingTreatment === "owner_held_business_funds" ? "Owner holding the business funds" : "Owner who paid personally"}</FieldLabel>
            <Controller control={form.control} name="ownerLabel" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger id="expenseOwner" className="w-full"><SelectValue placeholder="Choose owner" /></SelectTrigger><SelectContent>{OWNER_NAMES.map((owner) => <SelectItem key={owner} value={owner}>{owner}</SelectItem>)}</SelectContent></Select>} />
            <FieldError errors={[form.formState.errors.ownerLabel]} />
          </Field> : null}
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
        <Button type="submit" form="expense-entry" disabled={pending || !enabled}><Save data-icon="inline-start" />{pending ? "Saving…" : "Save expense"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
