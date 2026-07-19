"use client";

import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Pencil, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { saveProductAction } from "@/actions/manual-entry";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createSubmissionGuard, productCatalogSchema, type ProductCatalogValues } from "@/domain/manual-entry";
import type { Product, ProductCategory } from "@/domain/types";

function values(product?: Product): ProductCatalogValues {
  return { productId: product?.id, name: product?.name ?? "", slug: product?.slug ?? "",
    publicSku: product?.publicSku ?? product?.sku ?? "", sellingPrice: product ? String(product.sellingPrice / 100) : "0",
    isActive: product?.isActive ?? true, categoryId: product?.categoryId ?? null,
    buyingPrice: product ? String(product.buyingPrice / 100) : "0", reorderLevel: product?.reorderLevel ?? 0,
    dashboardSku: product?.sku ?? "", variation: product?.variation === "Default" ? "" : product?.variation ?? "",
    internalNotes: product?.internalNotes ?? "" };
}

export function ProductBusinessForm({ product, categories, enabled }: { product?: Product; categories: ProductCategory[]; enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [submissionGuard] = useState(createSubmissionGuard);
  const form = useForm<ProductCatalogValues>({ resolver: zodResolver(productCatalogSchema), defaultValues: values(product) });
  function save(input: ProductCatalogValues) {
    if (!enabled || !submissionGuard.tryLock()) return;
    setSaveError(null);
    startTransition(async () => { try {
      const result = await saveProductAction(input);
      if (!result.ok) { setSaveError(result.message); toast.error("Product was not saved", { description: result.message }); return; }
      toast.success(product ? "Product updated" : "Product created", { description: "Catalog and private costs were saved atomically." });
      setOpen(false);
    } finally { submissionGuard.release(); } });
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <Button type="button" size="sm" variant={product ? "outline" : "default"} disabled={!enabled} onClick={() => setOpen(true)} title={enabled ? (product ? "Edit product" : "Add product") : "Persistent product writes require connected owner/admin mode"}>{product ? <Pencil /> : <Plus />}{product ? "Edit" : "Add product"}</Button>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{product ? "Edit product" : "Add product"}</DialogTitle><DialogDescription>Catalog and private cost fields save together. Stock is fixed at zero on creation and is never edited here.</DialogDescription></DialogHeader>
      <form id={`product-catalog-${product?.id ?? "new"}`} onSubmit={form.handleSubmit(save)} className="grid gap-4 sm:grid-cols-2">
        <Field><FieldLabel>Name</FieldLabel><Input {...form.register("name")} /><FieldError errors={[form.formState.errors.name]} /></Field>
        <Field><FieldLabel>URL slug</FieldLabel><Input placeholder="daily-planner" {...form.register("slug")} /><FieldError errors={[form.formState.errors.slug]} /></Field>
        <Field><FieldLabel>Public SKU</FieldLabel><Input {...form.register("publicSku")} /><FieldError errors={[form.formState.errors.publicSku]} /></Field>
        <Field><FieldLabel>Selling price (BDT)</FieldLabel><Input inputMode="decimal" {...form.register("sellingPrice")} /><FieldError errors={[form.formState.errors.sellingPrice]} /></Field>
        <Field><FieldLabel>Category</FieldLabel><Controller control={form.control} name="categoryId" render={({ field }) => <Select value={field.value ?? "none"} onValueChange={(next) => field.onChange(next === "none" ? null : next)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="none">Uncategorised</SelectItem>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}{category.isActive ? "" : " (inactive)"}</SelectItem>)}</SelectGroup></SelectContent></Select>} /><FieldError errors={[form.formState.errors.categoryId]} /></Field>
        <Field><FieldLabel>Buying price (BDT)</FieldLabel><Input inputMode="decimal" {...form.register("buyingPrice")} /><FieldError errors={[form.formState.errors.buyingPrice]} /></Field>
        <Field><FieldLabel>Dashboard SKU</FieldLabel><Input {...form.register("dashboardSku")} /><FieldError errors={[form.formState.errors.dashboardSku]} /></Field>
        <Field><FieldLabel>Variation</FieldLabel><Input {...form.register("variation")} /><FieldError errors={[form.formState.errors.variation]} /></Field>
        <Field><FieldLabel>Reorder level (informational)</FieldLabel><Input type="number" min={0} {...form.register("reorderLevel", { valueAsNumber: true })} /><FieldError errors={[form.formState.errors.reorderLevel]} /></Field>
        <Field className="justify-end"><div className="flex h-9 items-center gap-2"><Controller control={form.control} name="isActive" render={({ field }) => <Checkbox id={`active-${product?.id ?? "new"}`} checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />} /><FieldLabel htmlFor={`active-${product?.id ?? "new"}`}>Active storefront product</FieldLabel></div></Field>
        <Field className="sm:col-span-2"><FieldLabel>Internal notes</FieldLabel><Textarea {...form.register("internalNotes")} /><FieldError errors={[form.formState.errors.internalNotes]} /></Field>
      </form>
      {saveError && <Alert variant="destructive"><AlertTriangle /><AlertTitle>Product was not saved</AlertTitle><AlertDescription>{saveError}</AlertDescription></Alert>}
      <DialogFooter><Button type="button" variant="outline" disabled={isPending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form={`product-catalog-${product?.id ?? "new"}`} disabled={isPending || !enabled}><Save />{isPending ? "Saving…" : "Save product"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
