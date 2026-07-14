export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type ProductRow = {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  sku: string | null;
  price: number;
  stock: number | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ProductBusinessRow = {
  product_id: string;
  sku_override: string | null;
  variation: string | null;
  buying_price: number;
  reorder_level: number;
  created_at: string;
  updated_at: string;
};

export type OrderRow = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  delivery_area: string;
  payment_method: string;
  payment_status: string;
  order_status: string;
  subtotal: number;
  delivery_charge: number;
  total: number;
  order_date: string | null;
  external_reference: string | null;
  customer_location: string | null;
  courier: string | null;
  sales_channel: string | null;
  campaign_id: string | null;
  campaign_name_snapshot: string | null;
  dashboard_order_status: string | null;
  dashboard_payment_status: string | null;
  settlement_status: string | null;
  discount_amount: number | null;
  refund_amount: number | null;
  courier_cost_snapshot: number | null;
  packaging_cost_snapshot: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type OrderItemRow = {
  id: string;
  order_id: string | null;
  product_id: string | null;
  product_name: string;
  product_slug: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  sku_snapshot: string | null;
  list_price_snapshot: number | null;
  buying_cost_snapshot: number | null;
  actual_unit_selling_price: number | null;
  created_at: string | null;
};

export type ExpenseRow = {
  id: string;
  expense_date: string;
  category_key: string;
  description: string;
  amount: number;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      products: Table<ProductRow>;
      product_business_data: Table<ProductBusinessRow>;
      orders: Table<OrderRow>;
      order_items: Table<OrderItemRow>;
      expenses: Table<ExpenseRow>;
      campaigns: Table<{
        id: string;
        name: string;
        channel: string | null;
        starts_on: string | null;
        ends_on: string | null;
        budget: number | null;
        is_active: boolean;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      daily_ad_spend: Table<{
        id: string;
        campaign_id: string | null;
        spend_date: string;
        platform: string;
        amount: number;
        source_reference: string | null;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      cash_movements: Table<{
        id: string;
        movement_date: string;
        movement_type: "inflow" | "outflow" | "transfer_in" | "transfer_out";
        account_key: string;
        amount: number;
        order_id: string | null;
        settlement_id: string | null;
        expense_id: string | null;
        description: string;
        created_by: string | null;
        created_at: string;
      }>;
      dashboard_user_profiles: Table<{
        user_id: string;
        email: string | null;
        display_name: string | null;
        role: "owner" | "admin" | "data_entry" | "viewer";
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>;
    };
    Views: {
      dashboard_order_financials: {
        Row: {
          order_id: string | null;
          order_number: string | null;
          is_delivered: boolean | null;
          cogs_complete: boolean | null;
          recognized_product_revenue: number | null;
          net_revenue: number | null;
          recognized_cogs: number | null;
          gross_profit: number | null;
          contribution_profit: number | null;
        };
        Relationships: [];
      };
      dashboard_reconciliation: {
        Row: {
          delivered_order_count: number | null;
          product_revenue: number | null;
          net_revenue: number | null;
          cogs: number | null;
          gross_profit: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_dashboard_order: {
        Args: { p_order: Json; p_items: Json };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
