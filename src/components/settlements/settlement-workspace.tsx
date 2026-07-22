"use client";

import { useMemo, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, ChevronDown, LockKeyhole, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { recordSteadfastSettlementAction } from "@/actions/settlements";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { calculateSettlementNet, selectedReceivableTotal, settlementEntrySchema, type SettlementEntryValues } from "@/domain/settlements";
import { formatMoney, parseMoney } from "@/domain/money";
import type { CourierSettlementData, SettlementReceivingMethod } from "@/domain/types";

function methodLabel(method: SettlementReceivingMethod) { return method === "bkash" ? "bKash" : "Bank transfer"; }

export function SettlementWorkspace({ data, enabled, today }: { data: CourierSettlementData; enabled: boolean; today: string }) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<SettlementEntryValues>({
    resolver: zodResolver(settlementEntrySchema),
    defaultValues: {
      settlementDate: today, receivingMethod: "bkash", grossCodAmount: "", deductions: "0", netReceived: "",
      courierReference: "", receivingAccountLabel: "", receivingAccountLast4: "", transactionReference: "", note: "",
      selectedOrderIds: [], idempotencyKey: crypto.randomUUID(),
    },
  });
  const selectedIds = useWatch({ control: form.control, name: "selectedOrderIds" });
  const gross = useWatch({ control: form.control, name: "grossCodAmount" });
  const deductions = useWatch({ control: form.control, name: "deductions" });
  const method = useWatch({ control: form.control, name: "receivingMethod" });
  const selectedTotal = useMemo(() => selectedReceivableTotal(selectedIds, data.eligibleOrders), [selectedIds, data.eligibleOrders]);
  const calculatedNet = calculateSettlementNet(gross, deductions);

  function toggleOrder(orderId: string, checked: boolean) {
    const next = checked ? [...new Set([...selectedIds, orderId])] : selectedIds.filter((id) => id !== orderId);
    form.setValue("selectedOrderIds", next, { shouldValidate: true });
  }

  async function openReview() {
    const net = calculateSettlementNet(form.getValues("grossCodAmount"), form.getValues("deductions"));
    form.setValue("netReceived", net === null ? "" : (net / 100).toFixed(2), { shouldValidate: true });
    try {
      if (parseMoney(form.getValues("grossCodAmount")) !== selectedTotal) {
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
      toast.success("Settlement confirmed", { description: "Allocations, order settlement evidence, and cash receipt were recorded atomically." });
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
          <Field><FieldLabel>Receiving method</FieldLabel><Controller control={form.control} name="receivingMethod" render={({ field }) => <Select value={field.value} onValueChange={(value) => field.onChange(value as SettlementReceivingMethod)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bkash">bKash</SelectItem><SelectItem value="bank_transfer">Bank transfer</SelectItem></SelectContent></Select>} /></Field>
          {method === "bank_transfer" && <Field><FieldLabel htmlFor="account-label">Bank label (optional)</FieldLabel><Input id="account-label" placeholder="Business bank account" {...form.register("receivingAccountLabel")} /><FieldError errors={[form.formState.errors.receivingAccountLabel]} /></Field>}
          <Field><FieldLabel htmlFor="last-four">Masked final digits (optional)</FieldLabel><Input id="last-four" inputMode="numeric" autoComplete="off" maxLength={4} placeholder="Last 2–4 digits only" {...form.register("receivingAccountLast4")} /><FieldError errors={[form.formState.errors.receivingAccountLast4]} /></Field>
          <Field><FieldLabel htmlFor="transaction-reference">Transaction reference (optional)</FieldLabel><Input id="transaction-reference" autoComplete="off" {...form.register("transactionReference")} /></Field>
          <Field><FieldLabel htmlFor="courier-reference">Courier reference (optional)</FieldLabel><Input id="courier-reference" autoComplete="off" {...form.register("courierReference")} /></Field>
          <Field><FieldLabel htmlFor="gross-cod">Gross COD</FieldLabel><Input id="gross-cod" inputMode="decimal" placeholder="0.00" {...form.register("grossCodAmount")} /><FieldError errors={[form.formState.errors.grossCodAmount]} /></Field>
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
        {selectedTotal > 0 && gross && selectedTotal !== (() => { try { return Math.round(Number(gross) * 100); } catch { return -1; } })() && <Alert className="mt-4"><AlertTriangle /><AlertTitle>Gross COD does not reconcile</AlertTitle><AlertDescription>Selected orders total {formatMoney(selectedTotal)}. Enter that exact gross amount before review.</AlertDescription></Alert>}
        {saveError && <Alert variant="destructive" className="mt-4"><AlertTriangle /><AlertTitle>Settlement not confirmed</AlertTitle><AlertDescription>{saveError}</AlertDescription></Alert>}
        <div className="mt-5 flex justify-end"><Button type="button" onClick={openReview} disabled={!enabled || isPending || data.eligibleOrders.length === 0}><CheckCircle2 />Review and confirm</Button></div>
      </form>
    </section>

    <section className="panel min-w-0 h-fit overflow-hidden">
      <div className="border-b p-5"><h2 className="font-semibold">Confirmed batch history</h2><p className="mt-1 text-sm text-muted-foreground">Receiving method and masked destination are preserved per batch.</p></div>
      <div className="divide-y">{data.batches.length ? data.batches.map((batch) => <details key={batch.id} className="group p-5"><summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div><p className="font-medium">{batch.settlementDate} · {methodLabel(batch.receivingMethod)}</p><p className="mt-1 text-xs text-muted-foreground">{batch.orders.length} orders · {batch.courierReference || "No courier reference"}</p></div><div className="flex items-center gap-2"><span className="money font-semibold">{formatMoney(batch.netReceived)}</span><ChevronDown className="size-4 transition-transform group-open:rotate-180" /></div></summary><div className="mt-4 space-y-3 text-sm"><div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3"><span>Gross</span><span className="money text-right">{formatMoney(batch.grossCodAmount)}</span><span>Deductions</span><span className="money text-right">{formatMoney(batch.deductions)}</span><span>Net cash receipt</span><span className="money text-right font-semibold">{formatMoney(batch.netReceived)}</span></div><p className="text-muted-foreground">Destination: {batch.receivingAccountLabel || methodLabel(batch.receivingMethod)}{batch.receivingAccountLast4 ? ` ·••${batch.receivingAccountLast4}` : ""}</p>{batch.transactionReference && <p>Transaction ref: <span className="font-medium">{batch.transactionReference}</span></p>}<ul className="space-y-2">{batch.orders.map((order) => <li key={order.orderId} className="flex justify-between gap-3"><span>{order.orderNumber} · {order.customerName}</span><span className="money">{formatMoney(order.allocatedAmount)}</span></li>)}</ul>{batch.note && <p className="rounded-lg border p-3 text-muted-foreground">{batch.note}</p>}<p className="flex items-center gap-1 text-xs text-muted-foreground"><LockKeyhole className="size-3" />Confirmed evidence is immutable.</p></div></details>) : <div className="p-8 text-center text-sm text-muted-foreground">No confirmed batches yet.</div>}</div>
    </section>

    <Dialog open={reviewOpen} onOpenChange={setReviewOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Confirm immutable Steadfast settlement?</DialogTitle><DialogDescription>This writes the batch, full-order allocations, Settled evidence, and one net cash inflow atomically. It does not change payment status, revenue, COGS, or stock.</DialogDescription></DialogHeader><div className="grid grid-cols-2 gap-3 rounded-lg border p-4 text-sm"><span>Orders</span><span className="text-right font-medium">{selectedIds.length}</span><span>Selected receivable</span><span className="money text-right font-medium">{formatMoney(selectedTotal)}</span><span>Gross COD</span><span className="text-right font-medium">{gross || "—"}</span><span>Deductions</span><span className="text-right font-medium">{deductions || "—"}</span><span>Net received</span><span className="money text-right font-semibold">{calculatedNet === null ? "—" : formatMoney(calculatedNet, true)}</span><span>Receiving method</span><span className="text-right font-medium">{methodLabel(method)}</span></div><Alert><LockKeyhole /><AlertTitle>No edit, delete, or reversal in this slice</AlertTitle><AlertDescription>If confirmed data is wrong, stop and use a future audited correction workflow.</AlertDescription></Alert><DialogFooter showCloseButton><Button type="submit" onClick={form.handleSubmit(confirm)} disabled={isPending}>{isPending ? "Confirming…" : "Confirm settlement"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
