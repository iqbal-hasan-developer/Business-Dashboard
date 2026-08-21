export default function CashSettlementsLoading() {
  return <div className="flex flex-col gap-4" role="status" aria-label="Loading cash and settlement data">
    <div className="h-20 animate-pulse rounded-2xl bg-muted" />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: 10 }, (_, index) => <div className="h-28 animate-pulse rounded-2xl bg-muted" key={index} />)}
    </div>
    <div className="h-72 animate-pulse rounded-2xl bg-muted" />
    <span className="sr-only">Loading cash balances, reconciliation, and settlements…</span>
  </div>;
}
