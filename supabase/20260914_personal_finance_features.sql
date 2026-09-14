create table if not exists public.finan_transaction_category_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id text not null,
  category text not null,
  excluded_from_flow boolean not null default false,
  content_snapshot text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, transaction_id)
);

create table if not exists public.finan_category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transfer_type text not null check (transfer_type in ('in','out')),
  keyword text not null,
  category text not null,
  excluded_from_flow boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, transfer_type, keyword)
);

create table if not exists public.finan_budgets (
  user_id uuid not null references auth.users(id) on delete cascade,
  month text not null check (month ~ '^\\d{4}-(0[1-9]|1[0-2])$'),
  category text not null,
  amount bigint not null check (amount > 0),
  warn_percent integer not null default 80 check (warn_percent between 50 and 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, month, category)
);

create table if not exists public.finan_manual_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  account_type text not null check (account_type in ('cash','wallet','other')),
  balance bigint not null default 0 check (balance >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.finan_transaction_category_overrides enable row level security;
alter table public.finan_category_rules enable row level security;
alter table public.finan_budgets enable row level security;
alter table public.finan_manual_accounts enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='finan_transaction_category_overrides' and policyname='finan own category overrides') then
    create policy "finan own category overrides" on public.finan_transaction_category_overrides for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='finan_category_rules' and policyname='finan own category rules') then
    create policy "finan own category rules" on public.finan_category_rules for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='finan_budgets' and policyname='finan own budgets') then
    create policy "finan own budgets" on public.finan_budgets for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='finan_manual_accounts' and policyname='finan own manual accounts') then
    create policy "finan own manual accounts" on public.finan_manual_accounts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
end $$;

create index if not exists finan_category_rules_user_idx on public.finan_category_rules(user_id, active);
create index if not exists finan_budgets_user_month_idx on public.finan_budgets(user_id, month);
create index if not exists finan_manual_accounts_user_idx on public.finan_manual_accounts(user_id, active);
