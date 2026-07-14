import { multiplyMoney, sumMoney } from "@/domain/money";
import type { Money, Order, OrderFinancials, OrderItem, Product } from "@/domain/types";

export function calculateLineRevenue(item: Pick<OrderItem, "quantity" | "actualUnitSellingPrice">): Money {
  return multiplyMoney(item.actualUnitSellingPrice, item.quantity);
}

export function calculateLineCogs(item: Pick<OrderItem, "quantity" | "buyingCostSnapshot">): Money {
  return multiplyMoney(item.buyingCostSnapshot, item.quantity);
}

export function calculateOrderFinancials(order: Pick<Order, "items" | "status" | "discount" | "deliveryCharged" | "refundAmount" | "courierCostSnapshot" | "packagingCostSnapshot">): OrderFinancials {
  const productSubtotal = sumMoney(order.items.map(calculateLineRevenue));
  const productCogs = sumMoney(order.items.map(calculateLineCogs));
  const orderTotal = productSubtotal + order.deliveryCharged - order.discount;
  const delivered = order.status === "Delivered";
  const productRevenue = delivered ? productSubtotal : 0;
  const netRevenue = delivered ? Math.max(orderTotal - order.refundAmount, 0) : 0;
  const recognizedCogs = delivered ? productCogs : 0;
  const grossProfit = netRevenue - recognizedCogs;
  const contributionProfit = delivered
    ? grossProfit - order.courierCostSnapshot - order.packagingCostSnapshot
    : 0;
  const profitMargin = netRevenue > 0 ? contributionProfit / netRevenue : 0;
  return { productSubtotal, productRevenue, orderTotal, productCogs, netRevenue, recognizedCogs, grossProfit, contributionProfit, profitMargin };
}

export function calculateInventoryValue(products: Product[]): Money {
  return sumMoney(products.map((product) => multiplyMoney(product.buyingPrice, product.stock)));
}

export function orderWarnings(order: Order, knownSkus: Set<string>, existingOrderNumbers: Set<string>, editingId?: string): string[] {
  const warnings: string[] = [];
  if (existingOrderNumbers.has(order.orderNumber) && order.id !== editingId) warnings.push("Duplicate order number");
  if (order.items.length === 0) warnings.push("Add at least one product item");
  if (order.items.some((item) => item.quantity < 1)) warnings.push("Quantity must be at least 1");
  if ([order.discount, order.deliveryCharged, order.refundAmount].some((value) => value < 0)) warnings.push("Money values cannot be negative");
  if (order.items.some((item) => item.actualUnitSellingPrice < item.buyingCostSnapshot)) warnings.push("One or more selling prices are below buying cost");
  if (order.status === "Delivered" && order.items.length === 0) warnings.push("Delivered orders must contain an item");
  if (order.settlementStatus === "Settled" && order.status !== "Delivered") warnings.push("Settlement is marked Settled before delivery");
  if (order.status === "Delivered" && order.settlementStatus === "Awaiting") warnings.push("Delivered order still has an Awaiting settlement");
  if (order.refundAmount > calculateOrderFinancials(order).orderTotal) warnings.push("Refund exceeds the order value");
  if (order.items.some((item) => !knownSkus.has(item.skuSnapshot))) warnings.push("One or more items use an unknown SKU");
  return [...new Set(warnings)];
}
