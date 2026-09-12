alter table public.finan_transactions drop constraint if exists finan_transactions_event_id_check;

alter table public.finan_transactions
  alter column event_id type text using event_id::text;

alter table public.finan_transactions
  add column if not exists dedupe_key text;

create unique index if not exists finan_transactions_dedupe_key_uidx
  on public.finan_transactions (dedupe_key)
  where dedupe_key is not null;

drop function if exists public.finan_ingest_transaction(text,bigint,text,text,text,text,bigint,text,text,timestamptz,text);

create or replace function public.finan_ingest_transaction(
  p_internal_secret text,
  p_event_id text,
  p_gateway text,
  p_account_number text,
  p_sub_account text,
  p_transfer_type text,
  p_amount bigint,
  p_content text,
  p_reference_code text,
  p_transaction_at timestamptz,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_owner_count integer;
  v_inserted integer := 0;
  v_event_id text := left(trim(coalesce(p_event_id,'')), 100);
  v_account_number text := left(regexp_replace(coalesce(p_account_number,''), '\s', '', 'g'), 100);
  v_category text;
  v_excluded boolean;
  v_dedupe_key text;
begin
  if not private.finan_internal_secret_ok(p_internal_secret)
     or v_event_id = ''
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

  select c.category, c.excluded_from_flow
    into v_category, v_excluded
  from private.finan_classify_transaction(p_transfer_type, p_content, p_reference_code, p_gateway) c;

  v_dedupe_key := md5(concat_ws('|',
    v_account_number,
    p_transfer_type,
    p_amount::text,
    coalesce(p_reference_code,''),
    date_trunc('second', p_transaction_at)::text,
    coalesce(p_content,'')
  ));

  insert into public.finan_transactions(
    event_id,user_id,gateway,account_number,sub_account,transfer_type,amount,content,reference_code,transaction_at,payload_hash,
    category,excluded_from_flow,classification_source,dedupe_key
  ) values (
    v_event_id,v_user_id,left(coalesce(p_gateway,''),100),v_account_number,left(coalesce(p_sub_account,''),100),p_transfer_type,p_amount,
    left(coalesce(p_content,''),2000),left(coalesce(p_reference_code,''),250),p_transaction_at,left(coalesce(p_payload_hash,''),128),
    coalesce(v_category,'uncategorized'),coalesce(v_excluded,false),'rule',v_dedupe_key
  ) on conflict do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    update public.finan_connected_accounts
       set manual_balance = manual_balance + case when p_transfer_type = 'in' then p_amount else -p_amount end,
           balance_updated_at = greatest(coalesce(balance_updated_at, p_transaction_at), p_transaction_at)
     where user_id = v_user_id
       and account_number = v_account_number
       and active = true
       and manual_balance is not null
       and p_transaction_at > coalesce(balance_anchor_at, balance_updated_at, '-infinity'::timestamptz);
  end if;

  return jsonb_build_object(
    'status', case when v_inserted = 1 then 'inserted' else 'duplicate' end,
    'user_id', v_user_id,
    'category', coalesce(v_category,'uncategorized'),
    'excluded_from_flow', coalesce(v_excluded,false)
  );
end;
$$;

revoke all on function public.finan_ingest_transaction(text,text,text,text,text,text,bigint,text,text,timestamptz,text) from public;
grant execute on function public.finan_ingest_transaction(text,text,text,text,text,text,bigint,text,text,timestamptz,text) to anon, authenticated;
