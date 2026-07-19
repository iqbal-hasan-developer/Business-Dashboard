"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { updateProductBusinessAction } from "@/actions/manual-entry";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createSubmissionGuard, productBusinessSchema, type ProductBusinessValues } from "@/domain/manual-entry";
import type { Product } from "@/domain/types";

export function ProductBusinessForm({ product, enabled }: { product: Product; enabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [submissionGuard] = useState(createSubmissionGuard);
  const form = useForm<ProductBusinessValues>({
    resolver: zodResolver(productBusinessSchema),
    defaultValues: {
      productId: product.id,
      buyingPrice: String(product.buyingPrice / 100),
      reorderLevel: product.reorderLevel,
      skuOverride: product.sku,
      variation: product.variation,
      internalNotes: product.internalNotes ?? "",
    },
  });

  function save(values: ProductBusinessValues) {
    if (!enabled || !submissionGuard.tryLock()) return;
    setSaveError(null);
    startTransition(async () => {
      try {
        const result = await updateProductBusinessAction(values);
        if (!result.ok) {
          setSaveError(result.message);
          toast.error("Product was not updated", { description: result.message });
          return;
        }
        toast.success("Private product details updated", { description: `${product.name} will be used for future order snapshots.` });
        setOpen(false);
        router.refresh();
      } finally {
        submissionGuard.release();
      }
    });
  }

  return <>
    <Button type="button" variant="outline" size="sm" disabled={!enabled} onClick={() => setOpen(true)} title={enabled ? "Edit private product details" : "Persistent edits require connected owner/admin mode"}><Pencil /> Edit costs</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Edit private product details</DialogTitle><DialogDescription>Updates use the authenticated <code>set_product_buying_cost</code> RPC. Public name, selling price, and stock remain storefront-owned and read-only.</DialogDescription></DialogHeader>
        <form id={`product-business-${product.id}`} onSubmit={form.handleSubmit(save)}>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor={`buyingPrice-${product.id}`}>Buying price (BDT)</FieldLabel><Input id={`buyingPrice-${product.id}`} inputMode="decimal" {...form.register("buyingPrice")} /><FieldError errors={[form.formState.errors.buyingPrice]} /></Field>
            <Field><FieldLabel htmlFor={`reorderLevel-${product.id}`}>Reorder level</FieldLabel><Input id={`reorderLevel-${product.id}`} type="number" min={0} {...form.register("reorderLevel", { valueAsNumber: true })} /><FieldError errors={[form.formState.errors.reorderLevel]} /></Field>
            <Field><FieldLabel htmlFor={`skuOverride-${product.id}`}>Dashboard SKU</FieldLabel><Input id={`skuOverride-${product.id}`} {...form.register("skuOverride")} /><FieldError errors={[form.formState.errors.skuOverride]} /></Field>
            <Field><FieldLabel htmlFor={`variation-${product.id}`}>Variation</FieldLabel><Input id={`variation-${product.id}`} {...form.register("variation")} /><FieldError errors={[form.formState.errors.variation]} /></Field>
            <Field className="sm:col-span-2"><FieldLabel htmlFor={`internalNotes-${product.id}`}>Internal notes</FieldLabel><Textarea id={`internalNotes-${product.id}`} {...form.register("internalNotes")} /><FieldError errors={[form.formState.errors.internalNotes]} /></Field>
          </FieldGroup>
          {saveError && <Alert variant="destructive" className="mt-4"><AlertTriangle /><AlertTitle>Product was not updated</AlertTitle><AlertDescription>{saveError}</AlertDescription></Alert>}
        </form>
        <DialogFooter><Button type="button" variant="outline" disabled={isPending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form={`product-business-${product.id}`} disabled={isPending}><Save /> {isPending ? "Saving…" : "Save private details"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
