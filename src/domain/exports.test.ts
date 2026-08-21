import { describe, expect, it } from "vitest";
import { buildFinancialReportCsv, buildOrdersCsv, buildProductsCsv, serializeCsv } from "@/domain/exports";
import { buildDashboardData, mockOrders, mockProducts } from "@/data/mock-data";

describe("CSV exports", () => {
  it("escapes spreadsheet formulas, quotes, commas, and new lines", () => {
    expect(serializeCsv([["value"], ["=2+2"], ['A "quoted", value'], ["line\nbreak"]]))
      .toBe('\uFEFFvalue\r\n\'=2+2\r\n"A ""quoted"", value"\r\n"line\nbreak"\r\n');
  });

  it("exports bounded order records with exact BDT decimal values", () => {
    const csv = buildOrdersCsv([mockOrders[0]]);
    expect(csv).toContain("Order number,External reference,Order date");
    expect(csv).toContain("NNM-20260714-0001,STD-884321,2026-07-14");
    expect(csv).toContain("930.00,80.00,0.00,1010.00");
  });

  it("exports reference product costs without fabricating inventory value", () => {
    const csv = buildProductsCsv([mockProducts[0]], []);
    expect(csv).toContain("Reference buying price BDT,Selling price BDT,Reference unit margin BDT,Website stock");
    expect(csv).toContain("280.00,580.00,300.00,22,10");
    expect(csv).not.toContain("Inventory value BDT");
  });

  it("keeps unavailable financial values blank instead of inventing zero", () => {
    const data = buildDashboardData();
    data.summary.cogs = null;
    const csv = buildFinancialReportCsv(data);
    expect(csv).toContain("Summary,COGS,,BDT");
    expect(csv).toContain("Reconciliation,All data-quality counts are zero,true,boolean");
  });
});
