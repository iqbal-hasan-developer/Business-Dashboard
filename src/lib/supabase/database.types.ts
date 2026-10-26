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
  buying_price_verified_at: string | null;
  buying_price_verified_by: string | null;
  reorder_level: number;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderRow = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_note: string | null;
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
  supplier_cost_total_snapshot_poisha: number | null;
  freight_cost_total_snapshot_poisha: number | null;
  landed_cost_total_snapshot_poisha: number | null;
  landed_cost_snapshot_source: "purchase_batch_fifo" | null;
  actual_unit_selling_price: number | null;
  created_at: string | null;
};

export type ExpenseRow = {
  id: string;
  expense_date: string;
  category_key: string;
  accounting_class: "operating_expense" | "inventory_purchase" | "freight_in" | "unallocated_procurement";
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
      categories: Table<{
        id: string;
        name: string;
        slug: string;
        is_active: boolean | null;
      }>;
      products: Table<ProductRow>;
      product_business_data: Table<ProductBusinessRow>;
      business_settings: Table<{
        setting_key: string;
        setting_value: Json;
        description: string | null;
        updated_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      business_lookup_values: Table<{
        lookup_type: string;
        lookup_key: string;
        label: string;
        sort_order: number;
        is_active: boolean;
        metadata: Json;
        updated_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      orders: Table<OrderRow>;
      order_items: Table<OrderItemRow>;
      expenses: Table<ExpenseRow>;
      purchase_batches: Table<{
        id: string;
        purchase_date: string;
        supplier: string | null;
        supplier_reference: string | null;
        notes: string | null;
        status: "posted" | "void";
        merchandise_total_poisha: number;
        freight_total_poisha: number;
        landed_total_poisha: number;
        created_by: string | null;
        created_at: string;
        updated_at: string;
      }>;
      purchase_batch_items: Table<{
        id: string;
        purchase_batch_id: string;
        product_id: string;
        quantity: number;
        supplier_unit_cost_poisha: number;
        supplier_product_cost_poisha: number;
        allocated_freight_poisha: number;
        landed_cost_total_poisha: number;
        landed_unit_cost_poisha: number;
        created_at: string;
      }>;
      procurement_expense_allocations: Table<{
        id: string;
        expense_id: string;
        purchase_batch_id: string;
        allocation_type: "merchandise" | "freight";
        allocated_poisha: number;
        created_by: string | null;
        created_at: string;
      }>;
      order_item_inventory_consumptions: Table<{
        id: string;
        order_id: string;
        order_item_id: string;
        purchase_batch_item_id: string;
        product_id_snapshot: string;
        quantity: number;
        supplier_cost_poisha: number;
        freight_cost_poisha: number;
        landed_cogs_poisha: number;
        recognized_at: string;
        created_at: string;
      }>;
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
        updated_by: string | null;
        results_count: number | null;
        result_type: string | null;
        impressions: number | null;
        reach: number | null;
        total_messaging_contacts: number | null;
        new_messaging_contacts: number | null;
        purchases: number | null;
        attribution_setting: string | null;
        performance_source_reference: string | null;
        performance_updated_at: string | null;
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
        updated_by: string | null;
      }>;
      audit_history: Table<{
        id: string;
        table_name: string;
        record_id: string;
        action: string;
        changed_by: string | null;
        changed_at: string;
        old_values: Json | null;
        new_values: Json | null;
        reason: string | null;
      }>;
      cash_movements: Table<{
        id: string;
        movement_date: string;
        movement_type: "inflow" | "outflow" | "transfer_in" | "transfer_out";
        transaction_type: "owner_investment" | "owner_withdrawal" | "owner_money_taken" | "operating_inflow" | "operating_outflow" | "transfer_in" | "transfer_out" | "courier_settlement" | "expense" | "ad_spend" | "procurement_payment" | "customer_payment" | "owner_held_transfer" | "reversal";
        account_key: string;
        amount: number;
        order_id: string | null;
        settlement_id: string | null;
        expense_id: string | null;
        description: string;
        reference: string | null;
        owner_label: string | null;
        reversal_of_id: string | null;
        correction_of_id: string | null;
        idempotency_key: string | null;
        request_fingerprint: string | null;
        funding_id: string | null;
        created_by: string | null;
        created_at: string;
      }>;
      financial_source_fundings: Table<{
        id: string;
        expense_id: string | null;
        ad_spend_id: string | null;
        purchase_batch_id: string | null;
        funding_treatment: "business_account_paid" | "owner_paid_personally" | "owner_held_business_funds" | "unpaid" | "historical_business_paid_account_unknown" | "already_represented";
        payment_date: string | null;
        business_account_key: string | null;
        amount: number;
        owner_label: string | null;
        existing_cash_movement_id: string | null;
        notes: string | null;
        idempotency_key: string;
        request_fingerprint: string;
        created_by: string | null;
        created_at: string;
      }>;
      owner_non_cash_capital_events: Table<{
        id: string;
        funding_id: string;
        event_type: "contribution" | "reversal";
        event_date: string;
        owner_label: string;
        amount: number;
        reversal_of_id: string | null;
        reason: string | null;
        created_by: string | null;
        created_at: string;
      }>;
      financial_source_funding_reversals: Table<{
        id: string;
        funding_id: string;
        reversed_on: string;
        reason: string;
        cash_reversal_id: string | null;
        owner_capital_reversal_id: string | null;
        owner_held_reversal_id: string | null;
        idempotency_key: string;
        request_fingerprint: string;
        created_by: string | null;
        created_at: string;
      }>;
      cash_account_balance_observations: Table<{
        id: string;
        account_key: string;
        observed_on: string;
        actual_balance: number;
        reason: string;
        idempotency_key: string;
        request_fingerprint: string;
        created_by: string | null;
        created_at: string;
      }>;
      owner_held_fund_events: Table<{
        id: string;
        event_type: "receipt" | "spend" | "reversal";
        event_date: string;
        owner_label: "Nasim" | "Rifat" | "Ikbal";
        amount: number;
        funding_id: string | null;
        settlement_id: string | null;
        cash_movement_id: string | null;
        original_owner_withdrawal_id: string | null;
        capital_return_id: string | null;
        reversal_of_id: string | null;
        reason: string | null;
        idempotency_key: string;
        request_fingerprint: string;
        created_by: string | null;
        created_at: string;
      }>;
      owner_capital_return_events: Table<{
        id: string;
        event_type: "return" | "reversal";
        event_date: string;
        owner_label: "Nasim" | "Rifat" | "Ikbal";
        amount: number;
        settlement_treatment: "owner_held_business_funds" | "business_account";
        reversal_of_id: string | null;
        reason: string;
        idempotency_key: string;
        request_fingerprint: string;
        created_by: string | null;
        created_at: string;
      }>;
      owner_money_taken_events: Table<{
        id: string;
        event_type: "taken" | "reversal";
        event_date: string;
        owner_label: "Nasim" | "Rifat" | "Ikbal";
        amount: number;
        capital_return_amount: number;
        excess_due_amount: number;
        source_account_key: string;
        cash_movement_id: string;
        capital_return_id: string | null;
        owner_held_event_id: string | null;
        reversal_of_id: string | null;
        description: string;
        reference: string | null;
        idempotency_key: string;
        request_fingerprint: string;
        created_by: string | null;
        created_at: string;
      }>;
      owner_held_balance_observations: Table<{
        id: string;
        owner_label: "Nasim" | "Rifat" | "Ikbal";
        observed_on: string;
        actual_due: number;
        reason: string;
        idempotency_key: string;
        request_fingerprint: string;
        created_by: string | null;
        created_at: string;
      }>;
      steadfast_receivable_observations: Table<{
        id: string;
        observed_on: string;
        actual_receivable: number;
        reason: string;
        idempotency_key: string;
        request_fingerprint: string;
        created_by: string | null;
        created_at: string;
      }>;
      settlement_records: Table<{
        id: string;
        courier: string;
        settlement_reference: string | null;
        settlement_date: string;
        amount_received: number;
        fees_withheld: number;
        status: string;
        notes: string | null;
        created_by: string | null;
        updated_by: string | null;
        created_at: string;
        updated_at: string;
        receiving_method: "bkash" | "bank_transfer" | null;
        receiving_account_label: string | null;
        receiving_account_last4: string | null;
        receiving_transaction_reference: string | null;
        gross_cod_amount: number | null;
        idempotency_key: string | null;
        request_fingerprint: string | null;
        confirmed_at: string | null;
        receipt_treatment: "business_account" | "owner_held_business_funds";
        owner_label: string | null;
      }>;
      settlement_receipt_allocations: Table<{
        id: string;
        settlement_id: string;
        receipt_treatment: "owner_held_business_funds";
        owner_label: "Nasim" | "Rifat" | "Ikbal";
        amount: number;
        owner_held_event_id: string;
        allocation_type: "receipt" | "reversal";
        reversal_of_id: string | null;
        source_reference: string;
        created_by: string | null;
        created_at: string;
      }>;
      settlement_order_allocations: Table<{
        settlement_id: string;
        order_id: string;
        allocated_amount: number;
        created_by: string | null;
        created_at: string;
      }>;
      rejected_cod_courier_adjustments: Table<{
        id: string;
        order_id: string;
        evidence_date: string;
        courier: string;
        tracking_code: string;
        courier_outcome: string;
        rejection_reason: string;
        customer_delivery_charge_recovery: number;
        courier_charge: number;
        expected_net_adjustment: number;
        evidence_status: string;
        idempotency_key: string;
        request_fingerprint: string;
        created_by: string;
        created_at: string;
      }>;
      rejected_cod_adjustment_settlement_allocations: Table<{
        id: string;
        adjustment_id: string;
        settlement_id: string;
        customer_delivery_charge_recovery: number;
        courier_charge: number;
        net_adjustment: number;
        created_by: string;
        created_at: string;
      }>;
      settlement_reversals: Table<{
        id: string;
        settlement_id: string;
        reversed_on: string;
        reason: string;
        cash_reversal_id: string | null;
        owner_held_reversal_id: string | null;
        idempotency_key: string;
        request_fingerprint: string;
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
      dashboard_rejected_cod_adjustments: {
        Row: {
          id: string;
          order_id: string;
          order_number: string;
          evidence_date: string;
          courier: string;
          tracking_code: string;
          courier_outcome: string;
          rejection_reason: string;
          customer_delivery_charge_recovery: number;
          courier_charge: number;
          expected_net_adjustment: number;
          evidence_status: string;
          settlement_confirmation_status: string;
          settlement_id: string | null;
          settlement_date: string | null;
          settlement_reference: string | null;
          created_at: string;
        };
        Relationships: [];
      };
      dashboard_rejected_cod_adjustment_financials: {
        Row: {
          event_date: string;
          order_id: string;
          order_number: string;
          sales_channel: string;
          campaign_id: string | null;
          delivery_charge_recovery: number;
          courier_cost: number;
          net_adjustment: number;
          settlement_id: string;
          recognized_at: string;
        };
        Relationships: [];
      };
      dashboard_steadfast_settlement_eligible_rejected_adjustments: {
        Row: {
          adjustment_id: string;
          order_id: string;
          order_number: string;
          order_date: string;
          customer_name: string;
          sales_channel: string;
          campaign_id: string | null;
          tracking_code: string;
          courier_outcome: string;
          expected_created_at: string;
          gross_cod_recovery: number;
          courier_charge: number;
          expected_net_adjustment: number;
        };
        Relationships: [];
      };
      dashboard_steadfast_settlement_batch_rejected_adjustments: {
        Row: {
          settlement_id: string;
          adjustment_id: string;
          order_id: string;
          order_number: string;
          customer_name: string;
          tracking_code: string;
          customer_delivery_charge_recovery: number;
          courier_charge: number;
          net_adjustment: number;
        };
        Relationships: [];
      };
      dashboard_cash_ledger: {
        Row: {
          id: string;
          movement_date: string;
          movement_type: "inflow" | "outflow" | "transfer_in" | "transfer_out";
          transaction_type: "owner_investment" | "owner_withdrawal" | "owner_money_taken" | "operating_inflow" | "operating_outflow" | "transfer_in" | "transfer_out" | "courier_settlement" | "expense" | "ad_spend" | "procurement_payment" | "customer_payment" | "reversal";
          account_key: string;
          account_label: string;
          amount: number;
          signed_amount: number;
          owner_investment_effect: number;
          running_balance: number;
          account_running_balance: number;
          description: string;
          reference: string | null;
          owner_label: string | null;
          order_id: string | null;
          settlement_id: string | null;
          expense_id: string | null;
          reversal_of_id: string | null;
          correction_of_id: string | null;
          is_reversed: boolean;
          created_at: string;
        };
        Relationships: [];
      };
      dashboard_cash_account_balances: {
        Row: {
          account_key: string;
          account_label: string;
          balance: number;
        };
        Relationships: [];
      };
      dashboard_owner_non_cash_capital: {
        Row: {
          id: string;
          funding_id: string;
          event_date: string;
          owner_label: string;
          event_type: "contribution" | "reversal";
          amount: number;
          signed_amount: number;
          reversal_of_id: string | null;
          is_reversed: boolean;
          reason: string | null;
          created_at: string;
        };
        Relationships: [];
      };
      dashboard_active_source_fundings: {
        Row: {
          funding_id: string;
          source_type: "expense" | "ad_spend" | "purchase_batch";
          source_id: string;
          source_date: string;
          description: string;
          amount: number;
          funding_treatment: "business_account_paid" | "owner_paid_personally" | "owner_held_business_funds" | "unpaid" | "historical_business_paid_account_unknown" | "already_represented";
          payment_date: string | null;
          business_account_key: string | null;
          owner_label: string | null;
          existing_cash_movement_id: string | null;
          generated_cash_movement_id: string | null;
          created_at: string;
        };
        Relationships: [];
      };
      dashboard_historical_cash_reconciliation: {
        Row: {
          record_type: "expense" | "procurement" | "ad_spend" | "purchase_batch" | "owner_cash_movement";
          record_id: string;
          record_date: string;
          description: string;
          amount: number;
          issue_type: "missing_funding_treatment" | "suspicious_owner_cash_entry" | "source_without_cash_movement";
          account_key: string | null;
          owner_label: string | null;
          cash_movement_id: string | null;
        };
        Relationships: [];
      };
      dashboard_cash_account_reconciliation: {
        Row: {
          account_key: string;
          account_label: string;
          ledger_balance: number;
          actual_balance: number | null;
          difference: number | null;
          observed_on: string | null;
          observation_reason: string | null;
          unresolved_count: number;
          unresolved_amount: number;
        };
        Relationships: [];
      };
      dashboard_owner_held_balances: {
        Row: {
          owner_label: string;
          ledger_due: number;
          actual_due: number | null;
          difference: number | null;
          observed_on: string | null;
          observation_reason: string | null;
        };
        Relationships: [];
      };
      dashboard_steadfast_receivable_reconciliation: {
        Row: {
          calculated_receivable: number;
          actual_receivable: number | null;
          difference: number | null;
          observed_on: string | null;
          observation_reason: string | null;
          gross_eligible_receivable: number;
          reversed_batch_receivable: number;
          current_calculated_receivable: number;
          current_gross_eligible_receivable: number;
          post_observation_receivable: number;
        };
        Relationships: [];
      };
      dashboard_steadfast_receivable_components: {
        Row: {
          order_id: string;
          order_number: string;
          order_date: string;
          customer_name: string;
          gross_cod_receivable: number;
          excluded_reversed_batch: boolean;
          active_collectible_receivable: number;
          reversed_settlement_id: string | null;
          reversed_on: string | null;
          reversal_reason: string | null;
        };
        Relationships: [];
      };
      dashboard_owner_capital_returns: {
        Row: {
          id: string;
          event_date: string;
          owner_label: string;
          event_type: "return" | "reversal";
          amount: number;
          signed_returned_amount: number;
          settlement_treatment: "owner_held_business_funds" | "business_account";
          reversal_of_id: string | null;
          is_reversed: boolean;
          reason: string;
          created_at: string;
        };
        Relationships: [];
      };
      dashboard_owner_capital_positions: {
        Row: {
          owner_label: string;
          cash_investment: number;
          non_cash_contribution: number;
          historical_investment: number;
          capital_returned: number;
          current_contributed_capital: number;
          owner_money_taken: number;
          money_taken_capital_return: number;
          money_taken_excess_due: number;
          due_from_owner: number;
          cumulative_money_returned_or_due: number;
        };
        Relationships: [];
      };
      dashboard_owner_money_taken_history: {
        Row: {
          id: string;
          event_type: "taken" | "reversal";
          event_date: string;
          owner_label: "Nasim" | "Rifat" | "Ikbal";
          amount: number;
          capital_return_amount: number;
          excess_due_amount: number;
          source_account_key: string;
          source_account_label: string;
          cash_movement_id: string;
          capital_return_id: string | null;
          owner_held_event_id: string | null;
          reversal_of_id: string | null;
          is_reversed: boolean;
          description: string;
          reference: string | null;
          created_at: string;
        };
        Relationships: [];
      };
      dashboard_owner_money_taken_lifetime_history: {
        Row: {
          id: string;
          event_date: string;
          owner_label: "Nasim" | "Rifat" | "Ikbal";
          event_type: "taken" | "reversal";
          amount: number;
          capital_return_amount: number;
          excess_due_amount: number;
          source_account_key: string;
          source_account_label: string;
          cash_movement_id: string | null;
          capital_return_id: string | null;
          owner_held_event_id: string | null;
          reversal_of_id: string | null;
          is_reversed: boolean;
          description: string;
          reference: string | null;
          created_at: string;
          record_source: "unified" | "legacy_owner_held" | "legacy_business_account_return";
          can_reverse: boolean;
        };
        Relationships: [];
      };
      dashboard_owner_position_daily: {
        Row: {
          owner_label: "Nasim" | "Rifat" | "Ikbal";
          event_date: string;
          owner_money_taken_in_period: number;
          capital_return_in_period: number;
          excess_due_in_period: number;
        };
        Relationships: [];
      };
      dashboard_spending_by_category: {
        Row: {
          category_key: string;
          category_label: string;
          recorded_source_total: number;
          classified_paid_spending: number;
          unpaid_total: number;
          unresolved_source_count: number;
          total_spending: number | null;
          sort_order: number;
          independently_verified_spending: number;
          combined_spending: number | null;
          overlap_review_required: boolean;
        };
        Relationships: [];
      };
      dashboard_capital_spending_available_funds: {
        Row: {
          owner_cash_investment: number;
          owner_non_cash_contribution: number;
          total_owner_investment_contribution: number;
          owner_withdrawals: number;
          classified_paid_spending: number;
          total_business_spending: number | null;
          unresolved_source_count: number;
          ledger_business_cash: number;
          actual_business_cash: number | null;
          ledger_due_from_owners: number;
          actual_due_from_owners: number;
          calculated_steadfast_receivable: number;
          confirmed_steadfast_receivable: number | null;
          total_available_receivable_funds: number | null;
          known_inventory_value: number;
          unresolved_reconciliation_difference: number | null;
          historical_owner_investment: number;
          total_capital_returned: number;
          current_contributed_capital: number;
          procurement_spending: number | null;
          supplier_freight_spending: number | null;
          advertising_spending: number | null;
          courier_fulfilment_spending: number | null;
          operating_spending: number | null;
          confirmed_paid_source_spending: number;
          verified_courier_fulfilment_spending: number;
          total_business_cash_spending: number | null;
        };
        Relationships: [];
      };
      dashboard_steadfast_settlement_eligible_orders: {
        Row: {
          order_id: string;
          order_number: string;
          order_date: string;
          customer_name: string;
          updated_at: string;
          gross_cod_receivable: number;
        };
        Relationships: [];
      };
      dashboard_steadfast_settlement_batches: {
        Row: {
          id: string;
          settlement_date: string;
          courier: string;
          receiving_method: "bkash" | "bank_transfer" | null;
          receiving_account_label: string | null;
          receiving_account_last4: string | null;
          receiving_transaction_reference: string | null;
          settlement_reference: string | null;
          gross_cod_amount: number;
          deductions: number;
          net_received: number;
          notes: string | null;
          confirmed_at: string;
          order_count: number;
          is_reversed: boolean;
          reversed_on: string | null;
          reversal_reason: string | null;
          receipt_treatment: "business_account" | "owner_held_business_funds";
          owner_label: string | null;
        };
        Relationships: [];
      };
      dashboard_steadfast_settlement_batch_orders: {
        Row: {
          settlement_id: string;
          order_id: string;
          order_number: string;
          customer_name: string;
          allocated_amount: number;
        };
        Relationships: [];
      };
      dashboard_steadfast_settlement_receipt_allocations: {
        Row: {
          id: string;
          settlement_id: string;
          owner_label: "Nasim" | "Rifat" | "Ikbal";
          amount: number;
          owner_held_event_id: string;
          is_reversed: boolean;
          reversal_allocation_id: string | null;
          reversal_owner_held_event_id: string | null;
          created_at: string;
        };
        Relationships: [];
      };
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
          recognized_courier_cost: number | null;
          recognized_packaging_cost: number | null;
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
      dashboard_procurement_summary: {
        Row: {
          inventory_purchase_total: number;
          freight_in_total: number;
          allocated_procurement_total: number;
          unallocated_procurement_total: number;
          known_inventory_value: number;
          unallocated_record_count: number;
          missing_cash_movement_count: number;
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
          inventory_purchases_recorded_as_operating_expense: number;
          supplier_freight_recorded_as_operating_expense: number;
          delivered_items_missing_landed_cost_snapshot: number;
          procurement_batches_missing_quantity: number;
          procurement_batches_missing_product: number;
          unallocated_freight_in: number;
          invalid_landed_cost: number;
          purchase_batch_allocation_mismatches: number;
          advertising_duplicated_in_expenses: number;
          fulfillment_duplicated_in_expenses: number;
          inventory_valuation_mismatches: number;
          unallocated_procurement_records: number;
          procurement_records_missing_cash_movement: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      get_dashboard_procurement_summary: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          inventory_purchase_total: number;
          freight_in_total: number;
          allocated_procurement_total: number;
          unallocated_procurement_total: number;
          known_inventory_value: number;
          unallocated_record_count: number;
          missing_cash_movement_count: number;
        }>;
      };
      get_dashboard_data_quality_checks: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          order_items_with_missing_links: number;
          duplicate_order_numbers: number;
          products_with_missing_sku: number;
          duplicate_product_skus: number;
          delivered_orders_without_items: number;
          delivered_orders_missing_financial_snapshot: number;
          snapshot_product_revenue_mismatches: number;
          snapshot_cogs_mismatches: number;
          inventory_purchases_recorded_as_operating_expense: number;
          supplier_freight_recorded_as_operating_expense: number;
          delivered_items_missing_landed_cost_snapshot: number;
          procurement_batches_missing_quantity: number;
          procurement_batches_missing_product: number;
          unallocated_freight_in: number;
          invalid_landed_cost: number;
          purchase_batch_allocation_mismatches: number;
          advertising_duplicated_in_expenses: number;
          fulfillment_duplicated_in_expenses: number;
          inventory_valuation_mismatches: number;
          unallocated_procurement_records: number;
          procurement_records_missing_cash_movement: number;
        }>;
      };
      get_business_order_defaults: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          currency: string;
          business_timezone: string;
          default_courier: string;
          inside_dhaka_courier_cost_poisha: number;
          outside_dhaka_courier_cost_poisha: number;
          packaging_cost_per_order_poisha: number;
          tax_vat_basis_points: number;
        }>;
      };
      create_dashboard_product: {
        Args: {
          p_name: string; p_slug: string; p_sku: string; p_price: number;
          p_is_active?: boolean; p_category_id?: string | null;
          p_buying_price?: number; p_reorder_level?: number;
          p_dashboard_sku?: string | null; p_variation?: string | null;
          p_internal_notes?: string | null;
        };
        Returns: string;
      };
      update_dashboard_product: {
        Args: {
          p_product_id: string; p_name: string; p_slug: string; p_sku: string;
          p_price: number; p_is_active: boolean; p_category_id?: string | null;
          p_buying_price?: number; p_reorder_level?: number;
          p_dashboard_sku?: string | null; p_variation?: string | null;
          p_internal_notes?: string | null;
        };
        Returns: string;
      };
      record_expense: {
        Args: { p_expense_date: string; p_category_key: string; p_description: string; p_amount: number; p_payment_method?: string | null; p_campaign_id?: string | null; p_sales_channel?: string | null; p_reference?: string | null };
        Returns: string;
      };
      edit_dashboard_expense: {
        Args: {
          p_expense_id: string;
          p_expense_date: string;
          p_category_key: string;
          p_description: string;
          p_amount: number;
          p_payment_method: string | null;
          p_campaign_id: string | null;
          p_sales_channel: string | null;
          p_reference: string | null;
          p_reason: string;
          p_expected_updated_at: string;
        };
        Returns: string;
      };
      delete_dashboard_expense: {
        Args: { p_expense_id: string; p_reason: string; p_expected_updated_at: string };
        Returns: string;
      };
      upsert_campaign: {
        Args: { p_id: string | null; p_name: string; p_channel: string; p_starts_on: string | null; p_ends_on: string | null; p_budget: number; p_is_active?: boolean };
        Returns: string;
      };
      record_daily_ad_spend: {
        Args: { p_campaign_id: string; p_spend_date: string; p_platform: string; p_amount: number; p_source_reference?: string | null };
        Returns: string;
      };
      record_funded_expense: {
        Args: { p_expense_date: string; p_category_key: string; p_description: string; p_amount: number; p_payment_method: string | null; p_campaign_id: string | null; p_sales_channel: string | null; p_reference: string | null; p_funding_treatment: "business_account_paid" | "owner_paid_personally" | "owner_held_business_funds" | "unpaid"; p_payment_date: string | null; p_business_account_key: string | null; p_owner_label: string | null; p_idempotency_key: string };
        Returns: string;
      };
      record_funded_ad_spend: {
        Args: { p_campaign_id: string; p_spend_date: string; p_platform: string; p_amount: number; p_source_reference: string | null; p_funding_treatment: "business_account_paid" | "owner_paid_personally" | "owner_held_business_funds" | "unpaid"; p_payment_date: string | null; p_business_account_key: string | null; p_owner_label: string | null; p_idempotency_key: string };
        Returns: string;
      };
      classify_historical_financial_source: {
        Args: { p_source_type: string; p_source_id: string; p_funding_treatment: string; p_payment_date: string | null; p_business_account_key: string | null; p_owner_label: string | null; p_existing_cash_movement_id: string | null; p_notes: string | null; p_idempotency_key: string };
        Returns: string;
      };
      classify_historical_account_unknown_source: {
        Args: { p_source_type: string; p_source_id: string; p_notes: string; p_idempotency_key: string };
        Returns: string;
      };
      pay_unpaid_financial_source: {
        Args: { p_source_type: string; p_source_id: string; p_funding_treatment: string; p_payment_date: string; p_business_account_key: string | null; p_owner_label: string | null; p_reason: string; p_idempotency_key: string };
        Returns: string;
      };
      reverse_financial_source_funding: {
        Args: { p_funding_id: string; p_reversed_on: string; p_reason: string; p_idempotency_key: string };
        Returns: string;
      };
      record_cash_account_balance_observation: {
        Args: { p_account_key: string; p_observed_on: string; p_actual_balance: number; p_reason: string; p_idempotency_key: string };
        Returns: string;
      };
      record_owner_held_fund_transfer: {
        Args: { p_transfer_date: string; p_owner_label: string; p_business_account_key: string; p_amount: number; p_reason: string; p_idempotency_key: string };
        Returns: string;
      };
      record_owner_capital_return_from_held: {
        Args: { p_return_date: string; p_owner_label: string; p_amount: number; p_reason: string; p_idempotency_key: string };
        Returns: string;
      };
      reverse_owner_capital_return_from_held: {
        Args: { p_capital_return_id: string; p_reversed_on: string; p_reason: string; p_idempotency_key: string };
        Returns: string;
      };
      reverse_owner_held_fund_transfer: {
        Args: { p_owner_held_event_id: string; p_reversed_on: string; p_reason: string; p_idempotency_key: string };
        Returns: string;
      };
      reclassify_owner_withdrawal_as_held: {
        Args: { p_original_movement_id: string; p_reclassified_on: string; p_reason: string; p_idempotency_key: string };
        Returns: string;
      };
      record_owner_held_balance_observation: {
        Args: { p_owner_label: string; p_observed_on: string; p_actual_due: number; p_reason: string; p_idempotency_key: string };
        Returns: string;
      };
      record_steadfast_receivable_observation: {
        Args: { p_observed_on: string; p_actual_receivable: number; p_reason: string; p_idempotency_key: string };
        Returns: string;
      };
      edit_dashboard_ad_spend: {
        Args: { p_spend_id: string; p_campaign_id: string; p_spend_date: string; p_platform: string; p_amount: number; p_source_reference: string | null; p_reason: string; p_expected_updated_at: string };
        Returns: string;
      };
      delete_dashboard_ad_spend: {
        Args: { p_spend_id: string; p_reason: string; p_expected_updated_at: string };
        Returns: string;
      };
      update_dashboard_campaign_performance: {
        Args: { p_campaign_id: string; p_results_count: number | null; p_result_type: string | null; p_impressions: number | null; p_reach: number | null; p_total_messaging_contacts: number | null; p_new_messaging_contacts: number | null; p_purchases: number | null; p_attribution_setting: string | null; p_source_reference: string | null; p_reason: string; p_expected_updated_at: string };
        Returns: string;
      };
      create_dashboard_order: {
        Args: { p_order: Json; p_items: Json };
        Returns: string;
      };
      update_dashboard_order: {
        Args: { p_order_id: string; p_expected_updated_at: string; p_order: Json; p_items: Json };
        Returns: string;
      };
      transition_dashboard_order: {
        Args: {
          p_order_id: string;
          p_order_status: string;
          p_payment_status?: string | null;
          p_settlement_status?: string | null;
          p_refund_amount?: number | null;
        };
        Returns: undefined;
      };
      set_product_buying_cost: {
        Args: {
          p_product_id: string;
          p_buying_price: number;
          p_reorder_level?: number;
          p_sku_override?: string | null;
          p_variation?: string | null;
          p_internal_notes?: string | null;
        };
        Returns: string;
      };
      update_business_financial_defaults: {
        Args: {
          p_default_courier: string;
          p_inside_dhaka_courier_cost_poisha: number;
          p_outside_dhaka_courier_cost_poisha: number;
          p_packaging_cost_per_order_poisha: number;
          p_tax_vat_basis_points: number;
        };
        Returns: undefined;
      };
      record_dashboard_cash_movement: {
        Args: {
          p_movement_date: string;
          p_transaction_type: "owner_investment" | "owner_withdrawal" | "operating_inflow" | "operating_outflow";
          p_account_key: string;
          p_amount: number;
          p_description: string;
          p_reference: string;
          p_owner_label: string;
          p_idempotency_key: string;
        };
        Returns: string;
      };
      record_customer_payment_receipt: {
        Args: {
          p_order_id: string;
          p_expected_updated_at: string;
          p_received_on: string;
          p_reference: string;
          p_idempotency_key: string;
        };
        Returns: string;
      };
      reverse_dashboard_cash_movement: {
        Args: { p_original_id: string; p_reason: string; p_idempotency_key: string };
        Returns: string;
      };
      edit_dashboard_owner_capital_movement: {
        Args: {
          p_original_id: string;
          p_movement_date: string;
          p_transaction_type: "owner_investment" | "owner_withdrawal";
          p_account_key: string;
          p_amount: number;
          p_description: string;
          p_reference: string;
          p_owner_label: string;
          p_reason: string;
          p_idempotency_key: string;
        };
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
      record_owner_money_taken: {
        Args: {
          p_event_date: string;
          p_owner_label: string;
          p_amount: number;
          p_source_account_key: string;
          p_description: string;
          p_reference: string;
          p_idempotency_key: string;
        };
        Returns: string;
      };
      record_purchase_batch: {
        Args: {
          p_purchase_date: string;
          p_supplier: string;
          p_supplier_reference: string;
          p_notes: string;
          p_items: Json;
          p_expense_allocations: Json;
        };
        Returns: string;
      };
      get_dashboard_product_financials: {
        Args: {
          p_start_date?: string | null;
          p_end_date?: string | null;
          p_sales_channel?: string | null;
          p_campaign_id?: string | null;
          p_order_status?: string | null;
          p_product_id?: string | null;
          p_sku?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: Array<{
          product_id: string;
          sku: string;
          product_name: string;
          delivered_order_count: number;
          delivered_units: number;
          returned_units: number;
          gross_product_revenue: number;
          allocated_delivery_revenue: number;
          allocated_discount: number;
          allocated_refund: number;
          adjusted_product_net_revenue: number;
          recognized_cogs: number | null;
          gross_profit: number | null;
          allocated_courier_cost: number | null;
          allocated_packaging_cost: number | null;
          contribution_profit: number | null;
        }>;
      };
      record_steadfast_cod_settlement: {
        Args: {
          p_settlement_date: string;
          p_receiving_method: "bkash" | "bank_transfer";
          p_gross_cod_amount: number;
          p_deductions: number;
          p_net_received: number;
          p_orders: Json;
          p_idempotency_key: string;
          p_courier_reference?: string | null;
          p_receiving_account_label?: string | null;
          p_receiving_account_last4?: string | null;
          p_receiving_transaction_reference?: string | null;
          p_note?: string | null;
        };
        Returns: string;
      };
      record_steadfast_cod_settlement_v2: {
        Args: {
          p_settlement_date: string;
          p_receipt_treatment: "business_account" | "owner_held_business_funds";
          p_receiving_method: "bkash" | "bank_transfer" | null;
          p_owner_label: string | null;
          p_gross_cod_amount: number;
          p_deductions: number;
          p_net_received: number;
          p_orders: Json;
          p_idempotency_key: string;
          p_courier_reference?: string | null;
          p_receiving_account_label?: string | null;
          p_receiving_account_last4?: string | null;
          p_receiving_transaction_reference?: string | null;
          p_note?: string | null;
        };
        Returns: string;
      };
      record_steadfast_cod_settlement_v3: {
        Args: {
          p_settlement_date: string;
          p_receipt_treatment: "business_account" | "owner_held_business_funds";
          p_receiving_method: "bkash" | "bank_transfer" | null;
          p_owner_allocations: Json;
          p_gross_cod_amount: number;
          p_deductions: number;
          p_net_received: number;
          p_orders: Json;
          p_idempotency_key: string;
          p_courier_reference?: string | null;
          p_receiving_account_label?: string | null;
          p_receiving_account_last4?: string | null;
          p_receiving_transaction_reference?: string | null;
          p_note?: string | null;
        };
        Returns: string;
      };
      record_rejected_cod_courier_adjustment: {
        Args: {
          p_order_id: string;
          p_evidence_date: string;
          p_tracking_code: string;
          p_courier_outcome: string;
          p_rejection_reason: string;
          p_customer_delivery_charge_recovery: number;
          p_courier_charge: number;
          p_idempotency_key: string;
        };
        Returns: string;
      };
      record_steadfast_cod_settlement_v4: {
        Args: {
          p_settlement_date: string;
          p_receipt_treatment: "business_account" | "owner_held_business_funds";
          p_receiving_method: "bkash" | "bank_transfer" | null;
          p_owner_allocations: Json;
          p_gross_cod_amount: number;
          p_deductions: number;
          p_net_received: number;
          p_orders: Json;
          p_rejected_adjustments: Json;
          p_idempotency_key: string;
          p_courier_reference?: string | null;
          p_receiving_account_label?: string | null;
          p_receiving_account_last4?: string | null;
          p_receiving_transaction_reference?: string | null;
          p_note?: string | null;
        };
        Returns: string;
      };
      reverse_owner_money_taken: {
        Args: {
          p_owner_money_taken_id: string;
          p_reversed_on: string;
          p_reason: string;
          p_idempotency_key: string;
        };
        Returns: string;
      };
      reverse_steadfast_cod_settlement: {
        Args: { p_settlement_id: string; p_reversed_on: string; p_reason: string; p_idempotency_key: string };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
