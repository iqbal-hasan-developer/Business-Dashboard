import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function OrderNotFound() {
  return <Empty className="panel min-h-96"><EmptyHeader><EmptyMedia variant="icon"><SearchX /></EmptyMedia><EmptyTitle>Order not found</EmptyTitle><EmptyDescription>This mock order does not exist or is no longer available.</EmptyDescription></EmptyHeader><EmptyContent><Button render={<Link href="/orders" />}>Back to orders</Button></EmptyContent></Empty>;
}
