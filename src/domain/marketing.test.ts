import { describe, expect, it } from "vitest";
import { campaignPerformanceSchema, deleteAdSpendSchema, editAdSpendSchema, resolveMarketingDates } from "@/domain/marketing";

describe("marketing validation", () => {
  it("resolves common date ranges without changing lifetime", () => {
    expect(resolveMarketingDates("2026-08-13", "lifetime")).toEqual({ startDate: null, endDate: null });
    expect(resolveMarketingDates("2026-08-13", "7d")).toEqual({ startDate: "2026-08-07", endDate: "2026-08-13" });
  });

  it("requires an audit reason and exact positive spend", () => {
    const base = { spendId: "00000000-0000-4000-8000-000000000001", campaignId: "00000000-0000-4000-8000-000000000002", spendDate: "2026-08-13", platform: "Meta", sourceReference: "export", expectedUpdatedAt: "2026-08-13T00:00:00.000Z" };
    expect(editAdSpendSchema.safeParse({ ...base, amount: "10.25", reason: "Corrected invoice" }).success).toBe(true);
    expect(editAdSpendSchema.safeParse({ ...base, amount: "10.255", reason: "x" }).success).toBe(false);
    expect(deleteAdSpendSchema.safeParse({ spendId: base.spendId, reason: "", expectedUpdatedAt: base.expectedUpdatedAt }).success).toBe(false);
    expect(deleteAdSpendSchema.safeParse({ spendId: base.spendId, reason: "Duplicate imported spend", expectedUpdatedAt: "2026-08-12T17:47:57.334244+00:00" }).success).toBe(true);
  });

  it("preserves unavailable metrics and rejects impossible relationships", () => {
    const base = { campaignId: "00000000-0000-4000-8000-000000000002", resultsCount: "", resultType: "", impressions: "100", reach: "101", totalMessagingContacts: "", newMessagingContacts: "", purchases: "", attributionSetting: "", sourceReference: "", reason: "Imported correction", expectedUpdatedAt: "2026-08-13T00:00:00.000Z" };
    expect(campaignPerformanceSchema.safeParse(base).success).toBe(false);
    const valid = campaignPerformanceSchema.parse({ ...base, reach: "80" });
    expect(valid.resultsCount).toBeNull();
  });
});
