import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const proposal = read(
  "supabase/development-migrations/202607170000_product_financial_recognition_allocations.sql",
);
const canonical = read(
  "supabase/migrations/202607170000_product_financial_recognition_allocations.sql",
);
const review = read("docs/product-financial-recognition-contract-review.md");
const pgTap = read("supabase/tests/database/004_product_financial_allocations.test.sql");
const fixtures = read(
  "supabase/development-rehearsal/202607170001_controlled_product_financial_fixtures.sql",
);
const preflight = read(
  "supabase/development-rehearsal/202607180000_read_only_product_financial_preflight.sql",
);
const verifier = read(
  "supabase/development-rehearsal/202607180001_verify_product_financial_schema.sql",
);
const pgTapWrapper = read(
  "supabase/development-rehearsal/202607180002_run_004_product_financial_allocations.sql",
);
const fixtureWrapper = read(
  "supabase/development-rehearsal/202607180003_run_product_financial_fixtures.sql",
);
const cleanup = read(
  "supabase/development-rehearsal/202607180004_verify_product_financial_cleanup.sql",
);
const rehearsalChecklist = read(
  "docs/product-financial-recognition-development-rehearsal-checklist.md",
);
const completeContract = [
  proposal,
  canonical,
  review,
  pgTap,
  fixtures,
  preflight,
  verifier,
  pgTapWrapper,
  fixtureWrapper,
  cleanup,
  rehearsalChecklist,
].join("\n");
const stripSqlComments = (sql: string) =>
  sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/'(?:''|[^'])*'/g, "''");

describe("review-only product financial recognition contract", () => {
  it("stays development-only and separates migration audit from repair", () => {
    expect(proposal).toContain("DEVELOPMENT SQL EDITOR PROPOSAL ONLY");
    expect(proposal).toContain("development_financial_allocation_ack");
    expect(proposal).toContain(
      "Recognition history exists. Use a separately reviewed evidence-based backfill.",
    );
    expect(review).toContain("Stage A is read-only");
    expect(review).toContain("Stage B is migration-history repair");
    expect(review).toContain(
      "Never infer production migration history from development.",
    );
  });

  it("promotes a transaction-safe canonical candidate without acknowledgement state", () => {
    expect(canonical).toContain(
      "Canonical migration candidate for development-only application rehearsal.",
    );
    expect(canonical).toMatch(/\bbegin;[\s\S]*\bcommit;\s*$/i);
    expect(canonical).toContain("set local lock_timeout = '5s'");
    expect(canonical).toContain("do $canonical_guard$");
    expect(canonical).toContain(
      "Existing recognition or refund history cannot be allocated safely.",
    );
    expect(canonical).toContain(
      "Product financial-allocation objects already or partially exist.",
    );
    expect(canonical).not.toContain("development_financial_allocation_ack");
    expect(canonical).not.toContain("reviewed-development-only");
  });

  it("recognizes revenue, COGS, and delivered units only at delivery", () => {
    expect(proposal).toContain(
      "current_order.dashboard_order_status is distinct from 'Delivered'",
    );
    expect(proposal).toContain("snapshot.recognition_status = 'Delivered'");
    expect(proposal).toContain("item.buying_cost_snapshot is not null");
    expect(review).toContain(
      "Cancelled before delivery | None | None | None | None | None",
    );
    expect(review).toContain(
      "Cash collected before delivery is cash received in advance, not revenue.",
    );
    expect(pgTap + fixtures).toContain("cancelled prepaid order");
  });

  it("uses exact deterministic integer-poisha allocation", () => {
    expect(proposal).toContain("gross_product_revenue_poisha bigint not null");
    expect(proposal).toContain("returned_quantity integer not null");
    expect(proposal).toContain("dashboard_money_to_poisha");
    expect(proposal).toContain("fractional_numerator desc, basis.key_value");
    expect(proposal).toMatch(/floor\(/);
    expect(proposal).not.toMatch(/\b(real|double precision|float\d*)\b/i);
    expect(pgTap).toContain("largest remainder uses immutable UUID order");
  });

  it("keeps monetary refunds, returns, and inspections separate", () => {
    for (const scope of ["product_only", "delivery_only", "full_order"]) {
      expect(proposal).toContain(scope);
      expect(review).toContain(scope);
    }
    for (const disposition of [
      "not_applicable",
      "not_returned",
      "returned_resellable",
      "returned_damaged",
    ]) {
      expect(proposal).toContain(disposition);
      expect(review).toContain(disposition);
    }
    expect(proposal).toContain("order_item_return_allocations");
    expect(proposal).toContain("order_return_events");
    expect(proposal).toContain("order_return_inspections");
    expect(proposal).toContain("inventory_restoration_movements");
    expect(proposal).toContain(
      "Returned quantity exceeds immutable delivered quantity.",
    );
    expect(proposal).toContain("record_dashboard_return");
    expect(proposal).toContain("inspect_dashboard_return");
    expect(review).toContain("Recording a return never creates a restoration movement.");
    const refundSignature = proposal.slice(
      proposal.indexOf("create or replace function public.record_dashboard_refund"),
      proposal.indexOf("returns uuid", proposal.indexOf("create or replace function public.record_dashboard_refund")),
    );
    expect(refundSignature).not.toContain("p_return_disposition");
    expect(refundSignature).not.toContain("p_return_items");
  });

  it("quarantines ambiguous legacy refunds and preserves nullable profit", () => {
    expect(proposal).toContain("unallocated_needs_review");
    expect(proposal).toContain(
      "Product financials contain refund evidence marked needs_review.",
    );
    expect(review).toContain(
      "It is not defaulted to `full_order` or `product_only`",
    );
    expect(pgTap + fixtures).toContain("ambiguous legacy refund");
    expect(pgTap).toContain("unknown COGS keeps product profit measures NULL");
  });

  it("exposes distinct product measures including returned units", () => {
    for (const field of [
      "gross_product_revenue",
      "allocated_delivery_revenue",
      "allocated_discount",
      "allocated_refund",
      "adjusted_product_net_revenue",
      "recognized_cogs",
      "gross_profit",
      "contribution_profit",
      "delivered_units",
      "returned_units",
      "delivered_order_count",
    ]) {
      expect(proposal).toContain(field);
    }
    for (const measure of [
      "Gross Product Revenue",
      "Delivery Revenue",
      "Advertising Spend",
      "Delivery Success Rate",
    ]) {
      expect(review).toContain(measure);
    }
    expect(review).toContain(
      "Product allocations may expose `allocated_delivery_revenue`, but it must never be labelled Product Revenue.",
    );
  });

  it("defines idempotency and serialized refund/return protection", () => {
    expect(proposal).toContain("for update;");
    expect(proposal).toContain(
      "order_financial_adjustments_idempotency_uidx",
    );
    expect(proposal).toContain("return existing_adjustment.id;");
    expect(proposal).toContain("return existing_event.id;");
    expect(proposal).toContain("A return event can be inspected and restored only once.");
    expect(proposal).toContain(
      "The refund idempotency key is already used by a different request.",
    );
    expect(pgTap).toContain("an exact idempotent retry");
    expect(pgTap + fixtures).toContain("Concurrent refund/return protection");
  });

  it("separates anon and service_role while preserving Website triggers", () => {
    expect(proposal).toContain("from public, anon, authenticated, service_role");
    expect(proposal).toContain(
      "grant execute on function public.dashboard_capture_delivered_snapshot()",
    );
    expect(proposal).toContain("public.dashboard_capture_refund_adjustment()");
    expect(proposal).toContain("uuid, numeric, text, text, date, jsonb");
    expect(proposal).toContain("uuid, text, text, date, jsonb");
    expect(proposal).not.toMatch(
      /grant\s+select[\s\S]{0,200}order_item_(financial|return)_allocations[\s\S]{0,100}\bto\s+anon\b/i,
    );
    expect(review).toContain(
      "The Website repository is not changed.",
    );
  });

  it("keeps pgTAP and fixture coverage rollback-only and inventory-safe", () => {
    for (const scenario of [
      "full refund without return",
      "resellable return",
      "damaged return",
      "product-only",
      "delivery-only",
      "over-return",
    ]) {
      expect(completeContract.toLowerCase()).toContain(scenario);
    }
    expect(fixtures).toContain("begin;");
    expect(fixtures.trimEnd()).toMatch(/rollback;$/);
    expect(fixtures).not.toContain("decrement_product_stock(");
    expect(proposal).not.toMatch(/update\s+public\.products\s+set\s+stock/i);
    expect(canonical).not.toMatch(/update\s+public\.products\s+set\s+stock/i);
    expect(canonical).not.toContain("decrement_product_stock(");
    expect(pgTapWrapper.trimEnd()).toMatch(/rollback;$/);
    expect(fixtureWrapper.trimEnd()).toMatch(/rollback;$/);
    expect(pgTapWrapper).toContain(
      "__CONFIRM_VISIBLE_DEVELOPMENT_BREADCRUMB__",
    );
    expect(fixtureWrapper).toContain("Reserved product-financial fixture identifiers");
  });

  it("keeps rehearsal gates metadata-only and verifies cleanup independently", () => {
    const executablePreflight = stripSqlComments(preflight);
    const executableVerifier = stripSqlComments(verifier);
    const executableCleanup = stripSqlComments(cleanup);

    for (const sql of [executablePreflight, executableVerifier, executableCleanup]) {
      expect(sql).not.toMatch(
        /\b(insert|update|delete|truncate|alter|create|drop|grant|revoke)\b/i,
      );
    }
    for (const sql of [preflight, verifier, cleanup]) {
      expect(sql).toContain("__CONFIRM_VISIBLE_DEVELOPMENT_BREADCRUMB__");
    }
    expect(preflight).toContain("application_allowed");
    expect(preflight).toContain("stop_required");
    expect(verifier).toContain("all_checks_passed");
    expect(verifier).toContain("website_trigger_path_preserved");
    expect(verifier).toContain("no_inventory_mutation_in_financial_functions");
    expect(cleanup).toContain("all_fixture_records_removed");
  });

  it("uses only the approved linked CLI migration workflow", () => {
    const powershellCommands = [
      ...rehearsalChecklist.matchAll(/```powershell\r?\n([\s\S]*?)```/g),
    ]
      .flatMap((match) => match[1].split(/\r?\n/))
      .map((line) => line.trim())
      .filter(Boolean);
    const dbPushCommands = powershellCommands.filter((line) =>
      line.startsWith("supabase db push"),
    );

    expect(dbPushCommands).toEqual([
      "supabase db push --dry-run --linked",
      "supabase db push --linked",
    ]);
    expect(powershellCommands).toContain("supabase migration list --linked");
    expect(powershellCommands).toContain("supabase --version");
    expect(powershellCommands.join("\n")).not.toMatch(
      /--include-all|--include-seed|--include-roles|--db-url|--password/,
    );
    expect(powershellCommands.join("\n")).not.toMatch(
      /supabase\s+(?:db\s+reset|migration\s+repair)/,
    );
    expect(rehearsalChecklist).toMatch(
      /Successful `db push` applies the canonical\s+migration and records `202607170000`/,
    );
    expect(rehearsalChecklist).toContain(
      "Do not paste or run the canonical migration in SQL Editor.",
    );
  });
});
