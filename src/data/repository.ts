import type { DashboardData, DashboardFilters, Expense, Order, Product } from "@/domain/types";
import { buildDashboardData, mockExpenses, mockOrders, mockProducts } from "@/data/mock-data";

export interface BusinessRepository {
  getDashboard(filters?: DashboardFilters): Promise<DashboardData>;
  getOrders(): Promise<Order[]>;
  getOrder(id: string): Promise<Order | null>;
  getProducts(): Promise<Product[]>;
  getExpenses(): Promise<Expense[]>;
}

export const mockRepository: BusinessRepository = {
  async getDashboard(filters = {}) { return buildDashboardData(filters); },
  async getOrders() { return mockOrders; },
  async getOrder(id) { return mockOrders.find((order) => order.id === id) ?? null; },
  async getProducts() { return mockProducts; },
  async getExpenses() { return mockExpenses; },
};
