import type { Json } from "@/lib/supabase/database.types";

type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type WorkspaceRow = { id: string; name: string; created_by: string; created_at: string; updated_at: string };
type ProductRow = {
  id: string; workspace_id: string; source_store_id: string | null; external_id: string | null;
  sku: string | null; name: string; description: string | null; category: string | null;
  brand: string | null; image_urls: string[]; status: "active" | "draft" | "archived";
  currency: string; price: number | null; metadata: Json; source_metadata: Json;
  created_at: string; updated_at: string;
};
type VariantRow = {
  id: string; workspace_id: string; product_id: string; external_id: string | null; sku: string | null;
  barcode: string | null; name: string; attributes: Json; currency: string; price: number;
  compare_at_price: number | null; reorder_level: number; source_metadata: Json;
  created_at: string; updated_at: string;
};
type CustomerRow = {
  id: string; workspace_id: string; store_id: string; external_id: string | null; email: string | null;
  phone: string | null; full_name: string; billing_address: Json; shipping_address: Json; notes: string | null;
  marketing_consent: boolean | null; source_metadata: Json; first_seen_at: string | null;
  last_seen_at: string | null; created_at: string; updated_at: string;
};
type OrderRow = {
  id: string; workspace_id: string; store_id: string; customer_id: string | null; external_id: string | null;
  order_number: string; status: string; payment_status: string; fulfillment_status: string;
  payment_method: string | null; currency: string; subtotal: number; discount_total: number;
  shipping_total: number; shipping_cost: number | null; tax_total: number; refund_total: number; total: number;
  customer_name_snapshot: string | null; customer_phone_snapshot: string | null;
  shipping_address_snapshot: Json; source: string; source_status: string | null; source_metadata: Json;
  placed_at: string; synced_at: string | null; created_at: string; updated_at: string;
};
type OrderItemRow = {
  id: string; workspace_id: string; order_id: string; product_variant_id: string | null;
  product_name_snapshot: string; sku_snapshot: string | null; image_url_snapshot: string | null;
  attributes: Json; quantity: number; unit_price: number; unit_cost: number | null;
  discount_total: number; tax_total: number; line_total: number; source_metadata: Json; created_at: string;
};
type ExpenseRow = {
  id: string; workspace_id: string; store_id: string | null; category: string; description: string;
  amount: number; currency: string; expense_date: string; status: "draft" | "unpaid" | "paid" | "void";
  accounting_class: "operating_expense" | "inventory_purchase" | "freight_in" | "unallocated_procurement" | "other";
  source: string; source_reference: string | null; payment_method: string | null;
  receipt_reference: string | null; notes: string | null; metadata: Json; created_by: string;
  created_at: string; updated_at: string;
};

export type UniversalDatabase = {
  public: {
    Tables: {
      workspaces: Table<WorkspaceRow>;
      workspace_memberships: Table<{ workspace_id: string; user_id: string; role: "owner" | "admin" | "manager" | "staff" | "viewer"; is_active: boolean; created_at: string; updated_at: string }>;
      workspace_invitations: Table<{ id: string; workspace_id: string; invited_email: string; role: string; expires_at: string; created_by: string; accepted_at: string | null; accepted_by: string | null; revoked_at: string | null; created_at: string }>;
      stores: Table<{ id: string; workspace_id: string; name: string; platform: "woocommerce" | "shopify" | "custom"; base_url: string; external_store_id: string | null; connection_status: "disconnected" | "connected" | "error"; is_active: boolean; platform_metadata: Json; created_by: string; created_at: string; updated_at: string }>;
      products: Table<ProductRow>;
      product_variants: Table<VariantRow>;
      product_variant_costs: Table<{ workspace_id: string; product_variant_id: string; cost_price: number | null; private_notes: string | null; updated_by: string; updated_at: string }>;
      customers: Table<CustomerRow>;
      orders: Table<OrderRow>;
      order_items: Table<OrderItemRow>;
      refunds: Table<{ id: string; workspace_id: string; order_id: string; external_id: string | null; amount: number; currency: string; status: string; reason: string | null; source_metadata: Json; refunded_at: string | null; created_at: string }>;
      fulfillments: Table<{ id: string; workspace_id: string; order_id: string; external_id: string | null; status: string; carrier: string | null; tracking_number: string | null; tracking_url: string | null; source_metadata: Json; shipped_at: string | null; delivered_at: string | null; created_at: string; updated_at: string }>;
      inventory_levels: Table<{ workspace_id: string; store_id: string; product_variant_id: string; quantity: number; reorder_level: number; source: string; observed_at: string; updated_at: string }>;
      inventory_movements: Table<{ id: string; workspace_id: string; store_id: string; product_variant_id: string; movement_type: string; quantity_delta: number; idempotency_key: string; source_reference: string | null; note: string | null; actor_id: string | null; created_at: string }>;
      expenses: Table<ExpenseRow>;
      financial_entries: Table<{ id: string; workspace_id: string; store_id: string | null; order_id: string | null; entry_type: string; amount: number; currency: string; effective_at: string; source_type: string; source_reference: string | null; idempotency_key: string; note: string | null; created_at: string }>;
      audit_events: Table<{ id: string; workspace_id: string; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; reason: string | null; event_metadata: Json; created_at: string }>;
    };
    Views: {
      workspace_product_stock: { Row: ProductRow & { stock_quantity: number | null; tracked_variant_count: number; stock_status: string }; Relationships: [] };
      workspace_inventory_stock: { Row: VariantRow & { product_name: string; category: string | null; tracked_store_count: number; stock_quantity: number | null; low_stock_store_count: number; stock_status: string }; Relationships: [] };
      workspace_customer_order_counts: { Row: Pick<CustomerRow, "id" | "workspace_id" | "full_name" | "email" | "phone" | "notes" | "first_seen_at" | "last_seen_at" | "created_at"> & { order_count: number }; Relationships: [] };
      workspace_order_list: { Row: OrderRow & { customer_name: string | null }; Relationships: [] };
    };
    Functions: {
      create_workspace: { Args: { p_name: string }; Returns: string };
      invite_workspace_member: { Args: { p_workspace_id: string; p_email: string; p_role: string }; Returns: Array<{ invitation_id: string; invitation_token: string; expires_at: string }> };
      accept_workspace_invitation: { Args: { p_token: string }; Returns: string };
      revoke_workspace_invitation: { Args: { p_workspace_id: string; p_invitation_id: string }; Returns: undefined };
      set_workspace_member_role: { Args: { p_workspace_id: string; p_user_id: string; p_role: string }; Returns: undefined };
      remove_workspace_member: { Args: { p_workspace_id: string; p_user_id: string }; Returns: undefined };
      transfer_workspace_ownership: { Args: { p_workspace_id: string; p_new_owner_id: string }; Returns: undefined };
      list_workspace_members: { Args: { p_workspace_id: string }; Returns: Array<{ user_id: string; email: string | null; role: string; is_active: boolean; created_at: string }> };
      save_workspace_product: { Args: { p_workspace_id: string; p_product_id: string | null; p_variant_id: string | null; p_name: string; p_description: string | null; p_sku: string | null; p_category: string | null; p_brand: string | null; p_image_urls: string[]; p_status: string; p_currency: string; p_price: number; p_cost_price: number | null; p_barcode: string | null; p_variant_name: string | null; p_attributes: Json; p_reorder_level: number }; Returns: Array<{ product_id: string; variant_id: string }> };
      archive_workspace_product: { Args: { p_workspace_id: string; p_product_id: string }; Returns: undefined };
      adjust_workspace_inventory: { Args: { p_workspace_id: string; p_store_id: string; p_variant_id: string; p_quantity_delta: number; p_idempotency_key: string; p_reason: string }; Returns: number };
      set_workspace_order_status: { Args: { p_workspace_id: string; p_order_id: string; p_status: string; p_payment_status: string }; Returns: undefined };
      record_workspace_refund: { Args: { p_workspace_id: string; p_order_id: string; p_amount: number; p_reason: string }; Returns: string };
      save_workspace_customer_notes: { Args: { p_workspace_id: string; p_customer_id: string; p_notes: string | null }; Returns: undefined };
      save_workspace_expense: { Args: { p_workspace_id: string; p_expense_id: string | null; p_category: string; p_description: string; p_amount: number; p_currency: string; p_expense_date: string; p_status: string; p_accounting_class: string; p_payment_method: string | null; p_receipt_reference: string | null; p_notes: string | null }; Returns: string };
      workspace_reporting_metrics: { Args: { p_workspace_id: string; p_start_date: string; p_end_date: string }; Returns: Json };
      create_workspace_order: { Args: { p_workspace_id: string; p_store_id: string; p_order_number: string; p_customer_name: string; p_customer_phone: string | null; p_customer_address: Json; p_payment_method: string | null; p_items: Json; p_discount: number; p_shipping_total: number; p_shipping_cost: number; p_tax_total: number }; Returns: string };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
