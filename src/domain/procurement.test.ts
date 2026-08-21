import { describe, expect, it } from "vitest";
import { allocateFreightByMerchandiseCost, summarizeExpenseAccounting } from "@/domain/procurement";
import type { Expense } from "@/domain/types";

function expense(categoryKey: string, amount: number, accountingClass?: Expense["accountingClass"]): Expense {
  return { id: crypto.randomUUID(), date: "2026-08-15", category: categoryKey, categoryKey, accountingClass, description: categoryKey, amount };
}

describe("procurement accounting", () => {
  it("excludes inventory purchases and freight-in from operating expenses", () => {
    expect(summarizeExpenseAccounting([
      expense("inventory_purchase", 4_698_000),
      expense("freight_in", 148_000),
      expense("software", 25_000),
    ])).toEqual({
      operatingExpenses: 25_000,
      inventoryPurchases: 4_698_000,
      freightIn: 148_000,
      unallocatedProcurement: 4_846_000,
    });
  });

  it("treats legacy product and stock purchase labels as procurement", () => {
    expect(summarizeExpenseAccounting([
      expense("product_purchase", 100),
      expense("stock_purchase", 200),
    ]).operatingExpenses).toBe(0);
  });

  it("allocates freight proportionally and reconciles every poisha", () => {
    const result = allocateFreightByMerchandiseCost(101, [
      { key: "b", merchandisePoisha: 100 },
      { key: "a", merchandisePoisha: 100 },
      { key: "c", merchandisePoisha: 300 },
    ]);
    expect(result).toEqual([
      { key: "a", allocatedFreightPoisha: 20 },
      { key: "b", allocatedFreightPoisha: 20 },
      { key: "c", allocatedFreightPoisha: 61 },
    ]);
    expect(result.reduce((sum, item) => sum + item.allocatedFreightPoisha, 0)).toBe(101);
  });

  it("rejects allocation without a reliable merchandise basis", () => {
    expect(() => allocateFreightByMerchandiseCost(100, [{ key: "unknown", merchandisePoisha: 0 }]))
      .toThrow("positive merchandise value");
  });
});
