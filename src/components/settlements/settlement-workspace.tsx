"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, ChevronDown, LockKeyhole, Plus, ReceiptText, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { recordSteadfastSettlementAction, reverseSteadfastSettlementAction } from "@/actions/settlements";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { calculateSettlementNet, ownerAllocationRemaining, ownerAllocationTotal, selectedReceivableTotal, settlementEntrySchema, type SettlementEntryValues } from "@/domain/settlements";
import { OWNER_NAMES } from "@/domain/cash";
import { formatMoney, parseMoney } from "@/domain/money";
import type { CourierSettlementData, SettlementBatch, SettlementReceiptTreatment, SettlementReceivingMethod } from "@/domain/types";

function methodLabel(method: SettlementReceivingMethod | null) { return method === "bkash" ? "bKash" : method === "bank_transfer" ? "Bank transfer" : "Owner-held business funds"; }
function receiptLabel(batch: SettlementBatch) { return batch.receiptTreatment === "owner_held_business_funds" ? `${batch.receiptAllocations.length || 1} owner allocation${batch.receiptAllocations.length === 1 ? "" : "s"}` : methodLabel(batch.receivingMethod); }

export function SettlementWorkspace({ data, enabled, reversalEnabled, today }: { data: CourierSettlementData; enabled: boolean; reversalEnabled: boolean; today: string }) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [reversalBatch, setReversalBatch] = useState<SettlementBatch | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const form = useForm<SettlementEntryValues>({
    resolver: zodResolver(settlementEntrySchema),
    defaultValues: {
      settlementDate: today, receiptTreatment: "business_account", receivingMethod: "bkash", ownerAllocations: [], grossCodAmount: "0.00", deductions: "0", netReceived: "",
      courierReference: "", receivingAccountLabel: "", receivingAccountLast4: "", transactionReference: "", note: "",
      selectedOrderIds: [], idempotencyKey: crypto.randomUUID(),
    },
  });
  const allocations = useFieldArray({ control: form.control, name: "ownerAllocations" });
  const selectedIds = useWatch({ control: form.control, name: "selectedOrderIds" });
  const deductions = useWatch({ control: form.control, name: "deductions" });
  const method = useWatch({ control: form.control, name: "receivingMethod" });
  const receiptTreatment = useWatch({ control: form.control, name: "receiptTreatment" });
  const ownerAllocations = useWatch({ control: form.control, name: "ownerAllocations" });
  const selectedTotal = useMemo(() => selectedReceivableTotal(selectedIds, data.eligibleOrders), [selectedIds, data.eligibleOrders]);
  const gross = (selectedTotal / 100).toFixed(2);
  const calculatedNet = calculateSettlementNet(gross, deductions);
  const allocatedTotal = ownerAllocationTotal(ownerAllocations);
  const allocationRemaining = ownerAllocationRemaining(calculatedNet, ownerAllocations);
  const allocationsReconcile = receiptTreatment === "business_account" || (calculatedNet !== null && allocationRemaining === 0 && (allocatedTotal ?? 0) > 0);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!form.formState.isDirty || isPending) return;
      event.preventDefault();
    };
    const warnForInternalNavigation = (event: MouseEvent) => {
      if (!form.formState.isDirty || isPending || event.defaultPrevented) return;
      const anchor = (event.target as Element | null)?.closest("a[href]");
      if (!anchor || anchor.getAttribute("target") === "_blank") return;
      const destination = new URL(anchor.getAttribute("href") ?? "", window.location.href);
      if (destination.origin !== window.location.origin || `${destination.pathname}${destination.search}` === `${window.location.pathname}${window.location.search}`) return;
      if (!window.confirm("Leave this page? Your unconfirmed settlement allocations will be lost.")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", warnForInternalNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", warnForInternalNavigation, true);
    };
  }, [form.formState.isDirty, isPending]);

  function toggleOrder(orderId: string, checked: boolean) {
    const next = checked ? [...new Set([...selectedIds, orderId])] : selectedIds.filter((id) => id !== orderId);
    form.setValue("selectedOrderIds", next, { shouldValidate: true });
    const nextGross = selectedReceivableTotal(next, data.eligibleOrders);
    form.setValue("grossCodAmount", (nextGross / 100).toFixed(2), { shouldValidate: true, shouldDirty: true });
  }

  async function openReview() {
    form.setValue("grossCodAmount", gross, { shouldValidate: true });
    const net = calculateSettlementNet(gross, form.getValues("deductions"));
    form.setValue("netReceived", net === null ? "" : (net / 100).toFixed(2), { shouldValidate: true });
    try {
      if (parseMoney(gross) !== selectedTotal) {
        form.setError("grossCodAmount", { message: "Gross COD must equal the selected authoritative receivables" });
        return;
      }
    } catch { /* The schema displays the exact money error. */ }
    if (await form.trigger()) setReviewOpen(true);
  }

  function confirm(values: SettlementEntryValues) {
    if (!enabled) return;
    setSaveError(null);
    startTransition(async () => {
      const result = await recordSteadfastSettlementAction(values);
      if (!result.ok) {
        setSaveError(result.message);
        setReviewOpen(false);
        toast.error("Settlement not confirmed", { description: result.message });
        return;
      }
      toast.success("Settlement confirmed", { description: values.receiptTreatment === "owner_held_business_funds" ? "Allocations and Due from Owner were recorded atomically; business cash was unchanged." : "Allocations, order settlement evidence, and cash receipt were recorded atomically." });
      window.location.reload();
    });
  }

  function confirmReversal() {
    if (!reversalBatch || reversalReason.trim().length < 3 || !reversalEnabled) return;
    startTransition(async () => {
      const result = await reverseSteadfastSettlementAction({ settlementId: reversalBatch.id, reversedOn: today, reason: reversalReason, idempotencyKey: crypto.randomUUID() });
      if (!result.ok) { toast.error("Settlement was not reversed", { description: result.message }); return; }
      toast.success("Settlement reversed", { description: "The linked cash or owner-held-funds reversal was appended and the orders are eligible for reviewed resettlement." });
      window.location.reload();
    });
  }

  return <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,.8fr)]">
    <section className="panel min-w-0 p-5">
      <div className="flex min-w-0 items-start gap-3"><ReceiptText className="mt-0.5 size-5 shrink-0 text-primary" /><div className="min-w-0"><h2 className="font-semibold">Record Steadfast settlement</h2><p className="mt-1 text-sm text-muted-foreground">One batch fully settles each selected Delivered COD order.</p></div></div>
      {!enabled && <Alert className="mt-4"><LockKeyhole /><AlertTitle>Read-only preview</AlertTitle><AlertDescription>Persistent confirmation requires an owner or admin in connected Supabase mode.</AlertDescription></Alert>}
      <form className="mt-5" onSubmit={form.handleSubmit(confirm)}>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="settlement-date">Settlement date</FieldLabel><Input id="settlement-date" type="date" max={today} {...form.register("settlementDate")} /><FieldError errors={[form.formState.errors.settlementDate]} /></Field>
          <Field><FieldLabel>Courier</FieldLabel><Input value="Steadfast" readOnly aria-label="Courier" /><FieldDescription>Fixed for this workflow.</FieldDescription></Field>
          <Field className="sm:col-span-2"><FieldLabel>Where was the net settlement received?</FieldLabel><Controller control={form.control} name="receiptTreatment" render={({ field }) => <Select value={field.value} onValueChange={(value) => { field.onChange(value as SettlementReceiptTreatment); if (value === "owner_held_business_funds") { form.setValue("receivingMethod", null); form.setValue("receivingAccountLabel", ""); form.setValue("receivingAccountLast4", ""); if (!allocations.fields.length) allocations.append({ ownerLabel: "", amount: "" }); } else { form.setValue("receivingMethod", "bkash"); allocations.replace([]); } }}><SelectTrigger className="w-full" aria-label="Settlement receipt destination"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="business_account">Business bKash or bank account</SelectItem><SelectItem value="owner_held_business_funds">Business funds held by owners</SelectItem></SelectContent></Select>} /><FieldDescription>Owner-held receipt increases Due from Owner and never increases business cash or owner capital.</FieldDescription><FieldError errors={[form.formState.errors.receiptTreatment]} /></Field>
          {receiptTreatment === "business_account" ? <><Field><FieldLabel>Receiving method</FieldLabel><Controller control={form.control} name="receivingMethod" render={({ field }) => <Select value={field.value ?? undefined} onValueChange={(value) => field.onChange(value as SettlementReceivingMethod)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bkash">bKash</SelectItem><SelectItem value="bank_transfer">Bank transfer</SelectItem></SelectContent></Select>} /><FieldError errors={[form.formState.errors.receivingMethod]} /></Field>{method === "bank_transfer" && <Field><FieldLabel htmlFor="account-label">Bank label (optional)</FieldLabel><Input id="account-label" placeholder="Business bank account" {...form.register("receivingAccountLabel")} /><FieldError errors={[form.formState.errors.receivingAccountLabel]} /></Field>}<Field><FieldLabel htmlFor="last-four">Masked final digits (optional)</FieldLabel><Input id="last-four" inputMode="numeric" autoComplete="off" maxLength={4} placeholder="Last 2–4 digits only" {...form.register("receivingAccountLast4")} /><FieldError errors={[form.formState.errors.receivingAccountLast4]} /></Field></> : <Field className="sm:col-span-2"><div className="flex items-center justify-between gap-3"><FieldLabel>Owner allocations</FieldLabel><Button type="button" size="sm" variant="outline" disabled={allocations.fields.length >= OWNER_NAMES.length} onClick={() => allocations.append({ ownerLabel: "", amount: "" })}><Plus />Add owner</Button></div><div className="mt-2 space-y-3">{allocations.fields.map((allocation, index) => <div key={allocation.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"><Field><FieldLabel htmlFor={`allocation-owner-${index}`}>Owner {index + 1}</FieldLabel><Controller control={form.control} name={`ownerAllocations.${index}.ownerLabel`} render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger id={`allocation-owner-${index}`} className="w-full" aria-label={`Allocation ${index + 1} owner`}><SelectValue placeholder="Choose owner" /></SelectTrigger><SelectContent>{OWNER_NAMES.map((owner) => <SelectItem key={owner} value={owner} disabled={ownerAllocations.some((row, rowIndex) => rowIndex !== index && row.ownerLabel === owner)}>{owner}</SelectItem>)}</SelectContent></Select>} /><FieldError errors={[form.formState.errors.ownerAllocations?.[index]?.ownerLabel]} /></Field><Field><FieldLabel htmlFor={`allocation-amount-${index}`}>Amount</FieldLabel><Input id={`allocation-amount-${index}`} aria-label={`Allocation ${index + 1} amount`} inputMode="decimal" placeholder="0.00" {...form.register(`ownerAllocations.${index}.amount`)} /><FieldError errors={[form.formState.errors.ownerAllocations?.[index]?.amount]} /></Field><Button type="button" size="icon" variant="ghost" aria-label={`Remove allocation ${index + 1}`} disabled={allocations.fields.length === 1} onClick={() => allocations.remove(index)}><Trash2 /></Button></div>)}</div><div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3 text-sm" aria-live="polite"><span>Net received</span><span className="money text-right">{calculatedNet === null ? "—" : formatMoney(calculatedNet)}</span><span>Total allocated</span><span className="money text-right">{allocatedTotal === null ? "—" : formatMoney(allocatedTotal)}</span><span>Remaining to allocate</span><span className={`money text-right font-semibold ${allocationRemaining !== 0 ? "text-destructive" : ""}`}>{allocationRemaining === null ? "—" : formatMoney(allocationRemaining)}</span></div><FieldError className="mt-2" errors={[form.formState.errors.ownerAllocations]} /></Field>}
          <Field><FieldLabel htmlFor="transaction-reference">Transaction reference (optional)</FieldLabel><Input id="transaction-reference" autoComplete="off" {...form.register("transactionReference")} /></Field>
          <Field><FieldLabel htmlFor="courier-reference">Courier reference (optional)</FieldLabel><Input id="courier-reference" autoComplete="off" {...form.register("courierReference")} /></Field>
          <Field><FieldLabel htmlFor="gross-cod">Gross COD</FieldLabel><Input id="gross-cod" value={gross} readOnly /><FieldDescription>Derived from selected eligible orders.</FieldDescription><FieldError errors={[form.formState.errors.grossCodAmount]} /></Field>
          <Field><FieldLabel htmlFor="deductions">Additional deductions</FieldLabel><Input id="deductions" inputMode="decimal" placeholder="0.00" {...form.register("deductions")} /><FieldDescription>Stored once at batch level.</FieldDescription><FieldError errors={[form.formState.errors.deductions]} /></Field>
          <Field><FieldLabel>Net received</FieldLabel><Input value={calculatedNet === null ? "—" : formatMoney(calculatedNet, true)} readOnly aria-label="Calculated net received" /><FieldDescription>Gross COD − deductions.</FieldDescription></Field>
          <Field className="sm:col-span-2"><FieldLabel htmlFor="settlement-note">Internal note (optional)</FieldLabel><Textarea id="settlement-note" placeholder="No PIN, OTP, password, full account number, or credentials." {...form.register("note")} /><FieldError errors={[form.formState.errors.note]} /></Field>
        </FieldGroup>

        <div className="mt-6 overflow-hidden rounded-xl border">
          <div className="flex flex-col gap-1 border-b bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-semibold">Eligible Delivered COD orders</h3><p className="text-xs text-muted-foreground">Amounts use authoritative adjusted net revenue.</p></div><p className="money text-sm font-semibold">Selected: {formatMoney(selectedTotal)}</p></div>
          <div className="max-h-80 overflow-auto">
            <Table><TableHeader><TableRow><TableHead className="w-12"><span className="sr-only">Select</span></TableHead><TableHead>Order</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Receivable</TableHead></TableRow></TableHeader>
              <TableBody>{data.eligibleOrders.length ? data.eligibleOrders.map((order) => <TableRow key={order.orderId}><TableCell><Checkbox aria-label={`Select ${order.orderNumber}`} checked={selectedIds.includes(order.orderId)} onCheckedChange={(checked) => toggleOrder(order.orderId, checked === true)} /></TableCell><TableCell className="font-medium">{order.orderNumber}</TableCell><TableCell>{order.customerName}</TableCell><TableCell>{order.orderDate}</TableCell><TableCell className="money text-right">{formatMoney(order.grossCodReceivable)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={5} className="h-28 text-center text-muted-foreground">No eligible Delivered COD orders.</TableCell></TableRow>}</TableBody>
            </Table>
          </div>
        </div>
        <FieldError className="mt-2" errors={[form.formState.errors.selectedOrderIds]} />
        {saveError && <Alert variant="destructive" className="mt-4"><AlertTriangle /><AlertTitle>Settlement not confirmed</AlertTitle><AlertDescription>{saveError}</AlertDescription></Alert>}
        <div className="mt-5 flex justify-end"><Button type="button" onClick={openReview} disabled={!enabled || isPending || selectedIds.length === 0 || calculatedNet === null || calculatedNet <= 0 || !allocationsReconcile}><CheckCircle2 />Review and confirm</Button></div>
      </form>
    </section>

    <section className="panel min-w-0 h-fit overflow-hidden">
      <div className="border-b p-5"><h2 className="font-semibold">Confirmed batch history</h2><p className="mt-1 text-sm text-muted-foreground">Receiving method and masked destination are preserved per batch.</p></div>
      <div className="divide-y">{data.batches.length ? data.batches.map((batch) => <details key={batch.id} className={`group p-5 ${batch.isReversed ? "opacity-70" : ""}`}><summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div><p className="flex items-center gap-2 font-medium">{batch.settlementDate} · {receiptLabel(batch)}{batch.isReversed ? <Badge variant="secondary">Reversed</Badge> : null}</p><p className="mt-1 text-xs text-muted-foreground">{batch.orders.length} orders · {batch.courierReference || "No courier reference"}</p></div><div className="flex items-center gap-2"><span className="money font-semibold">{formatMoney(batch.netReceived)}</span><ChevronDown className="size-4 transition-transform group-open:rotate-180" /></div></summary><div className="mt-4 space-y-3 text-sm"><div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3"><span>Gross</span><span className="money text-right">{formatMoney(batch.grossCodAmount)}</span><span>Deductions</span><span className="money text-right">{formatMoney(batch.deductions)}</span><span>{batch.receiptTreatment === "owner_held_business_funds" ? "Net owner-held receipt" : "Net cash receipt"}</span><span className="money text-right font-semibold">{formatMoney(batch.netReceived)}</span></div>{batch.receiptTreatment === "owner_held_business_funds" ? <div className="rounded-lg border p-3"><p className="mb-2 font-medium">Due-from-Owner allocations</p><ul className="space-y-2">{(batch.receiptAllocations.length ? batch.receiptAllocations : [{ id: batch.id, ownerLabel: batch.ownerLabel, amount: batch.netReceived, isReversed: batch.isReversed }]).map((allocation) => <li key={allocation.id} className="flex justify-between gap-3"><span>Due from {allocation.ownerLabel}</span><span className="money">{formatMoney(allocation.amount)}</span></li>)}</ul></div> : <p className="text-muted-foreground">Destination: {batch.receivingAccountLabel || methodLabel(batch.receivingMethod)}{batch.receivingAccountLast4 ? ` ·••${batch.receivingAccountLast4}` : ""}</p>}{batch.transactionReference && <p>Transaction ref: <span className="font-medium">{batch.transactionReference}</span></p>}<ul className="space-y-2">{batch.orders.map((order) => <li key={order.orderId} className="flex justify-between gap-3"><span>{order.orderNumber} · {order.customerName}</span><span className="money">{formatMoney(order.allocatedAmount)}</span></li>)}</ul>{batch.note && <p className="rounded-lg border p-3 text-muted-foreground">{batch.note}</p>}{batch.isReversed ? <Alert><RotateCcw /><AlertTitle>Reversed on {batch.reversedOn}</AlertTitle><AlertDescription>{batch.reversalReason}</AlertDescription></Alert> : <div className="flex items-center justify-between gap-3"><p className="flex items-center gap-1 text-xs text-muted-foreground"><LockKeyhole className="size-3" />Confirmed evidence is immutable.</p><Button size="sm" variant="outline" disabled={!reversalEnabled} onClick={() => setReversalBatch(batch)}><RotateCcw />Reverse batch</Button></div>}</div></details>) : <div className="p-8 text-center text-sm text-muted-foreground">No confirmed batches yet.</div>}</div>
    </section>

    <Dialog open={reviewOpen} onOpenChange={setReviewOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Confirm immutable Steadfast settlement?</DialogTitle><DialogDescription>This writes one batch, its selected-order evidence, and every destination allocation atomically. It does not change revenue, COGS, refunds, stock, or owner investment.</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-3 rounded-lg border p-4 text-sm"><span>Settlement date</span><span className="text-right font-medium">{form.getValues("settlementDate")}</span><span>Courier reference</span><span className="text-right font-medium">{form.getValues("courierReference") || "—"}</span><span>Transaction reference</span><span className="text-right font-medium">{form.getValues("transactionReference") || "—"}</span><span>Gross COD</span><span className="money text-right font-medium">{formatMoney(selectedTotal)}</span><span>Deductions</span><span className="text-right font-medium">{deductions || "—"}</span><span>Net received</span><span className="money text-right font-semibold">{calculatedNet === null ? "—" : formatMoney(calculatedNet)}</span></div><div className="rounded-lg border p-4 text-sm"><p className="mb-2 font-medium">Selected orders ({selectedIds.length})</p><ul className="space-y-1">{data.eligibleOrders.filter((order) => selectedIds.includes(order.orderId)).map((order) => <li key={order.orderId} className="flex justify-between gap-2"><span>{order.orderNumber}</span><span className="money">{formatMoney(order.grossCodReceivable)}</span></li>)}</ul></div>{receiptTreatment === "owner_held_business_funds" ? <div className="rounded-lg border p-4 text-sm"><p className="mb-2 font-medium">Owner allocations</p><ul className="space-y-2">{ownerAllocations.map((allocation, index) => <li key={`${allocation.ownerLabel}-${index}`} className="flex justify-between gap-3"><span>Due from {allocation.ownerLabel}</span><span className="money">{allocation.amount || "—"}</span></li>)}</ul><div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3"><span>Total allocated</span><span className="money text-right">{allocatedTotal === null ? "—" : formatMoney(allocatedTotal)}</span><span>Remaining</span><span className="money text-right">{allocationRemaining === null ? "—" : formatMoney(allocationRemaining)}</span></div></div> : <p className="rounded-lg border p-4 text-sm">Destination: {methodLabel(method)}</p>}<Alert><LockKeyhole /><AlertTitle>Immutable evidence</AlertTitle><AlertDescription>If confirmed data is wrong, only the owner can append an audited receipt reversal.</AlertDescription></Alert><DialogFooter showCloseButton><Button type="submit" onClick={form.handleSubmit(confirm)} disabled={isPending || !allocationsReconcile}>{isPending ? "Confirming…" : "Confirm settlement"}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(reversalBatch)} onOpenChange={(open) => { if (!open && !isPending) { setReversalBatch(null); setReversalReason(""); } }}><DialogContent><DialogHeader><DialogTitle>Reverse confirmed Steadfast batch?</DialogTitle><DialogDescription>This preserves the original batch and allocations, appends the opposite cash or owner-held-funds effect, and returns its orders to Awaiting settlement.</DialogDescription></DialogHeader>{reversalBatch ? <div className="rounded-lg border p-4 text-sm"><div className="flex justify-between gap-3"><span>{reversalBatch.settlementDate} · {reversalBatch.orders.length} orders</span><span className="money font-semibold">{formatMoney(reversalBatch.netReceived, true)}</span></div><p className="mt-2 text-muted-foreground">{reversalBatch.courierReference || "No courier reference"}</p></div> : null}<Field><FieldLabel htmlFor="settlement-reversal-reason">Reason</FieldLabel><Textarea id="settlement-reversal-reason" value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} placeholder="Explain why this confirmed batch is incorrect." /></Field><DialogFooter showCloseButton><Button variant="destructive" disabled={isPending || reversalReason.trim().length < 3} onClick={confirmReversal}><RotateCcw />{isPending ? "Reversing…" : "Confirm batch reversal"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
