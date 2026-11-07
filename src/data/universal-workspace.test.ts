import { describe, expect, it } from "vitest";
import { escapeCommerceSearch, normalizeCommerceAmount, normalizeCommerceDate, normalizeCommerceDateRange, normalizeCommerceId, normalizeCommerceIntegerRange, normalizeCommercePage, normalizeCommerceRange, normalizeCommerceSort } from "./universal-workspace";

describe("workspace commerce list input", () => {
  it("bounds page numbers and falls back to page one", () => {
    expect(normalizeCommercePage(undefined)).toBe(1);
    expect(normalizeCommercePage("invalid")).toBe(1);
    expect(normalizeCommercePage("0")).toBe(1);
    expect(normalizeCommercePage("999999")).toBe(10000);
  });

  it("limits search length and escapes PostgREST filter syntax", () => {
    expect(escapeCommerceSearch('a,b.%_"c')).toBe('a\\,b\\.\\%\\_\\"c');
    expect(escapeCommerceSearch("x".repeat(120))).toHaveLength(100);
  });

  it("rejects malformed date and amount filters", () => {
    expect(normalizeCommerceDate("2026-11-07")).toBe("2026-11-07");
    expect(normalizeCommerceDate("2026-02-30")).toBeNull();
    expect(normalizeCommerceDate("2026-1-01")).toBeNull();
    expect(normalizeCommerceAmount("123.456789")).toBe("123.456789");
    expect(normalizeCommerceAmount("-1")).toBeNull();
    expect(normalizeCommerceAmount("1.1234567")).toBeNull();
    expect(normalizeCommerceRange("20", "10")).toEqual({ min: null, max: null });
    expect(normalizeCommerceDateRange("2026-11-08", "2026-11-07")).toEqual({ start: null, end: null });
  });

  it("allows only predefined sort keys and directions", () => {
    expect(normalizeCommerceSort("orders", "total", "asc")).toEqual({ key: "total", column: "total", direction: "asc" });
    expect(normalizeCommerceSort("products", "updated_at desc; drop table products", "sideways")).toEqual({ key: "updated", column: "updated_at", direction: "desc" });
  });

  it("validates customer/store IDs and bounded order-count filters", () => {
    expect(normalizeCommerceId("00000000-0000-4000-8000-000000000001")).toBe("00000000-0000-4000-8000-000000000001");
    expect(normalizeCommerceId("not-a-uuid")).toBeNull();
    expect(normalizeCommerceIntegerRange("0", "12")).toEqual({ min: 0, max: 12 });
    expect(normalizeCommerceIntegerRange("4", "2")).toEqual({ min: null, max: null });
    expect(normalizeCommerceIntegerRange("-1", "10000000")).toEqual({ min: null, max: null });
  });
});
