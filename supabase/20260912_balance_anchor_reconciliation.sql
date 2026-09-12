alter table public.finan_connected_accounts
  add column if not exists balance_anchor_at timestamptz;

update public.finan_connected_accounts
set balance_anchor_at = balance_updated_at
where manual_balance is not null
  and balance_anchor_at is null;

create or replace function public.finan_set_account_balance(
  p_account_id text,
  p_balance bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_id text := left(coalesce(p_account_id, ''), 64);
  v_now timestamptz := now();
begin
  if v_user_id is null or v_account_id = '' or p_balance is null or p_balance < 0 then
    raise exception 'invalid balance';
  end if;

  update public.finan_connected_accounts
     set manual_balance = p_balance,
         balance_anchor_at = v_now,
         balance_updated_at = v_now
   where user_id = v_user_id
     and account_id = v_account_id
     and active = true;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  return jsonb_build_object(
    'status', 'updated',
    'account_id', v_account_id,
    'balance', p_balance,
    'balance_updated_at', v_now
  );
end;
$$;

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
  v_account_number text := left(regexp_replace(coalesce(p_account_number,''), '\s', '', 'g'), 100);
  v_category text;
  v_excluded boolean;
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

  select c.category, c.excluded_from_flow
    into v_category, v_excluded
  from private.finan_classify_transaction(p_transfer_type, p_content, p_reference_code, p_gateway) c;

  insert into public.finan_transactions(
    event_id,user_id,gateway,account_number,sub_account,transfer_type,amount,content,reference_code,transaction_at,payload_hash,
    category,excluded_from_flow,classification_source
  ) values (
    p_event_id,v_user_id,left(coalesce(p_gateway,''),100),v_account_number,left(coalesce(p_sub_account,''),100),p_transfer_type,p_amount,
    left(coalesce(p_content,''),2000),left(coalesce(p_reference_code,''),250),p_transaction_at,left(coalesce(p_payload_hash,''),128),
    coalesce(v_category,'uncategorized'),coalesce(v_excluded,false),'rule'
  ) on conflict (event_id) do nothing;

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
