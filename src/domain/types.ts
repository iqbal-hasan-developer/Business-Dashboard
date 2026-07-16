export const ORDER_STATUSES = [
  "Pending",
  "Confirmed",
  "Dispatched",
  "Delivered",
  "Cancelled",
  "Returned",
  "Refunded",
  "Failed Delivery",
] as const;

export const SETTLEMENT_STATUSES = [
  "Not Applicable",
  "Awaiting",
  "Partially Settled",
  "Settled",
  "Refund Due",
  "Refunded",
] as const;

export const PAYMENT_STATUSES = ["Unpaid", "Paid", "Partially Paid", "Refunded"] as const;
export const PAYMENT_METHODS = ["COD", "bKash", "Nagad", "Cash", "Bank Transfer"] as const;
export const SALES_CHANNELS = ["Website", "Facebook Messenger", "Facebook Page", "WhatsApp", "Phone", "Other"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type SalesChannel = (typeof SALES_CHANNELS)[number];

/** Integer amount in poisha. Never pass a fractional number. */
export type Money = number;

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  variation: string;
  buyingPrice: Money;
  sellingPrice: Money;
  stock: number;
  reorderLevel: number;
}

export interface OrderItem {
  id: string;
  productId: string;
  skuSnapshot: string;
  productNameSnapshot: string;
  listPriceSnapshot: Money;
  buyingCostSnapshot: Money;
  quantity: number;
  actualUnitSellingPrice: Money;
}

export interface Order {
  id: string;
  orderNumber: string;
  externalReference?: string;
  orderDate: string;
  customerName: string;
  customerLocation: "Inside Dhaka" | "Outside Dhaka";
  courier: string;
  channel: SalesChannel;
  campaign: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  settlementStatus: SettlementStatus;
  items: OrderItem[];
  discount: Money;
  deliveryCharged: Money;
  refundAmount: Money;
  courierCostSnapshot: Money;
  packagingCostSnapshot: Money;
}

export interface Expense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: Money;
}

export interface OrderFinancials {
  /** Transactional item subtotal, whether or not the order is Delivered. */
  productSubtotal: Money;
  /** Recognized item revenue. This is zero until the order is Delivered. */
  productRevenue: Money;
  orderTotal: Money;
  productCogs: Money;
  netRevenue: Money;
  recognizedCogs: Money;
  grossProfit: Money;
  contributionProfit: Money;
  profitMargin: number;
}

export interface DashboardFilters {
  range?: string;
  channel?: string;
  status?: string;
  campaign?: string;
}

export interface DashboardSummary {
  totalOrders: number;
  deliveredOrders: number;
  pendingOrders: number;
  productRevenue: Money;
  netRevenue: Money;
  cogs: Money;
  grossProfit: Money;
  netProfit: Money;
  profitMargin: number;
  adSpend: Money;
  averageOrderValue: Money;
  cashBalance: Money;
  codReceivable: Money;
  inventoryValue: Money;
}

export interface DashboardComparison {
  hasPriorPeriodData: boolean;
  totalOrdersChangePercent: number | null;
}

export interface DashboardData {
  summary: DashboardSummary;
  comparison: DashboardComparison;
  generatedAt?: string;
  trend: Array<{ date: string; revenue: Money; profit: Money }>;
  statusBreakdown: Array<{ status: OrderStatus; count: number }>;
  adSpendTrend: Array<{ date: string; revenue: Money; adSpend: Money }>;
  topProducts: Array<{ name: string; revenue: Money }>;
  expenseBreakdown: Array<{ category: string; amount: Money }>;
  recentOrders: Order[];
  warnings: Array<{ id: string; tone: "warning" | "danger"; title: string; detail: string }>;
}
