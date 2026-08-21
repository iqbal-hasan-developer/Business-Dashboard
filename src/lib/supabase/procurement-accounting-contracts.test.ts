import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/202608180000_procurement_inventory_accounting.sql"),
  "utf8",
);

describe("procurement inventory migration contract", () => {
  it("reclassifies only the reviewed nine immutable IDs with an audit reason", () => {
    const ids = [
      "fa6fa4aa-12e8-4ca2-a9d4-29d2be4b1a0a",
      "bbcdf759-62c0-4095-ab37-357a8bf327c3",
      "1096c0a8-722e-4171-b95b-613fcd29869a",
      "c80cf0ae-0e12-4aec-bfc3-b01177c60df8",
      "19da586d-e86c-4c86-99a8-ae7d3493a5b5",
      "a210d255-f291-4646-b3b8-c93d7e3c3de0",
      "2566055f-895e-482b-a3eb-3894b556e71f",
      "c9ee5905-a14c-4add-8926-4486d47b6bf9",
      "236cb12d-07e3-468c-8337-ae0f7d88cc28",
    ];
    ids.forEach((id) => expect(migration).toContain(id));
    expect(migration).toContain("Reclassified inventory acquisition costs to correct procurement accounting and prevent double counting with COGS.");
    expect(migration).toMatch(/Legacy procurement rows do not match the reviewed nine-record allowlist/);
    expect(migration).not.toMatch(/delete\s+from\s+public\.expenses/i);
  });

  it("uses exact money, deterministic freight allocation, and immutable consumption", () => {
    expect(migration).toMatch(/supplier_unit_cost_poisha bigint not null/i);
    expect(migration).toMatch(/dashboard_allocate_poisha\(freight_total, item_keys, item_weights\)/i);
    expect(migration).toMatch(/order by batch\.purchase_date, batch\.id, batch_item\.id/i);
    expect(migration).toMatch(/order_item_inventory_consumptions_immutable/i);
    expect(migration).not.toMatch(/double precision|\breal\b/i);
  });

  it("keeps procurement out of profit while preserving Delivered-only landed COGS", () => {
    expect(migration).toMatch(/where accounting_class = 'operating_expense'/i);
    expect(migration).toMatch(/contribution_profit - ads\.ad_spend - operating\.expenses/i);
    expect(migration).toMatch(/dashboard_order_status is distinct from 'Delivered'/i);
    expect(migration).toMatch(/dashboard_consume_landed_inventory\(current_order\.id\)/i);
    expect(migration).toMatch(/on conflict \(order_id\) do nothing/i);
  });

  it("keeps procurement tables private behind RLS and an authenticated RPC", () => {
    expect(migration).toMatch(/alter table public\.purchase_batches enable row level security/i);
    expect(migration).toMatch(/grant execute on function public\.record_purchase_batch[\s\S]+to authenticated/i);
    expect(migration).toMatch(/from public, anon, authenticated, service_role/i);
  });
});
