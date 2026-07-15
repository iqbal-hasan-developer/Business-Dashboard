# Development-only storefront baseline

This directory is intentionally outside `supabase/migrations`. It recreates the
confirmed NexaNotion production storefront schema in an empty development
Supabase project without copying business data.

Never add this baseline to the production migration history. The SQL has two
independent guards:

1. the session must explicitly set
   `nexanotion.development_baseline_ack` to
   `confirmed-empty-development-project`;
2. the `public` schema must contain no table, partitioned table, view,
   materialized view, or foreign table.

The production project already contains those tables, so the second guard
aborts even if the acknowledgement is set accidentally.

## Development application sequence

In a single development SQL Editor run, place this statement immediately above
the baseline SQL:

```sql
set nexanotion.development_baseline_ack =
  'confirmed-empty-development-project';
```

Then run `202607150000_storefront_public_schema.sql`. Review the result and run
the read-only schema inspection again before applying migration
`202607140000_live_schema_preflight.sql`.

The baseline contains schema objects and grants only. It inserts no products,
orders, customers, messages, Auth users, or other business rows.
