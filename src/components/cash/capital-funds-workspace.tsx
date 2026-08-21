"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BadgeDollarSign, Landmark, PackageOpen, Save, Scale, TriangleAlert, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { recordOwnerCapitalReturnAction, recordOwnerHeldObservationAction, recordOwnerHeldTransferAction, recordSteadfastObservationAction } from "@/actions/funding";
import { MetricCard } from "@/components/metric-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { OWNER_NAMES } from "@/domain/cash";
import { ownerCapitalReturnSchema, ownerHeldObservationSchema, ownerHeldTransferSchema, steadfastObservationSchema, type OwnerCapitalReturnValues, type OwnerHeldObservationValues, type OwnerHeldTransferValues, type SteadfastObservationValues } from "@/domain/funding";
import { formatMoney } from "@/domain/money";
import type { CapitalFundsSummary, CashAccountReconciliation, OwnerCapitalPosition, OwnerHeldBalance, SpendingCategorySummary, SteadfastReceivableReconciliation } from "@/domain/types";

function moneyInput(amount: number) {
  return `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;
}

export function CapitalFundsWorkspace({ summary, owners, capitalPositions, spendingCategories, steadfast, accounts, today, enabled }: {
  summary: CapitalFundsSummary;
  owners: OwnerHeldBalance[];
  capitalPositions: OwnerCapitalPosition[];
  spendingCategories: SpendingCategorySummary[];
  steadfast: SteadfastReceivableReconciliation;
  accounts: CashAccountReconciliation[];
  today: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [transferOpen, setTransferOpen] = useState(false);
  const [capitalReturnOpen, setCapitalReturnOpen] = useState(false);
  const [observingOwner, setObservingOwner] = useState<OwnerHeldBalance | null>(null);
  const [steadfastOpen, setSteadfastOpen] = useState(false);
  const businessAccounts = accounts.filter((account) => ["cash", "bkash", "nagad", "bank"].includes(account.accountKey));
  const transferForm = useForm<OwnerHeldTransferValues>({ resolver: zodResolver(ownerHeldTransferSchema), defaultValues: { transferDate: today, ownerLabel: "Nasim", businessAccountKey: businessAccounts[0]?.accountKey ?? "cash", amount: "0", reason: "", submissionKey: crypto.randomUUID() } });
  const capitalReturnForm = useForm<OwnerCapitalReturnValues>({ resolver: zodResolver(ownerCapitalReturnSchema), defaultValues: { returnDate: today, ownerLabel: "Nasim", amount: "0", reason: "", submissionKey: crypto.randomUUID() } });
  const ownerForm = useForm<OwnerHeldObservationValues>({ resolver: zodResolver(ownerHeldObservationSchema), defaultValues: { ownerLabel: "Nasim", observedOn: today, actualDue: "0", reason: "", submissionKey: crypto.randomUUID() } });
  const steadfastForm = useForm<SteadfastObservationValues>({ resolver: zodResolver(steadfastObservationSchema), defaultValues: { observedOn: today, actualReceivable: steadfast.actualReceivable === null ? "0" : moneyInput(steadfast.actualReceivable), reason: "", submissionKey: crypto.randomUUID() } });

  function postTransfer(values: OwnerHeldTransferValues) {
    startTransition(async () => {
      const result = await recordOwnerHeldTransferAction(values);
      if (!result.ok) { toast.error("Transfer was not posted", { description: result.message }); return; }
      toast.success(result.message); setTransferOpen(false); router.refresh();
    });
  }

  function postCapitalReturn(values: OwnerCapitalReturnValues) {
    startTransition(async () => {
      const result = await recordOwnerCapitalReturnAction(values);
      if (!result.ok) { toast.error("Capital return was not posted", { description: result.message }); return; }
      toast.success(result.message); setCapitalReturnOpen(false); router.refresh();
    });
  }

  function openOwnerObservation(owner: OwnerHeldBalance) {
    ownerForm.reset({ ownerLabel: owner.ownerLabel as OwnerHeldObservationValues["ownerLabel"], observedOn: today, actualDue: owner.actualDue === null ? "0" : moneyInput(owner.actualDue), reason: "", submissionKey: crypto.randomUUID() });
    setObservingOwner(owner);
  }

  function observeOwner(values: OwnerHeldObservationValues) {
    startTransition(async () => {
      const result = await recordOwnerHeldObservationAction(values);
      if (!result.ok) { toast.error("Control balance was not recorded", { description: result.message }); return; }
      toast.success(result.message); setObservingOwner(null); router.refresh();
    });
  }

  function observeSteadfast(values: SteadfastObservationValues) {
    startTransition(async () => {
      const result = await recordSteadfastObservationAction(values);
      if (!result.ok) { toast.error("Steadfast control was not recorded", { description: result.message }); return; }
      toast.success(result.message); setSteadfastOpen(false); router.refresh();
    });
  }

  return <section className="mb-4 space-y-4" aria-labelledby="capital-funds-heading">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h2 id="capital-funds-heading" className="text-lg font-semibold">Capital, Spending &amp; Available Funds</h2><p className="mt-1 text-sm text-muted-foreground">Actual cash, owner accountability, courier receivable, capital, and inventory are separate accounting positions.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!enabled} onClick={() => { capitalReturnForm.reset({ returnDate: today, ownerLabel: "Nasim", amount: "0", reason: "", submissionKey: crypto.randomUUID() }); setCapitalReturnOpen(true); }}><Landmark /> Return owner capital</Button><Button disabled={!enabled} onClick={() => { transferForm.reset({ transferDate: today, ownerLabel: "Nasim", businessAccountKey: businessAccounts[0]?.accountKey ?? "cash", amount: "0", reason: "", submissionKey: crypto.randomUUID() }); setTransferOpen(true); }}><Landmark /> Transfer business funds to owner</Button></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <MetricCard label="Total historical investment" value={formatMoney(summary.historicalOwnerInvestment)} detail="Lifetime owner contributions; investment is not revenue" icon={Landmark} tone="blue" />
      <MetricCard label="Total capital returned" value={formatMoney(summary.totalCapitalReturned)} detail="Owner distribution; not an expense" icon={Landmark} tone="violet" />
      <MetricCard label="Current contributed capital" value={formatMoney(summary.currentContributedCapital)} detail="Contributions less formal capital returns; not total equity" icon={Landmark} tone="blue" />
      <MetricCard label="Legacy ordinary owner withdrawals" value={formatMoney(summary.ownerWithdrawals)} detail="Historical-only classification; new transactions use the capital-first owner-money-taken workflow" icon={Landmark} tone="red" />
      <MetricCard label="Confirmed source-paid spending" value={formatMoney(summary.confirmedPaidSourceSpending)} detail="Historical account-unknown sources included once; no account guessed" icon={BadgeDollarSign} tone="amber" />
      <MetricCard label="Verified courier deductions" value={formatMoney(summary.verifiedCourierFulfilmentSpending)} detail="Independent active settlement evidence" icon={BadgeDollarSign} tone="violet" />
      <MetricCard label="Overall business cash spending" value={summary.totalBusinessCashSpending === null ? "Unavailable" : formatMoney(summary.totalBusinessCashSpending)} detail={summary.totalBusinessCashSpending === null ? "Unavailable while overlap or source review remains" : "Source-paid spending + non-overlapping courier deductions"} icon={BadgeDollarSign} tone="amber" />
      <MetricCard label="Actual business cash" value={summary.actualBusinessCash === null ? "Actuals needed" : formatMoney(summary.actualBusinessCash)} detail="Actual Cash + bKash + Nagad + Bank" icon={BadgeDollarSign} tone="emerald" />
      <MetricCard label="Due from owners" value={formatMoney(summary.actualDueFromOwners)} detail={`Owner-held ledger: ${formatMoney(summary.ledgerDueFromOwners)}`} icon={Scale} tone="violet" />
      <MetricCard label="Observed Steadfast balance" value={summary.confirmedSteadfastReceivable === null ? "Control needed" : formatMoney(summary.confirmedSteadfastReceivable)} detail={`Active order-derived: ${formatMoney(summary.calculatedSteadfastReceivable)}`} icon={WalletCards} tone="amber" />
      <MetricCard label="Total available / receivable funds" value={summary.totalAvailableReceivableFunds === null ? "Controls needed" : formatMoney(summary.totalAvailableReceivableFunds)} detail="Actual cash + Due from owners + confirmed Steadfast" icon={WalletCards} tone="emerald" />
      <MetricCard label="Known inventory value" value={formatMoney(summary.knownInventoryValue)} detail="Separate; excluded from available funds" icon={PackageOpen} tone="blue" />
      <MetricCard label="Unresolved reconciliation difference" value={summary.unresolvedReconciliationDifference === null ? "Controls needed" : formatMoney(summary.unresolvedReconciliationDifference)} detail="Control balances minus current ledgers" icon={TriangleAlert} tone="red" />
    </div>
    <Alert><TriangleAlert /><AlertTitle>Cash, spending, and profit are different measures</AlertTitle><AlertDescription>Owner-held business money is Due from Owner, not capital or spendable cash. “Historical account unknown” confirms that a source was paid from business funds without inventing Cash, bKash, Nagad, Bank, or owner attribution. Independently verified courier deductions are shown separately and included in overall spending only when no overlap is detected.</AlertDescription></Alert>
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="panel overflow-hidden"><div className="border-b p-4"><h3 className="font-semibold">Owner investment, capital returns, and Due</h3><p className="mt-1 text-sm text-muted-foreground">Lifetime investment is preserved; current contributed capital is never negative; excess money taken becomes Due from Owner.</p></div><Table><TableHeader><TableRow><TableHead>Owner</TableHead><TableHead className="text-right">Historical</TableHead><TableHead className="text-right">Returned</TableHead><TableHead className="text-right">Current</TableHead><TableHead className="text-right">Due</TableHead></TableRow></TableHeader><TableBody>{capitalPositions.map((position) => <TableRow key={position.ownerLabel}><TableCell className="font-medium">{position.ownerLabel}</TableCell><TableCell className="money text-right">{formatMoney(position.historicalInvestment, true)}</TableCell><TableCell className="money text-right">{formatMoney(position.capitalReturned, true)}</TableCell><TableCell className="money text-right font-semibold">{formatMoney(position.currentContributedCapital, true)}</TableCell><TableCell className="money text-right font-semibold">{formatMoney(position.dueFromOwner, true)}</TableCell></TableRow>)}</TableBody></Table></div>
      <div className="panel overflow-hidden"><div className="border-b p-4"><h3 className="font-semibold">Business spending by source category</h3><p className="mt-1 text-sm text-muted-foreground">Source-paid spending and independently verified deductions stay distinct. Combined totals fail closed when overlap needs review.</p></div><Table><TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Source paid</TableHead><TableHead className="text-right">Independent</TableHead><TableHead className="text-right">Combined</TableHead><TableHead className="text-right">Unresolved</TableHead></TableRow></TableHeader><TableBody>{spendingCategories.map((category) => <TableRow key={category.categoryKey}><TableCell className="font-medium">{category.categoryLabel}</TableCell><TableCell className="money text-right">{category.totalSpending === null ? "Unavailable" : formatMoney(category.totalSpending, true)}</TableCell><TableCell className="money text-right">{formatMoney(category.independentlyVerifiedSpending, true)}</TableCell><TableCell className="money text-right">{category.overlapReviewRequired ? "Overlap review" : category.combinedSpending === null ? "Unavailable" : formatMoney(category.combinedSpending, true)}</TableCell><TableCell className="text-right">{category.unresolvedSourceCount}</TableCell></TableRow>)}</TableBody></Table></div>
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="panel overflow-hidden"><div className="border-b p-4"><h3 className="font-semibold">Due from owners reconciliation</h3></div><Table><TableHeader><TableRow><TableHead>Owner</TableHead><TableHead className="text-right">Ledger</TableHead><TableHead className="text-right">Actual</TableHead><TableHead className="text-right">Difference</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{owners.map((owner) => <TableRow key={owner.ownerLabel}><TableCell className="font-medium">{owner.ownerLabel}</TableCell><TableCell className="money text-right">{formatMoney(owner.ledgerDue, true)}</TableCell><TableCell className="money text-right">{owner.actualDue === null ? "Not entered" : formatMoney(owner.actualDue, true)}</TableCell><TableCell className="money text-right">{owner.difference === null ? "Unavailable" : formatMoney(owner.difference, true)}</TableCell><TableCell className="text-right"><Button size="sm" variant="outline" disabled={!enabled} onClick={() => openOwnerObservation(owner)}>Record actual</Button></TableCell></TableRow>)}</TableBody></Table></div>
      <div className="panel overflow-hidden"><div className="border-b p-4"><h3 className="font-semibold">Steadfast receivable control</h3><p className="mt-1 text-sm text-muted-foreground">The observation is reconciled as of its business date; later orders remain visible separately.</p></div><div className="grid grid-cols-2 gap-3 p-4 text-sm"><span>Gross eligible as of observation</span><span className="money text-right">{formatMoney(steadfast.grossEligibleReceivable, true)}</span><span>Reversed-batch pair excluded</span><span className="money text-right">-{formatMoney(steadfast.reversedBatchReceivable, true)}</span><span>Calculated as of observation</span><span className="money text-right font-semibold">{formatMoney(steadfast.calculatedReceivable, true)}</span><span>User-observed control balance</span><span className="money text-right">{steadfast.actualReceivable === null ? "Not entered" : formatMoney(steadfast.actualReceivable, true)}</span><span>Historic control residual</span><span className="money text-right font-semibold text-destructive">{steadfast.difference === null ? "Unavailable" : formatMoney(steadfast.difference, true)}</span><span>Current gross eligible</span><span className="money text-right">{formatMoney(steadfast.currentGrossEligibleReceivable, true)}</span><span>Current calculated receivable</span><span className="money text-right font-semibold">{formatMoney(steadfast.currentCalculatedReceivable, true)}</span><span>Post-observation receivable</span><span className="money text-right">{formatMoney(steadfast.postObservationReceivable, true)}</span><span>Observed</span><span className="text-right">{steadfast.observedOn ?? "—"}</span></div><div className="border-t p-4 text-right"><Button size="sm" variant="outline" disabled={!enabled} onClick={() => { steadfastForm.reset({ observedOn: today, actualReceivable: steadfast.actualReceivable === null ? "0" : moneyInput(steadfast.actualReceivable), reason: "", submissionKey: crypto.randomUUID() }); setSteadfastOpen(true); }}>Record actual</Button></div></div>
    </div>
    <div className="panel overflow-hidden"><div className="border-b p-4"><h3 className="font-semibold">Steadfast order composition</h3><p className="mt-1 text-sm text-muted-foreground">The observed control remains separate; no ৳3 transaction has been invented. Orders after the observation date are current receivables, not part of the historic residual.</p></div><Table><TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Gross COD</TableHead><TableHead>Status in reconciliation</TableHead></TableRow></TableHeader><TableBody>{steadfast.components.map((component) => <TableRow key={component.orderId}><TableCell className="font-medium">{component.orderNumber}</TableCell><TableCell>{component.orderDate}</TableCell><TableCell className="money text-right">{formatMoney(component.grossCodReceivable, true)}</TableCell><TableCell>{component.excludedReversedBatch ? <span className="text-destructive">Excluded: reversed batch ({component.reversedOn})</span> : steadfast.observedOn && component.orderDate > steadfast.observedOn ? "Current — after observation" : "Active as of observation"}</TableCell></TableRow>)}</TableBody></Table></div>

    <Dialog open={transferOpen} onOpenChange={(open) => { if (!pending) setTransferOpen(open); }}><DialogContent><DialogHeader><DialogTitle>Transfer business funds to an owner?</DialogTitle><DialogDescription>This reduces the selected business cash account and increases Due from Owner. It is not an owner withdrawal or owner investment.</DialogDescription></DialogHeader><form id="owner-held-transfer" className="grid gap-4 sm:grid-cols-2" onSubmit={transferForm.handleSubmit(postTransfer)}><Field><FieldLabel>Transfer date</FieldLabel><Input type="date" {...transferForm.register("transferDate")} /></Field><Field><FieldLabel>Accountable owner</FieldLabel><Controller control={transferForm.control} name="ownerLabel" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{OWNER_NAMES.map((owner) => <SelectItem key={owner} value={owner}>{owner}</SelectItem>)}</SelectContent></Select>} /></Field><Field><FieldLabel>Source business account</FieldLabel><Controller control={transferForm.control} name="businessAccountKey" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{businessAccounts.map((account) => <SelectItem key={account.accountKey} value={account.accountKey}>{account.accountLabel}</SelectItem>)}</SelectContent></Select>} /></Field><Field><FieldLabel>Amount (BDT)</FieldLabel><Input inputMode="decimal" {...transferForm.register("amount")} /><FieldError errors={[transferForm.formState.errors.amount]} /></Field><Field className="sm:col-span-2"><FieldLabel>Evidence / reason</FieldLabel><Textarea {...transferForm.register("reason")} /><FieldError errors={[transferForm.formState.errors.reason]} /></Field><Alert className="sm:col-span-2"><TriangleAlert /><AlertTitle>Financially significant action</AlertTitle><AlertDescription>Confirm the money genuinely left the selected business account and remains accountable to the selected owner.</AlertDescription></Alert></form><DialogFooter><Button variant="outline" disabled={pending} onClick={() => setTransferOpen(false)}>Cancel</Button><Button type="submit" form="owner-held-transfer" disabled={pending}><Save />{pending ? "Posting…" : "Confirm transfer"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={capitalReturnOpen} onOpenChange={(open) => { if (!pending) setCapitalReturnOpen(open); }}><DialogContent><DialogHeader><DialogTitle>Return owner capital from held business funds?</DialogTitle><DialogDescription>This reduces both current contributed capital and Due from Owner. It does not change cash, revenue, COGS, expenses, or profit.</DialogDescription></DialogHeader><form id="owner-capital-return" className="grid gap-4 sm:grid-cols-2" onSubmit={capitalReturnForm.handleSubmit(postCapitalReturn)}><Field><FieldLabel>Return date</FieldLabel><Input type="date" {...capitalReturnForm.register("returnDate")} /></Field><Field><FieldLabel>Owner</FieldLabel><Controller control={capitalReturnForm.control} name="ownerLabel" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{OWNER_NAMES.map((owner) => <SelectItem key={owner} value={owner}>{owner}</SelectItem>)}</SelectContent></Select>} /></Field><Field><FieldLabel>Amount (BDT)</FieldLabel><Input inputMode="decimal" {...capitalReturnForm.register("amount")} /><FieldError errors={[capitalReturnForm.formState.errors.amount]} /></Field><Field className="sm:col-span-2"><FieldLabel>Approval / reason</FieldLabel><Textarea {...capitalReturnForm.register("reason")} /><FieldError errors={[capitalReturnForm.formState.errors.reason]} /></Field><Alert className="sm:col-span-2"><TriangleAlert /><AlertTitle>Capital distribution</AlertTitle><AlertDescription>The owner must have enough current contributed capital and enough business funds held. The transaction is append-only and reversible.</AlertDescription></Alert></form><DialogFooter><Button variant="outline" disabled={pending} onClick={() => setCapitalReturnOpen(false)}>Cancel</Button><Button type="submit" form="owner-capital-return" disabled={pending}><Save />{pending ? "Posting…" : "Confirm capital return"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(observingOwner)} onOpenChange={(open) => { if (!open && !pending) setObservingOwner(null); }}>{observingOwner ? <DialogContent><DialogHeader><DialogTitle>Record actual Due from {observingOwner.ownerLabel}</DialogTitle><DialogDescription>This control observation does not post or adjust the owner-held ledger.</DialogDescription></DialogHeader><form id="owner-held-observation" className="grid gap-4" onSubmit={ownerForm.handleSubmit(observeOwner)}><Field><FieldLabel>Observed date</FieldLabel><Input type="date" {...ownerForm.register("observedOn")} /></Field><Field><FieldLabel>Actual due (BDT)</FieldLabel><Input inputMode="decimal" {...ownerForm.register("actualDue")} /><FieldError errors={[ownerForm.formState.errors.actualDue]} /></Field><Field><FieldLabel>Verification reason</FieldLabel><Textarea {...ownerForm.register("reason")} /><FieldError errors={[ownerForm.formState.errors.reason]} /></Field></form><DialogFooter><Button variant="outline" disabled={pending} onClick={() => setObservingOwner(null)}>Cancel</Button><Button type="submit" form="owner-held-observation" disabled={pending}><Save />{pending ? "Recording…" : "Record control"}</Button></DialogFooter></DialogContent> : null}</Dialog>

    <Dialog open={steadfastOpen} onOpenChange={(open) => { if (!pending) setSteadfastOpen(open); }}><DialogContent><DialogHeader><DialogTitle>Record actual Steadfast receivable</DialogTitle><DialogDescription>This control observation does not change Delivered orders, allocations, or settlement batches.</DialogDescription></DialogHeader><form id="steadfast-observation" className="grid gap-4" onSubmit={steadfastForm.handleSubmit(observeSteadfast)}><Field><FieldLabel>Observed date</FieldLabel><Input type="date" {...steadfastForm.register("observedOn")} /></Field><Field><FieldLabel>Actual collectible amount (BDT)</FieldLabel><Input inputMode="decimal" {...steadfastForm.register("actualReceivable")} /><FieldError errors={[steadfastForm.formState.errors.actualReceivable]} /></Field><Field><FieldLabel>Verification reason</FieldLabel><Textarea {...steadfastForm.register("reason")} /><FieldError errors={[steadfastForm.formState.errors.reason]} /></Field></form><DialogFooter><Button variant="outline" disabled={pending} onClick={() => setSteadfastOpen(false)}>Cancel</Button><Button type="submit" form="steadfast-observation" disabled={pending}><Save />{pending ? "Recording…" : "Record control"}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
