# Vercel deployment checklist

This checklist prepares the private dashboard for Vercel. It does not authorize a
production database migration, deployment, DNS change, or real financial entry.

## 1. Required approvals before deployment

- Owner acceptance is complete for representative order, expense, cash,
  reversal, settlement, export, and reporting workflows.
- Production Supabase has a current owner-approved backup and restore path.
- The reviewed migration list and reconciliation totals are approved for the
  exact production project.
- The private production origin is approved. The current suggested origin is
  `https://dashboard.nexanotion.online`.

## 2. Create the Vercel project

1. Connect the approved GitHub repository to a new Vercel project.
2. Keep the project root as the repository root and framework preset as Next.js.
3. Use the repository defaults: `npm install`, `npm run build`, and `.next`.
4. Node.js is pinned to `22.x` in `package.json`, matching the locally tested
   runtime family.
5. Do not add the existing NexaNotion website repository to this Vercel project.

The build runs `scripts/verify-deployment-env.mjs` before Next.js. It rejects
mock mode, insecure production URLs, missing variables, Vercel mock-control
flags, and a secret/service-role key placed in the public key field. It prints
variable names and validation errors only, never secret values.

## 3. Enter Vercel Production environment variables

Enter these directly in **Vercel → Project → Settings → Environment Variables**:

| Name | Production value rule |
| --- | --- |
| `BUSINESS_DATA_PROVIDER` | Exactly `supabase` |
| `NEXT_PUBLIC_APP_URL` | Final HTTPS origin, with no trailing path |
| `NEXT_PUBLIC_SUPABASE_URL` | Exact production Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable/anon key only |

Never add a Supabase secret key or service-role key to any `NEXT_PUBLIC_*`
variable. Do not configure `ENABLE_MOCK_EXPENSE_CONTROLS` or
`ENABLE_MOCK_MARKETING_CONTROLS` in Vercel.

Preview deployments may remain unconfigured. They will build without a private
data connection and the application will fail closed at login. If previews need
live data, connect only the separate development Supabase project and complete a
separate access review; never point an unapproved Preview deployment at production.

## 4. Supabase authentication settings

In the exact production Supabase project, set the Auth Site URL to the approved
production origin. Add only approved redirect URLs. Password login does not need
a wildcard Preview redirect, so do not add a broad wildcard by default.

Confirm the owner account has an active authorized dashboard profile and that RLS
denies anonymous access before DNS cutover.

## 5. First Vercel deployment verification

Verify the generated Vercel URL before changing DNS:

- `/login` renders without a framework error or configuration warning.
- Anonymous requests to every private route and CSV export redirect to login.
- The approved owner can sign in and sign out.
- Dashboard, Orders, Products, Marketing, Expenses, Cash & settlements, Reports,
  Data checks, and Settings render on desktop and mobile.
- Browser console and Vercel runtime logs have no relevant errors and no secret or
  raw database values.
- Production totals match the approved reconciliation baseline before any write.

Stop and roll back to the previous deployment if any access, migration, or
financial check is unexpected.

## 6. DNS and cutover

Only after the generated Vercel URL passes verification:

1. Add the approved custom domain to the Vercel project.
2. Apply the exact DNS record Vercel displays in the domain setup screen.
3. Wait for Vercel to show the domain and TLS certificate as valid.
4. Recheck login, anonymous denial, mobile layout, and reconciliation on the
   custom domain.
5. Complete one owner-approved real order through delivery, financial
   recognition, settlement, and cash receipt, comparing every amount.

Record the deployment URL, Git commit, deployment time, operator, production
project reference, backup reference, migration list, and final verification result.
