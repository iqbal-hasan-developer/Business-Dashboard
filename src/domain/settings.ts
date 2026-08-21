import { z } from "zod";
import { parseMoney } from "@/domain/money";
import type { BusinessSettings, Money } from "@/domain/types";

const supportedMoneyInput = z.string().trim().min(1, "Amount is required").superRefine((value, context) => {
  try {
    const amount = parseMoney(value);
    if (amount < 0 || amount > 100_000_000) context.addIssue({ code: "custom", message: "Enter an amount from 0 to 1,000,000 BDT" });
  } catch {
    context.addIssue({ code: "custom", message: "Enter a valid BDT amount with at most two decimals" });
  }
});

const percentageInput = z.string().trim().min(1, "Tax or VAT is required").superRefine((value, context) => {
  try {
    const basisPoints = parseMoney(value);
    if (basisPoints < 0 || basisPoints > 10_000) context.addIssue({ code: "custom", message: "Enter a percentage from 0 to 100" });
  } catch {
    context.addIssue({ code: "custom", message: "Enter a percentage with at most two decimals" });
  }
});

export const businessSettingsFormSchema = z.object({
  defaultCourier: z.string().trim().min(1, "Default courier is required").max(120),
  insideDhakaCourierCost: supportedMoneyInput,
  outsideDhakaCourierCost: supportedMoneyInput,
  packagingCostPerOrder: supportedMoneyInput,
  taxVatPercent: percentageInput,
});

export type BusinessSettingsFormValues = z.infer<typeof businessSettingsFormSchema>;

export const OWNER_APPROVED_BUSINESS_SETTINGS: BusinessSettings = {
  currency: "BDT",
  timezone: "Asia/Dhaka",
  defaultCourier: "Steadfast",
  insideDhakaCourierCost: 6_500,
  outsideDhakaCourierCost: 11_500,
  packagingCostPerOrder: 200,
  taxVatBasisPoints: 0,
  cashAccounts: [
    { key: "cash", label: "Cash" },
    { key: "bkash", label: "bKash" },
    { key: "nagad", label: "Nagad" },
    { key: "bank", label: "Bank" },
    { key: "steadfast", label: "Steadfast" },
  ],
};

export function moneyInput(value: Money) {
  return (value / 100).toFixed(2).replace(/\.00$/, "");
}

export function settingsToFormValues(settings: BusinessSettings): BusinessSettingsFormValues {
  return {
    defaultCourier: settings.defaultCourier,
    insideDhakaCourierCost: moneyInput(settings.insideDhakaCourierCost),
    outsideDhakaCourierCost: moneyInput(settings.outsideDhakaCourierCost),
    packagingCostPerOrder: moneyInput(settings.packagingCostPerOrder),
    taxVatPercent: moneyInput(settings.taxVatBasisPoints),
  };
}

export function businessSettingsRpcArgs(values: BusinessSettingsFormValues) {
  return {
    p_default_courier: values.defaultCourier,
    p_inside_dhaka_courier_cost_poisha: parseMoney(values.insideDhakaCourierCost),
    p_outside_dhaka_courier_cost_poisha: parseMoney(values.outsideDhakaCourierCost),
    p_packaging_cost_per_order_poisha: parseMoney(values.packagingCostPerOrder),
    p_tax_vat_basis_points: parseMoney(values.taxVatPercent),
  };
}

export function courierCostForLocation(settings: BusinessSettings, location: "Inside Dhaka" | "Outside Dhaka") {
  return location === "Inside Dhaka" ? settings.insideDhakaCourierCost : settings.outsideDhakaCourierCost;
}
