create table if not exists public.finan_connected_accounts (
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id text not null,
  account_number text not null,
  bank_short_name text not null default '',
  label text not null default '',
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, account_id)
);
create index if not exists finan_connected_accounts_number_idx on public.finan_connected_accounts(account_number);

create table if not exists public.finan_transactions (
  event_id bigint primary key check (event_id > 0),
  user_id uuid not null references auth.users(id) on delete cascade,
  gateway text not null,
  account_number text not null,
  sub_account text not null default '',
  transfer_type text not null check (transfer_type in ('in','out')),
  amount bigint not null check (amount > 0),
  content text not null default '',
  reference_code text not null default '',
  transaction_at timestamptz not null,
  payload_hash text not null,
  received_at timestamptz not null default now()
);
create index if not exists finan_transactions_user_date_idx on public.finan_transactions(user_id, transaction_at desc);
create index if not exists finan_transactions_account_idx on public.finan_transactions(account_number, transaction_at desc);

alter table public.finan_connected_accounts enable row level security;
alter table public.finan_transactions enable row level security;

drop policy if exists "finan own connected accounts" on public.finan_connected_accounts;
create policy "finan own connected accounts" on public.finan_connected_accounts
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "finan own transactions" on public.finan_transactions;
create policy "finan own transactions" on public.finan_transactions
for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.finan_connected_accounts, public.finan_transactions from anon, authenticated;
grant select on public.finan_connected_accounts, public.finan_transactions to authenticated;

create or replace function public.finan_sync_connected_accounts(
  p_user_id uuid,
  p_accounts jsonb,
  p_internal_secret text
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer := 0;
begin
  if not private.finan_internal_secret_ok(p_internal_secret)
     or auth.uid() is null
     or auth.uid() <> p_user_id
     or jsonb_typeof(p_accounts) <> 'array' then
    raise exception 'unauthorized';
  end if;

  delete from public.finan_connected_accounts where user_id = p_user_id;

  insert into public.finan_connected_accounts(user_id, account_id, account_number, bank_short_name, label, active, updated_at)
  select
    p_user_id,
    left(coalesce(x->>'id',''), 64),
    left(regexp_replace(coalesce(x->>'account_number',''), '\s', '', 'g'), 100),
    left(coalesce(x->>'bank_short_name',''), 100),
    left(coalesce(x->>'label',''), 160),
    coalesce((x->>'active')::integer, 0) = 1,
    now()
  from jsonb_array_elements(p_accounts) x
  where coalesce(x->>'id','') <> '' and coalesce(x->>'account_number','') <> '';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.finan_sync_connected_accounts(uuid,jsonb,text) from public, anon, authenticated, service_role;
grant execute on function public.finan_sync_connected_accounts(uuid,jsonb,text) to authenticated;

create or replace function public.finan_ingest_transaction(
  p_internal_secret text,
  p_event_id bigint,
  p_gateway text,
  p_account_number text,
  p_sub_account text,
  p_transfer_type text,
  p_amount bigint,
  p_content text,
  p_reference_code text,
  p_transaction_at timestamptz,
  p_payload_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_owner_count integer;
  v_inserted integer := 0;
  v_account_number text := left(regexp_replace(coalesce(p_account_number,''), '\s', '', 'g'), 100);
begin
  if not private.finan_internal_secret_ok(p_internal_secret)
     or p_event_id <= 0
     or p_transfer_type not in ('in','out')
     or p_amount <= 0
     or v_account_number = ''
     or p_transaction_at is null then
    raise exception 'invalid transaction';
  end if;

  select count(distinct user_id), (array_agg(distinct user_id))[1]
    into v_owner_count, v_user_id
  from public.finan_connected_accounts
  where account_number = v_account_number and active = true;

  if coalesce(v_owner_count, 0) = 0 then
    return jsonb_build_object('status','unmatched');
  end if;
  if v_owner_count > 1 then
    return jsonb_build_object('status','ambiguous');
  end if;

  insert into public.finan_transactions(
    event_id,user_id,gateway,account_number,sub_account,transfer_type,amount,content,reference_code,transaction_at,payload_hash
  ) values (
    p_event_id,v_user_id,left(coalesce(p_gateway,''),100),v_account_number,left(coalesce(p_sub_account,''),100),p_transfer_type,p_amount,
    left(coalesce(p_content,''),2000),left(coalesce(p_reference_code,''),250),p_transaction_at,left(coalesce(p_payload_hash,''),128)
  ) on conflict (event_id) do nothing;

  get diagnostics v_inserted = row_count;
  return jsonb_build_object('status', case when v_inserted = 1 then 'inserted' else 'duplicate' end, 'user_id', v_user_id);
end;
$$;
revoke all on function public.finan_ingest_transaction(text,bigint,text,text,text,text,bigint,text,text,timestamptz,text) from public, anon, authenticated, service_role;
grant execute on function public.finan_ingest_transaction(text,bigint,text,text,text,text,bigint,text,text,timestamptz,text) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'finan_transactions'
  ) then
    execute 'alter publication supabase_realtime add table public.finan_transactions';
  end if;
end $$;
