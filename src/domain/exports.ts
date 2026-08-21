import { calculateOrderFinancials } from "@/domain/calculations";
import type { DashboardData, Money, Order, Product, ProductCategory } from "@/domain/types";

type CsvValue = string | number | boolean | null | undefined;

const UTF8_BOM = "\uFEFF";

function escapeCsvCell(value: CsvValue) {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
  const escaped = raw.replaceAll('"', '""');
  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

export function serializeCsv(rows: CsvValue[][]) {
  return `${UTF8_BOM}${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}\r\n`;
}

function moneyInBdt(value: Money | null) {
  return value === null ? null : (value / 100).toFixed(2);
}

export function buildOrdersCsv(orders: Order[]) {
  const rows: CsvValue[][] = [[
    "Order number", "External reference", "Order date", "Customer name", "Customer phone", "Customer address",
    "Location", "Courier", "Sales channel", "Campaign", "Order status", "Payment method", "Payment status",
    "Settlement status", "Item lines", "Units", "Product subtotal BDT", "Delivery charged BDT", "Discount BDT",
    "Order total BDT", "Refund BDT", "Recognized product revenue BDT", "Recognized COGS BDT", "Gross profit BDT",
    "Contribution profit BDT",
  ]];

  for (const order of orders) {
    const financials = calculateOrderFinancials(order);
    rows.push([
      order.orderNumber, order.externalReference, order.orderDate, order.customerName, order.customerPhone,
      order.customerAddress, order.customerLocation, order.courier, order.channel, order.campaign, order.status,
      order.paymentMethod, order.paymentStatus, order.settlementStatus, order.items.length,
      order.items.reduce((total, item) => total + item.quantity, 0), moneyInBdt(financials.productSubtotal),
      moneyInBdt(order.deliveryCharged), moneyInBdt(order.discount), moneyInBdt(financials.orderTotal),
      moneyInBdt(order.refundAmount), moneyInBdt(financials.productRevenue), moneyInBdt(financials.recognizedCogs),
      moneyInBdt(financials.grossProfit), moneyInBdt(financials.contributionProfit),
    ]);
  }
  return serializeCsv(rows);
}

export function buildProductsCsv(products: Product[], categories: ProductCategory[]) {
  const categoryById = new Map(categories.map((category) => [category.id, category.name]));
  const rows: CsvValue[][] = [[
    "SKU", "Public SKU", "Product name", "Category", "Variation", "Active", "Reference buying price BDT",
    "Selling price BDT", "Reference unit margin BDT", "Website stock", "Reorder level", "Internal notes",
  ]];

  for (const product of products) {
    const category = product.categoryId ? categoryById.get(product.categoryId) ?? "Uncategorised" : product.category;
    rows.push([
      product.sku, product.publicSku, product.name, category, product.variation, product.isActive ?? true,
      moneyInBdt(product.buyingPrice), moneyInBdt(product.sellingPrice), moneyInBdt(product.sellingPrice - product.buyingPrice),
      product.stock, product.reorderLevel, product.internalNotes,
    ]);
  }
  return serializeCsv(rows);
}

export function buildFinancialReportCsv(data: DashboardData) {
  const { summary, reporting, dataQuality } = data;
  const rows: CsvValue[][] = [["Section", "Metric", "Value", "Unit"]];
  const summaryRows: Array<[string, CsvValue, string]> = [
    ["Total orders", summary.totalOrders, "count"],
    ["Delivered orders", summary.deliveredOrders, "count"],
    ["Pending or active orders", summary.pendingOrders, "count"],
    ["Product revenue", moneyInBdt(summary.productRevenue), "BDT"],
    ["Net revenue", moneyInBdt(summary.netRevenue), "BDT"],
    ["COGS", moneyInBdt(summary.cogs), "BDT"],
    ["Gross profit", moneyInBdt(summary.grossProfit), "BDT"],
    ["Contribution profit", moneyInBdt(summary.contributionProfit), "BDT"],
    ["Advertising spend", moneyInBdt(summary.adSpend), "BDT"],
    ["Operating expenses", moneyInBdt(summary.operatingExpenses), "BDT"],
    ["Inventory purchases", moneyInBdt(summary.inventoryProcurement), "BDT"],
    ["Freight-in", moneyInBdt(summary.freightIn), "BDT"],
    ["Unallocated procurement", moneyInBdt(summary.unallocatedProcurement), "BDT"],
    ["Net profit", moneyInBdt(summary.netProfit), "BDT"],
    ["Profit margin", summary.profitMargin === null ? null : (summary.profitMargin * 100).toFixed(2), "percent"],
    ["Average order value", moneyInBdt(summary.averageOrderValue), "BDT"],
    ["Cash balance", moneyInBdt(summary.cashBalance), "BDT"],
    ["COD receivable", moneyInBdt(summary.codReceivable), "BDT"],
    ["Known allocated inventory value", moneyInBdt(summary.inventoryValue), "BDT"],
    ["Recognized refunds", moneyInBdt(reporting.recognizedRefundAmount), "BDT"],
  ];
  summaryRows.forEach(([metric, value, unit]) => rows.push(["Summary", metric, value, unit]));

  rows.push(["Reconciliation", "Filtered summary matches recognized order rows", reporting.summaryMatchesOrderDetails, "boolean"]);
  rows.push(["Reconciliation", "Global RPC matches reconciliation view", reporting.globalReconciliationMatches, "boolean"]);
  rows.push(["Reconciliation", "All data-quality counts are zero", reporting.dataQualityAllZero, "boolean"]);

  for (const [metric, value] of Object.entries(dataQuality)) rows.push(["Data quality", metric, value, "count"]);
  return serializeCsv(rows);
}
