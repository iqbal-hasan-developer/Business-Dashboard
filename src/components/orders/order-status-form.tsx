"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Save } from "lucide-react";
import { toast } from "sonner";
import { updateOrderStatusesAction } from "@/actions/manual-entry";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createSubmissionGuard,
  MANUAL_ORDER_STATUSES,
  MANUAL_PAYMENT_STATUSES,
  orderTransitionSchema,
  type OrderTransitionValues,
} from "@/domain/manual-entry";
import type { Order } from "@/domain/types";

function StatusSelect({ value, onValueChange, options }: { value: string; onValueChange: (value: string) => void; options: readonly string[] }) {
  return <Select value={value} onValueChange={(next) => onValueChange(next as string)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{options.map((option) => <SelectItem value={option} key={option}>{option}</SelectItem>)}</SelectGroup></SelectContent></Select>;
}

export function OrderStatusForm({ order, enabled }: { order: Order; enabled: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submissionGuard] = useState(createSubmissionGuard);
  const supported = MANUAL_ORDER_STATUSES.includes(order.status as (typeof MANUAL_ORDER_STATUSES)[number])
    && MANUAL_PAYMENT_STATUSES.includes(order.paymentStatus as (typeof MANUAL_PAYMENT_STATUSES)[number]);
  const form = useForm<OrderTransitionValues>({
    resolver: zodResolver(orderTransitionSchema),
    defaultValues: {
      orderId: order.id,
      orderStatus: supported ? order.status as OrderTransitionValues["orderStatus"] : "Pending",
      paymentStatus: supported ? order.paymentStatus as OrderTransitionValues["paymentStatus"] : "Unpaid",
    },
  });

  function save(values: OrderTransitionValues) {
    if (!enabled || !supported || !submissionGuard.tryLock()) return;
    setSaveError(null);
    startTransition(async () => {
      try {
        const result = await updateOrderStatusesAction(values);
        if (!result.ok) {
          setSaveError(result.message);
          toast.error("Statuses were not updated", { description: result.message });
          return;
        }
        toast.success("Statuses updated", { description: "Settlement status remains controlled by confirmed allocation evidence." });
        router.refresh();
      } finally {
        submissionGuard.release();
      }
    });
  }

  return <section className="panel mt-4 p-5">
    <h2 className="text-sm font-semibold">Update operational statuses</h2>
    <p className="mt-1 text-xs text-muted-foreground">Uses the authenticated transition RPC. Refund and return controls are not part of this MVP slice.</p>
    {!supported && <Alert className="mt-4"><AlertTriangle /><AlertTitle>Unsupported workflow state</AlertTitle><AlertDescription>This order is already in a refund/return-only state. The manual-entry MVP will not alter it.</AlertDescription></Alert>}
    <form onSubmit={form.handleSubmit(save)} className="mt-4">
      <FieldGroup className="grid gap-4 sm:grid-cols-3">
        <Field><FieldLabel>Order status</FieldLabel><Controller control={form.control} name="orderStatus" render={({ field }) => <StatusSelect value={field.value} onValueChange={field.onChange} options={MANUAL_ORDER_STATUSES} />} /></Field>
        <Field><FieldLabel>Payment status</FieldLabel><Controller control={form.control} name="paymentStatus" render={({ field }) => <StatusSelect value={field.value} onValueChange={field.onChange} options={MANUAL_PAYMENT_STATUSES} />} /></Field>
        <Field><FieldLabel>Settlement status</FieldLabel><div className="flex h-8 items-center rounded-lg border bg-muted/40 px-3 text-sm">{order.settlementStatus}</div><p className="text-xs text-muted-foreground">Updated only by confirmed settlement evidence.</p></Field>
      </FieldGroup>
      {saveError && <Alert variant="destructive" className="mt-4"><AlertTriangle /><AlertTitle>Statuses were not updated</AlertTitle><AlertDescription>{saveError}</AlertDescription></Alert>}
      <div className="mt-4 flex justify-end"><Button type="submit" disabled={!enabled || !supported || isPending}><Save /> {isPending ? "Saving…" : "Save statuses"}</Button></div>
    </form>
  </section>;
}
