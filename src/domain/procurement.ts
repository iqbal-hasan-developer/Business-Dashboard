import type { Expense, Money } from "@/domain/types";
import { sumMoney } from "@/domain/money";

export const OPERATING_EXPENSE_CATEGORY_KEYS = [
  "operations",
  "business_transportation",
  "packaging_supplies",
  "software",
  "utilities",
  "professional_services",
  "other",
] as const;

export const PROCUREMENT_CATEGORY_KEYS = [
  "inventory_purchase",
  "freight_in",
  "unallocated_procurement",
] as const;

export type ExpenseAccountingClass =
  | "operating_expense"
  | "inventory_purchase"
  | "freight_in"
  | "unallocated_procurement";

const INVENTORY_PURCHASE_KEYS = new Set([
  "inventory_purchase",
  "product_purchase",
  "stock_purchase",
]);
const FREIGHT_IN_KEYS = new Set(["freight_in", "inventory_procurement_transport"]);

export function expenseAccountingClass(
  categoryKey: string | undefined,
  persistedClass?: ExpenseAccountingClass,
): ExpenseAccountingClass {
  if (persistedClass) return persistedClass;
  const key = categoryKey?.trim().toLowerCase() ?? "";
  if (INVENTORY_PURCHASE_KEYS.has(key)) return "inventory_purchase";
  if (FREIGHT_IN_KEYS.has(key)) return "freight_in";
  if (key === "unallocated_procurement") return "unallocated_procurement";
  return "operating_expense";
}

export function isOperatingExpense(expense: Pick<Expense, "categoryKey" | "accountingClass">) {
  return expenseAccountingClass(expense.categoryKey, expense.accountingClass) === "operating_expense";
}

export function summarizeExpenseAccounting(expenses: Expense[]): {
  operatingExpenses: Money;
  inventoryPurchases: Money;
  freightIn: Money;
  unallocatedProcurement: Money;
} {
  const amounts: Record<ExpenseAccountingClass, Money[]> = {
    operating_expense: [],
    inventory_purchase: [],
    freight_in: [],
    unallocated_procurement: [],
  };
  for (const expense of expenses) {
    amounts[expenseAccountingClass(expense.categoryKey, expense.accountingClass)].push(expense.amount);
  }
  return {
    operatingExpenses: sumMoney(amounts.operating_expense),
    inventoryPurchases: sumMoney(amounts.inventory_purchase),
    freightIn: sumMoney(amounts.freight_in),
    unallocatedProcurement: sumMoney([
      ...amounts.inventory_purchase,
      ...amounts.freight_in,
      ...amounts.unallocated_procurement,
    ]),
  };
}

/**
 * Allocates freight in integer poisha by merchandise value. Leftover poisha
 * goes to the largest fractional remainder, with the stable key as tie-breaker.
 */
export function allocateFreightByMerchandiseCost(
  freightPoisha: Money,
  items: Array<{ key: string; merchandisePoisha: Money }>,
): Array<{ key: string; allocatedFreightPoisha: Money }> {
  if (!Number.isSafeInteger(freightPoisha) || freightPoisha < 0 || items.length === 0) {
    throw new Error("Freight allocation requires a non-negative exact total and at least one item.");
  }
  const merchandiseTotal = items.reduce((total, item) => {
    if (!item.key || !Number.isSafeInteger(item.merchandisePoisha) || item.merchandisePoisha < 0) {
      throw new Error("Freight allocation items must use stable keys and non-negative exact values.");
    }
    return total + item.merchandisePoisha;
  }, 0);
  if (!Number.isSafeInteger(merchandiseTotal) || merchandiseTotal <= 0) {
    throw new Error("Freight allocation requires positive merchandise value.");
  }
  if (new Set(items.map((item) => item.key)).size !== items.length) {
    throw new Error("Freight allocation keys must be unique.");
  }

  const ranked = items.map((item) => {
    const numerator = BigInt(freightPoisha) * BigInt(item.merchandisePoisha);
    const denominator = BigInt(merchandiseTotal);
    return {
      key: item.key,
      allocatedFreightPoisha: Number(numerator / denominator),
      remainder: numerator % denominator,
    };
  });
  let remaining = freightPoisha - ranked.reduce((total, item) => total + item.allocatedFreightPoisha, 0);
  ranked.sort((left, right) => left.remainder === right.remainder
    ? left.key.localeCompare(right.key)
    : left.remainder > right.remainder ? -1 : 1);
  for (const item of ranked) {
    if (remaining === 0) break;
    item.allocatedFreightPoisha += 1;
    remaining -= 1;
  }
  return ranked
    .sort((left, right) => left.key.localeCompare(right.key))
    .map(({ key, allocatedFreightPoisha }) => ({ key, allocatedFreightPoisha }));
}
