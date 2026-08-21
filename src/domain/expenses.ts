import { z } from "zod";
import { parseMoney } from "@/domain/money";
import { fundingFields, validateFunding } from "@/domain/funding";

export const EXPENSE_CATEGORIES = [
  { key: "operations", label: "Operations" },
  { key: "business_transportation", label: "Non-inventory business transportation" },
  { key: "packaging_supplies", label: "Packaging & supplies" },
  { key: "financial_fees", label: "Financial fees & transaction charges" },
  { key: "software", label: "Software & subscriptions" },
  { key: "utilities", label: "Utilities" },
  { key: "professional_services", label: "Professional services" },
  { key: "other", label: "Other expenses" },
  { key: "inventory_purchase", label: "Inventory purchase" },
  { key: "freight_in", label: "Freight-in / supplier transportation" },
  { key: "unallocated_procurement", label: "Unallocated procurement" },
] as const;

export const EXPENSE_CATEGORY_KEYS = EXPENSE_CATEGORIES.map((category) => category.key) as [
  (typeof EXPENSE_CATEGORIES)[number]["key"],
  ...(typeof EXPENSE_CATEGORIES)[number]["key"][],
];

const expenseCategorySchema = z.enum(EXPENSE_CATEGORY_KEYS, { message: "Choose an expense category" });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid business date");
const databaseTimestamp = z.string().datetime({
  offset: true,
  message: "This expense has an invalid update timestamp. Refresh and try again.",
});
const moneyInput = z.string().trim()
  .regex(/^\d+(\.\d{0,2})?$/, "Enter a positive amount with up to 2 decimals")
  .superRefine((value, context) => {
    try {
      if (parseMoney(value) <= 0) context.addIssue({ code: "custom", message: "Amount must be greater than zero" });
    } catch {
      context.addIssue({ code: "custom", message: "Enter an amount within the supported poisha range" });
    }
  });

const expenseDetailsSchema = z.object({
  expenseDate: isoDate,
  categoryKey: expenseCategorySchema,
  description: z.string().trim().min(2, "Description is required").max(500),
  amount: moneyInput,
  paymentMethod: z.string().trim().max(80),
  campaignId: z.string().uuid().nullable(),
  salesChannel: z.string().trim().max(100),
  reference: z.string().trim().max(160),
});

export const expenseEntrySchema = expenseDetailsSchema.extend(fundingFields).superRefine(validateFunding);

export const editExpenseSchema = expenseDetailsSchema.extend({
  expenseId: z.string().uuid(),
  reason: z.string().trim().min(3, "Explain why this expense is changing").max(500),
  expectedUpdatedAt: databaseTimestamp,
}).strict();

export const deleteExpenseSchema = z.object({
  expenseId: z.string().uuid(),
  reason: z.string().trim().min(3, "Explain why this expense is being deleted").max(500),
  expectedUpdatedAt: databaseTimestamp,
}).strict();

export type ExpenseEntryValues = z.infer<typeof expenseEntrySchema>;
export type EditExpenseValues = z.infer<typeof editExpenseSchema>;
export type DeleteExpenseValues = z.infer<typeof deleteExpenseSchema>;

const categoryLabels = new Map<string, string>(EXPENSE_CATEGORIES.map((category) => [category.key, category.label]));

export function expenseCategoryLabel(key: string): string {
  return categoryLabels.get(key.trim().toLowerCase())
    ?? key.trim().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function safeExpenseError(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  const message = error instanceof Error ? error.message : "";
  if (code === "40001" || /changed.*refresh/i.test(message)) return "This expense changed after you opened it. Refresh and try again.";
  if (code === "42501" || /not authorized|permission/i.test(message)) return "Your dashboard role cannot perform this action.";
  if (code === "P0002" || /not found/i.test(message)) return "This expense no longer exists. Refresh the page.";
  if (code === "23503" || /linked cash movement/i.test(message)) return "This expense is linked to a cash movement and cannot be changed until that cash record is corrected.";
  return "The expense update could not be saved. No partial change was kept.";
}
