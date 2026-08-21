import { z } from "zod";
import { parseMoney, sumMoney } from "@/domain/money";
import type { CashLedgerEntry, Money, OwnerPositionPeriod } from "@/domain/types";

export const OWNER_NAMES = ["Nasim", "Rifat", "Ikbal"] as const;
export type OwnerName = typeof OWNER_NAMES[number];

export interface OwnerCapitalSummary {
  ownerName: OwnerName;
  investments: Money;
  withdrawals: Money;
  netCapital: Money;
}

type OwnerCapitalEntry = Pick<CashLedgerEntry, "transactionType" | "amount" | "ownerLabel" | "isReversed">;

export const MANUAL_CASH_TRANSACTION_TYPES = [
  "owner_investment",
  "operating_inflow",
  "operating_outflow",
] as const;

export const CASH_TRANSACTION_LABELS: Record<string, string> = {
  owner_investment: "Owner investment",
  owner_withdrawal: "Owner withdrawal",
  owner_money_taken: "Owner money taken",
  operating_inflow: "Other cash inflow",
  operating_outflow: "Other cash outflow",
  transfer_in: "Transfer received",
  transfer_out: "Transfer sent",
  courier_settlement: "Courier settlement",
  expense: "Expense payment",
  ad_spend: "Advertising payment",
  procurement_payment: "Procurement payment",
  customer_payment: "Customer payment",
  owner_held_transfer: "Business funds transferred to owner",
  reversal: "Reversal",
};

const cashAmount = z.string().trim().superRefine((value, context) => {
  try {
    const amount = parseMoney(value);
    if (amount <= 0 || amount > 999_999_999_999) {
      context.addIssue({ code: "custom", message: "Enter an amount from 0.01 to 9,999,999,999.99 BDT" });
    }
  } catch {
    context.addIssue({ code: "custom", message: "Enter a valid BDT amount with at most two decimals" });
  }
});

const cashMovementFields = {
  movementDate: z.iso.date(),
  transactionType: z.enum(MANUAL_CASH_TRANSACTION_TYPES),
  accountKey: z.string().trim().min(1, "Cash account is required").max(120),
  amount: cashAmount,
  description: z.string().trim().min(3, "Description must have at least 3 characters").max(240),
  reference: z.string().trim().max(120),
  ownerLabel: z.string().trim().max(120),
  submissionKey: z.uuid(),
} as const;

function requireApprovedOwner(
  value: { transactionType: string; ownerLabel: string },
  context: z.core.$RefinementCtx,
) {
  if (value.transactionType.startsWith("owner_") && !OWNER_NAMES.includes(value.ownerLabel as OwnerName)) {
    context.addIssue({ code: "custom", path: ["ownerLabel"], message: "Select Nasim, Rifat, or Ikbal" });
  }
}

export const cashMovementSchema = z.object(cashMovementFields).superRefine(requireApprovedOwner);

export const ownerCapitalEditSchema = z.object({
  ...cashMovementFields,
  movementId: z.uuid(),
  transactionType: z.literal("owner_investment"),
  correctionReason: z.string().trim().min(3, "Correction reason must have at least 3 characters").max(500),
}).superRefine(requireApprovedOwner);

export const cashReversalSchema = z.object({
  movementId: z.uuid(),
  reason: z.string().trim().min(3, "Reversal reason must have at least 3 characters").max(500),
  submissionKey: z.uuid(),
});

export const ownerMoneyTakenSchema = z.object({
  eventDate: z.iso.date(),
  ownerLabel: z.enum(OWNER_NAMES),
  amount: cashAmount,
  sourceAccountKey: z.string().trim().min(1, "Source business account is required").max(120),
  description: z.string().trim().min(3, "Description must have at least 3 characters").max(240),
  reference: z.string().trim().max(120),
  submissionKey: z.uuid(),
});

export const ownerMoneyTakenReversalSchema = z.object({
  ownerMoneyTakenId: z.uuid(),
  reversedOn: z.iso.date(),
  reason: z.string().trim().min(3, "Reversal reason must have at least 3 characters").max(500),
  submissionKey: z.uuid(),
});

export type CashMovementValues = z.infer<typeof cashMovementSchema>;
export type OwnerCapitalEditValues = z.infer<typeof ownerCapitalEditSchema>;
export type CashReversalValues = z.infer<typeof cashReversalSchema>;
export type OwnerMoneyTakenValues = z.infer<typeof ownerMoneyTakenSchema>;
export type OwnerMoneyTakenReversalValues = z.infer<typeof ownerMoneyTakenReversalSchema>;

export function calculateOwnerMoneyTaken(amount: Money, currentCapital: Money, dueFromOwner: Money) {
  const capitalReturn = Math.min(amount, Math.max(currentCapital, 0));
  const excessDue = amount - capitalReturn;
  return {
    amount,
    capitalReturn,
    excessDue,
    currentCapitalBefore: Math.max(currentCapital, 0),
    currentCapitalAfter: Math.max(currentCapital - capitalReturn, 0),
    dueFromOwnerBefore: dueFromOwner,
    dueFromOwnerAfter: sumMoney([dueFromOwner, excessDue]),
  };
}

export function ownerPositionPeriodTotals(
  entries: readonly OwnerPositionPeriod[],
  startDate: string | null,
  endDate: string | null,
) {
  const periodEntries = entries.filter((entry) =>
    (!startDate || entry.eventDate >= startDate) && (!endDate || entry.eventDate <= endDate));
  const ownerMoneyTaken = sumMoney(periodEntries.map((entry) => entry.ownerMoneyTakenInPeriod));
  const capitalReturn = sumMoney(periodEntries.map((entry) => entry.capitalReturnInPeriod));
  const dueCreated = sumMoney(periodEntries.map((entry) => entry.excessDueInPeriod));
  if (ownerMoneyTaken !== sumMoney([capitalReturn, dueCreated])) {
    throw new Error("Owner money taken does not reconcile with its capital-return and Due portions.");
  }
  return { ownerMoneyTaken, capitalReturn, dueCreated };
}

export function cashDirection(transactionType: CashMovementValues["transactionType"]) {
  return transactionType === "owner_investment" || transactionType === "operating_inflow" ? "inflow" : "outflow";
}

export function ownerCapitalSummaries(entries: readonly OwnerCapitalEntry[]): OwnerCapitalSummary[] {
  return OWNER_NAMES.map((ownerName) => {
    const ownerEntries = entries.filter((entry) =>
      !entry.isReversed && entry.ownerLabel.localeCompare(ownerName, undefined, { sensitivity: "accent" }) === 0);
    const investments = sumMoney(ownerEntries
      .filter((entry) => entry.transactionType === "owner_investment")
      .map((entry) => entry.amount));
    const withdrawals = sumMoney(ownerEntries
      .filter((entry) => entry.transactionType === "owner_withdrawal")
      .map((entry) => entry.amount));
    return { ownerName, investments, withdrawals, netCapital: sumMoney([investments, -withdrawals]) };
  });
}

export function safeCashError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/idempotency key.*different/i.test(message)) return "This submission was already used with different values. Refresh and try again.";
  if (/already reversed/i.test(message)) return "That cash entry was already reversed.";
  if (/owner capital movement not found/i.test(message)) return "That owner-capital record no longer exists. Refresh and try again.";
  if (/original movement is not owner capital/i.test(message)) return "Only owner investment and withdrawal records can be edited here.";
  if (/source-specific correction/i.test(message)) return "This entry requires its source-specific correction workflow.";
  if (/not authorized|only owners/i.test(message)) return "Your dashboard role is not allowed to perform this cash action.";
  return "The cash ledger was not changed. Review the values and try again.";
}
