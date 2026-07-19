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
  internalNotes?: string;
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
  customerPhone?: string;
  customerAddress?: string;
  customerNote?: string;
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
  productRevenue: Money | null;
  netRevenue: Money | null;
  cogs: Money | null;
  grossProfit: Money | null;
  contributionProfit: Money | null;
  operatingExpenses: Money;
  netProfit: Money | null;
  profitMargin: number | null;
  adSpend: Money;
  averageOrderValue: Money | null;
  cashBalance: Money;
  codReceivable: Money;
  inventoryValue: Money;
}

export interface DashboardComparison {
  hasPriorPeriodData: boolean;
  totalOrdersChangePercent: number | null;
}

export type DashboardFinancialState = "available" | "incomplete" | "not-applicable";

export interface DashboardDataQuality {
  orderItemsWithMissingLinks: number;
  duplicateOrderNumbers: number;
  productsWithMissingSku: number;
  duplicateProductSkus: number;
  deliveredOrdersWithoutItems: number;
  deliveredOrdersMissingFinancialSnapshot: number;
  snapshotProductRevenueMismatches: number;
  snapshotCogsMismatches: number;
}

export interface DashboardReportingStatus {
  financialState: DashboardFinancialState;
  financialMessage: string;
  deliveredOrdersMissingCogs: number;
  deliveredOrdersMissingFulfillmentCosts: number;
  recognizedRefundAmount: Money;
  summaryMatchesOrderDetails: boolean;
  globalReconciliationMatches: boolean;
  dataQualityAllZero: boolean;
  topProductsAvailable: boolean;
  sources: {
    financialSummary: "get_dashboard_financial_summary" | "mock";
    orderFinancials: "dashboard_order_financials" | "mock";
    dailyFinancials: "dashboard_daily_financials" | "dashboard_order_financials" | "mock";
    reconciliation: "dashboard_reconciliation" | "mock";
    dataQuality: "dashboard_data_quality_checks" | "mock";
    cashBalance: "cash_movements" | "mock";
    codReceivable: "dashboard_order_financials" | "mock";
    inventoryValue: "products + product_business_data" | "mock";
  };
}

export interface DashboardData {
  summary: DashboardSummary;
  comparison: DashboardComparison;
  generatedAt?: string;
  trend: Array<{ date: string; revenue: Money | null; profit: Money | null }>;
  statusBreakdown: Array<{ status: OrderStatus; count: number }>;
  adSpendTrend: Array<{ date: string; revenue: Money | null; adSpend: Money }>;
  topProducts: Array<{ name: string; revenue: Money }>;
  expenseBreakdown: Array<{ category: string; amount: Money }>;
  recentOrders: Order[];
  warnings: Array<{ id: string; tone: "warning" | "danger"; title: string; detail: string }>;
  campaigns: string[];
  dataQuality: DashboardDataQuality;
  reporting: DashboardReportingStatus;
}
