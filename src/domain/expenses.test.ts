import { describe, expect, it } from "vitest";
import { deleteExpenseSchema, editExpenseSchema, expenseCategoryLabel, expenseEntrySchema, EXPENSE_CATEGORIES } from "@/domain/expenses";

const base = {
  expenseDate: "2026-08-13",
  categoryKey: "inventory_purchase",
  description: "Bought stock from supplier",
  amount: "2500.50",
  paymentMethod: "Cash",
  campaignId: null,
  salesChannel: "",
  reference: "INV-25",
  fundingTreatment: "business_account_paid" as const,
  paymentDate: "2026-08-13",
  businessAccountKey: "cash",
  ownerLabel: "",
  submissionKey: "00000000-0000-4000-8000-000000000091",
};

describe("expense validation", () => {
  it("offers the requested controlled categories", () => {
    expect(EXPENSE_CATEGORIES).toEqual(expect.arrayContaining([
      { key: "inventory_purchase", label: "Inventory purchase" },
      { key: "freight_in", label: "Freight-in / supplier transportation" },
      { key: "business_transportation", label: "Non-inventory business transportation" },
      { key: "other", label: "Other expenses" },
    ]));
    expect(expenseEntrySchema.safeParse(base).success).toBe(true);
    expect(expenseEntrySchema.safeParse({ ...base, categoryKey: "advertising" }).success).toBe(false);
  });

  it("requires exact positive money and audited mutation reasons", () => {
    expect(expenseEntrySchema.safeParse({ ...base, amount: "1.001" }).success).toBe(false);
    expect(editExpenseSchema.safeParse({ expenseDate: base.expenseDate, categoryKey: base.categoryKey, description: base.description, amount: base.amount, paymentMethod: base.paymentMethod, campaignId: base.campaignId, salesChannel: base.salesChannel, reference: base.reference, expenseId: "00000000-0000-4000-8000-000000000001", reason: "Correct category", expectedUpdatedAt: "2026-08-13T00:00:00.000Z" }).success).toBe(true);
    expect(deleteExpenseSchema.safeParse({ expenseId: "00000000-0000-4000-8000-000000000001", reason: "", expectedUpdatedAt: "2026-08-13T00:00:00.000Z" }).success).toBe(false);
  });

  it("labels known and legacy category keys safely", () => {
    expect(expenseCategoryLabel("freight_in")).toBe("Freight-in / supplier transportation");
    expect(expenseCategoryLabel("legacy_cost")).toBe("Legacy Cost");
  });
});
