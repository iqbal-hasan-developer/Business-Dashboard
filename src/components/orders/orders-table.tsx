"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { type ColumnDef, flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, type SortingState, useReactTable } from "@tanstack/react-table";
import { ArrowDownUp, ChevronLeft, ChevronRight, Eye, MoreHorizontal, Pencil, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { calculateOrderFinancials } from "@/domain/calculations";
import { formatMoney } from "@/domain/money";
import { ORDER_STATUSES, SALES_CHANNELS, SETTLEMENT_STATUSES, type Order } from "@/domain/types";

const campaignOptions = ["Always-on", "July Focus", "Journal Launch", "Planner Week", "Student Bundle"];

export function OrdersTable({ orders }: { orders: Order[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sorting, setSorting] = useState<SortingState>([{ id: "orderDate", desc: true }]);
  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === "all") params.delete(key); else params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }
  const filtered = useMemo(() => {
    const q = (searchParams.get("q") ?? "").toLowerCase();
    const rangeDays = Number((searchParams.get("date") ?? "14d").replace("d", ""));
    const cutoff = new Date("2026-07-14T00:00:00Z");
    cutoff.setDate(cutoff.getDate() - Math.max(rangeDays - 1, 0));
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    return orders.filter((order) => {
      const matchesSearch = !q || [order.orderNumber, order.customerName, order.externalReference ?? ""].some((value) => value.toLowerCase().includes(q));
      return matchesSearch && order.orderDate >= cutoffDate
        && (!searchParams.get("status") || order.status === searchParams.get("status"))
        && (!searchParams.get("settlement") || order.settlementStatus === searchParams.get("settlement"))
        && (!searchParams.get("channel") || order.channel === searchParams.get("channel"))
        && (!searchParams.get("campaign") || order.campaign === searchParams.get("campaign"));
    });
  }, [orders, searchParams]);
  const columns = useMemo<ColumnDef<Order>[]>(() => [
    { accessorKey: "orderNumber", header: "Order", cell: ({ row }) => <div><Link href={`/orders/${row.original.id}`} className="font-medium text-primary hover:underline">{row.original.orderNumber}</Link><p className="text-xs text-muted-foreground">{row.original.externalReference ?? "No external ref"}</p></div> },
    { accessorKey: "orderDate", header: ({ column }) => <button className="flex items-center gap-1" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>Date <ArrowDownUp className="size-3" /></button> },
    { accessorKey: "customerName", header: "Customer", cell: ({ row }) => <div>{row.original.customerName}<p className="text-xs text-muted-foreground">{row.original.customerLocation}</p></div> },
    { accessorKey: "channel", header: "Channel", cell: ({ row }) => <div>{row.original.channel}<p className="text-xs text-muted-foreground">{row.original.campaign}</p></div> },
    { accessorKey: "status", header: "Order status", cell: ({ row }) => <StatusBadge value={row.original.status} /> },
    { accessorKey: "settlementStatus", header: "Settlement", cell: ({ row }) => <StatusBadge value={row.original.settlementStatus} /> },
    { id: "total", header: () => <div className="text-right">Total</div>, cell: ({ row }) => <div className="money text-right font-medium">{formatMoney(calculateOrderFinancials(row.original).orderTotal)}</div> },
    { id: "actions", cell: ({ row }) => <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.orderNumber}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup><DropdownMenuItem render={<Link href={`/orders/${row.original.id}`} />}><Eye /> View details</DropdownMenuItem><DropdownMenuItem disabled><Pencil /> Editing not enabled</DropdownMenuItem></DropdownMenuGroup></DropdownMenuContent></DropdownMenu> },
  ], []);
  // TanStack Table intentionally returns non-memoizable callbacks; React Compiler skips this hook safely.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data: filtered, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize: 8 } } });
  const filterClass = "w-full bg-white sm:w-[170px]";
  const hasFilters = searchParams.size > 0;
  const selected = (key: string, fallback: string) => searchParams.get(key) ?? fallback;
  return <>
    <div className="panel mb-4 flex flex-col gap-2 p-3 lg:flex-row lg:flex-wrap lg:items-center">
      <InputGroup className="h-8 w-full bg-white lg:w-[260px]"><InputGroupAddon><Search className="size-4" /></InputGroupAddon><InputGroupInput placeholder="Search orders" value={searchParams.get("q") ?? ""} onChange={(event) => update("q", event.target.value)} /></InputGroup>
      <Select value={searchParams.get("status") ?? "all"} onValueChange={(value) => update("status", value as string)}><SelectTrigger className={filterClass}><SelectValue>{selected("status", "All order statuses")}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All order statuses</SelectItem>{ORDER_STATUSES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectGroup></SelectContent></Select>
      <Select value={searchParams.get("settlement") ?? "all"} onValueChange={(value) => update("settlement", value as string)}><SelectTrigger className={filterClass}><SelectValue>{selected("settlement", "All settlements")}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All settlements</SelectItem>{SETTLEMENT_STATUSES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectGroup></SelectContent></Select>
      <Select value={searchParams.get("channel") ?? "all"} onValueChange={(value) => update("channel", value as string)}><SelectTrigger className={filterClass}><SelectValue>{selected("channel", "All channels")}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All channels</SelectItem>{SALES_CHANNELS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectGroup></SelectContent></Select>
      <Select value={searchParams.get("campaign") ?? "all"} onValueChange={(value) => update("campaign", value as string)}><SelectTrigger className={filterClass}><SelectValue>{selected("campaign", "All campaigns")}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">All campaigns</SelectItem>{campaignOptions.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectGroup></SelectContent></Select>
      <Select value={searchParams.get("date") ?? "14d"} onValueChange={(value) => update("date", value as string)}><SelectTrigger className={filterClass}><SelectValue>{({ "7d": "Last 7 days", "14d": "Last 14 days", "30d": "Last 30 days" } as Record<string, string>)[selected("date", "14d")]}</SelectValue></SelectTrigger><SelectContent><SelectGroup><SelectItem value="7d">Last 7 days</SelectItem><SelectItem value="14d">Last 14 days</SelectItem><SelectItem value="30d">Last 30 days</SelectItem></SelectGroup></SelectContent></Select>
      {hasFilters && <Button variant="ghost" size="sm" onClick={() => router.replace(pathname)}><X /> Clear</Button>}
    </div>
    {filtered.length === 0 ? <Empty className="panel min-h-80"><EmptyHeader><EmptyMedia variant="icon"><Search /></EmptyMedia><EmptyTitle>No matching orders</EmptyTitle><EmptyDescription>Try changing or clearing the active filters.</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" onClick={() => router.replace(pathname)}>Clear filters</Button></EmptyContent></Empty> : <div className="panel overflow-hidden">
      <div className="hidden overflow-x-auto md:block"><Table><TableHeader>{table.getHeaderGroups().map((group) => <TableRow key={group.id}>{group.headers.map((header) => <TableHead key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader><TableBody>{table.getRowModel().rows.map((row) => <TableRow key={row.id}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}</TableBody></Table></div>
      <div className="divide-y md:hidden">{table.getRowModel().rows.map(({ original: order }) => <article key={order.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><Link href={`/orders/${order.id}`} className="text-sm font-semibold text-primary">{order.orderNumber}</Link><p className="mt-0.5 text-xs text-muted-foreground">{order.orderDate} · {order.channel}</p></div><p className="money font-semibold">{formatMoney(calculateOrderFinancials(order).orderTotal)}</p></div><p className="mt-3 text-sm font-medium">{order.customerName}</p><p className="mt-0.5 text-xs text-muted-foreground">{order.customerLocation} · {order.campaign}</p><div className="mt-3 flex flex-wrap gap-2"><StatusBadge value={order.status} /><StatusBadge value={order.settlementStatus} /></div></article>)}</div>
      <div className="flex items-center justify-between border-t px-4 py-3"><p className="text-xs text-muted-foreground">Showing {table.getRowModel().rows.length} of {filtered.length} orders</p><div className="flex items-center gap-1"><Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeft /></Button><span className="px-2 text-xs">{table.getState().pagination.pageIndex + 1} / {table.getPageCount()}</span><Button variant="outline" size="icon-sm" aria-label="Next page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRight /></Button></div></div>
    </div>}
  </>;
}
