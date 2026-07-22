"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, CircleDollarSign, Pencil, Plus, Save, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createOrderAction, updateOrderAction } from "@/actions/manual-entry";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { calculateOrderFinancials, orderWarnings } from "@/domain/calculations";
import {
  createSubmissionGuard,
  MANUAL_ORDER_STATUSES,
  MANUAL_PAYMENT_STATUSES,
  MANUAL_SETTLEMENT_STATUSES,
  manualOrderFormSchema,
  orderToManualOrderValues,
  toManualOrderEditValues,
  type ManualOrderValues,
} from "@/domain/manual-entry";
import { formatMoney, parseMoney } from "@/domain/money";
import { PAYMENT_METHODS, SALES_CHANNELS, type Order, type Product } from "@/domain/types";

function createDefaultValues(date: string, products: Product[]): ManualOrderValues {
  return {
    orderNumber: "",
    externalReference: "",
    orderDate: date,
    customerName: "",
    customerPhone: "",
    customerAddress: "",
    customerNote: "",
    customerLocation: "Inside Dhaka",
    courier: "Steadfast",
    channel: "Other",
    campaign: "",
    status: "Pending",
    paymentMethod: "COD",
    paymentStatus: "Unpaid",
    settlementStatus: "Awaiting",
    discount: "0",
    deliveryCharged: "0",
    courierCostSnapshot: "0",
    packagingCostSnapshot: "0",
    items: [{
      productId: products[0]?.id ?? "",
      quantity: 1,
      actualUnitSellingPrice: products[0] ? String(products[0].sellingPrice / 100) : "0",
    }],
  };
}

function safeMoney(value?: string) {
  try { return parseMoney(value || "0"); } catch { return 0; }
}

function FormSelect({ id, value, onValueChange, options, placeholder }: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly string[];
  placeholder: string;
}) {
  return <Select value={value} onValueChange={(next) => onValueChange(next as string)}>
    <SelectTrigger id={id} className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
    <SelectContent><SelectGroup>{options.map((option) => <SelectItem value={option} key={option}>{option}</SelectItem>)}</SelectGroup></SelectContent>
  </Select>;
}

function Section({ number, title, description, children }: {
  number: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return <section className="panel p-4 sm:p-5">
    <div className="mb-5 flex gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-semibold text-primary">{number}</span>
      <div><h2 className="text-sm font-semibold text-slate-950">{title}</h2><p className="mt-0.5 text-xs text-muted-foreground">{description}</p></div>
    </div>
    {children}
  </section>;
}

type SharedOrderFormProps = {
  products: Product[];
  existingOrderNumbers: string[];
  persistenceEnabled: boolean;
};

export function NewOrderForm(props: SharedOrderFormProps & { initialDate: string }) {
  const initialValues = useMemo(
    () => createDefaultValues(props.initialDate, props.products),
    [props.initialDate, props.products],
  );
  return <OrderForm {...props} mode="create" initialValues={initialValues} />;
}

export function EditOrderForm(props: SharedOrderFormProps & { order: Order }) {
  const initialValues = useMemo(() => orderToManualOrderValues(props.order), [props.order]);
  return <OrderForm
    {...props}
    mode="edit"
    initialValues={initialValues}
    orderId={props.order.id}
    expectedUpdatedAt={props.order.updatedAt}
    preserveUnknownCourierCost={props.order.courierCostSnapshotKnown === false}
    preserveUnknownPackagingCost={props.order.packagingCostSnapshotKnown === false}
  />;
}

function OrderForm({ products, existingOrderNumbers, persistenceEnabled, mode, initialValues, orderId, expectedUpdatedAt, preserveUnknownCourierCost = false, preserveUnknownPackagingCost = false }: SharedOrderFormProps & {
  mode: "create" | "edit";
  initialValues: ManualOrderValues;
  orderId?: string;
  expectedUpdatedAt?: string;
  preserveUnknownCourierCost?: boolean;
  preserveUnknownPackagingCost?: boolean;
}) {
  const router = useRouter();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [submissionGuard] = useState(createSubmissionGuard);
  const form = useForm<ManualOrderValues>({ resolver: zodResolver(manualOrderFormSchema), defaultValues: initialValues, mode: "onBlur" });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const values = useWatch({ control: form.control });

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (form.formState.isDirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [form.formState.isDirty]);

  const draft = useMemo<Order>(() => ({
    id: mode === "edit" && orderId ? orderId : "draft",
    orderNumber: values.orderNumber ?? "",
    externalReference: values.externalReference,
    orderDate: values.orderDate ?? initialValues.orderDate,
    customerName: values.customerName ?? "",
    customerPhone: values.customerPhone ?? "",
    customerAddress: values.customerAddress ?? "",
    customerNote: values.customerNote ?? "",
    customerLocation: values.customerLocation ?? "Inside Dhaka",
    courier: values.courier ?? "Steadfast",
    channel: values.channel ?? "Other",
    campaign: values.campaign ?? "",
    status: values.status ?? "Pending",
    paymentMethod: values.paymentMethod ?? "COD",
    paymentStatus: values.paymentStatus ?? "Unpaid",
    settlementStatus: values.settlementStatus ?? "Awaiting",
    discount: safeMoney(values.discount),
    deliveryCharged: safeMoney(values.deliveryCharged),
    refundAmount: 0,
    courierCostSnapshot: safeMoney(values.courierCostSnapshot),
    packagingCostSnapshot: safeMoney(values.packagingCostSnapshot),
    items: (values.items ?? []).map((entry, index) => {
      const product = products.find((candidate) => candidate.id === entry?.productId);
      return {
        id: `draft-${index}`,
        productId: entry?.productId ?? "unknown",
        skuSnapshot: product?.sku ?? "",
        productNameSnapshot: product?.name ?? "Unknown product",
        listPriceSnapshot: product?.sellingPrice ?? 0,
        buyingCostSnapshot: product?.buyingPrice ?? 0,
        quantity: Number(entry?.quantity ?? 0),
        actualUnitSellingPrice: safeMoney(entry?.actualUnitSellingPrice),
      };
    }),
  }), [initialValues.orderDate, mode, orderId, products, values]);

  const finance = calculateOrderFinancials(draft);
  const warnings = orderWarnings(draft, new Set(products.map((product) => product.sku)), new Set(existingOrderNumbers), mode === "edit" ? orderId : undefined);

  function applyProduct(index: number, productId: string) {
    const product = products.find((candidate) => candidate.id === productId);
    form.setValue(`items.${index}.productId`, productId, { shouldDirty: true, shouldValidate: true });
    if (product) form.setValue(`items.${index}.actualUnitSellingPrice`, String(product.sellingPrice / 100), { shouldDirty: true, shouldValidate: true });
  }

  function review(validated: ManualOrderValues) {
    if (mode === "create" && existingOrderNumbers.some((orderNumber) => orderNumber.toLowerCase() === validated.orderNumber.toLowerCase())) {
      form.setError("orderNumber", { message: "That order number already exists" });
      return;
    }
    setSaveError(null);
    setReviewOpen(true);
  }

  function save() {
    if (!persistenceEnabled || (mode === "edit" && (!orderId || !expectedUpdatedAt)) || !submissionGuard.tryLock()) return;
    startTransition(async () => {
      try {
        const formValues = form.getValues();
        const result = mode === "create"
          ? await createOrderAction(formValues)
          : await updateOrderAction(toManualOrderEditValues(formValues, orderId!, expectedUpdatedAt!, {
            courier: preserveUnknownCourierCost && !form.getFieldState("courierCostSnapshot").isDirty,
            packaging: preserveUnknownPackagingCost && !form.getFieldState("packagingCostSnapshot").isDirty,
          }));
        if (!result.ok) {
          setSaveError(result.message);
          toast.error(mode === "create" ? "Order was not saved" : "Order was not updated", { description: result.message });
          return;
        }
        setReviewOpen(false);
        toast.success(mode === "create" ? "Order saved" : "Order updated", { description: mode === "create" ? `${draft.orderNumber} is now in the authenticated order ledger.` : "The ordinary order fields and items were updated atomically." });
        form.reset(formValues);
        router.push(`/orders/${result.recordId}`);
        router.refresh();
      } finally {
        submissionGuard.release();
      }
    });
  }

  return <form onSubmit={form.handleSubmit(review)} className="grid items-start gap-4 xl:grid-cols-12">
    <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
      {!persistenceEnabled && <Alert><AlertTriangle /><AlertTitle>Isolated mock mode</AlertTitle><AlertDescription>The form remains available for deterministic UI testing, but its save action fails closed and cannot write records.</AlertDescription></Alert>}
      {mode === "edit" && <Alert><AlertTriangle /><AlertTitle>Statuses stay separate</AlertTitle><AlertDescription>Order, payment, and settlement statuses cannot be changed here. Use the operational status workflow on the order details page.</AlertDescription></Alert>}
      <Section number={1} title="Order identity" description={mode === "create" ? "Use a unique internal order number; external references remain optional." : "The order number is immutable; courier or external tracking references may still be updated."}>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          {mode === "create"
            ? <Field data-invalid={!!form.formState.errors.orderNumber}><FieldLabel htmlFor="orderNumber">Order number</FieldLabel><Input id="orderNumber" placeholder="NNM-20260719-001" {...form.register("orderNumber")} aria-invalid={!!form.formState.errors.orderNumber} /><FieldError errors={[form.formState.errors.orderNumber]} /></Field>
            : <Field data-disabled><FieldLabel htmlFor="orderNumber">Order number</FieldLabel><Input id="orderNumber" value={initialValues.orderNumber} disabled readOnly /></Field>}
          <Field><FieldLabel htmlFor="externalReference">External / courier reference</FieldLabel><Input id="externalReference" placeholder="Optional" {...form.register("externalReference")} /></Field>
          <Field><FieldLabel htmlFor="orderDate">Order date</FieldLabel><Input id="orderDate" type="date" {...form.register("orderDate")} /><FieldError errors={[form.formState.errors.orderDate]} /></Field>
          <Field><FieldLabel htmlFor="channel">Sales channel</FieldLabel><Controller control={form.control} name="channel" render={({ field }) => <FormSelect id="channel" value={field.value} onValueChange={field.onChange} options={SALES_CHANNELS} placeholder="Choose channel" />} /></Field>
        </FieldGroup>
      </Section>
      <Section number={2} title="Customer & fulfilment" description={mode === "create" ? "The atomic RPC requires the customer delivery details before it creates the order and items." : "Customer, delivery, tracking, campaign, and payment-method values are updated with the items in one transaction."}>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="customerName">Customer name</FieldLabel><Input id="customerName" {...form.register("customerName")} /><FieldError errors={[form.formState.errors.customerName]} /></Field>
          <Field><FieldLabel htmlFor="customerPhone">Customer phone</FieldLabel><Input id="customerPhone" inputMode="tel" {...form.register("customerPhone")} /><FieldError errors={[form.formState.errors.customerPhone]} /></Field>
          <Field className="sm:col-span-2"><FieldLabel htmlFor="customerAddress">Customer address</FieldLabel><Textarea id="customerAddress" {...form.register("customerAddress")} /><FieldError errors={[form.formState.errors.customerAddress]} /></Field>
          <Field><FieldLabel htmlFor="customerLocation">Customer location</FieldLabel><Controller control={form.control} name="customerLocation" render={({ field }) => <FormSelect id="customerLocation" value={field.value} onValueChange={field.onChange} options={["Inside Dhaka", "Outside Dhaka"]} placeholder="Choose location" />} /></Field>
          <Field><FieldLabel htmlFor="courier">Courier</FieldLabel><Input id="courier" {...form.register("courier")} /><FieldError errors={[form.formState.errors.courier]} /></Field>
          <Field><FieldLabel htmlFor="campaign">Campaign name</FieldLabel><Input id="campaign" placeholder="Optional" {...form.register("campaign")} /></Field>
          <Field><FieldLabel htmlFor="customerNote">Customer note</FieldLabel><Input id="customerNote" placeholder="Optional" {...form.register("customerNote")} /></Field>
          {mode === "edit" && <Field><FieldLabel htmlFor="paymentMethod">Payment method</FieldLabel><Controller control={form.control} name="paymentMethod" render={({ field }) => <FormSelect id="paymentMethod" value={field.value} onValueChange={field.onChange} options={PAYMENT_METHODS} placeholder="Method" />} /></Field>}
        </FieldGroup>
      </Section>
      {mode === "create" && <Section number={3} title="Independent statuses" description="Order, payment, and courier settlement statuses are stored independently.">
        <FieldGroup className="grid gap-4 sm:grid-cols-3">
          <Field><FieldLabel htmlFor="status">Order status</FieldLabel><Controller control={form.control} name="status" render={({ field }) => <FormSelect id="status" value={field.value} onValueChange={field.onChange} options={MANUAL_ORDER_STATUSES} placeholder="Order status" />} /></Field>
          <Field><FieldLabel htmlFor="paymentMethod">Payment method</FieldLabel><Controller control={form.control} name="paymentMethod" render={({ field }) => <FormSelect id="paymentMethod" value={field.value} onValueChange={field.onChange} options={PAYMENT_METHODS} placeholder="Method" />} /></Field>
          <Field><FieldLabel htmlFor="paymentStatus">Payment status</FieldLabel><Controller control={form.control} name="paymentStatus" render={({ field }) => <FormSelect id="paymentStatus" value={field.value} onValueChange={field.onChange} options={MANUAL_PAYMENT_STATUSES} placeholder="Payment status" />} /></Field>
          <Field><FieldLabel htmlFor="settlementStatus">Settlement status</FieldLabel><Controller control={form.control} name="settlementStatus" render={({ field }) => <FormSelect id="settlementStatus" value={field.value} onValueChange={field.onChange} options={MANUAL_SETTLEMENT_STATUSES} placeholder="Settlement status" />} /></Field>
        </FieldGroup>
      </Section>}
      <Section number={mode === "create" ? 4 : 3} title="Product items" description="The RPC snapshots the selected product and verified private buying cost without changing stock.">
        <div className="flex flex-col gap-3">
          {fields.map((field, index) => {
            const product = products.find((candidate) => candidate.id === values.items?.[index]?.productId);
            return <div key={field.id} className="rounded-xl border bg-muted/25 p-3">
              <FieldGroup className="grid items-start gap-3 sm:grid-cols-12">
                <Field className="sm:col-span-5"><FieldLabel htmlFor={`product-${index}`}>SKU / product</FieldLabel><Controller control={form.control} name={`items.${index}.productId`} render={({ field: productField }) => <Select value={productField.value} onValueChange={(value) => applyProduct(index, value as string)}><SelectTrigger id={`product-${index}`} className="w-full"><SelectValue placeholder="Choose product" /></SelectTrigger><SelectContent><SelectGroup>{products.map((value) => <SelectItem value={value.id} key={value.id}>{value.sku} · {value.name}</SelectItem>)}</SelectGroup></SelectContent></Select>} /><FieldError errors={[form.formState.errors.items?.[index]?.productId]} /></Field>
                <Field className="sm:col-span-2"><FieldLabel htmlFor={`quantity-${index}`}>Quantity</FieldLabel><Input id={`quantity-${index}`} type="number" min={1} {...form.register(`items.${index}.quantity`, { valueAsNumber: true })} /><FieldError errors={[form.formState.errors.items?.[index]?.quantity]} /></Field>
                <Field className="sm:col-span-3"><FieldLabel htmlFor={`actual-price-${index}`}>Actual unit price</FieldLabel><Input id={`actual-price-${index}`} inputMode="decimal" {...form.register(`items.${index}.actualUnitSellingPrice`)} /><FieldError errors={[form.formState.errors.items?.[index]?.actualUnitSellingPrice]} /></Field>
                <div className="flex h-full items-end sm:col-span-2"><Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={fields.length === 1} onClick={() => remove(index)}><Trash2 /> Remove</Button></div>
              </FieldGroup>
              {product && <div className="mt-3 grid gap-2 border-t pt-3 text-xs text-muted-foreground sm:grid-cols-3"><span>Product: <strong className="font-medium text-foreground">{product.name}</strong></span><span>List price: <strong className="money font-medium text-foreground">{formatMoney(product.sellingPrice)}</strong></span><span>Verified buying cost: <strong className="money font-medium text-foreground">{formatMoney(product.buyingPrice)}</strong></span></div>}
            </div>;
          })}
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => append({ productId: "", quantity: 1, actualUnitSellingPrice: "0" })}><Plus /> Add product item</Button>
          <FieldError errors={[form.formState.errors.items]} />
        </div>
      </Section>
      <Section number={mode === "create" ? 5 : 4} title="Financial inputs" description="All UI calculations remain integer-poisha; the server converts validated values only at the RPC boundary.">
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="discount">Discount (BDT)</FieldLabel><Input id="discount" inputMode="decimal" {...form.register("discount")} /><FieldError errors={[form.formState.errors.discount]} /></Field>
          <Field><FieldLabel htmlFor="deliveryCharged">Delivery charged (BDT)</FieldLabel><Input id="deliveryCharged" inputMode="decimal" {...form.register("deliveryCharged")} /><FieldError errors={[form.formState.errors.deliveryCharged]} /></Field>
          <Field><FieldLabel htmlFor="courierCostSnapshot">Courier cost snapshot (BDT)</FieldLabel><Input id="courierCostSnapshot" inputMode="decimal" {...form.register("courierCostSnapshot")} /><FieldError errors={[form.formState.errors.courierCostSnapshot]} /></Field>
          <Field><FieldLabel htmlFor="packagingCostSnapshot">Packaging cost snapshot (BDT)</FieldLabel><Input id="packagingCostSnapshot" inputMode="decimal" {...form.register("packagingCostSnapshot")} /><FieldError errors={[form.formState.errors.packagingCostSnapshot]} /></Field>
        </FieldGroup>
        <p className="mt-3 text-xs text-muted-foreground">Refunds and returns are intentionally excluded from this MVP slice.</p>
      </Section>
    </div>
    <aside className="panel p-4 xl:sticky xl:top-20 xl:col-span-4 xl:p-5">
      <div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><CircleDollarSign className="size-4" /></span><div><h2 className="text-sm font-semibold">Live financial summary</h2><p className="text-xs text-muted-foreground">Integer-poisha calculation</p></div></div>
      <dl className="mt-5 space-y-3">{[["Product subtotal", finance.productSubtotal], ["Product revenue", finance.productRevenue], ["Delivery charged", draft.deliveryCharged], ["Discount", -draft.discount], ["Order total", finance.orderTotal], ["Net revenue", finance.netRevenue], ["Recognized COGS", -finance.recognizedCogs], ["Courier snapshot", -draft.courierCostSnapshot], ["Packaging snapshot", -draft.packagingCostSnapshot], ["Contribution profit", finance.contributionProfit]].map(([label, amount], index) => <div key={String(label)} className={`flex items-center justify-between text-sm ${index === 4 || index === 9 ? "border-t pt-3 font-semibold" : ""}`}><dt className="text-muted-foreground">{label}</dt><dd className="money">{formatMoney(amount as number)}</dd></div>)}</dl>
      <div className="mt-4 rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-700">Delivered recognition continues through the installed database trigger and immutable snapshot rules. This form never updates inventory.</div>
      {warnings.length > 0 ? <Alert className="mt-4 border-amber-200 bg-amber-50"><AlertTriangle className="text-amber-600" /><AlertTitle>Review {warnings.length} warning{warnings.length === 1 ? "" : "s"}</AlertTitle><AlertDescription><ul className="mt-1 list-disc space-y-1 pl-4">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></AlertDescription></Alert> : <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="size-4" /> No financial warnings</div>}
      <div className="mt-5 grid gap-2"><Button type="submit" disabled={!products.length || isPending || (mode === "edit" && !form.formState.isDirty)}>{mode === "create" ? <ShoppingBag data-icon="inline-start" /> : <Pencil data-icon="inline-start" />} {mode === "create" ? "Review order" : "Review changes"}</Button><Button type="button" variant="outline" onClick={() => { if (!form.formState.isDirty || window.confirm("Discard unsaved changes?")) router.push(mode === "edit" ? `/orders/${orderId}` : "/orders"); }}>Cancel</Button></div>
    </aside>
    <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
      <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{mode === "create" ? "Review before save" : "Confirm financially significant changes"}</DialogTitle><DialogDescription>{mode === "create" ? (persistenceEnabled ? "This will call the authenticated atomic order RPC once." : "Mock mode cannot persist this order.") : `${persistenceEnabled ? "This atomically replaces the editable order values and item snapshots." : "Mock mode cannot persist this order."} Operational statuses and recognized financial records remain unchanged.`}</DialogDescription></DialogHeader>
        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Order</p><p className="mt-1 font-medium">{draft.orderNumber}</p></div><div><p className="text-xs text-muted-foreground">Customer</p><p className="mt-1 font-medium">{draft.customerName}</p></div><div><p className="text-xs text-muted-foreground">Items</p><p className="mt-1 font-medium">{draft.items.reduce((sum, item) => sum + item.quantity, 0)}</p></div><div><p className="text-xs text-muted-foreground">Order total</p><p className="money mt-1 font-semibold">{formatMoney(finance.orderTotal)}</p></div></div>
        {saveError && <Alert variant="destructive"><AlertTriangle /><AlertTitle>{mode === "create" ? "Order was not saved" : "Order was not updated"}</AlertTitle><AlertDescription>{saveError}</AlertDescription></Alert>}
        <DialogFooter><Button type="button" variant="outline" disabled={isPending} onClick={() => setReviewOpen(false)}>Keep editing</Button><Button type="button" disabled={!persistenceEnabled || isPending || (mode === "edit" && !expectedUpdatedAt)} onClick={save}><Save data-icon="inline-start" /> {isPending ? "Saving…" : mode === "create" ? "Save order" : "Save changes"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </form>;
}
