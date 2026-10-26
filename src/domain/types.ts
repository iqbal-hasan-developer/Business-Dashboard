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
  publicSku?: string;
  slug?: string;
  name: string;
  category: string;
  categoryId?: string | null;
  isActive?: boolean;
  variation: string;
  buyingPrice: Money;
  sellingPrice: Money;
  stock: number;
  reorderLevel: number;
  internalNotes?: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

export interface BusinessSettings {
  currency: "BDT";
  timezone: "Asia/Dhaka";
  defaultCourier: string;
  insideDhakaCourierCost: Money;
  outsideDhakaCourierCost: Money;
  packagingCostPerOrder: Money;
  taxVatBasisPoints: number;
  cashAccounts: Array<{ key: string; label: string }>;
}

export interface Campaign {
  id: string;
  name: string;
  channel: string;
  startsOn: string;
  endsOn: string;
  budget: Money;
  isActive: boolean;
  updatedAt?: string;
  resultsCount?: number | null;
  resultType?: string;
  impressions?: number | null;
  reach?: number | null;
  totalMessagingContacts?: number | null;
  newMessagingContacts?: number | null;
  purchases?: number | null;
  attributionSetting?: string;
  performanceSourceReference?: string;
}

export interface MarketingFilters {
  range?: "lifetime" | "7d" | "30d" | "month" | "custom";
  start?: string;
  end?: string;
  campaign?: string;
  platform?: string;
}

export interface AdSpendRecord {
  id: string;
  campaignId: string;
  campaignName: string;
  spendDate: string;
  platform: string;
  amount: Money;
  sourceReference: string;
  updatedAt: string;
}

export interface AdSpendAuditRecord {
  id: string;
  recordId: string;
  action: "UPDATE" | "DELETE";
  reason: string;
  changedAt: string;
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
}

export interface MarketingWorkspaceData {
  campaigns: Campaign[];
  spend: AdSpendRecord[];
  audit: AdSpendAuditRecord[];
  platforms: string[];
  totalSpend: Money;
  totalResults: number | null;
  totalPurchases: number | null;
  startDate: string | null;
  endDate: string | null;
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
  updatedAt?: string;
  hasImmutableFinancialSnapshot?: boolean;
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
  courierCostSnapshotKnown?: boolean;
  packagingCostSnapshotKnown?: boolean;
}

export interface RejectedCodAdjustment {
  id: string;
  orderId: string;
  orderNumber: string;
  evidenceDate: string;
  courier: "Steadfast";
  trackingCode: string;
  courierOutcome: "Partial Delivered";
  rejectionReason: "Customer rejected";
  customerDeliveryChargeRecovery: Money;
  courierCharge: Money;
  expectedNetAdjustment: Money;
  evidenceStatus: "provisional";
  settlementConfirmationStatus: "Awaiting confirmation" | "Confirmed";
  settlementId: string | null;
  settlementDate: string | null;
  settlementReference: string | null;
  createdAt: string;
}

export interface CustomerPaymentReceipt {
  id: string;
  orderId: string;
  receivedOn: string;
  accountKey: string;
  accountLabel: string;
  amount: Money;
  reference: string;
  isReversed: boolean;
  createdAt: string;
}

export interface Expense {
  id: string;
  date: string;
  category: string;
  categoryKey?: string;
  accountingClass?: "operating_expense" | "inventory_purchase" | "freight_in" | "unallocated_procurement";
  description: string;
  amount: Money;
  paymentMethod?: string;
  campaignId?: string | null;
  salesChannel?: string;
  reference?: string;
  updatedAt?: string;
}

export interface ExpenseAuditRecord {
  id: string;
  recordId: string;
  action: "UPDATE" | "DELETE";
  reason: string;
  changedAt: string;
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
}

export type SettlementReceiptTreatment = "business_account" | "owner_held_business_funds";
export type SettlementReceivingMethod = "bkash" | "bank_transfer";

export interface SettlementEligibleOrder {
  orderId: string;
  orderNumber: string;
  orderDate: string;
  customerName: string;
  expectedUpdatedAt: string;
  grossCodReceivable: Money;
}

export interface SettlementEligibleRejectedAdjustment {
  adjustmentId: string;
  orderId: string;
  orderNumber: string;
  orderDate: string;
  customerName: string;
  trackingCode: string;
  expectedCreatedAt: string;
  grossCodRecovery: Money;
  courierCharge: Money;
  expectedNetAdjustment: Money;
}

export interface SettlementBatchOrder {
  orderId: string;
  orderNumber: string;
  customerName: string;
  allocatedAmount: Money;
}

export interface SettlementBatchRejectedAdjustment {
  adjustmentId: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  trackingCode: string;
  grossCodRecovery: Money;
  courierCharge: Money;
  netAdjustment: Money;
}

export interface SettlementReceiptAllocation {
  id: string;
  ownerLabel: string;
  amount: Money;
  isReversed: boolean;
}

export interface SettlementBatch {
  id: string;
  settlementDate: string;
  courier: "Steadfast";
  receiptTreatment: SettlementReceiptTreatment;
  /** Deprecated compatibility value for historical single-owner batches. */
  ownerLabel: string;
  receivingMethod: SettlementReceivingMethod | null;
  receivingAccountLabel: string;
  receivingAccountLast4: string;
  transactionReference: string;
  courierReference: string;
  grossCodAmount: Money;
  deductions: Money;
  netReceived: Money;
  note: string;
  confirmedAt: string;
  isReversed: boolean;
  reversedOn: string;
  reversalReason: string;
  receiptAllocations: SettlementReceiptAllocation[];
  orders: SettlementBatchOrder[];
  rejectedAdjustments: SettlementBatchRejectedAdjustment[];
}

export interface CourierSettlementData {
  eligibleOrders: SettlementEligibleOrder[];
  eligibleRejectedAdjustments: SettlementEligibleRejectedAdjustment[];
  batches: SettlementBatch[];
}

export type ManualCashTransactionType = "owner_investment" | "owner_withdrawal" | "operating_inflow" | "operating_outflow";
export type CashTransactionType = ManualCashTransactionType | "owner_money_taken" | "transfer_in" | "transfer_out" | "courier_settlement" | "expense" | "ad_spend" | "procurement_payment" | "customer_payment" | "owner_held_transfer" | "reversal";

export interface CashLedgerEntry {
  id: string;
  movementDate: string;
  transactionType: CashTransactionType;
  accountKey: string;
  accountLabel: string;
  amount: Money;
  signedAmount: Money;
  runningBalance: Money;
  accountRunningBalance: Money;
  description: string;
  reference: string;
  ownerLabel: string;
  reversalOfId: string | null;
  correctionOfId: string | null;
  isReversed: boolean;
  createdAt: string;
}

export interface CashAccountBalance {
  accountKey: string;
  accountLabel: string;
  balance: Money;
}

export interface CashAccountReconciliation extends CashAccountBalance {
  actualBalance: Money | null;
  difference: Money | null;
  observedOn: string | null;
  observationReason: string;
  unresolvedCount: number;
  unresolvedAmount: Money;
}

export interface HistoricalCashIssue {
  recordType: "expense" | "procurement" | "ad_spend" | "purchase_batch" | "owner_cash_movement";
  recordId: string;
  recordDate: string;
  description: string;
  amount: Money;
  issueType: "missing_funding_treatment" | "suspicious_owner_cash_entry" | "source_without_cash_movement";
  accountKey: string | null;
  ownerLabel: string;
  cashMovementId: string | null;
}

export interface SourceFundingRecord {
  fundingId: string;
  sourceType: "expense" | "ad_spend" | "purchase_batch";
  sourceId: string;
  sourceDate: string;
  description: string;
  amount: Money;
  fundingTreatment: "business_account_paid" | "owner_paid_personally" | "owner_held_business_funds" | "unpaid" | "historical_business_paid_account_unknown" | "already_represented";
  paymentDate: string | null;
  businessAccountKey: string | null;
  ownerLabel: string;
  existingCashMovementId: string | null;
  generatedCashMovementId: string | null;
}

export interface OwnerHeldBalance {
  ownerLabel: string;
  ledgerDue: Money;
  actualDue: Money | null;
  difference: Money | null;
  observedOn: string | null;
  observationReason: string;
}

export interface SteadfastReceivableReconciliation {
  calculatedReceivable: Money;
  actualReceivable: Money | null;
  difference: Money | null;
  observedOn: string | null;
  observationReason: string;
  grossEligibleReceivable: Money;
  reversedBatchReceivable: Money;
  currentCalculatedReceivable: Money;
  currentGrossEligibleReceivable: Money;
  postObservationReceivable: Money;
  components: SteadfastReceivableComponent[];
}

export interface SteadfastReceivableComponent {
  orderId: string;
  orderNumber: string;
  orderDate: string;
  customerName: string;
  grossCodReceivable: Money;
  excludedReversedBatch: boolean;
  activeCollectibleReceivable: Money;
  reversedSettlementId: string | null;
  reversedOn: string | null;
  reversalReason: string;
}

export interface OwnerCapitalPosition {
  ownerLabel: string;
  cashInvestment: Money;
  nonCashContribution: Money;
  historicalInvestment: Money;
  capitalReturned: Money;
  currentContributedCapital: Money;
  dueFromOwner: Money;
  ownerMoneyTaken: Money;
  moneyTakenCapitalReturn: Money;
  moneyTakenExcessDue: Money;
  cumulativeMoneyReturnedOrDue: Money;
}

export interface OwnerMoneyTakenEntry {
  id: string;
  eventDate: string;
  ownerLabel: string;
  eventType: "taken" | "reversal";
  amount: Money;
  capitalReturnAmount: Money;
  excessDueAmount: Money;
  sourceAccountKey: string;
  sourceAccountLabel: string;
  cashMovementId: string | null;
  capitalReturnId: string | null;
  ownerHeldEventId: string | null;
  reversalOfId: string | null;
  isReversed: boolean;
  description: string;
  reference: string;
  createdAt: string;
  recordSource: "unified" | "legacy_owner_held" | "legacy_business_account_return";
  canReverse: boolean;
}

export interface OwnerPositionPeriod {
  eventDate: string;
  ownerLabel: string;
  ownerMoneyTakenInPeriod: Money;
  capitalReturnInPeriod: Money;
  excessDueInPeriod: Money;
}

export interface SpendingCategorySummary {
  categoryKey: string;
  categoryLabel: string;
  recordedSourceTotal: Money;
  classifiedPaidSpending: Money;
  unpaidTotal: Money;
  unresolvedSourceCount: number;
  totalSpending: Money | null;
  independentlyVerifiedSpending: Money;
  combinedSpending: Money | null;
  overlapReviewRequired: boolean;
}

export interface CapitalFundsSummary {
  ownerCashInvestment: Money;
  ownerNonCashContribution: Money;
  totalOwnerInvestmentContribution: Money;
  ownerWithdrawals: Money;
  classifiedPaidSpending: Money;
  totalBusinessSpending: Money | null;
  unresolvedSourceCount: number;
  ledgerBusinessCash: Money;
  actualBusinessCash: Money | null;
  ledgerDueFromOwners: Money;
  actualDueFromOwners: Money;
  calculatedSteadfastReceivable: Money;
  confirmedSteadfastReceivable: Money | null;
  totalAvailableReceivableFunds: Money | null;
  knownInventoryValue: Money;
  unresolvedReconciliationDifference: Money | null;
  historicalOwnerInvestment: Money;
  totalCapitalReturned: Money;
  currentContributedCapital: Money;
  procurementSpending: Money | null;
  supplierFreightSpending: Money | null;
  advertisingSpending: Money | null;
  courierFulfilmentSpending: Money | null;
  operatingSpending: Money | null;
  confirmedPaidSourceSpending: Money;
  verifiedCourierFulfilmentSpending: Money;
  totalBusinessCashSpending: Money | null;
}

export interface CashWorkspaceData {
  entries: CashLedgerEntry[];
  accountBalances: CashAccountBalance[];
  totalBalance: Money;
  ownerInvestmentBalance: Money;
  ownerCashInvestment: Money;
  ownerWithdrawal: Money;
  ownerNonCashContribution: Money;
  postedInflow: Money;
  postedOutflow: Money;
  reconciliationDifference: Money | null;
  accountReconciliation: CashAccountReconciliation[];
  historicalIssues: HistoricalCashIssue[];
  activeFundings: SourceFundingRecord[];
  ownerHeldBalances: OwnerHeldBalance[];
  ownerCapitalPositions: OwnerCapitalPosition[];
  ownerMoneyTakenEntries: OwnerMoneyTakenEntry[];
  ownerPositionPeriod: OwnerPositionPeriod[];
  spendingCategories: SpendingCategorySummary[];
  steadfastReceivable: SteadfastReceivableReconciliation;
  capitalFunds: CapitalFundsSummary;
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
  inventoryProcurement: Money;
  freightIn: Money;
  unallocatedProcurement: Money;
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
  inventoryPurchasesRecordedAsOperatingExpense: number;
  supplierFreightRecordedAsOperatingExpense: number;
  deliveredItemsMissingLandedCostSnapshot: number;
  procurementBatchesMissingQuantity: number;
  procurementBatchesMissingProduct: number;
  unallocatedFreightIn: number;
  invalidLandedCost: number;
  purchaseBatchAllocationMismatches: number;
  advertisingDuplicatedInExpenses: number;
  fulfillmentDuplicatedInExpenses: number;
  inventoryValuationMismatches: number;
  unallocatedProcurementRecords: number;
  procurementRecordsMissingCashMovement: number;
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
  sources: {
    financialSummary: "get_dashboard_financial_summary" | "mock";
    orderFinancials: "dashboard_order_financials" | "mock";
    productFinancials: "get_dashboard_product_financials" | "mock";
    dailyFinancials: "dashboard_daily_financials" | "dashboard_order_financials" | "mock";
    reconciliation: "dashboard_reconciliation" | "mock";
    dataQuality: "get_dashboard_data_quality_checks" | "dashboard_data_quality_checks" | "mock";
    cashBalance: "cash_movements" | "mock";
    codReceivable: "dashboard_steadfast_settlement_eligible_orders" | "mock";
    inventoryValue: "get_dashboard_procurement_summary" | "dashboard_procurement_summary" | "mock";
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
