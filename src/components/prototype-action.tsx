"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ComponentProps } from "react";

export function PrototypeAction({ message, ...props }: ComponentProps<typeof Button> & { message: string }) {
  return <Button {...props} onClick={() => toast.success(message, { description: "This interaction uses mock data in Phase 1." })} />;
}
