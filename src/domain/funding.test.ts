import { describe, expect, it } from "vitest";
import { accountObservationSchema, historicalFundingSchema, ownerCapitalReturnReversalSchema, ownerCapitalReturnSchema, ownerHeldObservationSchema, ownerHeldTransferReversalSchema, ownerHeldTransferSchema, payUnpaidSourceSchema, steadfastObservationSchema } from "@/domain/funding";

const key = "00000000-0000-4000-8000-000000000091";
const sourceId = "00000000-0000-4000-8000-000000000092";

describe("source funding validation", () => {
  it("requires confirmed account evidence for business-account payments", () => {
    const base = { sourceType: "expense", sourceId, fundingTreatment: "business_account_paid", paymentDate: "2026-08-17", businessAccountKey: "cash", ownerLabel: "", existingCashMovementId: "", notes: "Verified cash receipt", submissionKey: key } as const;
    expect(historicalFundingSchema.safeParse(base).success).toBe(true);
    expect(historicalFundingSchema.safeParse({ ...base, businessAccountKey: "" }).success).toBe(false);
  });

  it("keeps owner-paid and unpaid sources out of business cash fields", () => {
    expect(historicalFundingSchema.safeParse({ sourceType: "ad_spend", sourceId, fundingTreatment: "owner_paid_personally", paymentDate: "2026-08-17", businessAccountKey: "", ownerLabel: "Rifat", existingCashMovementId: "", notes: "Owner statement verified", submissionKey: key }).success).toBe(true);
    expect(historicalFundingSchema.safeParse({ sourceType: "expense", sourceId, fundingTreatment: "unpaid", paymentDate: "", businessAccountKey: "", ownerLabel: "", existingCashMovementId: "", notes: "Supplier invoice remains unpaid", submissionKey: key }).success).toBe(true);
  });

  it("accepts historical business-paid evidence without guessing an account or owner", () => {
    const base = { sourceType: "expense", sourceId, fundingTreatment: "historical_business_paid_account_unknown", paymentDate: "2026-07-23", businessAccountKey: "", ownerLabel: "", existingCashMovementId: "", notes: "Owner confirmed the source was paid from business funds; account is not recoverable", submissionKey: key } as const;
    expect(historicalFundingSchema.safeParse(base).success).toBe(true);
    expect(historicalFundingSchema.safeParse({ ...base, paymentDate: "" }).success).toBe(false);
    expect(historicalFundingSchema.safeParse({ ...base, businessAccountKey: "cash" }).success).toBe(false);
    expect(historicalFundingSchema.safeParse({ ...base, ownerLabel: "Ikbal" }).success).toBe(false);
    expect(historicalFundingSchema.safeParse({ ...base, existingCashMovementId: sourceId }).success).toBe(false);
  });

  it("requires a matching movement identifier for already-represented funding", () => {
    const base = { sourceType: "expense", sourceId, fundingTreatment: "already_represented", paymentDate: "2026-08-17", businessAccountKey: "bkash", ownerLabel: "", existingCashMovementId: key, notes: "Matched statement and ledger reference", submissionKey: "00000000-0000-4000-8000-000000000093" } as const;
    expect(historicalFundingSchema.safeParse(base).success).toBe(true);
    expect(historicalFundingSchema.safeParse({ ...base, existingCashMovementId: "" }).success).toBe(false);
  });

  it("validates unpaid payment transitions and exact actual balances", () => {
    expect(payUnpaidSourceSchema.safeParse({ sourceType: "purchase_batch", sourceId, fundingTreatment: "business_account_paid", paymentDate: "2026-08-17", businessAccountKey: "cash", ownerLabel: "", reason: "Paid from counted cash", submissionKey: key }).success).toBe(true);
    expect(accountObservationSchema.safeParse({ accountKey: "cash", observedOn: "2026-08-17", actualBalance: "0.00", reason: "Physical cash counted", submissionKey: key }).success).toBe(true);
    expect(accountObservationSchema.safeParse({ accountKey: "cash", observedOn: "2026-08-17", actualBalance: "1.001", reason: "Physical cash counted", submissionKey: key }).success).toBe(false);
  });

  it("validates owner-held transfers, controls, and exact capital returns", () => {
    expect(ownerHeldTransferSchema.safeParse({ transferDate: "2026-08-17", ownerLabel: "Nasim", businessAccountKey: "cash", amount: "22334.00", reason: "Confirmed Steadfast business funds held by Nasim", submissionKey: key }).success).toBe(true);
    expect(ownerHeldObservationSchema.safeParse({ ownerLabel: "Nasim", observedOn: "2026-08-17", actualDue: "7214.00", reason: "Owner confirmed control balance", submissionKey: key }).success).toBe(true);
    expect(steadfastObservationSchema.safeParse({ observedOn: "2026-08-17", actualReceivable: "4623.00", reason: "Owner confirmed courier control", submissionKey: key }).success).toBe(true);
    expect(ownerCapitalReturnSchema.safeParse({ returnDate: "2026-08-17", ownerLabel: "Nasim", amount: "15120.00", reason: "Approved full capital return", submissionKey: key }).success).toBe(true);
    expect(ownerCapitalReturnSchema.safeParse({ returnDate: "2026-08-17", ownerLabel: "Nasim", amount: "15120.001", reason: "Approved full capital return", submissionKey: key }).success).toBe(false);
  });

  it("requires auditable identifiers for append-only owner reversals", () => {
    expect(ownerCapitalReturnReversalSchema.safeParse({ capitalReturnId: sourceId, reversedOn: "2026-08-18", reason: "Correction approved by owner", submissionKey: key }).success).toBe(true);
    expect(ownerHeldTransferReversalSchema.safeParse({ ownerHeldEventId: sourceId, reversedOn: "2026-08-18", reason: "Transfer evidence was incorrect", submissionKey: key }).success).toBe(true);
  });
});
