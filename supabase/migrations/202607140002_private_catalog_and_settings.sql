create table if not exists public.product_business_data (
  product_id uuid primary key references public.products(id) on delete cascade,
  sku_override text,
  variation text,
  buying_price numeric(12,2) not null,
  buying_price_verified_at timestamptz,
  buying_price_verified_by uuid references auth.users(id) on delete set null,
  reorder_level integer not null default 0,
  internal_notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_business_data_buying_price_nonnegative
    check (buying_price >= 0),
  constraint product_business_data_reorder_level_nonnegative
    check (reorder_level >= 0),
  constraint product_business_data_verification_consistent
    check (
      buying_price_verified_by is null
      or buying_price_verified_at is not null
    )
);

create unique index if not exists product_business_data_sku_override_uidx
  on public.product_business_data (lower(sku_override))
  where sku_override is not null;

create table if not exists public.business_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  description text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_lookup_values (
  lookup_type text not null,
  lookup_key text not null,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (lookup_type, lookup_key),
  constraint business_lookup_values_sort_nonnegative check (sort_order >= 0)
);

drop trigger if exists product_business_data_set_updated_at
  on public.product_business_data;
create trigger product_business_data_set_updated_at
before update on public.product_business_data
for each row execute function public.dashboard_set_updated_at();

drop trigger if exists business_settings_set_updated_at
  on public.business_settings;
create trigger business_settings_set_updated_at
before update on public.business_settings
for each row execute function public.dashboard_set_updated_at();

drop trigger if exists business_lookup_values_set_updated_at
  on public.business_lookup_values;
create trigger business_lookup_values_set_updated_at
before update on public.business_lookup_values
for each row execute function public.dashboard_set_updated_at();
