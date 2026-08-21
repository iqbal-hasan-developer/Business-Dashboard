"use client";

import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function CashSettlementsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <Alert variant="destructive" role="alert">
    <TriangleAlert />
    <AlertTitle>Cash and reconciliation data could not be loaded</AlertTitle>
    <AlertDescription className="flex flex-col items-start gap-3">
      <span>No balance or reconciliation value has been substituted. Retry the authenticated read.</span>
      <Button variant="outline" onClick={reset}>Retry</Button>
    </AlertDescription>
  </Alert>;
}
