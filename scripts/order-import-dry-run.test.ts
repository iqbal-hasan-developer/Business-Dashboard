import { describe, expect, it } from "vitest";
import { validateImport } from "./order-import-dry-run.mjs";

const header = "order_number,order_date,customer_name,customer_location,courier,sales_channel,order_status,payment_method,payment_status,settlement_status,discount_bdt,delivery_charged_bdt,refund_bdt,courier_cost_bdt,packaging_cost_bdt,sku,product_name,quantity,list_price_bdt,buying_cost_bdt,actual_unit_selling_price_bdt";
const products = "sku,name\nSKU-1,Planner\n";

describe("order import dry run", () => {
  it("reconciles accepted Delivered item rows in integer poisha without writes", () => {
    const row = "NN-1,2026-08-08,Customer,Inside Dhaka,Steadfast,Facebook Page,Delivered,COD,Unpaid,Awaiting,0,80,0,65,2,SKU-1,Planner,2,500,250,480";
    expect(validateImport(`${header}\n${row}\n`, products)).toMatchObject({
      dryRun: true,
      databaseWrites: 0,
      inputRows: 1,
      acceptedRows: 1,
      readyForReviewedImport: true,
      reconciliation: { deliveredProductRevenuePoisha: "96000", deliveredCogsPoisha: "50000" },
    });
  });

  it("rejects unknown SKUs, fractional poisha, and conflicting duplicate order fields", () => {
    const rows = [
      "NN-1,2026-08-08,Customer,Inside Dhaka,Steadfast,Facebook Page,Pending,COD,Unpaid,Awaiting,0,80,0,65,2,UNKNOWN,Planner,1,500,250,480",
      "NN-1,2026-08-09,Customer,Inside Dhaka,Steadfast,Facebook Page,Pending,COD,Unpaid,Awaiting,0,80,0,65,2,SKU-1,Planner,1,500,250.001,480",
    ].join("\n");
    const report = validateImport(`${header}\n${rows}\n`, products);
    expect(report.readyForReviewedImport).toBe(false);
    expect(report.rejectedRows).toHaveLength(2);
    expect(report.duplicateOrderConflicts).toEqual(["NN-1"]);
    expect(report.unknownSkuRows).toBe(1);
  });
});
