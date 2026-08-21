begin;
set local search_path = public, extensions, pg_catalog;
select no_plan();

-- Development fixture: owner history, returned capital, current capital, and
-- current Due remain distinct and reconcile to the approved owner evidence.
select is((select historical_investment from public.dashboard_owner_capital_positions where owner_label='Nasim'),15120.00::numeric,'Nasim historical investment remains 15,120');
select is((select capital_returned from public.dashboard_owner_capital_positions where owner_label='Nasim'),15120.00::numeric,'Nasim capital returned is 15,120');
select is((select current_contributed_capital from public.dashboard_owner_capital_positions where owner_label='Nasim'),0.00::numeric,'Nasim current contributed capital is zero');
select is((select due_from_owner from public.dashboard_owner_capital_positions where owner_label='Nasim'),7714.00::numeric,'Nasim current Due is 7,714');

select is((select historical_investment from public.dashboard_owner_capital_positions where owner_label='Rifat'),33600.00::numeric,'Rifat historical investment remains 33,600');
select is((select capital_returned from public.dashboard_owner_capital_positions where owner_label='Rifat'),10000.00::numeric,'Rifat capital returned is 10,000');
select is((select current_contributed_capital from public.dashboard_owner_capital_positions where owner_label='Rifat'),23600.00::numeric,'Rifat current contributed capital is 23,600');
select is((select due_from_owner from public.dashboard_owner_capital_positions where owner_label='Rifat'),0.00::numeric,'Rifat current Due is zero');

select is((select historical_investment from public.dashboard_owner_capital_positions where owner_label='Ikbal'),0.00::numeric,'Ikbal historical investment remains zero');
select is((select capital_returned from public.dashboard_owner_capital_positions where owner_label='Ikbal'),0.00::numeric,'Ikbal capital returned is zero');
select is((select current_contributed_capital from public.dashboard_owner_capital_positions where owner_label='Ikbal'),0.00::numeric,'Ikbal current contributed capital is zero');
select is((select due_from_owner from public.dashboard_owner_capital_positions where owner_label='Ikbal'),1000.00::numeric,'Ikbal current Due is 1,000');

select is((select sum(historical_investment)::numeric from public.dashboard_owner_capital_positions),48720.00::numeric,'total historical investment is 48,720');
select is((select sum(capital_returned)::numeric from public.dashboard_owner_capital_positions),25120.00::numeric,'total capital returned is 25,120');
select is((select sum(current_contributed_capital)::numeric from public.dashboard_owner_capital_positions),23600.00::numeric,'total current contributed capital is 23,600');
select is((select sum(due_from_owner)::numeric from public.dashboard_owner_capital_positions),8714.00::numeric,'total current Due is 8,714');
select is((select sum(current_contributed_capital-due_from_owner)::numeric from public.dashboard_owner_capital_positions),14886.00::numeric,'current capital less current Due is 14,886');
select is((select sum(capital_returned+due_from_owner)::numeric from public.dashboard_owner_capital_positions),33834.00::numeric,'returned capital plus current Due is 33,834');
select ok(not exists(select 1 from public.dashboard_owner_capital_positions where current_contributed_capital < 0),'no owner has negative current capital');

-- Lifetime and the latest effective-date period both use the authoritative
-- classification view and balance exactly in numeric arithmetic.
select is((select sum(owner_money_taken_in_period)::numeric from public.dashboard_owner_position_daily),33834.00::numeric,'Lifetime owner money taken is 33,834');
select is((select sum(capital_return_in_period)::numeric from public.dashboard_owner_position_daily),25120.00::numeric,'Lifetime capital-return portion is 25,120');
select is((select sum(excess_due_in_period)::numeric from public.dashboard_owner_position_daily),8714.00::numeric,'Lifetime Due-created portion is 8,714');
select ok(not exists(select 1 from public.dashboard_owner_position_daily where owner_money_taken_in_period <> capital_return_in_period+excess_due_in_period),'every owner period row decomposes exactly');
select is((select sum(owner_money_taken_in_period)::numeric from public.dashboard_owner_position_daily where event_date='2026-08-21'),11000.00::numeric,'21 August owner money taken is 11,000');
select is((select sum(capital_return_in_period)::numeric from public.dashboard_owner_position_daily where event_date='2026-08-21'),10000.00::numeric,'21 August capital-return portion is 10,000');
select is((select sum(excess_due_in_period)::numeric from public.dashboard_owner_position_daily where event_date='2026-08-21'),1000.00::numeric,'21 August Due-created portion is 1,000');

-- The corrected courier settlement and separate transaction fee remain
-- unchanged by this reporting-only migration.
select is((select count(*) from public.dashboard_steadfast_settlement_batches where settlement_reference='SFC-31468898' and not is_reversed),1::bigint,'SFC-31468898 has one active settlement batch');
select is((select gross_cod_amount from public.dashboard_steadfast_settlement_batches where settlement_reference='SFC-31468898' and not is_reversed),12940.00::numeric,'SFC-31468898 gross COD remains 12,940');
select is((select deductions from public.dashboard_steadfast_settlement_batches where settlement_reference='SFC-31468898' and not is_reversed),1877.00::numeric,'SFC-31468898 deductions remain 1,877');
select is((select net_received from public.dashboard_steadfast_settlement_batches where settlement_reference='SFC-31468898' and not is_reversed),11063.00::numeric,'SFC-31468898 net receipt remains 11,063');
select is((select order_count from public.dashboard_steadfast_settlement_batches where settlement_reference='SFC-31468898' and not is_reversed),13::integer,'SFC-31468898 retains 13 linked Delivered orders');
select is((select count(*) from public.expenses where category_key='financial_fees' and amount=63.00 and reference='SFC-31468898'),1::bigint,'the 63 bKash charge remains one financial-fees expense');
select is((select count(*) from public.dashboard_cash_ledger where account_key='bkash' and signed_amount=-63.00 and reference='SFC-31468898' and not is_reversed),1::bigint,'the 63 bKash charge remains one active cash outflow');

-- Reporting-only correction does not touch recognized sales economics, cash,
-- or the intentionally unallocated procurement inventory evidence.
select is((select count(*) filter(where is_delivered) from public.dashboard_order_financials),51::bigint,'Delivered order count remains 51');
select is((select sum(recognized_product_revenue)::numeric from public.dashboard_order_financials where is_delivered),41330.00::numeric,'recognized product revenue remains 41,330');
select is((select sum(net_revenue)::numeric from public.dashboard_order_financials where is_delivered),43440.00::numeric,'recognized net revenue remains 43,440');
select is((select sum(recognized_cogs)::numeric from public.dashboard_order_financials where is_delivered),21680.00::numeric,'recognized COGS remains 21,680');
select is((select ledger_business_cash from public.dashboard_capital_spending_available_funds),49849.70::numeric,'ledger business cash remains 49,849.70');
select is((select actual_business_cash from public.dashboard_capital_spending_available_funds),0.00::numeric,'observed actual business cash remains zero');
select is((select known_inventory_value from public.dashboard_procurement_summary),0.00::numeric,'known inventory value remains zero without allocation evidence');
select is((select unallocated_procurement_total from public.dashboard_procurement_summary),48460.00::numeric,'unallocated procurement remains 48,460');

select * from finish();
rollback;
