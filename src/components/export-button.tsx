import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExportButton({ dataset, enabled }: { dataset: "orders" | "products" | "financial-report"; enabled: boolean }) {
  if (!enabled) return <Button disabled variant="outline" size="sm"><Download /> Owner export only</Button>;
  return <Button variant="outline" size="sm" render={<a href={`/exports/${dataset}`} download />}><Download /> Export CSV</Button>;
}
