import { describe, expect, it } from "vitest";
import { lifetimeReportingPeriod } from "@/domain/reporting-period";

describe("lifetime reporting period", () => {
  it("starts at the earliest valid business date and ends at the reference date", () => {
    expect(lifetimeReportingPeriod("2026-08-10", ["2026-07-12", "2026-06-22", "invalid", "2026-09-01"]))
      .toEqual({ startDate: "2026-06-22", endDate: "2026-08-10" });
  });

  it("uses the reference date when the lifetime scope is empty", () => {
    expect(lifetimeReportingPeriod("2026-08-10", [])).toEqual({ startDate: "2026-08-10", endDate: "2026-08-10" });
  });
});
