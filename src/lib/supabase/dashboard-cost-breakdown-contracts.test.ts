import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/202608210000_dashboard_cost_breakdown.sql"),
  "utf8",
);

describe("dashboard cost breakdown migration contract", () => {
  it("adds exact immutable courier and packaging fields to Delivered reporting", () => {
    expect(migration).toMatch(/create or replace view public\.dashboard_order_financials/i);
    expect(migration).toMatch(/courier_cost::numeric\(14,2\) as recognized_courier_cost/i);
    expect(migration).toMatch(/packaging_cost::numeric\(14,2\) as recognized_packaging_cost/i);
    expect(migration).toMatch(/where snapshot\.recognition_status = 'Delivered'/i);
    expect(migration).not.toMatch(/\bdouble precision\b|\breal\b/i);
  });

  it("preserves adjusted COGS, refund, and contribution-profit semantics", () => {
    expect(migration).toMatch(/snapshot\.cogs - public\.dashboard_poisha_to_money/i);
    expect(migration).toMatch(/snapshot\.refund_amount[\s\S]+refund\.refund_amount_delta/i);
    expect(migration).toMatch(/- courier_cost - packaging_cost/i);
  });
});
