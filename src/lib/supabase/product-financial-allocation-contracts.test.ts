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
const reportingHelperAclMigration = read(
  "supabase/migrations/202607180000_authenticated_reporting_helper_execute.sql",
);
const productReportingScopeMigration = read(
  "supabase/migrations/202607190000_product_reporting_ambiguous_refund_scope.sql",
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
const reportingHelperAclPreflight = read(
  "supabase/development-rehearsal/202607180005_read_only_reporting_helper_acl_preflight.sql",
);
const reportingHelperAclVerifier = read(
  "supabase/development-rehearsal/202607180006_verify_reporting_helper_acl.sql",
);
const productReportingScopePreflight = read(
  "supabase/development-rehearsal/202607190001_read_only_product_reporting_scope_preflight.sql",
);
const productReportingScopeVerifier = read(
  "supabase/development-rehearsal/202607190002_verify_product_reporting_scope.sql",
);
const rehearsalChecklist = read(
  "docs/product-financial-recognition-development-rehearsal-checklist.md",
);
const completeContract = [
  proposal,
  canonical,
  reportingHelperAclMigration,
  productReportingScopeMigration,
  review,
  pgTap,
  fixtures,
  preflight,
  verifier,
  pgTapWrapper,
  fixtureWrapper,
  cleanup,
  reportingHelperAclPreflight,
  reportingHelperAclVerifier,
  productReportingScopePreflight,
  productReportingScopeVerifier,
  rehearsalChecklist,
].join("\n");
const stripSqlComments = (sql: string) =>
  sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/'(?:''|[^'])*'/g, "''");
const transactionBody = (sql: string) => {
  const start = sql.search(/^begin;\s*$/im);
  return start === -1 ? "" : sql.slice(start);
};
const normalizeSqlWhitespace = (sql: string) =>
  sql.replace(/\s+/g, " ").trim();
const productReportingRpcDefinition = (sql: string) => {
  const start = sql.indexOf(
    "create or replace function public.get_dashboard_product_financials(",
  );
  const end = sql.indexOf("$function$;", start);
  return start === -1 || end === -1
    ? ""
    : sql.slice(start, end + "$function$;".length);
};
const pgTapAssertionFunctions = [
  "has_table",
  "has_view",
  "has_function",
  "ok",
  "is",
  "throws_ok",
  "lives_ok",
  "results_eq",
];
const pgTapAssertionFunctionPattern = pgTapAssertionFunctions.join("|");
const pgTapAssertionPattern = new RegExp(
  `^select\\s+(?:${pgTapAssertionFunctionPattern})\\s*\\(`,
  "gim",
);
const pgTapCapturePrefixPattern = new RegExp(
  `^insert into pg_temp\\.pgtap_004_result_buffer \\(tap_result\\)\\r?\\n(?=select\\s+(?:${pgTapAssertionFunctionPattern})\\s*\\()`,
  "gim",
);
const observableWrapperTransactionBody = (sql: string) =>
  transactionBody(sql)
    .replace(/\r\n/g, "\n")
    .replace(
      /^begin;\ncreate temporary table pgtap_004_result_buffer \([\s\S]*?\n\) on commit drop;\n\n(?:grant[\s\S]*?;\n\n)+/i,
      "begin;\n",
    )
    .replace(pgTapCapturePrefixPattern, "")
    .replace(
      /insert into pg_temp\.pgtap_004_result_buffer \(tap_result\)\nselect finish_output\.tap_output\nfrom finish\(\) with ordinality[\s\S]*?(?=rollback;\s*$)/i,
      "select * from finish();\n",
    );

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

  it("repairs only the authenticated security-invoker reporting helper ACL", () => {
    const executableMigration = stripSqlComments(reportingHelperAclMigration);

    expect(canonical).toContain(
      "public.dashboard_money_to_poisha(numeric),\n  public.dashboard_poisha_to_money(bigint)",
    );
    expect(canonical).toContain(
      "from public, anon, authenticated, service_role;",
    );
    expect(reportingHelperAclMigration).toMatch(
      /\bbegin;[\s\S]*grant execute on function\s+public\.dashboard_money_to_poisha\(numeric\),\s+public\.dashboard_poisha_to_money\(bigint\)\s+to authenticated;[\s\S]*\bcommit;\s*$/i,
    );
    expect(executableMigration).not.toMatch(
      /grant[\s\S]{0,300}\bto\s+(?:public|anon|service_role)\b/i,
    );
    expect(executableMigration).not.toMatch(
      /\b(insert|update|delete|truncate|alter table|create table|drop table)\b/i,
    );
    expect(executableMigration).not.toMatch(
      /decrement_product_stock\s*\(|update\s+public\.products\s+set\s+stock/i,
    );
    expect(reportingHelperAclMigration).toContain("search_path=pg_catalog");
    expect(reportingHelperAclMigration).toContain("security_invoker=true");
    expect(reportingHelperAclMigration).toContain(
      "Protected roles unexpectedly have reporting helper access.",
    );
    expect(pgTap).toContain(
      "authenticated reporting has only the required helper and RPC execute grants",
    );
    expect(pgTap).toContain(
      "'authenticated',\n    'public.dashboard_poisha_to_money(bigint)', 'EXECUTE'",
    );
    expect(pgTap).toContain(
      "'service_role',\n    'public.dashboard_money_to_poisha(numeric)', 'EXECUTE'",
    );
    expect(pgTap).toContain(
      "'public.get_dashboard_product_financials(date,date,text,uuid,text,uuid,text,integer,integer)'::regprocedure",
    );
  });

  it("checks the product-reporting RPC without brittle catalog serialization", () => {
    for (const sql of [reportingHelperAclVerifier, pgTap]) {
      expect(sql).toContain(
        "split_part(configuration, '=', 1) = 'search_path'",
      );
      expect(sql).toContain(
        "substring(configuration from length('search_path=') + 1)",
      );
      expect(sql).not.toContain("configuration = 'search_path='");
      expect(sql).toContain("procedure.prosrc");
      expect(sql).toContain("public\\.dashboard_has_any_role");
      expect(sql).toContain("'owner'\\s*::\\s*public\\.dashboard_role");
      expect(sql).toContain("'admin'\\s*::\\s*public\\.dashboard_role");
      expect(sql).toContain("'viewer'\\s*::\\s*public\\.dashboard_role");
      expect(sql).toContain("errcode\\s*=\\s*'42501'");
    }

    expect(reportingHelperAclVerifier).toContain("procedure.prosecdef");
    expect(reportingHelperAclVerifier).toContain(
      "function_language.lanname = 'plpgsql'",
    );
    expect(reportingHelperAclVerifier).toContain("service_role_execute");
    expect(reportingHelperAclVerifier).toContain("no_unexpected_execute");
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

  it("keeps all 90 pgTAP assertions in parity with exact numeric types", () => {
    const bigintAggregateColumns = [
      "gross_product_revenue_poisha",
      "delivery_revenue_poisha",
      "product_discount_poisha",
      "delivery_discount_poisha",
      "delivery_refund_poisha",
      "quantity_delta",
      "delivered_units",
      "returned_units",
    ];

    expect(pgTap.match(pgTapAssertionPattern) ?? []).toHaveLength(90);
    expect(pgTap).toContain("select no_plan();");
    expect(pgTap.trimEnd()).toMatch(/select \* from finish\(\);\s*rollback;$/i);
    expect(transactionBody(pgTap)).not.toBe("");
    expect(observableWrapperTransactionBody(pgTapWrapper)).toBe(
      transactionBody(pgTap).replace(/\r\n/g, "\n"),
    );

    for (const column of bigintAggregateColumns) {
      expect(
        pgTap.match(
          new RegExp(`sum\\(\\s*${column}\\s*\\)(?!\\s*::bigint)`, "gi"),
        ) ?? [],
      ).toHaveLength(0);
    }

    for (const exactTypeFragment of [
      "sum(gross_product_revenue_poisha)::bigint",
      "sum(delivery_revenue_poisha)::bigint",
      "sum(product_discount_poisha)::bigint",
      "sum(delivery_discount_poisha)::bigint",
      "sum(delivery_refund_poisha)::bigint",
      "coalesce(sum(quantity_delta)::bigint, 0::bigint)",
      "sum(delivered_units)::bigint",
      "sum(returned_units)::bigint",
      "row(1::bigint, 0::bigint)",
    ]) {
      expect(pgTap).toContain(exactTypeFragment);
    }

    expect(pgTap).not.toMatch(/\b(real|double precision|float\d*)\b/i);
  });

  it("scopes authoritative product-report tests to the recognition business date", () => {
    const reportingAssertions = pgTap.slice(
      pgTap.lastIndexOf("set local role authenticated;"),
      pgTap.lastIndexOf("reset role;"),
    );
    const recognitionDateExpression =
      "(now() at time zone 'Asia/Dhaka')::date";

    expect(
      reportingAssertions.match(
        /\(now\(\) at time zone 'Asia\/Dhaka'\)::date/g,
      ) ?? [],
    ).toHaveLength(12);
    expect(reportingAssertions.match(/'2026-07-17'/g) ?? []).toHaveLength(2);
    expect(canonical).toContain(
      "order_id, order_number_snapshot, order_date, order_origin_date,",
    );
    expect(canonical).toContain(recognitionDateExpression);
    expect(canonical).toContain("current_order.order_date");
    expect(canonical).toMatch(
      /p_start_date date default null,\s+p_end_date date default null,\s+p_sales_channel text default null,\s+p_campaign_id uuid default null,\s+p_order_status text default null,\s+p_product_id uuid default null,\s+p_sku text default null,/i,
    );
    expect(
      canonical.match(
        /p_start_date is null or snapshot\.order_date >= p_start_date/g,
      ) ?? [],
    ).toHaveLength(2);
    expect(
      canonical.match(
        /p_end_date is null or snapshot\.order_date <= p_end_date/g,
      ) ?? [],
    ).toHaveLength(2);
    expect(pgTap).toContain(
      "set product_id = '82100000-0000-4000-8000-000000000002'",
    );
    expect(reportingAssertions).toContain(
      "'82100000-0000-4000-8000-000000000001', null, 100, 0",
    );
    expect(reportingAssertions).toContain(
      "uses immutable product scope and fails closed",
    );
  });

  it("repairs only the immutable ambiguous-refund reporting scope", () => {
    const originalRpc = stripSqlComments(
      productReportingRpcDefinition(canonical),
    );
    const repairedRpc = stripSqlComments(
      productReportingRpcDefinition(productReportingScopeMigration),
    );
    const originalGuardStart = originalRpc.indexOf("if exists (");
    const repairedGuardStart = repairedRpc.indexOf("if exists (");
    const originalQueryStart = originalRpc.indexOf("return query");
    const repairedQueryStart = repairedRpc.indexOf("return query");

    expect(originalRpc).not.toBe("");
    expect(repairedRpc).not.toBe("");
    expect(normalizeSqlWhitespace(originalRpc.slice(0, originalGuardStart))).toBe(
      normalizeSqlWhitespace(repairedRpc.slice(0, repairedGuardStart)),
    );
    expect(normalizeSqlWhitespace(originalRpc.slice(originalQueryStart))).toBe(
      normalizeSqlWhitespace(repairedRpc.slice(repairedQueryStart)),
    );
    expect(repairedRpc).toContain(
      "from public.order_item_financial_allocations as scoped_allocation",
    );
    expect(repairedRpc).toContain(
      "scoped_allocation.product_id_snapshot = p_product_id",
    );
    expect(repairedRpc).toContain(
      "lower(scoped_allocation.sku_snapshot) = lower(p_sku)",
    );
    expect(repairedRpc).not.toContain("from public.order_items as item");
    expect(productReportingScopeMigration).toMatch(
      /\bbegin;[\s\S]*create or replace function public\.get_dashboard_product_financials\([\s\S]*\bcommit;\s*$/i,
    );
    expect(stripSqlComments(productReportingScopeMigration)).not.toMatch(
      /\b(insert into|update public\.|delete from|truncate|alter table|create table|drop table|grant|revoke)\b/i,
    );
    expect(productReportingScopeMigration).not.toContain(
      "decrement_product_stock(",
    );

    for (const sql of [
      productReportingScopePreflight,
      productReportingScopeVerifier,
    ]) {
      expect(sql).toContain("__CONFIRM_VISIBLE_DEVELOPMENT_BREADCRUMB__");
      expect(stripSqlComments(sql)).not.toMatch(
        /\b(insert|update|delete|truncate|alter|create|drop|grant|revoke)\b/i,
      );
    }
    expect(productReportingScopePreflight).toContain(
      "followup_application_allowed",
    );
    expect(productReportingScopeVerifier).toContain("all_checks_passed");
    expect(productReportingScopeVerifier).toContain(
      "immutable_allocation_fail_closed_scope_installed",
    );
  });

  it("exports every TAP assertion, diagnostic, and finish row in one grid", () => {
    const assertionCaptureCount = (
      pgTapWrapper.match(pgTapCapturePrefixPattern) ?? []
    ).length;
    const allBufferWrites =
      pgTapWrapper.match(
        /^insert into pg_temp\.pgtap_004_result_buffer \(tap_result\)$/gim,
      ) ?? [];

    expect(assertionCaptureCount).toBe(90);
    expect(allBufferWrites).toHaveLength(91);
    expect(pgTapWrapper).toContain(
      "create temporary table pgtap_004_result_buffer",
    );
    expect(pgTapWrapper).toContain(
      ") on commit drop;",
    );
    expect(pgTapWrapper).toMatch(
      /select finish_output\.tap_output\s+from finish\(\) with ordinality/i,
    );
    expect(pgTapWrapper).toContain(
      "pg_catalog.regexp_split_to_table(\n    buffered_output.tap_result,",
    );
    expect(pgTapWrapper).toMatch(
      /select\s+row_number\(\) over \([\s\S]*?::bigint as result_order,\s+tap_result\s+from expanded_tap_output\s+order by buffered_result_order, line_order;/i,
    );
    expect(
      pgTapWrapper.match(/^with expanded_tap_output as \($/gim) ?? [],
    ).toHaveLength(1);
    expect(pgTapWrapper.trimEnd()).toMatch(
      /from expanded_tap_output\s+order by buffered_result_order, line_order;\s+rollback;$/i,
    );
    expect(pgTapWrapper).not.toMatch(/\bcommit\s*;/i);
    expect(rehearsalChecklist).toContain(
      "SQL Editor result limit to at least **1,000**",
    );
    expect(rehearsalChecklist).toContain(
      "export the complete result grid and stop",
    );
  });

  it("grants only the temporary buffer privileges required by simulated roles", () => {
    const bufferInsertRoles = new Set<string>();
    let activeRole = "test_operator";

    for (const line of pgTapWrapper.split(/\r?\n/)) {
      const setRole = line.match(/^set(?: local)? role ([a-z_][a-z0-9_]*);$/i);
      if (setRole) {
        activeRole = setRole[1].toLowerCase();
      } else if (/^reset role;$/i.test(line)) {
        activeRole = "test_operator";
      } else if (
        /^insert into pg_temp\.pgtap_004_result_buffer \(tap_result\)$/i.test(
          line,
        )
      ) {
        bufferInsertRoles.add(activeRole);
      }
    }

    expect([...bufferInsertRoles].sort()).toEqual([
      "authenticated",
      "test_operator",
    ]);

    const executableWrapper = stripSqlComments(pgTapWrapper);
    const temporaryGrants =
      executableWrapper.match(/\bgrant\b[\s\S]*?;/gi) ?? [];
    expect(temporaryGrants).toHaveLength(2);
    expect(temporaryGrants[0]).toMatch(
      /^grant insert \(tap_result\)\s+on table pg_temp\.pgtap_004_result_buffer\s+to authenticated;$/i,
    );
    expect(temporaryGrants[1]).toMatch(
      /^grant usage\s+on sequence pg_temp\.pgtap_004_result_buffer_result_order_seq\s+to authenticated;$/i,
    );
    expect(temporaryGrants.join("\n")).not.toMatch(/\bpublic\b/i);
    expect(temporaryGrants.join("\n")).not.toMatch(
      /\b(?:anon|service_role)\b/i,
    );

    const finalReset = pgTapWrapper.lastIndexOf("reset role;");
    const finishCapture = pgTapWrapper.lastIndexOf(
      "select finish_output.tap_output",
    );
    const finalGrid = pgTapWrapper.lastIndexOf("with expanded_tap_output as (");
    expect(finalReset).toBeGreaterThan(-1);
    expect(finalReset).toBeLessThan(finishCapture);
    expect(finishCapture).toBeLessThan(finalGrid);
    expect(pgTapWrapper.slice(finalReset, finalGrid)).not.toMatch(
      /set(?: local)? role /i,
    );
  });

  it("keeps rehearsal gates metadata-only and verifies cleanup independently", () => {
    const executablePreflight = stripSqlComments(preflight);
    const executableVerifier = stripSqlComments(verifier);
    const executableCleanup = stripSqlComments(cleanup);
    const executableHelperPreflight = stripSqlComments(
      reportingHelperAclPreflight,
    );
    const executableHelperVerifier = stripSqlComments(
      reportingHelperAclVerifier,
    );

    for (const sql of [
      executablePreflight,
      executableVerifier,
      executableCleanup,
      executableHelperPreflight,
      executableHelperVerifier,
    ]) {
      expect(sql).not.toMatch(
        /\b(insert|update|delete|truncate|alter|create|drop|grant|revoke)\b/i,
      );
    }
    for (const sql of [
      preflight,
      verifier,
      cleanup,
      reportingHelperAclPreflight,
      reportingHelperAclVerifier,
    ]) {
      expect(sql).toContain("__CONFIRM_VISIBLE_DEVELOPMENT_BREADCRUMB__");
    }
    expect(preflight).toContain("application_allowed");
    expect(preflight).toContain("stop_required");
    expect(verifier).toContain("all_checks_passed");
    expect(verifier).toContain("website_trigger_path_preserved");
    expect(verifier).toContain("no_inventory_mutation_in_financial_functions");
    expect(cleanup).toContain("all_fixture_records_removed");
    expect(reportingHelperAclPreflight).toContain("followup_application_allowed");
    expect(reportingHelperAclVerifier).toContain(
      "authenticated_has_required_helper_execute",
    );
    expect(reportingHelperAclVerifier).toContain(
      "service_role_has_no_helper_or_financial_expansion",
    );
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
      "supabase db push --dry-run --linked",
      "supabase db push --linked",
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
    expect(rehearsalChecklist).toContain(
      "202607180000_authenticated_reporting_helper_execute.sql",
    );
    expect(rehearsalChecklist).toContain(
      "202607190000_product_reporting_ambiguous_refund_scope.sql",
    );
    expect(rehearsalChecklist).toContain(
      "Stop after the dry run and return sanitized",
    );
  });
});
