import { z } from "zod";
import { parseMoney } from "@/domain/money";

export const FUNDING_TREATMENTS = [
  "business_account_paid",
  "owner_paid_personally",
  "owner_held_business_funds",
  "unpaid",
] as const;

export const HISTORICAL_FUNDING_TREATMENTS = [
  ...FUNDING_TREATMENTS,
  "historical_business_paid_account_unknown",
  "already_represented",
] as const;

export const FUNDING_TREATMENT_LABELS: Record<(typeof HISTORICAL_FUNDING_TREATMENTS)[number], string> = {
  business_account_paid: "Paid from a business account",
  owner_paid_personally: "Paid personally by an owner",
  owner_held_business_funds: "Paid from business funds held by an owner",
  unpaid: "Unpaid / payable",
  historical_business_paid_account_unknown: "Paid from business funds — historical account unknown",
  already_represented: "Already represented in the cash ledger",
};

export const fundingFields = {
  fundingTreatment: z.enum(FUNDING_TREATMENTS),
  paymentDate: z.string(),
  businessAccountKey: z.string().trim().max(120),
  ownerLabel: z.string().trim().max(120),
  submissionKey: z.uuid(),
} as const;

export function validateFunding(
  value: {
    fundingTreatment: string;
    paymentDate: string;
    businessAccountKey: string;
    ownerLabel: string;
  },
  context: z.core.$RefinementCtx,
) {
  if (value.fundingTreatment === "business_account_paid") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.paymentDate)) {
      context.addIssue({ code: "custom", path: ["paymentDate"], message: "Payment date is required" });
    }
    if (!value.businessAccountKey) {
      context.addIssue({ code: "custom", path: ["businessAccountKey"], message: "Choose the business account that paid" });
    }
  }
  if (value.fundingTreatment === "owner_paid_personally" || value.fundingTreatment === "owner_held_business_funds") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.paymentDate)) {
      context.addIssue({ code: "custom", path: ["paymentDate"], message: "Payment date is required" });
    }
    if (!['Nasim', 'Rifat', 'Ikbal'].includes(value.ownerLabel)) {
      context.addIssue({ code: "custom", path: ["ownerLabel"], message: value.fundingTreatment === "owner_paid_personally" ? "Choose the owner who paid personally" : "Choose the owner holding the business funds" });
    }
  }
  if (value.fundingTreatment === "historical_business_paid_account_unknown") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.paymentDate)) {
      context.addIssue({ code: "custom", path: ["paymentDate"], message: "Historical payment date is required" });
    }
    if (value.businessAccountKey || value.ownerLabel) {
      context.addIssue({ code: "custom", path: ["fundingTreatment"], message: "Do not guess a cash account or owner for this historical treatment" });
    }
  }
}

export type FundingTreatment = (typeof HISTORICAL_FUNDING_TREATMENTS)[number];

const exactNonNegativeMoney = z.string().trim().superRefine((value, context) => {
  try {
    if (parseMoney(value) < 0) context.addIssue({ code: "custom", message: "Balance cannot be negative" });
  } catch {
    context.addIssue({ code: "custom", message: "Enter exact BDT with at most two decimals" });
  }
});

const exactPositiveMoney = z.string().trim().superRefine((value, context) => {
  try {
    if (parseMoney(value) <= 0) context.addIssue({ code: "custom", message: "Amount must be greater than zero" });
  } catch {
    context.addIssue({ code: "custom", message: "Enter exact BDT with at most two decimals" });
  }
});

export const historicalFundingSchema = z.object({
  sourceType: z.enum(["expense", "ad_spend", "purchase_batch"]),
  sourceId: z.uuid(),
  fundingTreatment: z.enum(HISTORICAL_FUNDING_TREATMENTS),
  paymentDate: z.string(),
  businessAccountKey: z.string().trim().max(120),
  ownerLabel: z.string().trim().max(120),
  existingCashMovementId: z.string().trim(),
  notes: z.string().trim().min(3, "Explain the evidence used for this classification").max(500),
  submissionKey: z.uuid(),
}).superRefine((value, context) => {
  validateFunding(value, context);
  if (value.fundingTreatment === "already_represented") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.paymentDate)) context.addIssue({ code: "custom", path: ["paymentDate"], message: "Payment date is required" });
    if (!value.businessAccountKey) context.addIssue({ code: "custom", path: ["businessAccountKey"], message: "Choose the represented account" });
    if (!z.uuid().safeParse(value.existingCashMovementId).success) context.addIssue({ code: "custom", path: ["existingCashMovementId"], message: "Choose the existing cash movement" });
  }
  if (value.fundingTreatment === "historical_business_paid_account_unknown" && value.existingCashMovementId) {
    context.addIssue({ code: "custom", path: ["existingCashMovementId"], message: "Historical account-unknown funding cannot link a guessed cash movement" });
  }
});

export const accountObservationSchema = z.object({
  accountKey: z.string().trim().min(1, "Choose an account").max(120),
  observedOn: z.iso.date(),
  actualBalance: exactNonNegativeMoney,
  reason: z.string().trim().min(3, "Describe how the actual balance was verified").max(500),
  submissionKey: z.uuid(),
});

export const payUnpaidSourceSchema = z.object({
  sourceType: z.enum(["expense", "ad_spend", "purchase_batch"]),
  sourceId: z.uuid(),
  fundingTreatment: z.enum(["business_account_paid", "owner_paid_personally", "owner_held_business_funds"]),
  paymentDate: z.iso.date(),
  businessAccountKey: z.string().trim().max(120),
  ownerLabel: z.string().trim().max(120),
  reason: z.string().trim().min(3, "Explain the payment evidence").max(500),
  submissionKey: z.uuid(),
}).superRefine(validateFunding);

export const reverseSourceFundingSchema = z.object({
  fundingId: z.uuid(),
  reversedOn: z.iso.date(),
  reason: z.string().trim().min(3, "Explain why this posted funding is being reversed").max(500),
  submissionKey: z.uuid(),
});

export const ownerHeldTransferSchema = z.object({
  transferDate: z.iso.date(),
  ownerLabel: z.enum(["Nasim", "Rifat", "Ikbal"]),
  businessAccountKey: z.string().trim().min(1, "Choose the source business account").max(120),
  amount: exactPositiveMoney,
  reason: z.string().trim().min(3, "Explain why the owner is holding these business funds").max(500),
  submissionKey: z.uuid(),
});

export const ownerHeldObservationSchema = z.object({
  ownerLabel: z.enum(["Nasim", "Rifat", "Ikbal"]),
  observedOn: z.iso.date(),
  actualDue: exactNonNegativeMoney,
  reason: z.string().trim().min(3, "Describe how the amount due was verified").max(500),
  submissionKey: z.uuid(),
});

export const steadfastObservationSchema = z.object({
  observedOn: z.iso.date(),
  actualReceivable: exactNonNegativeMoney,
  reason: z.string().trim().min(3, "Describe how the Steadfast balance was verified").max(500),
  submissionKey: z.uuid(),
});

export const ownerCapitalReturnSchema = z.object({
  returnDate: z.iso.date(),
  ownerLabel: z.enum(["Nasim", "Rifat", "Ikbal"]),
  amount: exactPositiveMoney,
  reason: z.string().trim().min(3, "Explain the approved capital return").max(500),
  submissionKey: z.uuid(),
});

export const ownerCapitalReturnReversalSchema = z.object({
  capitalReturnId: z.uuid(),
  reversedOn: z.iso.date(),
  reason: z.string().trim().min(3, "Explain why the capital return is being reversed").max(500),
  submissionKey: z.uuid(),
});

export const ownerHeldTransferReversalSchema = z.object({
  ownerHeldEventId: z.uuid(),
  reversedOn: z.iso.date(),
  reason: z.string().trim().min(3, "Explain why the owner-held transfer is being reversed").max(500),
  submissionKey: z.uuid(),
});

export type HistoricalFundingValues = z.infer<typeof historicalFundingSchema>;
export type AccountObservationValues = z.infer<typeof accountObservationSchema>;
export type PayUnpaidSourceValues = z.infer<typeof payUnpaidSourceSchema>;
export type ReverseSourceFundingValues = z.infer<typeof reverseSourceFundingSchema>;
export type OwnerHeldTransferValues = z.infer<typeof ownerHeldTransferSchema>;
export type OwnerHeldObservationValues = z.infer<typeof ownerHeldObservationSchema>;
export type SteadfastObservationValues = z.infer<typeof steadfastObservationSchema>;
export type OwnerCapitalReturnValues = z.infer<typeof ownerCapitalReturnSchema>;
export type OwnerCapitalReturnReversalValues = z.infer<typeof ownerCapitalReturnReversalSchema>;
export type OwnerHeldTransferReversalValues = z.infer<typeof ownerHeldTransferReversalSchema>;
