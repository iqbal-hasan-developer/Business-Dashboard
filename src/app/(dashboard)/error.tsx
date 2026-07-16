"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <Empty className="panel min-h-96"><EmptyHeader><EmptyMedia variant="icon"><AlertTriangle /></EmptyMedia><EmptyTitle>We could not load this page</EmptyTitle><EmptyDescription>The secure data source returned an unexpected error. Your data has not been changed.</EmptyDescription></EmptyHeader><EmptyContent><Button onClick={reset}>Try again</Button></EmptyContent></Empty>;
}
