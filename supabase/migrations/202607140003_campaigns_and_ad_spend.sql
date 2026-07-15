create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text,
  starts_on date,
  ends_on date,
  budget numeric(12,2),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaigns_budget_nonnegative
    check (budget is null or budget >= 0),
  constraint campaigns_dates_ordered
    check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create unique index if not exists campaigns_name_uidx
  on public.campaigns (lower(name));

create table if not exists public.daily_ad_spend (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete set null,
  spend_date date not null,
  platform text not null,
  amount numeric(12,2) not null,
  source_reference text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_ad_spend_amount_nonnegative check (amount >= 0),
  constraint daily_ad_spend_identity unique nulls not distinct (
    campaign_id, spend_date, platform, source_reference
  )
);

drop trigger if exists campaigns_set_updated_at on public.campaigns;
create trigger campaigns_set_updated_at
before update on public.campaigns
for each row execute function public.dashboard_set_updated_at();

drop trigger if exists daily_ad_spend_set_updated_at
  on public.daily_ad_spend;
create trigger daily_ad_spend_set_updated_at
before update on public.daily_ad_spend
for each row execute function public.dashboard_set_updated_at();
