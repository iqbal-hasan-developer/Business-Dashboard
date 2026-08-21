"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleHelp, Landmark, Pencil, RotateCcw, Save, Trash2, WalletCards } from "lucide-react";
import { toast } from "sonner";
import {
  deleteOwnerCapitalMovementAction,
  editOwnerCapitalMovementAction,
  recordCashMovementAction,
  recordOwnerMoneyTakenAction,
  reverseCashMovementAction,
  reverseOwnerMoneyTakenAction,
} from "@/actions/cash";
import {
  CASH_TRANSACTION_LABELS,
  OWNER_NAMES,
  cashDirection,
  cashMovementSchema,
  calculateOwnerMoneyTaken,
  ownerMoneyTakenSchema,
  ownerCapitalEditSchema,
  type CashMovementValues,
  type OwnerMoneyTakenValues,
  type OwnerCapitalEditValues,
} from "@/domain/cash";
import { formatMoney, parseMoney } from "@/domain/money";
import type { BusinessSettings, CashLedgerEntry, CashWorkspaceData } from "@/domain/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function submissionKey() {
  return crypto.randomUUID();
}

function cashDefaults(date: string): CashMovementValues {
  return {
    movementDate: date,
    transactionType: "owner_investment",
    accountKey: "cash",
    amount: "0",
    description: "",
    reference: "",
    ownerLabel: "",
    submissionKey: submissionKey(),
  };
}

function moneyInput(amount: number) {
  const whole = Math.floor(amount / 100);
  const fraction = String(amount % 100).padStart(2, "0");
  return fraction === "00" ? String(whole) : `${whole}.${fraction}`;
}

function capitalEditValues(entry: CashLedgerEntry): OwnerCapitalEditValues {
  return {
    movementId: entry.id,
    movementDate: entry.movementDate,
    transactionType: "owner_investment",
    accountKey: entry.accountKey,
    amount: moneyInput(entry.amount),
    description: entry.description,
    reference: entry.reference,
    ownerLabel: entry.ownerLabel,
    correctionReason: "",
    submissionKey: submissionKey(),
  };
}

function isOwnerCapitalEntry(entry: CashLedgerEntry) {
  return (entry.transactionType === "owner_investment" || entry.transactionType === "owner_withdrawal")
    && !entry.isReversed
    && entry.reversalOfId === null;
}

function reversibleOperatingEntry(entry: CashLedgerEntry) {
  return (entry.transactionType === "operating_inflow" || entry.transactionType === "operating_outflow")
    && !entry.isReversed
    && entry.reversalOfId === null;
}

function Explanation({ children }: { children: ReactNode }) {
  return <Tooltip><TooltipTrigger aria-label="Accounting explanation" className="inline-flex rounded-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><CircleHelp className="size-4" /></TooltipTrigger><TooltipContent>{children}</TooltipContent></Tooltip>;
}

export function CashWorkspace({ data, settings, today, enabled, reversalEnabled }: {
  data: CashWorkspaceData;
  settings: BusinessSettings;
  today: string;
  enabled: boolean;
  reversalEnabled: boolean;
}) {
  const router = useRouter();
  const [entryOpen, setEntryOpen] = useState(false);
  const [ownerTakenOpen, setOwnerTakenOpen] = useState(false);
  const [ownerTakenReview, setOwnerTakenReview] = useState<OwnerMoneyTakenValues | null>(null);
  const [reversingOwnerTakenId, setReversingOwnerTakenId] = useState<string | null>(null);
  const [ownerTakenReversalReason, setOwnerTakenReversalReason] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [reviewValues, setReviewValues] = useState<CashMovementValues | null>(null);
  const [pending, startTransition] = useTransition();
  const [reversalEntry, setReversalEntry] = useState<CashLedgerEntry | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [editingCapitalEntry, setEditingCapitalEntry] = useState<CashLedgerEntry | null>(null);
  const [deletingCapitalEntry, setDeletingCapitalEntry] = useState<CashLedgerEntry | null>(null);
  const [deletionReason, setDeletionReason] = useState("");
  const [deletionKey, setDeletionKey] = useState("");
  const accountLabels = useMemo(
    () => new Map(settings.cashAccounts.map((account) => [account.key, account.label])),
    [settings.cashAccounts],
  );
  const activeCapitalEntries = useMemo(() => data.entries.filter(isOwnerCapitalEntry), [data.entries]);
  const form = useForm<CashMovementValues>({ resolver: zodResolver(cashMovementSchema), defaultValues: cashDefaults(today) });
  const editForm = useForm<OwnerCapitalEditValues>({
    resolver: zodResolver(ownerCapitalEditSchema),
    defaultValues: {
      ...cashDefaults(today),
      movementId: "00000000-0000-4000-8000-000000000001",
      transactionType: "owner_investment",
      correctionReason: "",
    },
  });
  const transactionType = useWatch({ control: form.control, name: "transactionType" });
  const ownerTakenForm = useForm<OwnerMoneyTakenValues>({ resolver: zodResolver(ownerMoneyTakenSchema), defaultValues: { eventDate: today, ownerLabel: "Nasim", amount: "0", sourceAccountKey: "cash", description: "", reference: "", submissionKey: submissionKey() } });
  const candidate = reviewValues ?? form.getValues();
  const ownerTakenOwner = useWatch({ control: ownerTakenForm.control, name: "ownerLabel" });
  const ownerTakenAmount = useWatch({ control: ownerTakenForm.control, name: "amount" });
  const previewPosition = data.ownerCapitalPositions.find((position) => position.ownerLabel === ownerTakenOwner);
  const parsedOwnerTakenAmount = (() => { try { return parseMoney(ownerTakenAmount || "0"); } catch { return 0; } })();
  const ownerTakenPreview = calculateOwnerMoneyTaken(parsedOwnerTakenAmount, previewPosition?.currentContributedCapital ?? 0, previewPosition?.dueFromOwner ?? 0);

  function refreshCash() {
    router.refresh();
  }

  function openCapitalEdit(entry: CashLedgerEntry) {
    editForm.reset(capitalEditValues(entry));
    setEditingCapitalEntry(entry);
  }

  function openCapitalDelete(entry: CashLedgerEntry) {
    setDeletionReason("");
    setDeletionKey(submissionKey());
    setDeletingCapitalEntry(entry);
  }

  function confirmEntry() {
    if (!reviewValues) return;
    startTransition(async () => {
      const result = await recordCashMovementAction(reviewValues);
      if (!result.ok) {
        toast.error("Cash entry was not recorded", { description: result.message });
        return;
      }
      toast.success("Cash movement recorded", { description: "The append-only ledger and account balances were updated." });
      form.reset(cashDefaults(today));
      setReviewValues(null);
      setReviewing(false);
      setEntryOpen(false);
      refreshCash();
    });
  }

  function confirmReversal() {
    if (!reversalEntry || reversalReason.trim().length < 3) return;
    const values = { movementId: reversalEntry.id, reason: reversalReason, submissionKey: submissionKey() };
    startTransition(async () => {
      const result = await reverseCashMovementAction(values);
      if (!result.ok) {
        toast.error("Cash entry was not reversed", { description: result.message });
        return;
      }
      toast.success("Reversal appended", { description: "The original cash entry remains unchanged for audit history." });
      setReversalEntry(null);
      setReversalReason("");
      refreshCash();
    });
  }

  function saveCapitalEdit(values: OwnerCapitalEditValues) {
    startTransition(async () => {
      const result = await editOwnerCapitalMovementAction(values);
      if (!result.ok) {
        toast.error("Owner-capital record was not changed", { description: result.message });
        return;
      }
      toast.success("Owner-capital record updated", {
        description: "The original was reversed and the corrected replacement is now active.",
      });
      setEditingCapitalEntry(null);
      refreshCash();
    });
  }

  function confirmCapitalDelete() {
    if (!deletingCapitalEntry || deletionReason.trim().length < 3 || !deletionKey) return;
    const values = { movementId: deletingCapitalEntry.id, reason: deletionReason, submissionKey: deletionKey };
    startTransition(async () => {
      const result = await deleteOwnerCapitalMovementAction(values);
      if (!result.ok) {
        toast.error("Owner-capital record was not deleted", { description: result.message });
        return;
      }
      toast.success("Owner-capital record deleted", {
        description: "It was removed from active totals and preserved in audit history.",
      });
      setDeletingCapitalEntry(null);
      setDeletionReason("");
      setDeletionKey("");
      refreshCash();
    });
  }

  function confirmOwnerMoneyTaken() {
    if (!ownerTakenReview) return;
    startTransition(async () => {
      const result = await recordOwnerMoneyTakenAction(ownerTakenReview);
      if (!result.ok) { toast.error("Owner money taken was not posted", { description: result.message }); return; }
      toast.success(result.message); setOwnerTakenReview(null); setOwnerTakenOpen(false); router.refresh();
    });
  }

  function confirmOwnerMoneyTakenReversal() {
    if (!reversingOwnerTakenId || ownerTakenReversalReason.trim().length < 3) return;
    startTransition(async () => {
      const result = await reverseOwnerMoneyTakenAction({ ownerMoneyTakenId: reversingOwnerTakenId, reversedOn: today, reason: ownerTakenReversalReason, submissionKey: submissionKey() });
      if (!result.ok) { toast.error("Owner money taken was not reversed", { description: result.message }); return; }
      toast.success(result.message); setReversingOwnerTakenId(null); setOwnerTakenReversalReason(""); router.refresh();
    });
  }

  return <div className="mt-5 flex flex-col gap-4">
    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Cash account balances</h2>
          <p className="mt-1 text-sm text-muted-foreground">Ledger history and observed current cash stay separate until legacy differences are resolved.</p>
        </div>
        <Button size="sm" disabled={!enabled} onClick={() => setEntryOpen(true)} title={enabled ? "Record cash movement" : "Connected owner/admin mode required"}>
          <WalletCards data-icon="inline-start" /> Record cash movement
        </Button>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">
        {data.accountReconciliation.map((account) => <div className="rounded-xl border p-4" key={account.accountKey}>
          <p className="font-medium">{account.accountLabel}</p>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="flex items-center gap-1 text-muted-foreground">Ledger-calculated <Explanation>Append-only ledger balance; it is not current available cash when a control difference remains.</Explanation></dt><dd className="money">{formatMoney(account.balance, true)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Observed actual</dt><dd className="money font-semibold">{account.actualBalance === null ? "Not entered" : formatMoney(account.actualBalance, true)}</dd></div>
            <div className="flex justify-between gap-3 border-t pt-2"><dt className="text-muted-foreground">Difference</dt><dd className={`money ${account.difference ? "text-destructive" : ""}`}>{account.difference === null ? "Unavailable" : formatMoney(account.difference, true)}</dd></div>
          </dl>
          {account.observedOn ? <p className="mt-3 text-xs text-muted-foreground">Observed {account.observedOn}</p> : null}
        </div>)}
      </div>
    </section>

    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <Landmark className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <h2 className="font-semibold">Owner position by person</h2>
            <p className="mt-1 text-sm text-muted-foreground">Historical investment, returned capital, and Due from Owner come from linked append-only events.</p>
          </div>
        </div>
        <Button className="w-full sm:ml-auto sm:w-auto" size="sm" disabled={!enabled} onClick={() => { ownerTakenForm.reset({ eventDate: today, ownerLabel: "Nasim", amount: "0", sourceAccountKey: "cash", description: "", reference: "", submissionKey: submissionKey() }); setOwnerTakenReview(null); setOwnerTakenOpen(true); }}><WalletCards /> Record money taken by owner</Button>
      </div>
      <div className="grid gap-3 p-5 md:grid-cols-3">
        {data.ownerCapitalPositions.map((owner) => <article className="rounded-xl border p-4" key={owner.ownerLabel}>
          <h3 className="font-semibold text-slate-950">{owner.ownerLabel}</h3>
          <dl className="mt-4 flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between gap-3"><dt className="flex items-center gap-1 text-muted-foreground">Historical investment <Explanation>Total genuine investment recorded for this owner; later capital returns do not rewrite it.</Explanation></dt><dd className="money font-medium">{formatMoney(owner.historicalInvestment, true)}</dd></div>
            <div className="flex items-center justify-between gap-3"><dt className="flex items-center gap-1 text-muted-foreground">Capital returned <Explanation>Capital returned reduces contributed capital but does not reduce profit.</Explanation></dt><dd className="money font-medium">{formatMoney(owner.capitalReturned, true)}</dd></div>
            <div className="flex items-center justify-between gap-3"><dt className="flex items-center gap-1 text-muted-foreground">Current contributed capital <Explanation>Historical investment less capital returned; this balance never goes below zero.</Explanation></dt><dd className="money font-semibold text-primary">{formatMoney(owner.currentContributedCapital, true)}</dd></div>
            <div className="flex items-center justify-between gap-3 border-t pt-3"><dt className="flex items-center gap-1 font-medium">Due from Owner <Explanation>Money the owner owes the business. Excess money taken beyond available capital increases this balance.</Explanation></dt><dd className="money font-semibold text-destructive">{formatMoney(owner.dueFromOwner, true)}</dd></div>
          </dl>
        </article>)}
      </div>
      <section className="border-t" aria-labelledby="owner-money-taken-history-heading">
        <div className="px-5 py-4">
          <h3 id="owner-money-taken-history-heading" className="font-medium">Owner money taken history</h3>
          <p className="mt-1 text-sm text-muted-foreground">Lifetime classifications include legacy owner-held funds and the current atomic workflow without linked duplicates.</p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Owner</TableHead><TableHead>Source</TableHead><TableHead className="text-right">Amount taken</TableHead><TableHead className="text-right">Capital return</TableHead><TableHead className="text-right">Due increase</TableHead><TableHead>Status / reference</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
            <TableBody>{data.ownerMoneyTakenEntries.length ? data.ownerMoneyTakenEntries.map((entry) => <TableRow key={entry.id} className={entry.eventType === "reversal" || entry.isReversed ? "opacity-60" : undefined}>
              <TableCell className="whitespace-nowrap">{entry.eventDate}</TableCell><TableCell className="font-medium">{entry.ownerLabel}</TableCell><TableCell>{entry.sourceAccountLabel}</TableCell>
              <TableCell className="money text-right">{formatMoney(entry.amount, true)}</TableCell><TableCell className="money text-right">{formatMoney(entry.capitalReturnAmount, true)}</TableCell><TableCell className="money text-right">{formatMoney(entry.excessDueAmount, true)}</TableCell>
              <TableCell className="min-w-48"><Badge variant="outline">{entry.eventType === "reversal" ? "Reversal" : entry.isReversed ? "Reversed" : "Active"}</Badge>{entry.recordSource !== "unified" ? <Badge className="ml-2" variant="secondary">Legacy classification</Badge> : null}{entry.reference ? <p className="mt-1 text-xs text-muted-foreground">Ref: {entry.reference}</p> : null}<p className="mt-1 text-xs text-muted-foreground">{entry.description}</p></TableCell>
              <TableCell className="text-right">{entry.canReverse ? <Button size="sm" variant="ghost" disabled={!reversalEnabled} onClick={() => { setOwnerTakenReversalReason(""); setReversingOwnerTakenId(entry.id); }}><RotateCcw /> Reverse</Button> : <span className="text-muted-foreground">—</span>}</TableCell>
            </TableRow>) : <TableRow><TableCell colSpan={8}>
              <Empty className="min-h-32">
                <EmptyHeader><EmptyMedia variant="icon"><Landmark /></EmptyMedia><EmptyTitle>No owner money taken records</EmptyTitle><EmptyDescription>Lifetime owner distributions will show their capital and Due split here.</EmptyDescription></EmptyHeader>
              </Empty>
            </TableCell></TableRow>}</TableBody>
          </Table>
        </div>
      </section>
      <div className="border-t p-5">
        <h3 className="font-medium">Genuine owner-investment records</h3>
        <p className="mt-1 text-sm text-muted-foreground">A future investment remains separate from Due from Owner unless an explicit repayment or offset workflow is selected.</p>
        <div className="mt-3 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Owner</TableHead><TableHead>Account</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{activeCapitalEntries.filter((entry) => entry.transactionType === "owner_investment").map((entry) => <TableRow key={entry.id}><TableCell>{entry.movementDate}</TableCell><TableCell>{entry.ownerLabel}</TableCell><TableCell>{entry.accountLabel}</TableCell><TableCell>{entry.description}</TableCell><TableCell className="money text-right">{formatMoney(entry.amount, true)}</TableCell><TableCell className="text-right"><Button size="sm" variant="outline" disabled={!reversalEnabled} onClick={() => openCapitalEdit(entry)} aria-label={`Edit Owner investment for ${entry.ownerLabel}`}><Pencil /> Edit</Button><Button size="sm" variant="ghost" disabled={!reversalEnabled} onClick={() => openCapitalDelete(entry)} aria-label={`Delete Owner investment for ${entry.ownerLabel}`}><Trash2 /> Delete</Button></TableCell></TableRow>)}</TableBody></Table></div>
      </div>
    </section>

    <section className="panel overflow-hidden">
      <div className="border-b p-5"><h2 className="font-semibold">Append-only cash ledger</h2><p className="mt-1 text-sm text-muted-foreground">Inflow, outflow, owner funding, settlement receipts, and audited reversals.</p></div>
      <div className="overflow-x-auto">
        <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Account</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Movement</TableHead><TableHead className="text-right">Running balance</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
          <TableBody>{data.entries.length ? data.entries.map((entry) => <TableRow key={entry.id} className={entry.isReversed ? "opacity-60" : undefined}>
            <TableCell className="whitespace-nowrap">{entry.movementDate}</TableCell>
            <TableCell><Badge variant="outline">{CASH_TRANSACTION_LABELS[entry.transactionType]}</Badge>{entry.isReversed ? <Badge className="ml-2" variant="secondary">Reversed</Badge> : null}</TableCell>
            <TableCell>{entry.accountLabel}</TableCell>
            <TableCell className="min-w-56"><p>{entry.description}</p>{entry.reference ? <p className="mt-1 text-xs text-muted-foreground">Ref: {entry.reference}</p> : null}{entry.ownerLabel ? <p className="mt-1 text-xs text-muted-foreground">Owner/person: {entry.ownerLabel}</p> : null}</TableCell>
            <TableCell className={`money text-right font-medium ${entry.signedAmount < 0 ? "text-destructive" : "text-emerald-700"}`}>{entry.signedAmount > 0 ? "+" : ""}{formatMoney(entry.signedAmount, true)}</TableCell>
            <TableCell className="money text-right">{formatMoney(entry.runningBalance, true)}</TableCell>
            <TableCell className="text-right">{reversibleOperatingEntry(entry) ? <Button size="sm" variant="ghost" disabled={!reversalEnabled} onClick={() => setReversalEntry(entry)} aria-label={`Reverse ${CASH_TRANSACTION_LABELS[entry.transactionType]} from ${entry.movementDate}`}><RotateCcw data-icon="inline-start" /> Reverse</Button> : isOwnerCapitalEntry(entry) ? <span className="text-xs text-muted-foreground">Manage above</span> : <span className="text-muted-foreground">-</span>}</TableCell>
          </TableRow>) : <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No cash movements have been recorded.</TableCell></TableRow>}</TableBody>
        </Table>
      </div>
    </section>

    <Dialog open={entryOpen} onOpenChange={(open) => { if (!pending) { setEntryOpen(open); if (!open) { setReviewing(false); setReviewValues(null); } } }}>
      <DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{reviewing ? "Confirm cash movement" : "Record cash movement"}</DialogTitle><DialogDescription>{reviewing ? "This creates an immutable ledger entry. Corrections require a separate owner action." : "Record owner funding or another manual inflow/outflow against an approved cash account."}</DialogDescription></DialogHeader>
        {reviewing ? <div className="flex flex-col gap-4"><div className="grid grid-cols-2 gap-3 rounded-lg border p-4 text-sm"><span>Type</span><span className="text-right font-medium">{CASH_TRANSACTION_LABELS[candidate.transactionType]}</span>{candidate.transactionType.startsWith("owner_") ? <><span>Owner</span><span className="text-right font-medium">{candidate.ownerLabel}</span></> : null}<span>Account</span><span className="text-right font-medium">{accountLabels.get(candidate.accountKey) ?? candidate.accountKey}</span><span>Direction</span><span className="text-right font-medium">{cashDirection(candidate.transactionType)}</span><span>Amount</span><span className="money text-right font-semibold">{formatMoney(parseMoney(candidate.amount), true)}</span><span>Description</span><span className="text-right font-medium">{candidate.description}</span></div><Alert><Save /><AlertTitle>Append-only financial record</AlertTitle><AlertDescription>Confirm only after checking the owner, account, direction, and amount.</AlertDescription></Alert></div>
          : <form id="cash-entry" onSubmit={form.handleSubmit((values) => { setReviewValues(values); setReviewing(true); })}>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(form.formState.errors.movementDate)}><FieldLabel htmlFor="cashMovementDate">Date</FieldLabel><Input id="cashMovementDate" type="date" aria-invalid={Boolean(form.formState.errors.movementDate)} {...form.register("movementDate")} /><FieldError errors={[form.formState.errors.movementDate]} /></Field>
              <Field data-invalid={Boolean(form.formState.errors.transactionType)}><FieldLabel htmlFor="cashTransactionType">Transaction type</FieldLabel><Controller control={form.control} name="transactionType" render={({ field }) => <Select value={field.value} onValueChange={(value) => { field.onChange(value); if (!(value as string).startsWith("owner_")) form.setValue("ownerLabel", ""); }}><SelectTrigger id="cashTransactionType" className="w-full" aria-invalid={Boolean(form.formState.errors.transactionType)}><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="owner_investment">Owner investment</SelectItem><SelectItem value="operating_inflow">Other cash inflow</SelectItem><SelectItem value="operating_outflow">Other cash outflow</SelectItem></SelectGroup></SelectContent></Select>} /></Field>
              <Field data-invalid={Boolean(form.formState.errors.accountKey)}><FieldLabel htmlFor="cashAccount">Cash account</FieldLabel><Controller control={form.control} name="accountKey" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger id="cashAccount" className="w-full" aria-invalid={Boolean(form.formState.errors.accountKey)}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{settings.cashAccounts.map((account) => <SelectItem key={account.key} value={account.key}>{account.label}</SelectItem>)}</SelectGroup></SelectContent></Select>} /><FieldError errors={[form.formState.errors.accountKey]} /></Field>
              <Field data-invalid={Boolean(form.formState.errors.amount)}><FieldLabel htmlFor="cashAmount">Amount (BDT)</FieldLabel><Input id="cashAmount" inputMode="decimal" aria-invalid={Boolean(form.formState.errors.amount)} {...form.register("amount")} /><FieldError errors={[form.formState.errors.amount]} /></Field>
              {transactionType.startsWith("owner_") ? <Field className="sm:col-span-2" data-invalid={Boolean(form.formState.errors.ownerLabel)}><FieldLabel htmlFor="cashOwnerLabel">Owner</FieldLabel><Controller control={form.control} name="ownerLabel" render={({ field }) => <Select value={field.value || null} onValueChange={field.onChange}><SelectTrigger id="cashOwnerLabel" className="w-full" aria-invalid={Boolean(form.formState.errors.ownerLabel)}><SelectValue placeholder="Select owner" /></SelectTrigger><SelectContent><SelectGroup>{OWNER_NAMES.map((ownerName) => <SelectItem key={ownerName} value={ownerName}>{ownerName}</SelectItem>)}</SelectGroup></SelectContent></Select>} /><FieldError errors={[form.formState.errors.ownerLabel]} /></Field> : null}
              <Field className="sm:col-span-2" data-invalid={Boolean(form.formState.errors.description)}><FieldLabel htmlFor="cashDescription">Description</FieldLabel><Textarea id="cashDescription" aria-invalid={Boolean(form.formState.errors.description)} {...form.register("description")} /><FieldError errors={[form.formState.errors.description]} /></Field>
              <Field className="sm:col-span-2"><FieldLabel htmlFor="cashReference">Reference (optional)</FieldLabel><Input id="cashReference" {...form.register("reference")} /></Field>
            </FieldGroup>
          </form>}
        <DialogFooter>{reviewing ? <><Button variant="outline" onClick={() => setReviewing(false)} disabled={pending}>Back</Button><Button onClick={confirmEntry} disabled={pending}>{pending ? "Saving..." : "Confirm cash entry"}</Button></> : <><Button variant="outline" onClick={() => setEntryOpen(false)}>Cancel</Button><Button type="submit" form="cash-entry">Review cash entry</Button></>}</DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={ownerTakenOpen} onOpenChange={(open) => { if (!pending) { setOwnerTakenOpen(open); if (!open) setOwnerTakenReview(null); } }}>
      <DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{ownerTakenReview ? "Confirm money taken by owner" : "Record money taken by owner"}</DialogTitle><DialogDescription>The database applies the amount to remaining contributed capital first; only the excess becomes Due from Owner.</DialogDescription></DialogHeader>
        {ownerTakenReview ? <div className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2"><span>Owner</span><strong className="text-right">{ownerTakenReview.ownerLabel}</strong><span>Current contributed capital</span><span className="money text-right">{formatMoney(ownerTakenPreview.currentCapitalBefore, true)}</span><span>Amount taken</span><span className="money text-right">{formatMoney(ownerTakenPreview.amount, true)}</span><span>Capital returned</span><span className="money text-right">{formatMoney(ownerTakenPreview.capitalReturn, true)}</span><span>Increase in Due from Owner</span><span className="money text-right">{formatMoney(ownerTakenPreview.excessDue, true)}</span><span>New contributed capital</span><span className="money text-right font-semibold">{formatMoney(ownerTakenPreview.currentCapitalAfter, true)}</span><span>Due from Owner after</span><span className="money text-right font-semibold">{formatMoney(ownerTakenPreview.dueFromOwnerAfter, true)}</span><span>Cash-account effect</span><span className="money text-right text-destructive">-{formatMoney(ownerTakenPreview.amount, true)} {accountLabels.get(ownerTakenReview.sourceAccountKey)}</span><span>Profit effect</span><span className="money text-right">{formatMoney(0, true)}</span></div> : <form id="owner-money-taken" className="grid gap-4 sm:grid-cols-2" onSubmit={ownerTakenForm.handleSubmit((values) => setOwnerTakenReview(values))}>
          <Field><FieldLabel htmlFor="ownerTakenDate">Date</FieldLabel><Input id="ownerTakenDate" type="date" {...ownerTakenForm.register("eventDate")} /></Field>
          <Field><FieldLabel htmlFor="ownerTakenOwner">Owner</FieldLabel><Controller control={ownerTakenForm.control} name="ownerLabel" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger id="ownerTakenOwner" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{OWNER_NAMES.map((owner) => <SelectItem key={owner} value={owner}>{owner}</SelectItem>)}</SelectContent></Select>} /></Field>
          <Field><FieldLabel htmlFor="ownerTakenAmount">Amount (BDT)</FieldLabel><Input id="ownerTakenAmount" inputMode="decimal" {...ownerTakenForm.register("amount")} /><FieldError errors={[ownerTakenForm.formState.errors.amount]} /></Field>
          <Field><FieldLabel htmlFor="ownerTakenAccount">Source business account</FieldLabel><Controller control={ownerTakenForm.control} name="sourceAccountKey" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger id="ownerTakenAccount" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{settings.cashAccounts.filter((account) => ["cash","bkash","nagad","bank"].includes(account.key)).map((account) => <SelectItem key={account.key} value={account.key}>{account.label}</SelectItem>)}</SelectContent></Select>} /></Field>
          <Field className="sm:col-span-2"><FieldLabel htmlFor="ownerTakenDescription">Description</FieldLabel><Textarea id="ownerTakenDescription" {...ownerTakenForm.register("description")} /><FieldError errors={[ownerTakenForm.formState.errors.description]} /></Field>
          <Field className="sm:col-span-2"><FieldLabel htmlFor="ownerTakenReference">Reference (optional)</FieldLabel><Input id="ownerTakenReference" {...ownerTakenForm.register("reference")} /></Field>
          <Alert className="sm:col-span-2"><Landmark /><AlertTitle>Balance-sheet transaction</AlertTitle><AlertDescription>Owner money taken is not a business expense. Any separate financial transaction fee must be recorded as an expense.</AlertDescription></Alert>
        </form>}
        <DialogFooter>{ownerTakenReview ? <><Button variant="outline" disabled={pending} onClick={() => setOwnerTakenReview(null)}>Back</Button><Button disabled={pending} onClick={confirmOwnerMoneyTaken}>{pending ? "Posting…" : "Confirm atomic posting"}</Button></> : <><Button variant="outline" disabled={pending} onClick={() => setOwnerTakenOpen(false)}>Cancel</Button><Button type="submit" form="owner-money-taken" disabled={pending}>Review split</Button></>}</DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(reversingOwnerTakenId)} onOpenChange={(open) => { if (!open && !pending) { setReversingOwnerTakenId(null); setOwnerTakenReversalReason(""); } }}><DialogContent><DialogHeader><DialogTitle>Reverse owner money taken?</DialogTitle><DialogDescription>The linked cash outflow, capital-return portion, and Due portion will be reversed together. Original evidence remains unchanged.</DialogDescription></DialogHeader><Field><FieldLabel htmlFor="ownerTakenReversalReason">Reason</FieldLabel><Textarea id="ownerTakenReversalReason" value={ownerTakenReversalReason} onChange={(event) => setOwnerTakenReversalReason(event.target.value)} /></Field><DialogFooter><Button variant="outline" disabled={pending} onClick={() => setReversingOwnerTakenId(null)}>Cancel</Button><Button variant="destructive" disabled={pending || ownerTakenReversalReason.trim().length < 3} onClick={confirmOwnerMoneyTakenReversal}><RotateCcw />{pending ? "Reversing…" : "Reverse all linked effects"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(editingCapitalEntry)} onOpenChange={(open) => { if (!open && !pending) setEditingCapitalEntry(null); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Edit owner-capital record</DialogTitle><DialogDescription>Saving appends a reversal and corrected replacement in one database transaction. The original remains visible in audit history.</DialogDescription></DialogHeader>
        <form id="owner-capital-edit" onSubmit={editForm.handleSubmit(saveCapitalEdit)}>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(editForm.formState.errors.movementDate)}><FieldLabel htmlFor="capitalEditDate">Date</FieldLabel><Input id="capitalEditDate" type="date" aria-invalid={Boolean(editForm.formState.errors.movementDate)} {...editForm.register("movementDate")} /><FieldError errors={[editForm.formState.errors.movementDate]} /></Field>
            <Field><FieldLabel htmlFor="capitalEditType">Type</FieldLabel><Input id="capitalEditType" value="Owner investment" disabled /></Field>
            <Field data-invalid={Boolean(editForm.formState.errors.ownerLabel)}><FieldLabel htmlFor="capitalEditOwner">Owner</FieldLabel><Controller control={editForm.control} name="ownerLabel" render={({ field }) => <Select value={field.value || null} onValueChange={field.onChange}><SelectTrigger id="capitalEditOwner" className="w-full" aria-invalid={Boolean(editForm.formState.errors.ownerLabel)}><SelectValue placeholder="Select owner" /></SelectTrigger><SelectContent><SelectGroup>{OWNER_NAMES.map((ownerName) => <SelectItem key={ownerName} value={ownerName}>{ownerName}</SelectItem>)}</SelectGroup></SelectContent></Select>} /><FieldError errors={[editForm.formState.errors.ownerLabel]} /></Field>
            <Field data-invalid={Boolean(editForm.formState.errors.accountKey)}><FieldLabel htmlFor="capitalEditAccount">Cash account</FieldLabel><Controller control={editForm.control} name="accountKey" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger id="capitalEditAccount" className="w-full" aria-invalid={Boolean(editForm.formState.errors.accountKey)}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{settings.cashAccounts.map((account) => <SelectItem key={account.key} value={account.key}>{account.label}</SelectItem>)}</SelectGroup></SelectContent></Select>} /><FieldError errors={[editForm.formState.errors.accountKey]} /></Field>
            <Field data-invalid={Boolean(editForm.formState.errors.amount)}><FieldLabel htmlFor="capitalEditAmount">Amount (BDT)</FieldLabel><Input id="capitalEditAmount" inputMode="decimal" aria-invalid={Boolean(editForm.formState.errors.amount)} {...editForm.register("amount")} /><FieldError errors={[editForm.formState.errors.amount]} /></Field>
            <Field><FieldLabel htmlFor="capitalEditReference">Reference (optional)</FieldLabel><Input id="capitalEditReference" {...editForm.register("reference")} /></Field>
            <Field className="sm:col-span-2" data-invalid={Boolean(editForm.formState.errors.description)}><FieldLabel htmlFor="capitalEditDescription">Description</FieldLabel><Textarea id="capitalEditDescription" aria-invalid={Boolean(editForm.formState.errors.description)} {...editForm.register("description")} /><FieldError errors={[editForm.formState.errors.description]} /></Field>
            <Field className="sm:col-span-2" data-invalid={Boolean(editForm.formState.errors.correctionReason)}><FieldLabel htmlFor="capitalEditReason">Why are you changing this record?</FieldLabel><Textarea id="capitalEditReason" placeholder="For example: wrong amount, owner, account, or date." aria-invalid={Boolean(editForm.formState.errors.correctionReason)} {...editForm.register("correctionReason")} /><FieldError errors={[editForm.formState.errors.correctionReason]} /></Field>
          </FieldGroup>
        </form>
        <Alert><Pencil /><AlertTitle>Audited correction</AlertTitle><AlertDescription>Cash balances and owner totals will use the corrected replacement after this saves.</AlertDescription></Alert>
        <DialogFooter><Button variant="outline" disabled={pending} onClick={() => setEditingCapitalEntry(null)}>Cancel</Button><Button type="submit" form="owner-capital-edit" disabled={pending}><Save data-icon="inline-start" />{pending ? "Saving..." : "Save correction"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(deletingCapitalEntry)} onOpenChange={(open) => { if (!open && !pending) { setDeletingCapitalEntry(null); setDeletionReason(""); setDeletionKey(""); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Delete owner-capital record?</DialogTitle><DialogDescription>This removes the investment from active owner totals and corrects the cash balance. The original record remains in audit history.</DialogDescription></DialogHeader>
        {deletingCapitalEntry ? <Alert variant="destructive"><Trash2 /><AlertTitle>{CASH_TRANSACTION_LABELS[deletingCapitalEntry.transactionType]} - {formatMoney(deletingCapitalEntry.amount, true)}</AlertTitle><AlertDescription>{deletingCapitalEntry.ownerLabel} / {deletingCapitalEntry.accountLabel} / {deletingCapitalEntry.movementDate}</AlertDescription></Alert> : null}
        <Field data-invalid={deletionReason.length > 0 && deletionReason.trim().length < 3}><FieldLabel htmlFor="capitalDeleteReason">Why are you deleting this record?</FieldLabel><Textarea id="capitalDeleteReason" value={deletionReason} onChange={(event) => setDeletionReason(event.target.value)} placeholder="For example: duplicate entry or entered by mistake." aria-invalid={deletionReason.length > 0 && deletionReason.trim().length < 3} /></Field>
        <DialogFooter><Button variant="outline" disabled={pending} onClick={() => setDeletingCapitalEntry(null)}>Cancel</Button><Button variant="destructive" disabled={pending || deletionReason.trim().length < 3} onClick={confirmCapitalDelete}><Trash2 data-icon="inline-start" />{pending ? "Deleting..." : "Delete record"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(reversalEntry)} onOpenChange={(open) => { if (!open && !pending) { setReversalEntry(null); setReversalReason(""); } }}>
      <DialogContent><DialogHeader><DialogTitle>Append cash reversal?</DialogTitle><DialogDescription>The original entry remains immutable. A new opposite movement will correct the account balance.</DialogDescription></DialogHeader>{reversalEntry ? <div className="rounded-lg border p-4 text-sm"><div className="flex justify-between gap-3"><span>{CASH_TRANSACTION_LABELS[reversalEntry.transactionType]}</span><span className="money font-semibold">{formatMoney(reversalEntry.signedAmount, true)}</span></div><p className="mt-2 text-muted-foreground">{reversalEntry.accountLabel} / {reversalEntry.description}</p></div> : null}<Field><FieldLabel htmlFor="cashReversalReason">Reason</FieldLabel><Textarea id="cashReversalReason" value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} placeholder="Explain what was wrong and why this correction is required." /></Field><DialogFooter><Button variant="outline" disabled={pending} onClick={() => setReversalEntry(null)}>Cancel</Button><Button variant="destructive" disabled={pending || reversalReason.trim().length < 3} onClick={confirmReversal}><RotateCcw data-icon="inline-start" />{pending ? "Reversing..." : "Confirm reversal"}</Button></DialogFooter></DialogContent>
    </Dialog>
  </div>;
}
