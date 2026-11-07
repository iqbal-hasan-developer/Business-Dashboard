import { Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { productName } from "@/lib/product";

type BrandLogoProps = { className?: string };

export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2 font-semibold tracking-tight text-slate-950", className)}>
      <Store aria-hidden="true" className="size-5 shrink-0 text-blue-700" />
      <span className="truncate">{productName}</span>
    </span>
  );
}
