"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardCheck, Scale, Save, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { classifyHistoricalFundingAction, payUnpaidSourceAction, recordAccountObservationAction, reverseSourceFundingAction } from "@/actions/funding";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { OWNER_NAMES } from "@/domain/cash";
import {
  FUNDING_TREATMENT_LABELS,
  accountObservationSchema,
  historicalFundingSchema,
  payUnpaidSourceSchema,
  reverseSourceFundingSchema,
  type AccountObservationValues,
  type HistoricalFundingValues,
  type PayUnpaidSourceValues,
  type ReverseSourceFundingValues,
} from "@/domain/funding";
import { formatMoney } from "@/domain/money";
import type { CashAccountReconciliation, CashLedgerEntry, HistoricalCashIssue, SourceFundingRecord } from "@/domain/types";

const treatmentValues = ["business_account_paid", "owner_paid_personally", "owner_held_business_funds", "historical_business_paid_account_unknown", "unpaid", "already_represented"] as const;
const issueLabels = {
  missing_funding_treatment: "Funding not classified",
  suspicious_owner_cash_entry: "Owner cash entry needs review",
  source_without_cash_movement: "Posted source is missing cash",
} as const;

function sourceType(issue: HistoricalCashIssue): HistoricalFundingValues["sourceType"] | null {
  if (issue.recordType === "expense" || issue.recordType === "procurement") return "expense";
  if (issue.recordType === "ad_spend" || issue.recordType === "purchase_batch") return issue.recordType;
  return null;
}

function moneyInput(amount: number) {
  return `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;
}

export function ReconciliationWorkspace({ accounts, issues, fundings, ledger, today, enabled }: {
  accounts: CashAccountReconciliation[];
  issues: HistoricalCashIssue[];
  fundings: SourceFundingRecord[];
  ledger: CashLedgerEntry[];
  today: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [classifying, setClassifying] = useState<HistoricalCashIssue | null>(null);
  const [observing, setObserving] = useState<CashAccountReconciliation | null>(null);
  const [paying, setPaying] = useState<SourceFundingRecord | null>(null);
  const [reversing, setReversing] = useState<SourceFundingRecord | null>(null);
  const availableOutflows = useMemo(() => ledger.filter((entry) => entry.signedAmount < 0 && !entry.isReversed && entry.reversalOfId === null), [ledger]);
  const classificationForm = useForm<HistoricalFundingValues>({
    resolver: zodResolver(historicalFundingSchema),
    defaultValues: { sourceType: "expense", sourceId: crypto.randomUUID(), fundingTreatment: "unpaid", paymentDate: "", businessAccountKey: "", ownerLabel: "", existingCashMovementId: "", notes: "", submissionKey: crypto.randomUUID() },
  });
  const observationForm = useForm<AccountObservationValues>({
    resolver: zodResolver(accountObservationSchema),
    defaultValues: { accountKey: accounts[0]?.accountKey ?? "", observedOn: today, actualBalance: "0", reason: "", submissionKey: crypto.randomUUID() },
  });
  const paymentForm = useForm<PayUnpaidSourceValues>({ resolver: zodResolver(payUnpaidSourceSchema), defaultValues: { sourceType: "expense", sourceId: crypto.randomUUID(), fundingTreatment: "business_account_paid", paymentDate: today, businessAccountKey: accounts[0]?.accountKey ?? "", ownerLabel: "", reason: "", submissionKey: crypto.randomUUID() } });
  const reversalForm = useForm<ReverseSourceFundingValues>({ resolver: zodResolver(reverseSourceFundingSchema), defaultValues: { fundingId: crypto.randomUUID(), reversedOn: today, reason: "", submissionKey: crypto.randomUUID() } });
  const treatment = useWatch({ control: classificationForm.control, name: "fundingTreatment" });
  const paymentTreatment = useWatch({ control: paymentForm.control, name: "fundingTreatment" });
  const matchingOutflows = classifying ? availableOutflows.filter((entry) => entry.amount === classifying.amount) : [];

  function openClassification(issue: HistoricalCashIssue) {
    const resolvedSource = sourceType(issue);
    if (!resolvedSource) return;
    classificationForm.reset({ sourceType: resolvedSource, sourceId: issue.recordId, fundingTreatment: "unpaid", paymentDate: "", businessAccountKey: "", ownerLabel: "", existingCashMovementId: "", notes: "", submissionKey: crypto.randomUUID() });
    setClassifying(issue);
  }

  function classify(values: HistoricalFundingValues) {
    startTransition(async () => {
      const result = await classifyHistoricalFundingAction(values);
      if (!result.ok) {
        toast.error("Classification was not posted", { description: result.message });
        return;
      }
      toast.success(result.message);
      setClassifying(null);
      router.refresh();
    });
  }

  function openObservation(account: CashAccountReconciliation) {
    observationForm.reset({ accountKey: account.accountKey, observedOn: today, actualBalance: account.actualBalance === null ? "0" : moneyInput(account.actualBalance), reason: "", submissionKey: crypto.randomUUID() });
    setObserving(account);
  }

  function observe(values: AccountObservationValues) {
    startTransition(async () => {
      const result = await recordAccountObservationAction(values);
      if (!result.ok) {
        toast.error("Actual balance was not recorded", { description: result.message });
        return;
      }
      toast.success(result.message);
      setObserving(null);
      router.refresh();
    });
  }

  function openPayment(funding: SourceFundingRecord) {
    paymentForm.reset({ sourceType: funding.sourceType, sourceId: funding.sourceId, fundingTreatment: "business_account_paid", paymentDate: today, businessAccountKey: accounts[0]?.accountKey ?? "", ownerLabel: "", reason: "", submissionKey: crypto.randomUUID() });
    setPaying(funding);
  }

  function pay(values: PayUnpaidSourceValues) {
    startTransition(async () => {
      const result = await payUnpaidSourceAction(values);
      if (!result.ok) { toast.error("Payment was not posted", { description: result.message }); return; }
      toast.success(result.message); setPaying(null); router.refresh();
    });
  }

  function openReversal(funding: SourceFundingRecord) {
    reversalForm.reset({ fundingId: funding.fundingId, reversedOn: today, reason: "", submissionKey: crypto.randomUUID() });
    setReversing(funding);
  }

  function reverse(values: ReverseSourceFundingValues) {
    startTransition(async () => {
      const result = await reverseSourceFundingAction(values);
      if (!result.ok) { toast.error("Funding was not reversed", { description: result.message }); return; }
      toast.success(result.message); setReversing(null); router.refresh();
    });
  }

  return <div className="flex flex-col gap-4">
    <section className="panel overflow-hidden">
      <div className="flex items-start gap-3 border-b p-5"><Scale className="mt-0.5 size-5 text-primary" /><div><h2 className="font-semibold">Account reconciliation</h2><p className="mt-1 text-sm text-muted-foreground">Compare the append-only ledger with a physically verified account balance. Differences are never auto-adjusted.</p></div></div>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Ledger balance</TableHead><TableHead className="text-right">Actual balance</TableHead><TableHead className="text-right">Difference</TableHead><TableHead>Observed</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{accounts.map((account) => <TableRow key={account.accountKey}><TableCell className="font-medium">{account.accountLabel}</TableCell><TableCell className="money text-right">{formatMoney(account.balance, true)}</TableCell><TableCell className="money text-right">{account.actualBalance === null ? "Not entered" : formatMoney(account.actualBalance, true)}</TableCell><TableCell className={`money text-right font-medium ${account.difference && account.difference !== 0 ? "text-destructive" : ""}`}>{account.difference === null ? "Unavailable" : formatMoney(account.difference, true)}</TableCell><TableCell>{account.observedOn ?? "—"}</TableCell><TableCell className="text-right"><Button size="sm" variant="outline" disabled={!enabled} onClick={() => openObservation(account)}><ClipboardCheck data-icon="inline-start" /> Record actual</Button></TableCell></TableRow>)}</TableBody></Table></div>
    </section>

    <section className="panel overflow-hidden">
      <div className="border-b p-5"><h2 className="font-semibold">Active source funding</h2><p className="mt-1 text-sm text-muted-foreground">Unpaid sources can be paid once. Historical account-unknown records confirm business-paid spending without assigning Cash, bKash, Nagad, Bank, an owner, or a cash movement. Posted funding is corrected only through a source-linked reversal.</p></div>
      <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Source</TableHead><TableHead>Treatment</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{fundings.length ? fundings.map((funding) => <TableRow key={funding.fundingId}><TableCell>{funding.sourceDate}</TableCell><TableCell><Badge variant="outline">{funding.sourceType.replaceAll("_", " ")}</Badge></TableCell><TableCell>{FUNDING_TREATMENT_LABELS[funding.fundingTreatment]}</TableCell><TableCell className="min-w-64">{funding.description}</TableCell><TableCell className="money text-right">{formatMoney(funding.amount, true)}</TableCell><TableCell className="text-right">{funding.fundingTreatment === "unpaid" ? <Button size="sm" variant="outline" disabled={!enabled} onClick={() => openPayment(funding)}>Post payment</Button> : <Button size="sm" variant="ghost" disabled={!enabled} onClick={() => openReversal(funding)}>Reverse funding</Button>}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No classified source funding has been posted yet.</TableCell></TableRow>}</TableBody></Table></div>
    </section>

    <section className="panel overflow-hidden">
      <div className="border-b p-5"><h2 className="font-semibold">Historical cash reconciliation</h2><p className="mt-1 text-sm text-muted-foreground">These records need evidence. Description text is used only to flag owner entries for review; it never determines a funding source.</p></div>
      {issues.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Record</TableHead><TableHead>Issue</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{issues.map((issue) => <TableRow key={`${issue.recordType}:${issue.recordId}:${issue.issueType}`}><TableCell>{issue.recordDate}</TableCell><TableCell><Badge variant="outline">{issue.recordType.replaceAll("_", " ")}</Badge></TableCell><TableCell><Badge variant="secondary">{issueLabels[issue.issueType]}</Badge></TableCell><TableCell className="min-w-64"><p>{issue.description}</p>{issue.ownerLabel ? <p className="mt-1 text-xs text-muted-foreground">Owner: {issue.ownerLabel}</p> : null}</TableCell><TableCell className="money text-right">{formatMoney(issue.amount, true)}</TableCell><TableCell className="text-right">{sourceType(issue) ? <Button size="sm" variant="outline" disabled={!enabled} onClick={() => openClassification(issue)}>Classify</Button> : <span className="text-xs text-muted-foreground">Review in owner capital</span>}</TableCell></TableRow>)}</TableBody></Table></div> : <div className="p-5"><Alert><ClipboardCheck /><AlertTitle>No unresolved historical funding</AlertTitle><AlertDescription>Every financial source has explicit funding evidence, and no suspicious owner cash descriptions remain active.</AlertDescription></Alert></div>}
    </section>

    <Dialog open={Boolean(classifying)} onOpenChange={(open) => { if (!open && !pending) setClassifying(null); }}>
      {classifying ? <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl"><DialogHeader><DialogTitle>Classify historical funding</DialogTitle><DialogDescription>{classifying.recordDate} · {classifying.description} · {formatMoney(classifying.amount, true)}. This posts evidence; it does not guess or create an automatic balancing adjustment.</DialogDescription></DialogHeader><form id="historical-funding" className="overflow-y-auto pr-1" onSubmit={classificationForm.handleSubmit(classify)}><FieldGroup className="grid gap-4 sm:grid-cols-2"><Field className="sm:col-span-2"><FieldLabel>Funding treatment</FieldLabel><Controller control={classificationForm.control} name="fundingTreatment" render={({ field }) => <Select value={field.value} onValueChange={(value) => { field.onChange(value); classificationForm.setValue("paymentDate", value === "unpaid" ? "" : classifying.recordDate); classificationForm.setValue("businessAccountKey", ""); classificationForm.setValue("ownerLabel", ""); classificationForm.setValue("existingCashMovementId", ""); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{treatmentValues.map((value) => <SelectItem key={value} value={value}>{FUNDING_TREATMENT_LABELS[value]}</SelectItem>)}</SelectContent></Select>} /></Field>{treatment !== "unpaid" ? <Field><FieldLabel>Payment date</FieldLabel><Input type="date" {...classificationForm.register("paymentDate")} /><FieldError errors={[classificationForm.formState.errors.paymentDate]} /></Field> : null}{treatment === "business_account_paid" || treatment === "already_represented" ? <Field><FieldLabel>Business account</FieldLabel><Controller control={classificationForm.control} name="businessAccountKey" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger className="w-full"><SelectValue placeholder="Choose account" /></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.accountKey} value={account.accountKey}>{account.accountLabel}</SelectItem>)}</SelectContent></Select>} /><FieldError errors={[classificationForm.formState.errors.businessAccountKey]} /></Field> : null}{treatment === "owner_paid_personally" || treatment === "owner_held_business_funds" ? <Field><FieldLabel>{treatment === "owner_held_business_funds" ? "Owner holding the business funds" : "Owner who paid personally"}</FieldLabel><Controller control={classificationForm.control} name="ownerLabel" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger className="w-full"><SelectValue placeholder="Choose owner" /></SelectTrigger><SelectContent>{OWNER_NAMES.map((owner) => <SelectItem key={owner} value={owner}>{owner}</SelectItem>)}</SelectContent></Select>} /><FieldError errors={[classificationForm.formState.errors.ownerLabel]} /></Field> : null}{treatment === "already_represented" ? <Field className="sm:col-span-2"><FieldLabel>Existing matching outflow</FieldLabel><Controller control={classificationForm.control} name="existingCashMovementId" render={({ field }) => <Select value={field.value} onValueChange={(value) => { field.onChange(value); const entry = matchingOutflows.find((candidate) => candidate.id === value); if (entry) { classificationForm.setValue("paymentDate", entry.movementDate); classificationForm.setValue("businessAccountKey", entry.accountKey); } }}><SelectTrigger className="w-full"><SelectValue placeholder="Choose exact matching movement" /></SelectTrigger><SelectContent>{matchingOutflows.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.movementDate} · {entry.accountLabel} · {formatMoney(entry.amount, true)} · {entry.description}</SelectItem>)}</SelectContent></Select>} /><FieldDescription>Only active outflows with the exact same amount are offered. The database also verifies date and account.</FieldDescription><FieldError errors={[classificationForm.formState.errors.existingCashMovementId]} /></Field> : null}<Field className="sm:col-span-2"><FieldLabel>Evidence / reason</FieldLabel><Textarea {...classificationForm.register("notes")} placeholder="Invoice, receipt, account statement, owner confirmation, or payable evidence." /><FieldError errors={[classificationForm.formState.errors.notes]} /></Field></FieldGroup></form><DialogFooter><Button variant="outline" disabled={pending} onClick={() => setClassifying(null)}>Cancel</Button><Button type="submit" form="historical-funding" disabled={pending}><Save data-icon="inline-start" />{pending ? "Posting…" : "Post classification"}</Button></DialogFooter></DialogContent> : null}
    </Dialog>

    <Dialog open={Boolean(observing)} onOpenChange={(open) => { if (!open && !pending) setObserving(null); }}>
      {observing ? <DialogContent><DialogHeader><DialogTitle>Record actual {observing.accountLabel} balance</DialogTitle><DialogDescription>This observation is append-only. It calculates a difference but never changes the cash ledger.</DialogDescription></DialogHeader><form id="account-observation" className="grid gap-4" onSubmit={observationForm.handleSubmit(observe)}><Field><FieldLabel>Observed date</FieldLabel><Input type="date" {...observationForm.register("observedOn")} /><FieldError errors={[observationForm.formState.errors.observedOn]} /></Field><Field><FieldLabel>Actual balance (BDT)</FieldLabel><Input inputMode="decimal" {...observationForm.register("actualBalance")} /><FieldError errors={[observationForm.formState.errors.actualBalance]} /></Field><Field><FieldLabel>Verification reason</FieldLabel><Textarea {...observationForm.register("reason")} placeholder="For example: counted physical cash and checked the account statement." /><FieldError errors={[observationForm.formState.errors.reason]} /></Field><Alert><TriangleAlert /><AlertTitle>No automatic adjustment</AlertTitle><AlertDescription>A non-zero difference remains unresolved until its transactions are classified or an explicit adjustment is separately approved.</AlertDescription></Alert></form><DialogFooter><Button variant="outline" disabled={pending} onClick={() => setObserving(null)}>Cancel</Button><Button type="submit" form="account-observation" disabled={pending}><Save data-icon="inline-start" />{pending ? "Recording…" : "Record observation"}</Button></DialogFooter></DialogContent> : null}
    </Dialog>

    <Dialog open={Boolean(paying)} onOpenChange={(open) => { if (!open && !pending) setPaying(null); }}>
      {paying ? <DialogContent><DialogHeader><DialogTitle>Post payment for unpaid source</DialogTitle><DialogDescription>{paying.description} · {formatMoney(paying.amount, true)}. The payment and its linked cash, owner-capital, or Due from Owner event are atomic.</DialogDescription></DialogHeader><form id="pay-source" className="grid gap-4 sm:grid-cols-2" onSubmit={paymentForm.handleSubmit(pay)}><Field className="sm:col-span-2"><FieldLabel>Funding treatment</FieldLabel><Controller control={paymentForm.control} name="fundingTreatment" render={({ field }) => <Select value={field.value} onValueChange={(value) => { field.onChange(value); if (value === "business_account_paid") paymentForm.setValue("ownerLabel", ""); else paymentForm.setValue("businessAccountKey", ""); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="business_account_paid">Paid from a business account</SelectItem><SelectItem value="owner_paid_personally">Paid personally by an owner</SelectItem><SelectItem value="owner_held_business_funds">Paid from business funds held by an owner</SelectItem></SelectContent></Select>} /></Field><Field><FieldLabel>Payment date</FieldLabel><Input type="date" {...paymentForm.register("paymentDate")} /></Field>{paymentTreatment === "business_account_paid" ? <Field><FieldLabel>Business account</FieldLabel><Controller control={paymentForm.control} name="businessAccountKey" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger className="w-full"><SelectValue placeholder="Choose account" /></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.accountKey} value={account.accountKey}>{account.accountLabel}</SelectItem>)}</SelectContent></Select>} /><FieldError errors={[paymentForm.formState.errors.businessAccountKey]} /></Field> : <Field><FieldLabel>{paymentTreatment === "owner_held_business_funds" ? "Owner holding the business funds" : "Owner who paid personally"}</FieldLabel><Controller control={paymentForm.control} name="ownerLabel" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger className="w-full"><SelectValue placeholder="Choose owner" /></SelectTrigger><SelectContent>{OWNER_NAMES.map((owner) => <SelectItem key={owner} value={owner}>{owner}</SelectItem>)}</SelectContent></Select>} /><FieldError errors={[paymentForm.formState.errors.ownerLabel]} /></Field>}<Field className="sm:col-span-2"><FieldLabel>Payment evidence / reason</FieldLabel><Textarea {...paymentForm.register("reason")} /><FieldError errors={[paymentForm.formState.errors.reason]} /></Field></form><DialogFooter><Button variant="outline" disabled={pending} onClick={() => setPaying(null)}>Cancel</Button><Button type="submit" form="pay-source" disabled={pending}><Save data-icon="inline-start" />{pending ? "Posting…" : "Post payment"}</Button></DialogFooter></DialogContent> : null}
    </Dialog>

    <Dialog open={Boolean(reversing)} onOpenChange={(open) => { if (!open && !pending) setReversing(null); }}>
      {reversing ? <DialogContent><DialogHeader><DialogTitle>Reverse source funding?</DialogTitle><DialogDescription>The original {FUNDING_TREATMENT_LABELS[reversing.fundingTreatment].toLowerCase()} record remains immutable. Its linked cash or non-cash effect will be reversed consistently.</DialogDescription></DialogHeader><form id="reverse-source" className="grid gap-4" onSubmit={reversalForm.handleSubmit(reverse)}><Field><FieldLabel>Reversal date</FieldLabel><Input type="date" {...reversalForm.register("reversedOn")} /></Field><Field><FieldLabel>Reason</FieldLabel><Textarea {...reversalForm.register("reason")} /><FieldError errors={[reversalForm.formState.errors.reason]} /></Field></form><DialogFooter><Button variant="outline" disabled={pending} onClick={() => setReversing(null)}>Cancel</Button><Button type="submit" form="reverse-source" variant="destructive" disabled={pending}>{pending ? "Reversing…" : "Append reversal"}</Button></DialogFooter></DialogContent> : null}
    </Dialog>
  </div>;
}
