import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <div className="space-y-5" aria-label="Loading page"><div className="space-y-2"><Skeleton className="h-8 w-52" /><Skeleton className="h-4 w-80 max-w-full" /></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div><Skeleton className="h-80 rounded-xl" /></div>;
}
