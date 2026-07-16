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
  payment_method: string | null;
  campaign_id: string | null;
  sales_channel: string | null;
  reference: string | null;
  created_by: string | null;
  updated_by: string | null;
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
      order_financial_snapshots: Table<{
        order_id: string;
        order_number_snapshot: string;
        order_date: string;
        sales_channel: string;
        campaign_id: string | null;
        campaign_name_snapshot: string | null;
        payment_method: string;
        settlement_status: string;
        recognition_status: "Delivered";
        product_revenue: number;
        delivery_revenue: number;
        discount_amount: number;
        refund_amount: number;
        net_revenue: number;
        cogs: number | null;
        cogs_complete: boolean;
        courier_cost: number | null;
        packaging_cost: number | null;
        recognized_at: string;
        recognition_source: "website" | "dashboard" | "approved_backfill";
        recognized_by: string | null;
        snapshot_version: number;
        created_at: string;
      }>;
      order_financial_adjustments: Table<{
        id: string;
        order_id: string;
        adjustment_type: "refund";
        amount_delta: number;
        occurred_on: string;
        occurred_at: string;
        adjustment_source: "website" | "dashboard" | "approved_backfill";
        created_by: string | null;
        created_at: string;
      }>;
    };
    Views: {
      dashboard_order_financials: {
        Row: {
          order_id: string;
          order_number: string;
          order_date: string;
          sales_channel: string;
          campaign_id: string | null;
          campaign_name_snapshot: string | null;
          payment_method: string;
          settlement_status: string;
          recognized_at: string;
          recognition_source: string;
          is_delivered: true;
          cogs_complete: boolean;
          fulfillment_costs_complete: boolean;
          recognized_product_revenue: number;
          recognized_delivery_revenue: number;
          recognized_discount_amount: number;
          recognized_refund_amount: number;
          net_revenue: number;
          recognized_cogs: number | null;
          gross_profit: number | null;
          contribution_profit: number | null;
        };
        Relationships: [];
      };
      dashboard_reconciliation: {
        Row: {
          delivered_order_count: number;
          delivered_orders_missing_cogs: number;
          delivered_orders_missing_fulfillment_costs: number;
          product_revenue: number;
          net_revenue: number;
          cogs: number | null;
          gross_profit: number | null;
          contribution_profit: number | null;
          average_order_value: number;
          ad_spend: number;
          expenses: number;
          net_profit: number | null;
          profit_margin: number | null;
        };
        Relationships: [];
      };
      dashboard_daily_financials: {
        Row: {
          business_date: string;
          delivered_order_count: number;
          delivered_orders_missing_cogs: number;
          delivered_orders_missing_fulfillment_costs: number;
          product_revenue: number;
          net_revenue: number;
          cogs: number | null;
          gross_profit: number | null;
          contribution_profit: number | null;
          average_order_value: number;
          expenses: number;
          ad_spend: number;
          net_profit: number | null;
          profit_margin: number | null;
        };
        Relationships: [];
      };
      dashboard_data_quality_checks: {
        Row: {
          order_items_with_missing_links: number;
          duplicate_order_numbers: number;
          products_with_missing_sku: number;
          duplicate_product_skus: number;
          delivered_orders_without_items: number;
          delivered_orders_missing_financial_snapshot: number;
          snapshot_product_revenue_mismatches: number;
          snapshot_cogs_mismatches: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_dashboard_order: {
        Args: { p_order: Json; p_items: Json };
        Returns: string;
      };
      get_dashboard_financial_summary: {
        Args: {
          p_start_date?: string | null;
          p_end_date?: string | null;
          p_sales_channel?: string | null;
          p_campaign_id?: string | null;
        };
        Returns: Array<{
          delivered_order_count: number;
          delivered_orders_missing_cogs: number;
          delivered_orders_missing_fulfillment_costs: number;
          product_revenue: number;
          net_revenue: number;
          cogs: number | null;
          gross_profit: number | null;
          contribution_profit: number | null;
          average_order_value: number;
          ad_spend: number;
          expenses: number;
          net_profit: number | null;
          profit_margin: number | null;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
