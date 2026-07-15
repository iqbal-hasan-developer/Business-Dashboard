# Stock function privilege hotfix -- production verified

This directory records the urgent, privilege-only security hotfix for:

`public.decrement_product_stock(uuid, integer)`

The production execution and verification below were performed manually and
confirmed to Codex by the user on 15 July 2026. The SQL does not call the
function, read product rows, or change stock quantities. The apply script does
not replace or alter the function body.

## Production application record

- `20260715_001_preflight.sql` matched the expected function signature,
  security mode, result type, required roles, and privilege exposure.
- `20260715_002_apply_privilege_hotfix.sql` was applied successfully to the
  existing NexaNotion production Supabase project.
- `20260715_003_verify.sql` passed all four effective-privilege checks.
- `20260715_999_emergency_rollback.sql` was not used.

Recorded post-application verification:

| Principal | Effective `EXECUTE` | Verification |
| --- | --- | --- |
| `PUBLIC` | No | Passed |
| `anon` | No | Passed |
| `authenticated` | No | Passed |
| `service_role` | Yes | Passed |

## Confirmed website compatibility

The website has one executable call site in
`src/app/api/orders/route.ts`. It runs inside the server-side order API through
`createSupabaseAdminClient()`. That factory is guarded by `server-only` and uses
the server-side `SUPABASE_SERVICE_ROLE_KEY` environment variable.

No browser, anon-client, or authenticated-user call site was found. The
hotfix explicitly grants `service_role` execution after revoking `PUBLIC`,
`anon`, and `authenticated`, so the inspected checkout path remains authorized.

## Review and execution procedure

1. Confirm the selected Supabase Dashboard project is the existing NexaNotion
   production project. Project references are not embedded in these files.
2. Run `20260715_001_preflight.sql` and retain its metadata-only output.
3. Confirm the exact overload exists, is `SECURITY DEFINER`, returns `boolean`,
   and the expected Supabase roles exist.
4. Record the definition fingerprint. The query never returns the definition.
5. Obtain explicit approval to apply the hotfix.
6. Run `20260715_002_apply_privilege_hotfix.sql` once.
7. Run `20260715_003_verify.sql` immediately afterward.
8. Require all four privilege checks to pass and require the post-application
   definition fingerprint to equal the preflight fingerprint.

Do not test this hotfix by directly invoking the function against a real
product. Privilege metadata is sufficient for the emergency verification.

## Expected post-hotfix access

| Principal | Effective `EXECUTE` |
| --- | --- |
| `PUBLIC` | No |
| `anon` | No |
| `authenticated` | No |
| `service_role` | Yes |

Function owners and database administrators retain their normal PostgreSQL
owner/administrative capabilities; this hotfix does not change ownership.

## Rollback warning

`20260715_999_emergency_rollback.sql` is deliberately separate. It restores
execution to `PUBLIC`, `anon`, and `authenticated`, reopening the confirmed
exposure. Use it only under a separately approved emergency decision after
evidence that the explicit `service_role` grant did not preserve the deployed
checkout path.

## Follow-up risk

A later `create or replace function` or broad default-function privilege can
reintroduce execution grants. The main reviewed migration chain must preserve
the explicit revokes whenever this function is recreated.
