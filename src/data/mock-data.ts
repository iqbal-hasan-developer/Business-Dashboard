import { aggregateDashboardData } from "@/domain/dashboard";
import { parseMoney } from "@/domain/money";
import type { DashboardData, DashboardFilters, Expense, Order, OrderItem, Product } from "@/domain/types";

export const mockProducts: Product[] = [
  { id: "p1", sku: "NN-PLN-001", name: "Ultimate Life Planner", category: "Planners", variation: "Midnight", buyingPrice: parseMoney("280"), sellingPrice: parseMoney("580"), stock: 22, reorderLevel: 10 },
  { id: "p2", sku: "NN-BDG-002", name: "Budget Reset Workbook", category: "Finance", variation: "Sage", buyingPrice: parseMoney("210"), sellingPrice: parseMoney("450"), stock: 8, reorderLevel: 12 },
  { id: "p3", sku: "NN-JRN-003", name: "90-Day Focus Journal", category: "Journals", variation: "Sand", buyingPrice: parseMoney("240"), sellingPrice: parseMoney("520"), stock: 31, reorderLevel: 10 },
  { id: "p4", sku: "NN-STD-004", name: "Student Success Kit", category: "Study", variation: "Blue", buyingPrice: parseMoney("390"), sellingPrice: parseMoney("790"), stock: 6, reorderLevel: 8 },
  { id: "p5", sku: "NN-HBT-005", name: "Habit Builder Cards", category: "Wellness", variation: "Violet", buyingPrice: parseMoney("160"), sellingPrice: parseMoney("350"), stock: 44, reorderLevel: 15 },
  { id: "p6", sku: "NN-DSK-006", name: "Desk Planning Pad", category: "Desk", variation: "A4 / Ivory", buyingPrice: parseMoney("185"), sellingPrice: parseMoney("390"), stock: 13, reorderLevel: 10 },
];

function item(productId: string, quantity: number, actualPrice?: string): OrderItem {
  const product = mockProducts.find((candidate) => candidate.id === productId)!;
  return {
    id: `${productId}-${quantity}-${actualPrice ?? "list"}`,
    productId,
    skuSnapshot: product.sku,
    productNameSnapshot: product.name,
    listPriceSnapshot: product.sellingPrice,
    buyingCostSnapshot: product.buyingPrice,
    quantity,
    actualUnitSellingPrice: actualPrice ? parseMoney(actualPrice) : product.sellingPrice,
  };
}

const base = {
  courier: "Steadfast",
  campaign: "Always-on",
  paymentMethod: "COD" as const,
  paymentStatus: "Unpaid" as const,
  discount: 0,
  deliveryCharged: parseMoney("80"),
  refundAmount: 0,
  packagingCostSnapshot: 0,
};

export const mockOrders: Order[] = [
  { ...base, id: "o1", orderNumber: "NNM-20260714-0001", externalReference: "STD-884321", orderDate: "2026-07-14", customerName: "Nusrat Jahan", customerLocation: "Inside Dhaka", channel: "Facebook Messenger", status: "Delivered", paymentStatus: "Paid", settlementStatus: "Settled", courierCostSnapshot: parseMoney("70"), items: [item("p1", 1), item("p5", 1)] },
  { ...base, id: "o2", orderNumber: "NNM-20260714-0002", orderDate: "2026-07-14", customerName: "Fahim Ahmed", customerLocation: "Outside Dhaka", channel: "Website", campaign: "July Focus", status: "Pending", settlementStatus: "Awaiting", courierCostSnapshot: parseMoney("120"), deliveryCharged: parseMoney("120"), items: [item("p3", 2)] },
  { ...base, id: "o3", orderNumber: "NNM-20260713-0003", orderDate: "2026-07-13", customerName: "Maliha Rahman", customerLocation: "Inside Dhaka", channel: "WhatsApp", campaign: "July Focus", status: "Confirmed", settlementStatus: "Awaiting", courierCostSnapshot: parseMoney("70"), items: [item("p2", 1), item("p6", 1)] },
  { ...base, id: "o4", orderNumber: "NNM-20260713-0004", externalReference: "STD-882109", orderDate: "2026-07-13", customerName: "Tanvir Hasan", customerLocation: "Outside Dhaka", channel: "Facebook Page", status: "Dispatched", settlementStatus: "Awaiting", courierCostSnapshot: parseMoney("120"), deliveryCharged: parseMoney("120"), items: [item("p4", 1)] },
  { ...base, id: "o5", orderNumber: "NNM-20260712-0005", orderDate: "2026-07-12", customerName: "Sadia Islam", customerLocation: "Inside Dhaka", channel: "Website", campaign: "Journal Launch", status: "Delivered", paymentMethod: "bKash", paymentStatus: "Paid", settlementStatus: "Settled", courierCostSnapshot: parseMoney("70"), discount: parseMoney("50"), items: [item("p3", 1), item("p5", 2)] },
  { ...base, id: "o6", orderNumber: "NNM-20260711-0006", orderDate: "2026-07-11", customerName: "Rafi Chowdhury", customerLocation: "Outside Dhaka", channel: "Phone", status: "Failed Delivery", settlementStatus: "Not Applicable", courierCostSnapshot: parseMoney("120"), deliveryCharged: parseMoney("120"), items: [item("p1", 1)] },
  { ...base, id: "o7", orderNumber: "NNM-20260710-0007", orderDate: "2026-07-10", customerName: "Afsana Karim", customerLocation: "Inside Dhaka", channel: "Facebook Messenger", campaign: "Planner Week", status: "Delivered", paymentStatus: "Paid", settlementStatus: "Partially Settled", courierCostSnapshot: parseMoney("70"), discount: parseMoney("80"), items: [item("p1", 2)] },
  { ...base, id: "o8", orderNumber: "NNM-20260709-0008", orderDate: "2026-07-09", customerName: "Sabbir Hossain", customerLocation: "Outside Dhaka", channel: "Website", campaign: "Student Bundle", status: "Returned", settlementStatus: "Refund Due", courierCostSnapshot: parseMoney("120"), deliveryCharged: parseMoney("120"), items: [item("p4", 1), item("p6", 1)] },
  { ...base, id: "o9", orderNumber: "NNM-20260708-0009", orderDate: "2026-07-08", customerName: "Farzana Akter", customerLocation: "Inside Dhaka", channel: "Facebook Page", status: "Delivered", paymentMethod: "Nagad", paymentStatus: "Paid", settlementStatus: "Settled", courierCostSnapshot: parseMoney("70"), items: [item("p2", 2), item("p5", 1)] },
  { ...base, id: "o10", orderNumber: "NNM-20260707-0010", orderDate: "2026-07-07", customerName: "Mahin Kabir", customerLocation: "Outside Dhaka", channel: "WhatsApp", status: "Cancelled", settlementStatus: "Not Applicable", courierCostSnapshot: parseMoney("120"), deliveryCharged: parseMoney("120"), items: [item("p3", 1)] },
  { ...base, id: "o11", orderNumber: "NNM-20260706-0011", orderDate: "2026-07-06", customerName: "Sumaiya Noor", customerLocation: "Inside Dhaka", channel: "Website", campaign: "Planner Week", status: "Delivered", paymentStatus: "Paid", settlementStatus: "Settled", courierCostSnapshot: parseMoney("70"), items: [item("p1", 1), item("p6", 2)] },
  { ...base, id: "o12", orderNumber: "NNM-20260705-0012", orderDate: "2026-07-05", customerName: "Adnan Sami", customerLocation: "Inside Dhaka", channel: "Other", status: "Refunded", paymentStatus: "Refunded", settlementStatus: "Refunded", courierCostSnapshot: parseMoney("70"), refundAmount: parseMoney("430"), items: [item("p2", 1)] },
  { ...base, id: "o13", orderNumber: "NNM-20260704-0013", orderDate: "2026-07-04", customerName: "Raisa Tasnim", customerLocation: "Outside Dhaka", channel: "Facebook Messenger", campaign: "Journal Launch", status: "Delivered", paymentStatus: "Paid", settlementStatus: "Awaiting", courierCostSnapshot: parseMoney("120"), deliveryCharged: parseMoney("120"), items: [item("p3", 3, "500")] },
  { ...base, id: "o14", orderNumber: "NNM-20260703-0014", orderDate: "2026-07-03", customerName: "Imran Hossain", customerLocation: "Inside Dhaka", channel: "Website", status: "Delivered", paymentMethod: "Bank Transfer", paymentStatus: "Paid", settlementStatus: "Settled", courierCostSnapshot: parseMoney("70"), items: [item("p5", 3), item("p2", 1)] },
];

export const mockExpenses: Expense[] = [
  { id: "e1", date: "2026-07-14", category: "Advertising", description: "Meta Ads — July Focus", amount: parseMoney("3850") },
  { id: "e2", date: "2026-07-12", category: "Operations", description: "Packing supplies", amount: parseMoney("940") },
  { id: "e3", date: "2026-07-10", category: "Software", description: "Design tools", amount: parseMoney("1200") },
  { id: "e4", date: "2026-07-08", category: "Advertising", description: "Creator collaboration", amount: parseMoney("1750") },
  { id: "e5", date: "2026-07-05", category: "Logistics", description: "Courier adjustment", amount: parseMoney("630") },
];

export function buildDashboardData(filters: DashboardFilters = {}): DashboardData {
  return aggregateDashboardData(
    { orders: mockOrders, products: mockProducts, expenses: mockExpenses },
    filters,
    {
      referenceDate: "2026-07-14",
      cashBalance: parseMoney("48250"),
      comparison: { hasPriorPeriodData: true, totalOrdersChangePercent: 12.5 },
    },
  );
}
