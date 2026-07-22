import type { Campaign, CourierSettlementData, DashboardData, DashboardFilters, Expense, Order, Product, ProductCategory } from "@/domain/types";
import { buildDashboardData, mockExpenses, mockOrders, mockProducts } from "@/data/mock-data";
import { calculateOrderFinancials } from "@/domain/calculations";

export interface BusinessRepository {
  getDashboard(filters?: DashboardFilters): Promise<DashboardData>;
  getOrders(): Promise<Order[]>;
  getOrder(id: string): Promise<Order | null>;
  getProducts(): Promise<Product[]>;
  getProductCategories(): Promise<ProductCategory[]>;
  getExpenses(): Promise<Expense[]>;
  getCampaigns(): Promise<Campaign[]>;
  getCourierSettlementData(): Promise<CourierSettlementData>;
}

export const mockRepository: BusinessRepository = {
  async getDashboard(filters = {}) { return buildDashboardData(filters); },
  async getOrders() { return mockOrders; },
  async getOrder(id) { return mockOrders.find((order) => order.id === id) ?? null; },
  async getProducts() { return mockProducts; },
  async getProductCategories() {
    return [...new Set(mockProducts.map((product) => product.category))].map((name, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name, slug: name.toLowerCase().replaceAll(" ", "-"), isActive: true }));
  },
  async getExpenses() { return mockExpenses; },
  async getCampaigns() { return [{ id: "00000000-0000-4000-8000-000000000001", name: "Always-on", channel: "Facebook Page", startsOn: "2026-07-01", endsOn: "", budget: 0, isActive: true }]; },
  async getCourierSettlementData() {
    return {
      eligibleOrders: mockOrders.filter((order) => order.paymentMethod === "COD" && order.status === "Delivered" && order.settlementStatus !== "Settled")
        .map((order) => ({ orderId: order.id, orderNumber: order.orderNumber, orderDate: order.orderDate, customerName: order.customerName, expectedUpdatedAt: order.updatedAt ?? new Date(`${order.orderDate}T00:00:00Z`).toISOString(), grossCodReceivable: calculateOrderFinancials(order).netRevenue })),
      batches: [],
    };
  },
};
