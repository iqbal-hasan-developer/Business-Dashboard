import "server-only";

import { aggregateDashboardData } from "@/domain/dashboard";
import type {
  DashboardData, DashboardFilters, Expense, Order, OrderStatus, PaymentMethod,
  PaymentStatus, Product, SalesChannel, SettlementStatus,
} from "@/domain/types";
import { ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, SALES_CHANNELS, SETTLEMENT_STATUSES } from "@/domain/types";
import type { BusinessRepository } from "@/data/repository";
import type { OrderItemRow, OrderRow, ProductBusinessRow, ProductRow } from "@/lib/supabase/database.types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function toMoney(value: number | null | undefined) {
  return Math.round(Number(value ?? 0) * 100);
}

function allowed<T extends readonly string[]>(values: T, value: string | null | undefined, fallback: T[number]): T[number] {
  return values.includes(value as T[number]) ? value as T[number] : fallback;
}

export function mapProduct(row: ProductRow, business?: ProductBusinessRow): Product {
  return {
    id: row.id,
    sku: business?.sku_override ?? row.sku ?? row.slug,
    name: row.name,
    category: row.category_id ?? "Uncategorised",
    variation: business?.variation ?? "Default",
    buyingPrice: toMoney(business?.buying_price),
    sellingPrice: toMoney(row.price),
    stock: row.stock ?? 0,
    reorderLevel: business?.reorder_level ?? 0,
  };
}

function legacyOrderStatus(value: string): OrderStatus {
  const mapped: Record<string, OrderStatus> = {
    pending: "Pending", confirmed: "Confirmed", processing: "Confirmed",
    shipped: "Dispatched", delivered: "Delivered", cancelled: "Cancelled",
  };
  return mapped[value.toLowerCase()] ?? "Pending";
}

function legacyPaymentStatus(value: string): PaymentStatus {
  const mapped: Record<string, PaymentStatus> = {
    unpaid: "Unpaid", pending: "Unpaid", verified: "Paid", refunded: "Refunded",
  };
  return mapped[value.toLowerCase()] ?? "Unpaid";
}

function legacyPaymentMethod(value: string): PaymentMethod {
  const mapped: Record<string, PaymentMethod> = { cod: "COD", bkash: "bKash", nagad: "Nagad" };
  return mapped[value.toLowerCase()] ?? "Cash";
}

export function mapOrder(row: OrderRow, itemRows: OrderItemRow[]): Order {
  const status = row.dashboard_order_status
    ? allowed(ORDER_STATUSES, row.dashboard_order_status, "Pending")
    : legacyOrderStatus(row.order_status);
  return {
    id: row.id,
    orderNumber: row.order_number,
    externalReference: row.external_reference ?? undefined,
    orderDate: row.order_date ?? row.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    customerName: row.customer_name,
    customerLocation: row.customer_location === "Outside Dhaka" ? "Outside Dhaka" : "Inside Dhaka",
    courier: row.courier ?? "Steadfast",
    channel: allowed(SALES_CHANNELS, row.sales_channel, "Other") as SalesChannel,
    campaign: row.campaign_name_snapshot ?? "Always-on",
    status,
    paymentMethod: allowed(PAYMENT_METHODS, row.payment_method, legacyPaymentMethod(row.payment_method)),
    paymentStatus: row.dashboard_payment_status
      ? allowed(PAYMENT_STATUSES, row.dashboard_payment_status, "Unpaid")
      : legacyPaymentStatus(row.payment_status),
    settlementStatus: allowed(SETTLEMENT_STATUSES, row.settlement_status, "Not Applicable") as SettlementStatus,
    discount: toMoney(row.discount_amount),
    deliveryCharged: toMoney(row.delivery_charge),
    refundAmount: toMoney(row.refund_amount),
    courierCostSnapshot: toMoney(row.courier_cost_snapshot),
    packagingCostSnapshot: toMoney(row.packaging_cost_snapshot),
    items: itemRows.map((item) => ({
      id: item.id,
      productId: item.product_id ?? "unknown",
      skuSnapshot: item.sku_snapshot ?? item.product_slug,
      productNameSnapshot: item.product_name,
      listPriceSnapshot: toMoney(item.list_price_snapshot ?? item.unit_price),
      buyingCostSnapshot: toMoney(item.buying_cost_snapshot),
      quantity: item.quantity,
      actualUnitSellingPrice: toMoney(item.actual_unit_selling_price ?? item.unit_price),
    })),
  };
}

export class SupabaseBusinessRepository implements BusinessRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getDashboard(filters: DashboardFilters = {}): Promise<DashboardData> {
    const [orders, products, expenses, adSpend, cashBalance] = await Promise.all([
      this.getOrders(), this.getProducts(), this.getExpenses(), this.getAdSpend(filters), this.getCashBalance(),
    ]);
    const referenceDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
    return aggregateDashboardData(
      { orders, products, expenses: [...expenses, ...adSpend] },
      filters,
      { referenceDate, cashBalance, generatedAt: new Date().toISOString() },
    );
  }

  private async getAdSpend(filters: DashboardFilters): Promise<Expense[]> {
    const [spendResult, campaignsResult] = await Promise.all([
      this.supabase.from("daily_ad_spend").select("id,campaign_id,spend_date,platform,amount,source_reference,created_by,created_at,updated_at"),
      this.supabase.from("campaigns").select("id,name,channel,starts_on,ends_on,budget,is_active,created_by,created_at,updated_at"),
    ]);
    if (spendResult.error || campaignsResult.error) throw new Error("Unable to load advertising spend.");
    const campaigns = new Map(campaignsResult.data.map((campaign) => [campaign.id, campaign]));
    return spendResult.data
      .filter((spend) => {
        const campaign = campaigns.get(spend.campaign_id ?? "");
        const campaignMatches = !filters.campaign || filters.campaign === "all" || campaign?.name === filters.campaign;
        const channelMatches = !filters.channel || filters.channel === "all" || campaign?.channel === filters.channel;
        return campaignMatches && channelMatches;
      })
      .map((spend) => ({
        id: `ad-${spend.id}`,
        date: spend.spend_date,
        category: "Advertising",
        description: `${spend.platform}${spend.campaign_id ? ` — ${campaigns.get(spend.campaign_id)?.name ?? "Campaign"}` : ""}`,
        amount: toMoney(spend.amount),
      }));
  }

  private async getCashBalance() {
    const { data, error } = await this.supabase.from("cash_movements").select("id,movement_date,movement_type,account_key,amount,order_id,settlement_id,expense_id,description,created_by,created_at");
    if (error) throw new Error("Unable to load cash movements.");
    return data.reduce((balance, movement) => {
      const amount = toMoney(movement.amount);
      return balance + (["inflow", "transfer_in"].includes(movement.movement_type) ? amount : -amount);
    }, 0);
  }

  async getProducts(): Promise<Product[]> {
    const [productsResult, businessResult] = await Promise.all([
      this.supabase.from("products").select("id,category_id,name,slug,sku,price,stock,is_active,created_at,updated_at").order("name"),
      this.supabase.from("product_business_data").select("product_id,sku_override,variation,buying_price,reorder_level,created_at,updated_at"),
    ]);
    if (productsResult.error || businessResult.error) throw new Error("Unable to load products.");
    const privateByProduct = new Map(businessResult.data.map((row) => [row.product_id, row]));
    return productsResult.data.map((row) => mapProduct(row, privateByProduct.get(row.id)));
  }

  async getOrders(): Promise<Order[]> {
    const { data: orders, error } = await this.supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (error) throw new Error("Unable to load orders.");
    if (!orders.length) return [];
    const { data: items, error: itemsError } = await this.supabase.from("order_items").select("*").in("order_id", orders.map((order) => order.id));
    if (itemsError) throw new Error("Unable to load order items.");
    const itemsByOrder = new Map<string, OrderItemRow[]>();
    items.forEach((item) => {
      if (!item.order_id) return;
      itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) ?? []), item]);
    });
    return orders.map((order) => mapOrder(order, itemsByOrder.get(order.id) ?? []));
  }

  async getOrder(id: string): Promise<Order | null> {
    const { data: order, error } = await this.supabase.from("orders").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error("Unable to load the order.");
    if (!order) return null;
    const { data: items, error: itemsError } = await this.supabase.from("order_items").select("*").eq("order_id", id);
    if (itemsError) throw new Error("Unable to load order items.");
    return mapOrder(order, items);
  }

  async getExpenses(): Promise<Expense[]> {
    const { data, error } = await this.supabase.from("expenses").select("id,expense_date,category_key,description,amount,created_at,updated_at").order("expense_date", { ascending: false });
    if (error) throw new Error("Unable to load expenses.");
    return data.map((expense) => ({
      id: expense.id,
      date: expense.expense_date,
      category: expense.category_key === "advertising" ? "Advertising" : expense.category_key,
      description: expense.description,
      amount: toMoney(expense.amount),
    }));
  }
}
