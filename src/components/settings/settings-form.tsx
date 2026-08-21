"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Save, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { updateBusinessSettingsAction } from "@/actions/settings";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { businessSettingsFormSchema, settingsToFormValues, type BusinessSettingsFormValues } from "@/domain/settings";
import { formatMoney, parseMoney } from "@/domain/money";
import type { BusinessSettings } from "@/domain/types";

export function SettingsForm({ settings, enabled }: { settings: BusinessSettings; enabled: boolean }) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<BusinessSettingsFormValues>({
    resolver: zodResolver(businessSettingsFormSchema),
    defaultValues: settingsToFormValues(settings),
    mode: "onBlur",
  });

  function save(values: BusinessSettingsFormValues) {
    if (!enabled || isPending) return;
    setSaveError(null);
    startTransition(async () => {
      const result = await updateBusinessSettingsAction(values);
      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            form.setError(field as keyof BusinessSettingsFormValues, { message: messages[0] });
          }
        }
        setReviewOpen(false);
        setSaveError(result.message);
        toast.error("Settings were not updated", { description: result.message });
        return;
      }
      form.reset(values);
      setReviewOpen(false);
      toast.success("Business defaults updated", { description: "Only future order snapshots use the new defaults." });
    });
  }

  return <>
    {!enabled && <Alert className="mb-4"><AlertTriangle /><AlertTitle>Read-only preview</AlertTitle><AlertDescription>Persistent changes require the connected development project and an owner account.</AlertDescription></Alert>}
    <form onSubmit={form.handleSubmit(() => setReviewOpen(true))} className="grid gap-4 xl:grid-cols-2">
      <section className="panel p-5">
        <h2 className="text-sm font-semibold">Business defaults</h2>
        <p className="mt-1 text-xs text-muted-foreground">Currency and timezone remain fixed for consistent reporting.</p>
        <FieldGroup className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field data-disabled><FieldLabel htmlFor="currency">Currency</FieldLabel><Input id="currency" value={settings.currency} disabled readOnly /><FieldDescription>Money is calculated in integer poisha.</FieldDescription></Field>
          <Field data-disabled><FieldLabel htmlFor="timezone">Timezone</FieldLabel><Input id="timezone" value={settings.timezone} disabled readOnly /></Field>
          <Field><FieldLabel htmlFor="taxVatPercent">Tax / VAT default (%)</FieldLabel><Input id="taxVatPercent" inputMode="decimal" {...form.register("taxVatPercent")} /><FieldError errors={[form.formState.errors.taxVatPercent]} /></Field>
        </FieldGroup>
      </section>

      <section className="panel p-5">
        <h2 className="text-sm font-semibold">Fulfilment costs</h2>
        <p className="mt-1 text-xs text-muted-foreground">Copied into new order snapshots; existing orders never change.</p>
        <FieldGroup className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="defaultCourier">Default courier</FieldLabel><Input id="defaultCourier" {...form.register("defaultCourier")} /><FieldError errors={[form.formState.errors.defaultCourier]} /></Field>
          <Field><FieldLabel htmlFor="packagingCostPerOrder">Packaging cost (BDT)</FieldLabel><Input id="packagingCostPerOrder" inputMode="decimal" {...form.register("packagingCostPerOrder")} /><FieldError errors={[form.formState.errors.packagingCostPerOrder]} /></Field>
          <Field><FieldLabel htmlFor="insideDhakaCourierCost">Inside Dhaka courier cost (BDT)</FieldLabel><Input id="insideDhakaCourierCost" inputMode="decimal" {...form.register("insideDhakaCourierCost")} /><FieldError errors={[form.formState.errors.insideDhakaCourierCost]} /></Field>
          <Field><FieldLabel htmlFor="outsideDhakaCourierCost">Outside Dhaka courier cost (BDT)</FieldLabel><Input id="outsideDhakaCourierCost" inputMode="decimal" {...form.register("outsideDhakaCourierCost")} /><FieldError errors={[form.formState.errors.outsideDhakaCourierCost]} /></Field>
        </FieldGroup>
      </section>

      <section className="panel p-5 xl:col-span-2">
        <div className="flex items-start gap-3"><WalletCards className="mt-0.5 size-5 text-primary" /><div><h2 className="text-sm font-semibold">Approved cash accounts</h2><p className="mt-1 text-xs text-muted-foreground">Account labels only; no credentials or full account numbers are stored.</p></div></div>
        <div className="mt-4 flex flex-wrap gap-2">{settings.cashAccounts.map((account) => <Badge variant="outline" key={account.key}>{account.label}</Badge>)}</div>
      </section>

      {saveError && <Alert variant="destructive" className="xl:col-span-2"><AlertTriangle /><AlertTitle>Settings were not updated</AlertTitle><AlertDescription>{saveError}</AlertDescription></Alert>}
      <div className="flex justify-end xl:col-span-2"><Button type="submit" disabled={!enabled || isPending || !form.formState.isDirty}><Save />{isPending ? "Saving…" : "Review changes"}</Button></div>
    </form>

    <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Update future order defaults?</DialogTitle><DialogDescription>New manual orders will receive these courier and packaging snapshots. Existing orders and recognized financial history will not be rewritten.</DialogDescription></DialogHeader>
        <dl className="grid grid-cols-2 gap-3 rounded-lg border p-4 text-sm">
          <dt>Inside Dhaka</dt><dd className="money text-right font-medium">{formatMoney(parseMoney(form.getValues("insideDhakaCourierCost")))}</dd>
          <dt>Outside Dhaka</dt><dd className="money text-right font-medium">{formatMoney(parseMoney(form.getValues("outsideDhakaCourierCost")))}</dd>
          <dt>Packaging</dt><dd className="money text-right font-medium">{formatMoney(parseMoney(form.getValues("packagingCostPerOrder")))}</dd>
          <dt>Tax / VAT</dt><dd className="text-right font-medium">{form.getValues("taxVatPercent")}%</dd>
        </dl>
        <DialogFooter showCloseButton><Button type="button" disabled={isPending} onClick={form.handleSubmit(save)}>{isPending ? "Saving…" : "Confirm settings"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
