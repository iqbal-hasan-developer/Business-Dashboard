"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, CircleDollarSign, Plus, Save, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calculateOrderFinancials, orderWarnings } from "@/domain/calculations";
import { formatMoney, parseMoney } from "@/domain/money";
import { orderFormSchema, type OrderFormValues } from "@/domain/order-schema";
import { ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, SALES_CHANNELS, SETTLEMENT_STATUSES, type Order, type Product } from "@/domain/types";

const defaults: OrderFormValues = {
  orderNumber: "NNM-20260714-0015",
  externalReference: "",
  orderDate: "2026-07-14",
  customerName: "",
  customerLocation: "Inside Dhaka",
  courier: "Steadfast",
  channel: "Website",
  campaign: "Always-on",
  status: "Pending",
  paymentMethod: "COD",
  paymentStatus: "Unpaid",
  settlementStatus: "Awaiting",
  discount: "0",
  deliveryCharged: "80",
  refundAmount: "0",
  items: [{ sku: "NN-PLN-001", quantity: 1, actualUnitSellingPrice: "580" }],
};

function safeMoney(value?: string) {
  try { return parseMoney(value || "0"); } catch { return 0; }
}

function FormSelect({ value, onValueChange, options, placeholder }: { value: string; onValueChange: (value: string) => void; options: readonly string[]; placeholder: string }) {
  return <Select value={value} onValueChange={(next) => onValueChange(next as string)}><SelectTrigger className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent><SelectGroup>{options.map((option) => <SelectItem value={option} key={option}>{option}</SelectItem>)}</SelectGroup></SelectContent></Select>;
}

function Section({ number, title, description, children }: { number: number; title: string; description: string; children: React.ReactNode }) {
  return <section className="panel p-4 sm:p-5"><div className="mb-5 flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-semibold text-primary">{number}</span><div><h2 className="text-sm font-semibold text-slate-950">{title}</h2><p className="mt-0.5 text-xs text-muted-foreground">{description}</p></div></div>{children}</section>;
}

export function NewOrderForm({ products, existingOrderNumbers }: { products: Product[]; existingOrderNumbers: string[] }) {
  const router = useRouter();
  const [reviewOpen, setReviewOpen] = useState(false);
  const form = useForm<OrderFormValues>({ resolver: zodResolver(orderFormSchema), defaultValues: defaults, mode: "onBlur" });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const values = useWatch({ control: form.control });
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (form.formState.isDirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [form.formState.isDirty]);

  const draft = useMemo<Order>(() => {
    const orderItems = (values.items ?? []).map((entry, index) => {
      const product = products.find((value) => value.sku === entry?.sku);
      return { id: `draft-${index}`, productId: product?.id ?? "unknown", skuSnapshot: entry?.sku ?? "", productNameSnapshot: product?.name ?? "Unknown product", listPriceSnapshot: product?.sellingPrice ?? 0, buyingCostSnapshot: product?.buyingPrice ?? 0, quantity: Number(entry?.quantity ?? 0), actualUnitSellingPrice: safeMoney(entry?.actualUnitSellingPrice) };
    });
    return {
      id: "draft", orderNumber: values.orderNumber ?? "", externalReference: values.externalReference,
      orderDate: values.orderDate ?? "", customerName: values.customerName ?? "", customerLocation: values.customerLocation ?? "Inside Dhaka",
      courier: values.courier ?? "Steadfast", channel: values.channel ?? "Website", campaign: values.campaign ?? "", status: values.status ?? "Pending",
      paymentMethod: values.paymentMethod ?? "COD", paymentStatus: values.paymentStatus ?? "Unpaid", settlementStatus: values.settlementStatus ?? "Awaiting",
      items: orderItems, discount: safeMoney(values.discount), deliveryCharged: safeMoney(values.deliveryCharged), refundAmount: safeMoney(values.refundAmount),
      courierCostSnapshot: values.customerLocation === "Outside Dhaka" ? parseMoney("120") : parseMoney("70"), packagingCostSnapshot: 0,
    };
  }, [products, values]);
  const finance = calculateOrderFinancials(draft);
  const warnings = orderWarnings(draft, new Set(products.map((product) => product.sku)), new Set(existingOrderNumbers));

  function applyProduct(index: number, sku: string) {
    const product = products.find((candidate) => candidate.sku === sku);
    form.setValue(`items.${index}.sku`, sku, { shouldDirty: true, shouldValidate: true });
    if (product) form.setValue(`items.${index}.actualUnitSellingPrice`, String(product.sellingPrice / 100), { shouldDirty: true, shouldValidate: true });
  }

  function saveMock() {
    setReviewOpen(false);
    toast.success("Mock order saved", { description: `${draft.orderNumber} was added to the prototype workflow.` });
    form.reset(defaults);
    router.push("/orders");
  }

  return <form onSubmit={form.handleSubmit(() => setReviewOpen(true))} className="grid items-start gap-4 xl:grid-cols-12">
    <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
      <Section number={1} title="Order identity" description="Keep the internal number separate from courier or marketplace references."><FieldGroup className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="orderNumber">Order number</FieldLabel><Input id="orderNumber" {...form.register("orderNumber")} aria-invalid={!!form.formState.errors.orderNumber} /><FieldError errors={[form.formState.errors.orderNumber]} /></Field><Field><FieldLabel htmlFor="externalReference">External / courier reference</FieldLabel><Input id="externalReference" placeholder="Optional" {...form.register("externalReference")} /></Field><Field><FieldLabel htmlFor="orderDate">Order date</FieldLabel><Input id="orderDate" type="date" {...form.register("orderDate")} /></Field><Field><FieldLabel>Sales channel</FieldLabel><Controller control={form.control} name="channel" render={({ field }) => <FormSelect value={field.value} onValueChange={field.onChange} options={SALES_CHANNELS} placeholder="Choose channel" />} /></Field></FieldGroup></Section>
      <Section number={2} title="Customer & fulfilment" description="Courier cost is snapshotted from the provisional location setting."><FieldGroup className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="customerName">Customer name</FieldLabel><Input id="customerName" placeholder="e.g. Nusrat Jahan" {...form.register("customerName")} aria-invalid={!!form.formState.errors.customerName} /><FieldError errors={[form.formState.errors.customerName]} /></Field><Field><FieldLabel>Customer location</FieldLabel><Controller control={form.control} name="customerLocation" render={({ field }) => <FormSelect value={field.value} onValueChange={field.onChange} options={["Inside Dhaka", "Outside Dhaka"]} placeholder="Choose location" />} /></Field><Field><FieldLabel htmlFor="courier">Courier</FieldLabel><Input id="courier" {...form.register("courier")} /></Field><Field><FieldLabel htmlFor="campaign">Campaign</FieldLabel><Input id="campaign" placeholder="Always-on" {...form.register("campaign")} /></Field></FieldGroup></Section>
      <Section number={3} title="Operational statuses" description="Order, payment, and settlement state are deliberately independent."><FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field><FieldLabel>Order status</FieldLabel><Controller control={form.control} name="status" render={({ field }) => <FormSelect value={field.value} onValueChange={field.onChange} options={ORDER_STATUSES} placeholder="Order status" />} /></Field><Field><FieldLabel>Payment method</FieldLabel><Controller control={form.control} name="paymentMethod" render={({ field }) => <FormSelect value={field.value} onValueChange={field.onChange} options={PAYMENT_METHODS} placeholder="Method" />} /></Field><Field><FieldLabel>Payment status</FieldLabel><Controller control={form.control} name="paymentStatus" render={({ field }) => <FormSelect value={field.value} onValueChange={field.onChange} options={PAYMENT_STATUSES} placeholder="Payment" />} /></Field><Field><FieldLabel>Settlement status</FieldLabel><Controller control={form.control} name="settlementStatus" render={({ field }) => <FormSelect value={field.value} onValueChange={field.onChange} options={SETTLEMENT_STATUSES} placeholder="Settlement" />} /></Field></FieldGroup></Section>
      <Section number={4} title="Product items" description="Product details and buying cost populate from the selected SKU and become snapshots."><div className="flex flex-col gap-3">{fields.map((field, index) => {
        const product = products.find((candidate) => candidate.sku === values.items?.[index]?.sku);
        return <div key={field.id} className="rounded-xl border bg-muted/25 p-3"><FieldGroup className="grid items-start gap-3 sm:grid-cols-12"><Field className="sm:col-span-5"><FieldLabel>SKU / product</FieldLabel><Controller control={form.control} name={`items.${index}.sku`} render={({ field: skuField }) => <Select value={skuField.value} onValueChange={(value) => applyProduct(index, value as string)}><SelectTrigger className="w-full"><SelectValue placeholder="Choose SKU" /></SelectTrigger><SelectContent><SelectGroup>{products.map((value) => <SelectItem value={value.sku} key={value.sku}>{value.sku} · {value.name}</SelectItem>)}</SelectGroup></SelectContent></Select>} /><FieldError errors={[form.formState.errors.items?.[index]?.sku]} /></Field><Field className="sm:col-span-2"><FieldLabel>Quantity</FieldLabel><Input type="number" min={1} {...form.register(`items.${index}.quantity`, { valueAsNumber: true })} /><FieldError errors={[form.formState.errors.items?.[index]?.quantity]} /></Field><Field className="sm:col-span-3"><FieldLabel>Actual unit price</FieldLabel><Input inputMode="decimal" {...form.register(`items.${index}.actualUnitSellingPrice`)} /><FieldError errors={[form.formState.errors.items?.[index]?.actualUnitSellingPrice]} /></Field><div className="flex h-full items-end sm:col-span-2"><Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={fields.length === 1} onClick={() => remove(index)}><Trash2 /> Remove</Button></div></FieldGroup>{product && <div className="mt-3 grid gap-2 border-t pt-3 text-xs text-muted-foreground sm:grid-cols-3"><span>Product: <strong className="font-medium text-foreground">{product.name}</strong></span><span>List price: <strong className="money font-medium text-foreground">{formatMoney(product.sellingPrice)}</strong></span><span>Buying cost: <strong className="money font-medium text-foreground">{formatMoney(product.buyingPrice)}</strong></span></div>}</div>;
      })}<Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => append({ sku: "", quantity: 1, actualUnitSellingPrice: "0" })}><Plus /> Add product item</Button><FieldError errors={[form.formState.errors.items]} /></div></Section>
      <Section number={5} title="Adjustments" description="Customer delivery charge is manual and remains separate from the courier cost snapshot."><FieldGroup className="grid gap-4 sm:grid-cols-3"><Field><FieldLabel htmlFor="discount">Discount (BDT)</FieldLabel><Input id="discount" inputMode="decimal" {...form.register("discount")} /><FieldError errors={[form.formState.errors.discount]} /></Field><Field><FieldLabel htmlFor="deliveryCharged">Delivery charged (BDT)</FieldLabel><Input id="deliveryCharged" inputMode="decimal" {...form.register("deliveryCharged")} /><FieldError errors={[form.formState.errors.deliveryCharged]} /></Field><Field><FieldLabel htmlFor="refundAmount">Refund amount (BDT)</FieldLabel><Input id="refundAmount" inputMode="decimal" {...form.register("refundAmount")} /><FieldError errors={[form.formState.errors.refundAmount]} /></Field></FieldGroup></Section>
    </div>
    <aside className="panel p-4 xl:sticky xl:top-20 xl:col-span-4 xl:p-5"><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><CircleDollarSign className="size-4" /></span><div><h2 className="text-sm font-semibold">Live financial summary</h2><p className="text-xs text-muted-foreground">Integer-poisha calculation</p></div></div><dl className="mt-5 space-y-3">{[["Product subtotal", finance.productSubtotal], ["Product revenue", finance.productRevenue], ["Delivery charged", draft.deliveryCharged], ["Discount", -draft.discount], ["Order total", finance.orderTotal], ["Refund", -draft.refundAmount], ["Net revenue", finance.netRevenue], ["Recognized COGS", -finance.recognizedCogs], ["Courier snapshot", -draft.courierCostSnapshot], ["Contribution profit", finance.contributionProfit]].map(([label, amount], index) => <div key={String(label)} className={`flex items-center justify-between text-sm ${index === 4 || index === 9 ? "border-t pt-3 font-semibold" : ""}`}><dt className="text-muted-foreground">{label}</dt><dd className="money">{formatMoney(amount as number)}</dd></div>)}</dl><div className="mt-4 rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-700">Recognized product revenue, net revenue, and COGS remain zero until Order Status is <strong>Delivered</strong>.</div>{warnings.length > 0 ? <Alert className="mt-4 border-amber-200 bg-amber-50"><AlertTriangle className="text-amber-600" /><AlertTitle>Review {warnings.length} warning{warnings.length === 1 ? "" : "s"}</AlertTitle><AlertDescription><ul className="mt-1 list-disc space-y-1 pl-4">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></AlertDescription></Alert> : <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="size-4" /> No financial warnings</div>}<div className="mt-5 grid gap-2"><Button type="submit"><ShoppingBag /> Review order</Button><Button type="button" variant="outline" onClick={() => { if (!form.formState.isDirty || window.confirm("Discard unsaved changes?")) router.push("/orders"); }}>Cancel</Button></div></aside>
    <Dialog open={reviewOpen} onOpenChange={setReviewOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Review before save</DialogTitle><DialogDescription>Confirm the mock order and financial result. This does not write to Supabase.</DialogDescription></DialogHeader><div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Order</p><p className="mt-1 font-medium">{draft.orderNumber}</p></div><div><p className="text-xs text-muted-foreground">Customer</p><p className="mt-1 font-medium">{draft.customerName}</p></div><div><p className="text-xs text-muted-foreground">Items</p><p className="mt-1 font-medium">{draft.items.reduce((sum, item) => sum + item.quantity, 0)}</p></div><div><p className="text-xs text-muted-foreground">Order total</p><p className="money mt-1 font-semibold">{formatMoney(finance.orderTotal)}</p></div></div>{warnings.length > 0 && <p className="text-xs text-amber-700">This order has {warnings.length} non-blocking business warning{warnings.length === 1 ? "" : "s"}.</p>}<DialogFooter><Button type="button" variant="outline" onClick={() => setReviewOpen(false)}>Keep editing</Button><Button type="button" onClick={saveMock}><Save /> Save mock order</Button></DialogFooter></DialogContent></Dialog>
  </form>;
}
