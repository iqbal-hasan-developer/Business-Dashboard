"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, ReceiptText, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { recordCustomerPaymentReceiptAction } from "@/actions/customer-payments";
import { formatMoney } from "@/domain/money";
import type { CustomerPaymentReceipt, Money } from "@/domain/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type EligibleReceipt = {
  eligible: true;
  account: { key: string; label: string };
  amount: Money;
  expectedUpdatedAt: string;
};

type IneligibleReceipt = { eligible: false; message: string };

export function CustomerPaymentReceiptPanel({
  orderId,
  orderNumber,
  orderDate,
  paymentMethod,
  eligibility,
  receipt,
  enabled,
}: {
  orderId: string;
  orderNumber: string;
  orderDate: string;
  paymentMethod: string;
  eligibility: EligibleReceipt | IneligibleReceipt;
  receipt: CustomerPaymentReceipt | null;
  enabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [receivedOn, setReceivedOn] = useState(orderDate);
  const [reference, setReference] = useState("");
  const [submissionKey, setSubmissionKey] = useState("");
  const [isPending, startTransition] = useTransition();

  function openConfirmation() {
    setReceivedOn(orderDate);
    setReference("");
    setSubmissionKey(crypto.randomUUID());
    setOpen(true);
  }

  function confirmReceipt() {
    if (!eligibility.eligible || !submissionKey || !receivedOn) return;
    startTransition(async () => {
      const result = await recordCustomerPaymentReceiptAction({
        orderId,
        expectedUpdatedAt: eligibility.expectedUpdatedAt,
        receivedOn,
        reference,
        submissionKey,
      });
      if (!result.ok) {
        toast.error("Payment receipt was not recorded", { description: result.message });
        return;
      }
      toast.success("Customer payment recorded", { description: `${eligibility.account.label} cash balance now includes ${formatMoney(eligibility.amount, true)}.` });
      setOpen(false);
      router.refresh();
    });
  }

  return <section className="panel mt-4 p-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary"><WalletCards className="size-5" /></div>
        <div>
          <h2 className="text-sm font-semibold">Customer payment receipt</h2>
          <p className="mt-1 text-xs text-muted-foreground">Records actual non-COD money received. Revenue, profit, payment status, and settlement status remain unchanged.</p>
        </div>
      </div>
      {!receipt && eligibility.eligible ? <Button size="sm" disabled={!enabled} onClick={openConfirmation} title={enabled ? "Record customer payment receipt" : "Connected owner/admin mode required"}><ReceiptText /> Record payment receipt</Button> : null}
    </div>

    {receipt ? <Alert className="mt-4" variant={receipt.isReversed ? "destructive" : "default"}>
      <CircleCheck />
      <AlertTitle>{receipt.isReversed ? "Payment receipt was reversed" : "Payment receipt recorded"}</AlertTitle>
      <AlertDescription>{formatMoney(receipt.amount, true)} was recorded to {receipt.accountLabel} on {receipt.receivedOn}.{receipt.reference ? ` Reference: ${receipt.reference}.` : ""}</AlertDescription>
    </Alert> : !eligibility.eligible ? <Alert className="mt-4"><ReceiptText /><AlertTitle>Receipt not available</AlertTitle><AlertDescription>{eligibility.message}</AlertDescription></Alert> : <div className="mt-4 grid gap-3 rounded-xl border p-4 text-sm sm:grid-cols-3">
      <div><p className="text-xs text-muted-foreground">Payment method</p><p className="mt-1 font-medium">{paymentMethod}</p></div>
      <div><p className="text-xs text-muted-foreground">Cash account</p><p className="mt-1 font-medium">{eligibility.account.label}</p></div>
      <div><p className="text-xs text-muted-foreground">Receipt amount</p><p className="money mt-1 font-semibold">{formatMoney(eligibility.amount, true)}</p></div>
    </div>}

    <Dialog open={open} onOpenChange={(next) => { if (!isPending) setOpen(next); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Record customer payment?</DialogTitle><DialogDescription>The database will derive the exact order amount and matching cash account. This creates an append-only, order-linked cash entry.</DialogDescription></DialogHeader>
        {eligibility.eligible ? <>
          <div className="grid grid-cols-2 gap-3 rounded-xl border p-4 text-sm">
            <span className="text-muted-foreground">Order</span><span className="text-right font-medium">{orderNumber}</span>
            <span className="text-muted-foreground">Account</span><span className="text-right font-medium">{eligibility.account.label}</span>
            <span className="text-muted-foreground">Amount</span><span className="money text-right font-semibold">{formatMoney(eligibility.amount, true)}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="customerReceiptDate">Date received</FieldLabel><Input id="customerReceiptDate" type="date" min={orderDate} value={receivedOn} onChange={(event) => setReceivedOn(event.target.value)} disabled={isPending} /></Field>
            <Field><FieldLabel htmlFor="customerReceiptReference">Payment reference (optional)</FieldLabel><Input id="customerReceiptReference" value={reference} maxLength={120} onChange={(event) => setReference(event.target.value)} placeholder="For example, bKash transaction ID" disabled={isPending} /></Field>
          </div>
          <Alert><ReceiptText /><AlertTitle>Check before confirming</AlertTitle><AlertDescription>Confirm the money was actually received in this account. Settlement status will stay Not Applicable.</AlertDescription></Alert>
        </> : null}
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button><Button onClick={confirmReceipt} disabled={!eligibility.eligible || !receivedOn || isPending}>{isPending ? "Recording..." : "Confirm payment receipt"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
