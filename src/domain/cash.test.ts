import { describe, expect, it } from "vitest";
import { OWNER_NAMES, calculateOwnerMoneyTaken, cashDirection, cashMovementSchema, cashReversalSchema, ownerCapitalEditSchema, ownerCapitalSummaries, ownerMoneyTakenSchema, ownerPositionPeriodTotals } from "@/domain/cash";

const valid = {
  movementDate: "2026-08-08",
  transactionType: "owner_investment",
  accountKey: "cash",
  amount: "5000.25",
  description: "Opening owner investment",
  reference: "OPEN-1",
  ownerLabel: "Nasim",
  submissionKey: "00000000-0000-4000-8000-000000000001",
} as const;

describe("cash workflow domain", () => {
  it("accepts exact BDT inputs and classifies direction", () => {
    expect(cashMovementSchema.parse(valid).amount).toBe("5000.25");
    expect(cashDirection("owner_investment")).toBe("inflow");
    expect(cashDirection("operating_outflow")).toBe("outflow");
  });

  it("rejects zero, fractional-poisha, and unknown accounts", () => {
    expect(cashMovementSchema.safeParse({ ...valid, amount: "0" }).success).toBe(false);
    expect(cashMovementSchema.safeParse({ ...valid, amount: "1.001" }).success).toBe(false);
    expect(cashMovementSchema.safeParse({ ...valid, accountKey: "" }).success).toBe(false);
  });

  it("requires one of the approved owners for capital movements", () => {
    expect(OWNER_NAMES).toEqual(["Nasim", "Rifat", "Ikbal"]);
    expect(cashMovementSchema.safeParse({ ...valid, ownerLabel: "" }).success).toBe(false);
    expect(cashMovementSchema.safeParse({ ...valid, ownerLabel: "Another owner" }).success).toBe(false);
    expect(cashMovementSchema.safeParse({ ...valid, transactionType: "operating_inflow", ownerLabel: "" }).success).toBe(true);
  });

  it("summarizes active investments and withdrawals for every approved owner", () => {
    expect(ownerCapitalSummaries([
      { transactionType: "owner_investment", amount: 100_000, ownerLabel: "Nasim", isReversed: false },
      { transactionType: "owner_withdrawal", amount: 25_000, ownerLabel: "Nasim", isReversed: false },
      { transactionType: "owner_investment", amount: 50_000, ownerLabel: "Rifat", isReversed: true },
      { transactionType: "reversal", amount: 50_000, ownerLabel: "Rifat", isReversed: false },
    ])).toEqual([
      { ownerName: "Nasim", investments: 100_000, withdrawals: 25_000, netCapital: 75_000 },
      { ownerName: "Rifat", investments: 0, withdrawals: 0, netCapital: 0 },
      { ownerName: "Ikbal", investments: 0, withdrawals: 0, netCapital: 0 },
    ]);
  });

  it("requires an explicit reason and unique submission key for reversal", () => {
    expect(cashReversalSchema.safeParse({ movementId: valid.submissionKey, reason: "Wrong account", submissionKey: "00000000-0000-4000-8000-000000000002" }).success).toBe(true);
    expect(cashReversalSchema.safeParse({ movementId: valid.submissionKey, reason: "", submissionKey: "bad" }).success).toBe(false);
  });

  it("validates editable owner-capital replacements", () => {
    const edit = { ...valid, movementId: valid.submissionKey, correctionReason: "Correct the recorded amount" };
    expect(ownerCapitalEditSchema.safeParse(edit).success).toBe(true);
    expect(ownerCapitalEditSchema.safeParse({ ...edit, transactionType: "operating_inflow" }).success).toBe(false);
    expect(ownerCapitalEditSchema.safeParse({ ...edit, correctionReason: "" }).success).toBe(false);
  });

  it("classifies money taken against capital first and sends only the excess to Due from Owner", () => {
    expect(calculateOwnerMoneyTaken(1_100_000, 1_000_000, 721_400)).toEqual({
      amount: 1_100_000,
      capitalReturn: 1_000_000,
      excessDue: 100_000,
      currentCapitalBefore: 1_000_000,
      currentCapitalAfter: 0,
      dueFromOwnerBefore: 721_400,
      dueFromOwnerAfter: 821_400,
    });
    expect(calculateOwnerMoneyTaken(50_000, 0, 50_000).dueFromOwnerAfter).toBe(100_000);
  });

  it("validates the unified owner-money-taken form independently from manual cash movements", () => {
    const values = {
      eventDate: "2026-08-21",
      ownerLabel: "Ikbal",
      amount: "500",
      sourceAccountKey: "bkash",
      description: "Money taken by Ikbal",
      reference: "OWNER-TAKEN-IKBAL",
      submissionKey: "00000000-0000-4000-8000-000000000003",
    };
    expect(ownerMoneyTakenSchema.safeParse(values).success).toBe(true);
    expect(cashMovementSchema.safeParse({ ...valid, transactionType: "owner_withdrawal" }).success).toBe(false);
  });

  it("reconciles lifetime and custom-period owner classifications in integer poisha", () => {
    const rows = [
      { eventDate: "2026-07-21", ownerLabel: "Nasim", ownerMoneyTakenInPeriod: 1_373_600, capitalReturnInPeriod: 1_373_600, excessDueInPeriod: 0 },
      { eventDate: "2026-07-23", ownerLabel: "Ikbal", ownerMoneyTakenInPeriod: 50_000, capitalReturnInPeriod: 0, excessDueInPeriod: 50_000 },
      { eventDate: "2026-07-26", ownerLabel: "Nasim", ownerMoneyTakenInPeriod: 859_800, capitalReturnInPeriod: 138_400, excessDueInPeriod: 721_400 },
      { eventDate: "2026-08-21", ownerLabel: "Rifat", ownerMoneyTakenInPeriod: 1_000_000, capitalReturnInPeriod: 1_000_000, excessDueInPeriod: 0 },
      { eventDate: "2026-08-21", ownerLabel: "Nasim", ownerMoneyTakenInPeriod: 50_000, capitalReturnInPeriod: 0, excessDueInPeriod: 50_000 },
      { eventDate: "2026-08-21", ownerLabel: "Ikbal", ownerMoneyTakenInPeriod: 50_000, capitalReturnInPeriod: 0, excessDueInPeriod: 50_000 },
    ];

    expect(ownerPositionPeriodTotals(rows, null, null)).toEqual({
      ownerMoneyTaken: 3_383_400,
      capitalReturn: 2_512_000,
      dueCreated: 871_400,
    });
    expect(ownerPositionPeriodTotals(rows, "2026-08-21", "2026-08-21")).toEqual({
      ownerMoneyTaken: 1_100_000,
      capitalReturn: 1_000_000,
      dueCreated: 100_000,
    });
  });

  it("rejects a reporting row whose owner-money-taken decomposition is unbalanced", () => {
    expect(() => ownerPositionPeriodTotals([
      { eventDate: "2026-08-21", ownerLabel: "Nasim", ownerMoneyTakenInPeriod: 50_000, capitalReturnInPeriod: 0, excessDueInPeriod: 49_999 },
    ], null, null)).toThrow(/does not reconcile/);
  });
});
