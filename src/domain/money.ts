import type { Money } from "@/domain/types";

export function assertMoney(value: number): asserts value is Money {
  if (!Number.isSafeInteger(value)) throw new Error("Money must be a safe integer in poisha.");
}

export function parseMoney(value: string): Money {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) throw new Error("Enter a valid non-negative amount with up to 2 decimals.");
  const [whole, fraction = ""] = normalized.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  assertMoney(amount);
  return amount;
}

export function formatMoney(value: Money, showDecimals = false): string {
  assertMoney(value);
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute / 100).toLocaleString("en-BD");
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${sign}৳${whole}${showDecimals || fraction !== "00" ? `.${fraction}` : ""}`;
}

export function multiplyMoney(unitAmount: Money, quantity: number): Money {
  assertMoney(unitAmount);
  if (!Number.isSafeInteger(quantity)) throw new Error("Quantity must be a whole number.");
  const total = unitAmount * quantity;
  assertMoney(total);
  return total;
}

export function sumMoney(values: Money[]): Money {
  return values.reduce((total, value) => {
    assertMoney(value);
    const next = total + value;
    assertMoney(next);
    return next;
  }, 0);
}
