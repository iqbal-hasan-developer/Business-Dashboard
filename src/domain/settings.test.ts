import { describe, expect, it } from "vitest";
import { businessSettingsFormSchema, businessSettingsRpcArgs, courierCostForLocation, OWNER_APPROVED_BUSINESS_SETTINGS, settingsToFormValues } from "@/domain/settings";

describe("business settings", () => {
  it("preserves the owner-approved defaults in integer poisha", () => {
    expect(OWNER_APPROVED_BUSINESS_SETTINGS).toMatchObject({
      insideDhakaCourierCost: 6500,
      outsideDhakaCourierCost: 13500,
      packagingCostPerOrder: 800,
      taxVatBasisPoints: 0,
    });
  });

  it("converts validated BDT and percentage inputs to exact integer RPC values", () => {
    const values = businessSettingsFormSchema.parse({
      defaultCourier: "Steadfast",
      insideDhakaCourierCost: "65",
      outsideDhakaCourierCost: "115.50",
      packagingCostPerOrder: "2",
      taxVatPercent: "7.5",
    });
    expect(businessSettingsRpcArgs(values)).toEqual({
      p_default_courier: "Steadfast",
      p_inside_dhaka_courier_cost_poisha: 6500,
      p_outside_dhaka_courier_cost_poisha: 11550,
      p_packaging_cost_per_order_poisha: 200,
      p_tax_vat_basis_points: 750,
    });
  });

  it("rejects negative, excessive, and over-precision values", () => {
    const base = settingsToFormValues(OWNER_APPROVED_BUSINESS_SETTINGS);
    expect(businessSettingsFormSchema.safeParse({ ...base, insideDhakaCourierCost: "-1" }).success).toBe(false);
    expect(businessSettingsFormSchema.safeParse({ ...base, taxVatPercent: "100.01" }).success).toBe(false);
    expect(businessSettingsFormSchema.safeParse({ ...base, packagingCostPerOrder: "2.001" }).success).toBe(false);
  });

  it("selects the correct location default without changing the stored settings", () => {
    expect(courierCostForLocation(OWNER_APPROVED_BUSINESS_SETTINGS, "Inside Dhaka")).toBe(6500);
    expect(courierCostForLocation(OWNER_APPROVED_BUSINESS_SETTINGS, "Outside Dhaka")).toBe(13500);
  });
});
