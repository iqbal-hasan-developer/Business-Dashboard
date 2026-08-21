import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const REQUIRED_ORDER_HEADERS = [
  "order_number", "order_date", "customer_name", "customer_location", "courier",
  "sales_channel", "order_status", "payment_method", "payment_status", "settlement_status",
  "discount_bdt", "delivery_charged_bdt", "refund_bdt", "courier_cost_bdt", "packaging_cost_bdt",
  "sku", "product_name", "quantity", "list_price_bdt", "buying_cost_bdt", "actual_unit_selling_price_bdt",
];

const ORDER_STATUSES = new Set(["Pending", "Confirmed", "Dispatched", "Delivered", "Cancelled", "Returned", "Refunded", "Failed Delivery"]);
const PAYMENT_STATUSES = new Set(["Unpaid", "Paid", "Partially Paid", "Refunded"]);
const SETTLEMENT_STATUSES = new Set(["Not Applicable", "Awaiting", "Partially Settled", "Settled", "Refund Due", "Refunded"]);
const LOCATIONS = new Set(["Inside Dhaka", "Outside Dhaka"]);
const ORDER_LEVEL_FIELDS = ["order_date", "customer_name", "customer_location", "courier", "sales_channel", "order_status", "payment_method", "payment_status", "settlement_status", "discount_bdt", "delivery_charged_bdt", "refund_bdt", "courier_cost_bdt", "packaging_cost_bdt"];

export function parseCsv(source) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows.filter((values) => values.some((value) => value.trim() !== ""));
}

function parseTable(source, label) {
  const rows = parseCsv(source);
  if (!rows.length) throw new Error(`${label} CSV is empty.`);
  const headers = rows[0].map((value) => value.trim().replace(/^\uFEFF/, ""));
  if (new Set(headers).size !== headers.length) throw new Error(`${label} CSV has duplicate headers.`);
  return { headers, records: rows.slice(1).map((values, index) => ({ rowNumber: index + 2, values: Object.fromEntries(headers.map((header, column) => [header, (values[column] ?? "").trim()])) })) };
}

function moneyToPoisha(value) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function issueIf(condition, issues, message) { if (condition) issues.push(message); }

export function validateImport(orderSource, productSource) {
  const orders = parseTable(orderSource, "Orders");
  const missingHeaders = REQUIRED_ORDER_HEADERS.filter((header) => !orders.headers.includes(header));
  if (missingHeaders.length) throw new Error(`Orders CSV is missing headers: ${missingHeaders.join(", ")}`);
  const products = parseTable(productSource, "Products");
  if (!products.headers.includes("sku")) throw new Error("Products CSV must contain a sku header.");
  const productSkus = new Set(products.records.map((record) => record.values.sku).filter(Boolean));
  const rejectedRows = [];
  const acceptedRows = [];
  const orderBaseline = new Map();
  const orderLines = new Map();
  const duplicateOrderConflicts = new Set();
  let deliveredProductRevenuePoisha = 0n;
  let deliveredCogsPoisha = 0n;

  for (const record of orders.records) {
    const value = record.values;
    const issues = [];
    issueIf(!value.order_number, issues, "order_number is required");
    issueIf(!/^\d{4}-\d{2}-\d{2}$/.test(value.order_date), issues, "order_date must be YYYY-MM-DD");
    issueIf(!value.customer_name, issues, "customer_name is required");
    issueIf(!LOCATIONS.has(value.customer_location), issues, "customer_location is unsupported");
    issueIf(!ORDER_STATUSES.has(value.order_status), issues, "order_status is unsupported");
    issueIf(!PAYMENT_STATUSES.has(value.payment_status), issues, "payment_status is unsupported");
    issueIf(!SETTLEMENT_STATUSES.has(value.settlement_status), issues, "settlement_status is unsupported");
    issueIf(!value.sku, issues, "sku is required");
    issueIf(value.sku && !productSkus.has(value.sku), issues, "sku is unknown in the approved product export");
    issueIf(!value.product_name, issues, "product_name is required");
    issueIf(!/^\d+$/.test(value.quantity) || Number(value.quantity) <= 0 || !Number.isSafeInteger(Number(value.quantity)), issues, "quantity must be a positive whole number");
    const money = Object.fromEntries(["discount_bdt", "delivery_charged_bdt", "refund_bdt", "courier_cost_bdt", "packaging_cost_bdt", "list_price_bdt", "buying_cost_bdt", "actual_unit_selling_price_bdt"].map((field) => [field, moneyToPoisha(value[field])]));
    for (const [field, amount] of Object.entries(money)) issueIf(amount === null, issues, `${field} must be a non-negative BDT amount with at most two decimals`);

    const baseline = orderBaseline.get(value.order_number);
    if (baseline) {
      const inconsistent = ORDER_LEVEL_FIELDS.filter((field) => baseline[field] !== value[field]);
      if (inconsistent.length) { issues.push(`order-level values conflict across item rows: ${inconsistent.join(", ")}`); duplicateOrderConflicts.add(value.order_number); }
    } else if (value.order_number) orderBaseline.set(value.order_number, value);

    if (issues.length) rejectedRows.push({ row: record.rowNumber, orderNumber: value.order_number, sku: value.sku, issues });
    else {
      acceptedRows.push(record);
      orderLines.set(value.order_number, (orderLines.get(value.order_number) ?? 0) + 1);
      if (value.order_status === "Delivered") {
        const quantity = BigInt(value.quantity);
        deliveredProductRevenuePoisha += money.actual_unit_selling_price_bdt * quantity;
        deliveredCogsPoisha += money.buying_cost_bdt * quantity;
      }
    }
  }

  const deliveredWithoutItems = [...orderBaseline.entries()].filter(([orderNumber, value]) => value.order_status === "Delivered" && !orderLines.has(orderNumber)).map(([orderNumber]) => orderNumber);
  const report = {
    dryRun: true,
    databaseWrites: 0,
    inputRows: orders.records.length,
    acceptedRows: acceptedRows.length,
    rejectedRows,
    distinctOrders: orderBaseline.size,
    duplicateOrderConflicts: [...duplicateOrderConflicts],
    unknownSkuRows: rejectedRows.filter((row) => row.issues.some((issue) => issue.includes("sku is unknown"))).length,
    deliveredWithoutItems,
    reconciliation: {
      deliveredProductRevenuePoisha: deliveredProductRevenuePoisha.toString(),
      deliveredCogsPoisha: deliveredCogsPoisha.toString(),
    },
    readyForReviewedImport: rejectedRows.length === 0 && duplicateOrderConflicts.size === 0 && deliveredWithoutItems.length === 0,
  };
  return report;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const ordersPath = argument("--orders");
  const productsPath = argument("--products");
  const reportPath = argument("--report");
  if (!ordersPath || !productsPath) {
    console.error("Usage: npm run import:dry-run -- --orders <orders.csv> --products <products.csv> [--report <report.json>]");
    process.exitCode = 2;
  } else {
    try {
      const report = validateImport(readFileSync(resolve(ordersPath), "utf8"), readFileSync(resolve(productsPath), "utf8"));
      const json = `${JSON.stringify(report, null, 2)}\n`;
      if (reportPath) writeFileSync(resolve(reportPath), json, { encoding: "utf8", flag: "wx" });
      process.stdout.write(json);
      process.exitCode = report.readyForReviewedImport ? 0 : 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Import dry run failed.");
      process.exitCode = 2;
    }
  }
}
