import { describe, expect, it, vi } from "vitest";
import { mapCapitalFundsRow, mapOrder, mapOwnerMoneyTakenLifetimeRow, mapOwnerPositionPeriodRow, mapProduct, mapSpendingCategoryRow, mapSteadfastControlRow, mapTopProductRows, summarizeRecognizedCostRows, SupabaseBusinessRepository } from "@/data/supabase-repository";
import type { ProductFinancialRow } from "@/data/authoritative-reporting";
import type { Database, OrderItemRow, OrderRow, ProductBusinessRow, ProductRow } from "@/lib/supabase/database.types";

describe("Supabase repository mapping", () => {
  it("keeps buying cost in the private product companion row", () => {
    const product = { id: "p1", category_id: null, name: "Planner", slug: "planner", sku: "PUBLIC", price: 580, stock: 2, is_active: true, created_at: null, updated_at: null } satisfies ProductRow;
    const business = { product_id: "p1", sku_override: "NN-001", variation: "Blue", buying_price: 280, buying_price_verified_at: "now", buying_price_verified_by: "u1", reorder_level: 4, internal_notes: "private", created_at: "now", updated_at: "now" } satisfies ProductBusinessRow;
    expect(mapProduct(product, business)).toMatchObject({ sku: "NN-001", buyingPrice: 28000, sellingPrice: 58000 });
  });

  it("maps legacy Delivered rows and immutable item snapshots", () => {
    const order = {
      id: "o1", order_number: "NN-1", customer_name: "Customer", customer_phone: "", customer_address: "", customer_note: null, delivery_area: "Inside Dhaka",
      payment_method: "cod", payment_status: "verified", order_status: "delivered", subtotal: 580, delivery_charge: 80, total: 660,
      order_date: null, external_reference: null, customer_location: null, courier: null, sales_channel: null, campaign_id: null,
      campaign_name_snapshot: null, dashboard_order_status: null, dashboard_payment_status: null, settlement_status: null,
      discount_amount: null, refund_amount: null, courier_cost_snapshot: 70, packaging_cost_snapshot: 0, created_at: "2026-07-14T00:00:00Z", updated_at: null,
    } satisfies OrderRow;
    const item = {
      id: "i1", order_id: "o1", product_id: "p1", product_name: "Planner", product_slug: "planner", unit_price: 580,
      quantity: 1, line_total: 580, sku_snapshot: "NN-001", list_price_snapshot: 580, buying_cost_snapshot: 280,
      supplier_cost_total_snapshot_poisha: null, freight_cost_total_snapshot_poisha: null,
      landed_cost_total_snapshot_poisha: null, landed_cost_snapshot_source: null,
      actual_unit_selling_price: 580, created_at: null,
    } satisfies OrderItemRow;
    expect(mapOrder(order, [item], true)).toMatchObject({ status: "Delivered", paymentMethod: "COD", paymentStatus: "Paid", updatedAt: undefined, hasImmutableFinancialSnapshot: true, courierCostSnapshotKnown: true, packagingCostSnapshotKnown: true, items: [{ buyingCostSnapshot: 28000 }] });
  });

  it("loads the bounded product-financial RPC with dashboard filters and maps adjusted net revenue", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        product_id: "00000000-0000-4000-8000-000000000010",
        sku: "NN-010",
        product_name: "Planner",
        delivered_order_count: "2",
        delivered_units: "3",
        returned_units: "1",
        gross_product_revenue: "1234.50",
        allocated_delivery_revenue: "120.05",
        allocated_discount: "34.25",
        allocated_refund: "200.10",
        adjusted_product_net_revenue: "1120.20",
        recognized_cogs: "500.00",
        gross_profit: "620.20",
        allocated_courier_cost: "70.00",
        allocated_packaging_cost: "2.00",
        contribution_profit: "548.20",
      }],
      error: null,
    });
    const repository = new SupabaseBusinessRepository({ rpc } as never);
    const loader = repository as unknown as {
      getProductFinancialRows(
        period: { startDate: string; endDate: string },
        channel: string,
        campaignId: string,
        status: string,
      ): Promise<ProductFinancialRow[]>;
    };

    const rows = await loader.getProductFinancialRows(
      { startDate: "2026-07-01", endDate: "2026-07-31" },
      "Website",
      "00000000-0000-4000-8000-000000000099",
      "Delivered",
    );

    expect(rpc).toHaveBeenCalledWith("get_dashboard_product_financials", {
      p_start_date: "2026-07-01",
      p_end_date: "2026-07-31",
      p_sales_channel: "Website",
      p_campaign_id: "00000000-0000-4000-8000-000000000099",
      p_order_status: "Delivered",
      p_product_id: null,
      p_sku: null,
      p_limit: 5,
      p_offset: 0,
    });
    expect(mapTopProductRows(rows)).toEqual([{ name: "Planner", revenue: 112020 }]);
  });

  it("maps exact courier and packaging snapshots while preserving unavailable costs", () => {
    expect(summarizeRecognizedCostRows([
      { recognized_courier_cost: 6_500, recognized_packaging_cost: 200 },
      { recognized_courier_cost: 11_500, recognized_packaging_cost: 200 },
    ], 44_000, true)).toEqual({
      productCost: 44_000,
      transportation: 18_000,
      packaging: 400,
    });

    expect(summarizeRecognizedCostRows([
      { recognized_courier_cost: null, recognized_packaging_cost: 200 },
    ], null, true)).toEqual({
      productCost: null,
      transportation: null,
      packaging: 200,
    });
    expect(summarizeRecognizedCostRows([], 0, false)).toEqual({
      productCost: null,
      transportation: null,
      packaging: null,
    });
  });

  it("maps exact spending and as-of Steadfast controls to integer poisha", () => {
    const category = {
      category_key: "courier_fulfilment", category_label: "Courier / fulfilment", recorded_source_total: 0,
      classified_paid_spending: 0, unpaid_total: 0, unresolved_source_count: 0, total_spending: 0,
      sort_order: 4, independently_verified_spending: 4336.3, combined_spending: 4336.3, overlap_review_required: false,
    } satisfies Database["public"]["Views"]["dashboard_spending_by_category"]["Row"];
    const steadfast = {
      calculated_receivable: 4620, actual_receivable: 4623, difference: 3, observed_on: "2026-08-17",
      observation_reason: "Verified courier control", gross_eligible_receivable: 6190, reversed_batch_receivable: 1570,
      current_calculated_receivable: 7440, current_gross_eligible_receivable: 9010, post_observation_receivable: 2820,
    } satisfies Database["public"]["Views"]["dashboard_steadfast_receivable_reconciliation"]["Row"];

    expect(mapSpendingCategoryRow(category)).toMatchObject({ independentlyVerifiedSpending: 433630, combinedSpending: 433630, overlapReviewRequired: false });
    expect(mapSteadfastControlRow(steadfast)).toMatchObject({ calculatedReceivable: 462000, actualReceivable: 462300, difference: 300, currentCalculatedReceivable: 744000, postObservationReceivable: 282000 });
  });

  it("preserves the effective date and maps exact owner classification money", () => {
    const row = {
      owner_label: "Nasim",
      event_date: "2026-07-26",
      owner_money_taken_in_period: 8598,
      capital_return_in_period: 1384,
      excess_due_in_period: 7214,
    } satisfies Database["public"]["Views"]["dashboard_owner_position_daily"]["Row"];

    expect(mapOwnerPositionPeriodRow(row)).toEqual({
      eventDate: "2026-07-26",
      ownerLabel: "Nasim",
      ownerMoneyTakenInPeriod: 859_800,
      capitalReturnInPeriod: 138_400,
      excessDueInPeriod: 721_400,
    });
  });

  it("maps a legacy lifetime owner-money row without losing exact money or reversal safety", () => {
    const row = {
      id: "00000000-0000-4000-8000-000000000604",
      event_date: "2026-07-26",
      owner_label: "Nasim",
      event_type: "taken" as const,
      amount: 8598,
      capital_return_amount: 1384,
      excess_due_amount: 7214,
      source_account_key: "bkash",
      source_account_label: "bKash",
      cash_movement_id: "00000000-0000-4000-8000-000000000614",
      capital_return_id: null,
      owner_held_event_id: "00000000-0000-4000-8000-000000000624",
      reversal_of_id: null,
      is_reversed: false,
      description: "Legacy owner-held business funds",
      reference: "SFC-30935216",
      created_at: "2026-07-26T12:00:00+06:00",
      record_source: "legacy_owner_held" as const,
      can_reverse: false,
    } satisfies Database["public"]["Views"]["dashboard_owner_money_taken_lifetime_history"]["Row"];

    expect(mapOwnerMoneyTakenLifetimeRow(row)).toMatchObject({
      amount: 859_800,
      capitalReturnAmount: 138_400,
      excessDueAmount: 721_400,
      recordSource: "legacy_owner_held",
      canReverse: false,
    });
  });

  it("maps the non-duplicated Development cash-spending and available-funds totals", () => {
    const row = {
      owner_cash_investment: 48720, owner_non_cash_contribution: 0, total_owner_investment_contribution: 48720,
      owner_withdrawals: 0, classified_paid_spending: 53132.79, total_business_spending: 53132.79,
      unresolved_source_count: 0, ledger_business_cash: 49849.7, actual_business_cash: 0,
      ledger_due_from_owners: 7714, actual_due_from_owners: 7714, calculated_steadfast_receivable: 4620,
      confirmed_steadfast_receivable: 4623, total_available_receivable_funds: 12337, known_inventory_value: 0,
      unresolved_reconciliation_difference: -49846.7, historical_owner_investment: 48720, total_capital_returned: 15120,
      current_contributed_capital: 33600, procurement_spending: 46980, supplier_freight_spending: 1480,
      advertising_spending: 4602.79, courier_fulfilment_spending: 4336.3, operating_spending: 70,
      confirmed_paid_source_spending: 53132.79, verified_courier_fulfilment_spending: 4336.3,
      total_business_cash_spending: 57469.09,
    } satisfies Database["public"]["Views"]["dashboard_capital_spending_available_funds"]["Row"];

    expect(mapCapitalFundsRow(row)).toMatchObject({
      confirmedPaidSourceSpending: 5_313_279,
      verifiedCourierFulfilmentSpending: 433_630,
      totalBusinessCashSpending: 5_746_909,
      actualDueFromOwners: 771_400,
      totalAvailableReceivableFunds: 1_233_700,
    });
  });
});
