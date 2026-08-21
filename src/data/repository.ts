import type { BusinessSettings, Campaign, CashWorkspaceData, CourierSettlementData, CustomerPaymentReceipt, DashboardData, DashboardFilters, Expense, ExpenseAuditRecord, MarketingFilters, MarketingWorkspaceData, Order, Product, ProductCategory } from "@/domain/types";
import { buildDashboardData, mockExpenses, mockOrders, mockProducts } from "@/data/mock-data";
import { calculateOrderFinancials } from "@/domain/calculations";
import { OWNER_APPROVED_BUSINESS_SETTINGS } from "@/domain/settings";

export interface BusinessRepository {
  getDashboard(filters?: DashboardFilters): Promise<DashboardData>;
  getOrders(): Promise<Order[]>;
  getOrder(id: string): Promise<Order | null>;
  getCustomerPaymentReceipt(orderId: string): Promise<CustomerPaymentReceipt | null>;
  getProducts(): Promise<Product[]>;
  getProductCategories(): Promise<ProductCategory[]>;
  getBusinessSettings(): Promise<BusinessSettings>;
  getCashWorkspace(): Promise<CashWorkspaceData>;
  getExpenses(): Promise<Expense[]>;
  getExpenseAuditHistory(): Promise<ExpenseAuditRecord[]>;
  getCampaigns(): Promise<Campaign[]>;
  getMarketingWorkspace(filters?: MarketingFilters): Promise<MarketingWorkspaceData>;
  getCourierSettlementData(): Promise<CourierSettlementData>;
}

export const mockRepository: BusinessRepository = {
  async getDashboard(filters = {}) { return buildDashboardData(filters); },
  async getOrders() { return mockOrders; },
  async getOrder(id) { return mockOrders.find((order) => order.id === id) ?? null; },
  async getCustomerPaymentReceipt() { return null; },
  async getProducts() { return mockProducts; },
  async getProductCategories() {
    return [...new Set(mockProducts.map((product) => product.category))].map((name, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name, slug: name.toLowerCase().replaceAll(" ", "-"), isActive: true }));
  },
  async getBusinessSettings() { return OWNER_APPROVED_BUSINESS_SETTINGS; },
  async getCashWorkspace() {
    return {
      entries: [
        { id: "00000000-0000-4000-8000-000000000091", movementDate: "2026-07-01", transactionType: "owner_investment", accountKey: "cash", accountLabel: "Cash", amount: 5_000_000, signedAmount: 5_000_000, runningBalance: 5_000_000, accountRunningBalance: 5_000_000, description: "Opening owner investment", reference: "OPENING", ownerLabel: "Nasim", reversalOfId: null, correctionOfId: null, isReversed: false, createdAt: "2026-07-01T00:00:00Z" },
        { id: "00000000-0000-4000-8000-000000000092", movementDate: "2026-07-02", transactionType: "operating_outflow", accountKey: "cash", accountLabel: "Cash", amount: 175_000, signedAmount: -175_000, runningBalance: 4_825_000, accountRunningBalance: 4_825_000, description: "Sample operating outflow", reference: "MOCK", ownerLabel: "", reversalOfId: null, correctionOfId: null, isReversed: false, createdAt: "2026-07-02T00:00:00Z" },
      ],
      accountBalances: [
        { accountKey: "cash", accountLabel: "Cash", balance: 4_825_000 },
        { accountKey: "bkash", accountLabel: "bKash", balance: 0 },
        { accountKey: "nagad", accountLabel: "Nagad", balance: 0 },
        { accountKey: "bank", accountLabel: "Bank", balance: 0 },
        { accountKey: "steadfast", accountLabel: "Steadfast", balance: 0 },
      ],
      totalBalance: 4_825_000,
      ownerInvestmentBalance: 5_000_000,
      ownerCashInvestment: 5_000_000,
      ownerWithdrawal: 0,
      ownerNonCashContribution: 0,
      postedInflow: 5_000_000,
      postedOutflow: 175_000,
      reconciliationDifference: null,
      accountReconciliation: [
        { accountKey: "cash", accountLabel: "Cash", balance: 4_825_000, actualBalance: null, difference: null, observedOn: null, observationReason: "", unresolvedCount: 0, unresolvedAmount: 0 },
      ],
      historicalIssues: [],
      activeFundings: [],
      ownerHeldBalances: [
        { ownerLabel: "Nasim", ledgerDue: 771_400, actualDue: 771_400, difference: 0, observedOn: "2026-08-21", observationReason: "Owner reconciliation fixture" },
        { ownerLabel: "Rifat", ledgerDue: 0, actualDue: null, difference: null, observedOn: null, observationReason: "" },
        { ownerLabel: "Ikbal", ledgerDue: 100_000, actualDue: 100_000, difference: 0, observedOn: "2026-08-21", observationReason: "Owner reconciliation fixture" },
      ],
      ownerCapitalPositions: [
        { ownerLabel: "Nasim", cashInvestment: 1_512_000, nonCashContribution: 0, historicalInvestment: 1_512_000, capitalReturned: 1_512_000, currentContributedCapital: 0, dueFromOwner: 771_400, ownerMoneyTaken: 2_283_400, moneyTakenCapitalReturn: 1_512_000, moneyTakenExcessDue: 771_400, cumulativeMoneyReturnedOrDue: 2_283_400 },
        { ownerLabel: "Rifat", cashInvestment: 3_360_000, nonCashContribution: 0, historicalInvestment: 3_360_000, capitalReturned: 1_000_000, currentContributedCapital: 2_360_000, dueFromOwner: 0, ownerMoneyTaken: 1_000_000, moneyTakenCapitalReturn: 1_000_000, moneyTakenExcessDue: 0, cumulativeMoneyReturnedOrDue: 1_000_000 },
        { ownerLabel: "Ikbal", cashInvestment: 0, nonCashContribution: 0, historicalInvestment: 0, capitalReturned: 0, currentContributedCapital: 0, dueFromOwner: 100_000, ownerMoneyTaken: 100_000, moneyTakenCapitalReturn: 0, moneyTakenExcessDue: 100_000, cumulativeMoneyReturnedOrDue: 100_000 },
      ],
      ownerMoneyTakenEntries: [
        {
          id: "00000000-0000-4000-8000-000000000601", eventDate: "2026-08-21", ownerLabel: "Ikbal", eventType: "taken", amount: 50_000,
          capitalReturnAmount: 0, excessDueAmount: 50_000, sourceAccountKey: "cash", sourceAccountLabel: "Cash",
          cashMovementId: "00000000-0000-4000-8000-000000000611", capitalReturnId: null, ownerHeldEventId: "00000000-0000-4000-8000-000000000621",
          reversalOfId: null, isReversed: false, description: "Money taken by Ikbal", reference: "", createdAt: "2026-08-21T12:03:00+06:00",
          recordSource: "unified", canReverse: true,
        },
        {
          id: "00000000-0000-4000-8000-000000000602", eventDate: "2026-08-21", ownerLabel: "Nasim", eventType: "taken", amount: 50_000,
          capitalReturnAmount: 0, excessDueAmount: 50_000, sourceAccountKey: "cash", sourceAccountLabel: "Cash",
          cashMovementId: "00000000-0000-4000-8000-000000000612", capitalReturnId: null, ownerHeldEventId: "00000000-0000-4000-8000-000000000622",
          reversalOfId: null, isReversed: false, description: "Money taken by Nasim", reference: "", createdAt: "2026-08-21T12:02:00+06:00",
          recordSource: "unified", canReverse: true,
        },
        {
          id: "00000000-0000-4000-8000-000000000603", eventDate: "2026-08-21", ownerLabel: "Rifat", eventType: "taken", amount: 1_000_000,
          capitalReturnAmount: 1_000_000, excessDueAmount: 0, sourceAccountKey: "cash", sourceAccountLabel: "Cash",
          cashMovementId: "00000000-0000-4000-8000-000000000613", capitalReturnId: "00000000-0000-4000-8000-000000000623", ownerHeldEventId: null,
          reversalOfId: null, isReversed: false, description: "Capital returned to Rifat", reference: "", createdAt: "2026-08-21T12:01:00+06:00",
          recordSource: "unified", canReverse: true,
        },
        {
          id: "00000000-0000-4000-8000-000000000604", eventDate: "2026-07-26", ownerLabel: "Nasim", eventType: "taken", amount: 859_800,
          capitalReturnAmount: 138_400, excessDueAmount: 721_400, sourceAccountKey: "bkash", sourceAccountLabel: "bKash",
          cashMovementId: "00000000-0000-4000-8000-000000000614", capitalReturnId: null, ownerHeldEventId: "00000000-0000-4000-8000-000000000624",
          reversalOfId: null, isReversed: false, description: "Legacy owner-held business funds", reference: "SFC-30935216", createdAt: "2026-07-26T12:00:00+06:00",
          recordSource: "legacy_owner_held", canReverse: false,
        },
        {
          id: "00000000-0000-4000-8000-000000000605", eventDate: "2026-07-23", ownerLabel: "Ikbal", eventType: "taken", amount: 50_000,
          capitalReturnAmount: 0, excessDueAmount: 50_000, sourceAccountKey: "cash", sourceAccountLabel: "Cash",
          cashMovementId: "00000000-0000-4000-8000-000000000615", capitalReturnId: null, ownerHeldEventId: "00000000-0000-4000-8000-000000000625",
          reversalOfId: null, isReversed: false, description: "Legacy owner-held business funds", reference: "", createdAt: "2026-07-23T12:00:00+06:00",
          recordSource: "legacy_owner_held", canReverse: false,
        },
        {
          id: "00000000-0000-4000-8000-000000000606", eventDate: "2026-07-21", ownerLabel: "Nasim", eventType: "taken", amount: 1_373_600,
          capitalReturnAmount: 1_373_600, excessDueAmount: 0, sourceAccountKey: "cash", sourceAccountLabel: "Cash",
          cashMovementId: "00000000-0000-4000-8000-000000000616", capitalReturnId: null, ownerHeldEventId: "00000000-0000-4000-8000-000000000626",
          reversalOfId: null, isReversed: false, description: "Legacy owner-held business funds", reference: "SFC-30826633", createdAt: "2026-07-21T12:00:00+06:00",
          recordSource: "legacy_owner_held", canReverse: false,
        },
      ],
      ownerPositionPeriod: [
        { eventDate: "2026-07-21", ownerLabel: "Nasim", ownerMoneyTakenInPeriod: 1_373_600, capitalReturnInPeriod: 1_373_600, excessDueInPeriod: 0 },
        { eventDate: "2026-07-23", ownerLabel: "Ikbal", ownerMoneyTakenInPeriod: 50_000, capitalReturnInPeriod: 0, excessDueInPeriod: 50_000 },
        { eventDate: "2026-07-26", ownerLabel: "Nasim", ownerMoneyTakenInPeriod: 859_800, capitalReturnInPeriod: 138_400, excessDueInPeriod: 721_400 },
        { eventDate: "2026-08-21", ownerLabel: "Rifat", ownerMoneyTakenInPeriod: 1_000_000, capitalReturnInPeriod: 1_000_000, excessDueInPeriod: 0 },
        { eventDate: "2026-08-21", ownerLabel: "Nasim", ownerMoneyTakenInPeriod: 50_000, capitalReturnInPeriod: 0, excessDueInPeriod: 50_000 },
        { eventDate: "2026-08-21", ownerLabel: "Ikbal", ownerMoneyTakenInPeriod: 50_000, capitalReturnInPeriod: 0, excessDueInPeriod: 50_000 },
      ],
      spendingCategories: [
        { categoryKey: "procurement", categoryLabel: "Procurement", recordedSourceTotal: 0, classifiedPaidSpending: 0, unpaidTotal: 0, unresolvedSourceCount: 0, totalSpending: 0, independentlyVerifiedSpending: 0, combinedSpending: 0, overlapReviewRequired: false },
        { categoryKey: "supplier_freight", categoryLabel: "Supplier freight", recordedSourceTotal: 0, classifiedPaidSpending: 0, unpaidTotal: 0, unresolvedSourceCount: 0, totalSpending: 0, independentlyVerifiedSpending: 0, combinedSpending: 0, overlapReviewRequired: false },
        { categoryKey: "advertising", categoryLabel: "Advertising", recordedSourceTotal: 0, classifiedPaidSpending: 0, unpaidTotal: 0, unresolvedSourceCount: 0, totalSpending: 0, independentlyVerifiedSpending: 0, combinedSpending: 0, overlapReviewRequired: false },
        { categoryKey: "courier_fulfilment", categoryLabel: "Courier / fulfilment", recordedSourceTotal: 0, classifiedPaidSpending: 0, unpaidTotal: 0, unresolvedSourceCount: 0, totalSpending: 0, independentlyVerifiedSpending: 0, combinedSpending: 0, overlapReviewRequired: false },
        { categoryKey: "operating", categoryLabel: "Operating", recordedSourceTotal: 0, classifiedPaidSpending: 0, unpaidTotal: 0, unresolvedSourceCount: 0, totalSpending: 0, independentlyVerifiedSpending: 0, combinedSpending: 0, overlapReviewRequired: false },
      ],
      steadfastReceivable: { calculatedReceivable: 0, actualReceivable: null, difference: null, observedOn: null, observationReason: "", grossEligibleReceivable: 0, reversedBatchReceivable: 0, currentCalculatedReceivable: 0, currentGrossEligibleReceivable: 0, postObservationReceivable: 0, components: [] },
      capitalFunds: {
        ownerCashInvestment: 4_872_000,
        ownerNonCashContribution: 0,
        totalOwnerInvestmentContribution: 4_872_000,
        ownerWithdrawals: 0,
        classifiedPaidSpending: 0,
        totalBusinessSpending: null,
        unresolvedSourceCount: 0,
        ledgerBusinessCash: 4_825_000,
        actualBusinessCash: null,
        ledgerDueFromOwners: 871_400,
        actualDueFromOwners: 871_400,
        calculatedSteadfastReceivable: 0,
        confirmedSteadfastReceivable: null,
        totalAvailableReceivableFunds: null,
        knownInventoryValue: 0,
        unresolvedReconciliationDifference: null,
        historicalOwnerInvestment: 4_872_000,
        totalCapitalReturned: 2_512_000,
        currentContributedCapital: 2_360_000,
        procurementSpending: 0,
        supplierFreightSpending: 0,
        advertisingSpending: 0,
        courierFulfilmentSpending: 0,
        operatingSpending: 0,
        confirmedPaidSourceSpending: 0,
        verifiedCourierFulfilmentSpending: 0,
        totalBusinessCashSpending: 0,
      },
    };
  },
  async getExpenses() { return mockExpenses; },
  async getExpenseAuditHistory() { return []; },
  async getCampaigns() { return [{ id: "00000000-0000-4000-8000-000000000001", name: "Always-on", channel: "Facebook Page", startsOn: "2026-07-01", endsOn: "", budget: 0, isActive: true }]; },
  async getMarketingWorkspace() {
    const campaigns = await this.getCampaigns();
    const campaign = campaigns[0];
    const spend = campaign ? [{ id: "00000000-0000-4000-8000-000000000061", campaignId: campaign.id, campaignName: campaign.name, spendDate: "2026-08-12", platform: "Meta", amount: 12_500, sourceReference: "Mock spend", updatedAt: "2026-08-12T17:47:57.334244+00:00" }] : [];
    return { campaigns, spend, audit: [], platforms: ["Meta"], totalSpend: 12_500, totalResults: null, totalPurchases: null, startDate: null, endDate: null };
  },
  async getCourierSettlementData() {
    return {
      eligibleOrders: mockOrders.filter((order) => order.paymentMethod === "COD" && order.status === "Delivered" && order.settlementStatus !== "Settled")
        .map((order) => ({ orderId: order.id, orderNumber: order.orderNumber, orderDate: order.orderDate, customerName: order.customerName, expectedUpdatedAt: order.updatedAt ?? new Date(`${order.orderDate}T00:00:00Z`).toISOString(), grossCodReceivable: calculateOrderFinancials(order).netRevenue })),
      batches: [],
    };
  },
};
