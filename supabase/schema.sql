create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.finan_runtime_secrets (
  key text primary key,
  secret_hash text not null,
  updated_at timestamptz not null default now()
);
revoke all on private.finan_runtime_secrets from public, anon, authenticated;

create table if not exists public.finan_app_settings (
  id text primary key,
  brand_name text not null,
  workspace_name text not null,
  guest_workspace_label text not null,
  member_workspace_label text not null,
  nav_section_label text not null,
  sidebar_card_title text not null,
  sidebar_card_description text not null,
  sidebar_card_action text not null,
  eyebrow text not null,
  demo_status_label text not null,
  live_status_label text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.finan_navigation_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z][a-z0-9-]{1,39}$'),
  title text not null check (char_length(title) between 1 and 60),
  page_title text not null check (char_length(page_title) between 1 and 100),
  page_description text not null check (char_length(page_description) between 1 and 180),
  icon_key text not null check (icon_key in ('dashboard','activity','landmark','gem')),
  sort_order integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.finan_plans (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,31}$'),
  name text not null,
  description text not null,
  price_monthly integer not null check (price_monthly >= 0),
  duration_days integer not null default 30 check (duration_days between 1 and 366),
  max_bank_accounts integer not null check (max_bank_accounts between 0 and 100),
  features text[] not null default '{}',
  recommended boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.finan_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null references public.finan_plans(id),
  status text not null default 'active' check (status in ('active','past_due','cancelled')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.finan_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_token text not null,
  mode text not null check (mode in ('live','sandbox')),
  bank_count integer not null default 0 check (bank_count between 0 and 100),
  updated_at timestamptz not null default now()
);

create table if not exists public.finan_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null references public.finan_plans(id),
  amount integer not null check (amount > 0),
  duration_days integer not null check (duration_days between 1 and 366),
  status text not null default 'pending' check (status in ('pending','paid','review','expired','cancelled')),
  payment_code text not null unique check (payment_code ~ '^FIN[A-Z0-9]{16,24}$'),
  bank_account text not null,
  bank_code text not null,
  bank_bin text,
  account_name text not null,
  sub_account text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_at timestamptz,
  payment_event_id bigint unique
);
create index if not exists finan_orders_user_created_idx on public.finan_orders(user_id, created_at desc);
create index if not exists finan_orders_pending_code_idx on public.finan_orders(payment_code) where status = 'pending';
create index if not exists finan_orders_plan_idx on public.finan_orders(plan_id);
create unique index if not exists finan_orders_one_pending_plan_idx on public.finan_orders(user_id, plan_id) where status = 'pending';

create table if not exists public.finan_payment_events (
  event_id bigint primary key check (event_id > 0),
  order_id uuid references public.finan_orders(id),
  gateway text not null,
  recipient_account text not null,
  sub_account text,
  amount integer not null check (amount > 0),
  transfer_type text not null,
  payment_code text,
  reference_code text,
  transaction_at timestamptz not null,
  payload_hash text not null,
  outcome text not null check (outcome in ('processed','duplicate','review')),
  received_at timestamptz not null default now()
);
alter table public.finan_payment_events add column if not exists gateway text;
update public.finan_payment_events set gateway = 'UNKNOWN' where gateway is null;
alter table public.finan_payment_events alter column gateway set not null;
create index if not exists finan_payment_events_order_idx on public.finan_payment_events(order_id);
create index if not exists finan_subscriptions_plan_idx on public.finan_subscriptions(plan_id);

create table if not exists public.finan_rate_limits (
  subject text not null,
  action_key text not null,
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (subject, action_key, window_start)
);

alter table public.finan_app_settings enable row level security;
alter table public.finan_navigation_items enable row level security;
alter table public.finan_plans enable row level security;
alter table public.finan_subscriptions enable row level security;
alter table public.finan_connections enable row level security;
alter table public.finan_orders enable row level security;
alter table public.finan_payment_events enable row level security;
alter table public.finan_rate_limits enable row level security;

drop policy if exists "finan public settings" on public.finan_app_settings;
create policy "finan public settings" on public.finan_app_settings for select to anon, authenticated using (true);
drop policy if exists "finan public navigation" on public.finan_navigation_items;
create policy "finan public navigation" on public.finan_navigation_items for select to anon, authenticated using (active);
drop policy if exists "finan public plans" on public.finan_plans;
create policy "finan public plans" on public.finan_plans for select to anon, authenticated using (active);
drop policy if exists "finan own subscription" on public.finan_subscriptions;
create policy "finan own subscription" on public.finan_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "finan own orders" on public.finan_orders;
create policy "finan own orders" on public.finan_orders for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "finan deny direct connections" on public.finan_connections;
create policy "finan deny direct connections" on public.finan_connections for all to anon, authenticated using (false) with check (false);
drop policy if exists "finan deny direct payment events" on public.finan_payment_events;
create policy "finan deny direct payment events" on public.finan_payment_events for all to anon, authenticated using (false) with check (false);
drop policy if exists "finan deny direct rate limits" on public.finan_rate_limits;
create policy "finan deny direct rate limits" on public.finan_rate_limits for all to anon, authenticated using (false) with check (false);

revoke all on public.finan_app_settings, public.finan_navigation_items, public.finan_plans,
  public.finan_subscriptions, public.finan_connections, public.finan_orders,
  public.finan_payment_events, public.finan_rate_limits from anon, authenticated;
grant select on public.finan_app_settings, public.finan_navigation_items, public.finan_plans to anon, authenticated;
grant select on public.finan_subscriptions, public.finan_orders to authenticated;

insert into public.finan_app_settings (
  id, brand_name, workspace_name, guest_workspace_label, member_workspace_label,
  nav_section_label, sidebar_card_title, sidebar_card_description, sidebar_card_action,
  eyebrow, demo_status_label, live_status_label
) values (
  'default', 'finflow', 'Không gian tài chính', 'Không gian trải nghiệm', 'Tài khoản của bạn',
  'QUẢN LÝ', 'SePay', 'Kết nối ngân hàng. Theo dõi dòng tiền tự động.', 'Thiết lập kết nối',
  'DÒNG TIỀN CỦA BẠN', 'Chế độ trải nghiệm', 'Đã kết nối SePay'
) on conflict (id) do update set
  brand_name = excluded.brand_name,
  workspace_name = excluded.workspace_name,
  guest_workspace_label = excluded.guest_workspace_label,
  member_workspace_label = excluded.member_workspace_label,
  nav_section_label = excluded.nav_section_label,
  sidebar_card_title = excluded.sidebar_card_title,
  sidebar_card_description = excluded.sidebar_card_description,
  sidebar_card_action = excluded.sidebar_card_action,
  eyebrow = excluded.eyebrow,
  demo_status_label = excluded.demo_status_label,
  live_status_label = excluded.live_status_label,
  updated_at = now();

insert into public.finan_navigation_items (slug, title, page_title, page_description, icon_key, sort_order) values
  ('overview', 'Tổng quan', 'Tổng quan tài chính', 'Nắm bắt thu chi. Chủ động mỗi quyết định.', 'dashboard', 10),
  ('transactions', 'Giao dịch', 'Lịch sử giao dịch', 'Tìm kiếm và kiểm tra mọi khoản thu chi.', 'activity', 20),
  ('accounts', 'Tài khoản ngân hàng', 'Tài khoản ngân hàng', 'Theo dõi các tài khoản được liên kết qua SePay.', 'landmark', 30),
  ('plans', 'Gói sử dụng', 'Gói sử dụng', 'Chọn gói phù hợp để quản lý tài chính mỗi ngày.', 'gem', 40)
on conflict (slug) do update set
  title = excluded.title, page_title = excluded.page_title, page_description = excluded.page_description,
  icon_key = excluded.icon_key, sort_order = excluded.sort_order, active = true, updated_at = now();

insert into public.finan_plans (id, name, description, price_monthly, duration_days, max_bank_accounts, features, recommended, sort_order) values
  ('starter', 'Khởi đầu', 'Dùng thử các tính năng cốt lõi.', 0, 30, 1, array['1 tài khoản ngân hàng','Tổng quan dòng tiền','Xuất dữ liệu CSV'], false, 10),
  ('pro', 'Chuyên nghiệp', 'Tự động hóa tài chính cá nhân và hộ kinh doanh.', 99000, 30, 2, array['2 tài khoản ngân hàng','Đồng bộ giao dịch SePay','Lọc và xuất báo cáo'], true, 20),
  ('business', 'Doanh nghiệp', 'Theo dõi nhiều tài khoản cho đội ngũ.', 249000, 30, 10, array['10 tài khoản ngân hàng','Đồng bộ giao dịch SePay','Ưu tiên hỗ trợ'], false, 30)
on conflict (id) do update set
  name = excluded.name, description = excluded.description, price_monthly = excluded.price_monthly,
  duration_days = excluded.duration_days, max_bank_accounts = excluded.max_bank_accounts,
  features = excluded.features, recommended = excluded.recommended, active = true,
  sort_order = excluded.sort_order, updated_at = now();

create or replace function private.finan_internal_secret_ok(p_secret text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select secret_hash = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex')
     from private.finan_runtime_secrets where key = 'internal_rpc'), false
  );
$$;
revoke all on function private.finan_internal_secret_ok(text) from public, anon, authenticated;

drop function if exists public.finan_rate_limit(text,text,integer,integer);
create or replace function public.finan_rate_limit(p_internal_secret text, p_subject text, p_action_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_start timestamptz; v_hits integer;
begin
  if not private.finan_internal_secret_ok(p_internal_secret)
     or char_length(p_subject) > 160 or char_length(p_action_key) > 80
     or p_limit not between 1 and 1000 or p_window_seconds not between 1 and 86400 then
    return false;
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.finan_rate_limits(subject, action_key, window_start, hits)
  values (p_subject, p_action_key, v_start, 1)
  on conflict (subject, action_key, window_start) do update set hits = public.finan_rate_limits.hits + 1
  returning hits into v_hits;
  delete from public.finan_rate_limits where window_start < now() - interval '2 days';
  return v_hits <= p_limit;
end;
$$;
revoke all on function public.finan_rate_limit(text,text,text,integer,integer) from public, anon, authenticated, service_role;
grant execute on function public.finan_rate_limit(text,text,text,integer,integer) to anon, authenticated;

create or replace function public.finan_upsert_connection(
  p_user_id uuid, p_encrypted_token text, p_mode text, p_bank_count integer, p_internal_secret text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_max integer;
begin
  if not private.finan_internal_secret_ok(p_internal_secret) or auth.uid() is null or auth.uid() <> p_user_id then raise exception 'unauthorized'; end if;
  select coalesce(p.max_bank_accounts, 1) into v_max
  from public.finan_subscriptions s join public.finan_plans p on p.id = s.plan_id
  where s.user_id = p_user_id and s.status = 'active' and (s.ends_at is null or s.ends_at > now());
  v_max := coalesce(v_max, 1);
  if p_bank_count > v_max then raise exception 'plan_account_limit'; end if;
  if p_mode not in ('live','sandbox') or char_length(p_encrypted_token) not between 32 and 4096 then raise exception 'invalid_connection'; end if;
  insert into public.finan_connections(user_id, encrypted_token, mode, bank_count)
  values (p_user_id, p_encrypted_token, p_mode, p_bank_count)
  on conflict (user_id) do update set encrypted_token = excluded.encrypted_token, mode = excluded.mode, bank_count = excluded.bank_count, updated_at = now();
  return jsonb_build_object('connected', true, 'mode', p_mode, 'bankCount', p_bank_count);
end;
$$;
revoke all on function public.finan_upsert_connection(uuid,text,text,integer,text) from public, anon, authenticated, service_role;
grant execute on function public.finan_upsert_connection(uuid,text,text,integer,text) to authenticated;

create or replace function public.finan_get_connection(p_user_id uuid, p_internal_secret text)
returns table(encrypted_token text, mode text, bank_count integer, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.finan_internal_secret_ok(p_internal_secret) or auth.uid() is null or auth.uid() <> p_user_id then raise exception 'unauthorized'; end if;
  return query select c.encrypted_token, c.mode, c.bank_count, c.updated_at from public.finan_connections c where c.user_id = p_user_id;
end;
$$;
revoke all on function public.finan_get_connection(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.finan_get_connection(uuid,text) to authenticated;

create or replace function public.finan_delete_connection(p_user_id uuid, p_internal_secret text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.finan_internal_secret_ok(p_internal_secret) or auth.uid() is null or auth.uid() <> p_user_id then raise exception 'unauthorized'; end if;
  delete from public.finan_connections where user_id = p_user_id;
  return found;
end;
$$;
revoke all on function public.finan_delete_connection(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.finan_delete_connection(uuid,text) to authenticated;

create or replace function public.finan_create_order(
  p_user_id uuid, p_plan_id text, p_payment_code text, p_bank_account text, p_bank_code text,
  p_bank_bin text, p_account_name text, p_sub_account text, p_internal_secret text
) returns public.finan_orders language plpgsql security definer set search_path = '' as $$
declare v_plan public.finan_plans; v_order public.finan_orders;
begin
  if not private.finan_internal_secret_ok(p_internal_secret) or auth.uid() is null or auth.uid() <> p_user_id then raise exception 'unauthorized'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':' || p_plan_id, 0));
  select * into v_plan from public.finan_plans where id = p_plan_id and active and price_monthly > 0;
  if not found then raise exception 'invalid_plan'; end if;
  update public.finan_orders set status = 'expired' where user_id = p_user_id and status = 'pending' and expires_at <= now();
  select * into v_order from public.finan_orders where user_id = p_user_id and plan_id = p_plan_id and status = 'pending' and expires_at > now() order by created_at desc limit 1;
  if found then return v_order; end if;
  insert into public.finan_orders(user_id, plan_id, amount, duration_days, payment_code, bank_account, bank_code, bank_bin, account_name, sub_account, expires_at)
  values (p_user_id, v_plan.id, v_plan.price_monthly, v_plan.duration_days, p_payment_code, p_bank_account, p_bank_code, nullif(p_bank_bin,''), p_account_name, nullif(p_sub_account,''), now() + interval '30 minutes')
  returning * into v_order;
  return v_order;
end;
$$;
revoke all on function public.finan_create_order(uuid,text,text,text,text,text,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.finan_create_order(uuid,text,text,text,text,text,text,text,text) to authenticated;

drop function if exists public.finan_process_payment(text,bigint,text,text,integer,text,text,text,timestamptz,text);
create or replace function public.finan_process_payment(
  p_internal_secret text, p_event_id bigint, p_gateway text, p_recipient_account text, p_sub_account text,
  p_amount integer, p_transfer_type text, p_payment_code text, p_reference_code text,
  p_transaction_at timestamptz, p_payload_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_order public.finan_orders; v_order_found boolean := false; v_outcome text := 'review';
begin
  if not private.finan_internal_secret_ok(p_internal_secret) then raise exception 'unauthorized'; end if;
  if p_event_id <= 0 or p_amount <= 0 then raise exception 'invalid_event'; end if;
  insert into public.finan_payment_events(event_id, gateway, recipient_account, sub_account, amount, transfer_type, payment_code, reference_code, transaction_at, payload_hash, outcome)
  values (p_event_id, p_gateway, p_recipient_account, nullif(p_sub_account,''), p_amount, p_transfer_type, nullif(p_payment_code,''), nullif(p_reference_code,''), p_transaction_at, p_payload_hash, 'review')
  on conflict (event_id) do nothing;
  if not found then
    return jsonb_build_object('outcome','duplicate');
  end if;
  select * into v_order from public.finan_orders
  where payment_code = p_payment_code and status in ('pending','review') for update;
  v_order_found := found;
  if v_order_found and p_transfer_type = 'in' and p_amount = v_order.amount
     and regexp_replace(upper(p_gateway), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(v_order.bank_code), '[^A-Z0-9]', '', 'g')
     and p_recipient_account = v_order.bank_account
     and coalesce(p_sub_account,'') = coalesce(v_order.sub_account,'')
     and p_transaction_at >= v_order.created_at - interval '10 minutes'
     and p_transaction_at <= v_order.expires_at + interval '1 day' then
    update public.finan_orders set status = 'paid', paid_at = p_transaction_at, payment_event_id = p_event_id where id = v_order.id;
    insert into public.finan_subscriptions(user_id, plan_id, status, starts_at, ends_at, updated_at)
    values (v_order.user_id, v_order.plan_id, 'active', now(), now() + make_interval(days => v_order.duration_days), now())
    on conflict (user_id) do update set
      plan_id = excluded.plan_id, status = 'active', starts_at = now(),
      ends_at = greatest(now(), coalesce(public.finan_subscriptions.ends_at, now())) + make_interval(days => v_order.duration_days), updated_at = now();
    v_outcome := 'processed';
  end if;
  update public.finan_payment_events
  set order_id = case when v_order_found then v_order.id else null end, outcome = v_outcome
  where event_id = p_event_id;
  return jsonb_build_object('outcome', v_outcome, 'orderId', case when v_order_found then v_order.id else null end);
end;
$$;
revoke all on function public.finan_process_payment(text,bigint,text,text,text,integer,text,text,text,timestamptz,text) from public, anon, authenticated, service_role;
grant execute on function public.finan_process_payment(text,bigint,text,text,text,integer,text,text,text,timestamptz,text) to anon;

create or replace function private.finan_handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.finan_subscriptions(user_id, plan_id, status, ends_at)
  values (new.id, 'starter', 'active', null) on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function private.finan_handle_new_user() from public, anon, authenticated;
drop trigger if exists finan_on_auth_user_created on auth.users;
create trigger finan_on_auth_user_created after insert on auth.users for each row execute function private.finan_handle_new_user();

insert into public.finan_subscriptions(user_id, plan_id, status, ends_at)
select id, 'starter', 'active', null from auth.users
on conflict (user_id) do nothing;
