alter table public.finan_transactions
  add column if not exists category text not null default 'uncategorized',
  add column if not exists excluded_from_flow boolean not null default false,
  add column if not exists classification_source text not null default 'rule';

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'finan_transactions_category_check'
      and conrelid = 'public.finan_transactions'::regclass
  ) then
    alter table public.finan_transactions
      add constraint finan_transactions_category_check check (category in (
        'income_sales','income_service','income_salary','income_other',
        'expense_cogs','expense_salary','expense_marketing','expense_rent','expense_utilities','expense_shipping','expense_fee','expense_tax','expense_food','expense_transport','expense_shopping','expense_other',
        'transfer_internal','capital','loan','refund','uncategorized'
      ));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'finan_transactions_classification_source_check'
      and conrelid = 'public.finan_transactions'::regclass
  ) then
    alter table public.finan_transactions
      add constraint finan_transactions_classification_source_check check (classification_source in ('rule','manual'));
  end if;
end $$;

create or replace function private.finan_classify_transaction(
  p_transfer_type text,
  p_content text,
  p_reference_code text,
  p_gateway text
)
returns table(category text, excluded_from_flow boolean)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := lower(concat_ws(' ', coalesce(p_content,''), coalesce(p_reference_code,''), coalesce(p_gateway,'')));
  v_category text;
  v_excluded boolean := false;
begin
  if v_text ~ '(chuyển tiền.*(nội bộ|giữa.*tài khoản)|chuyen tien.*(noi bo|giua.*tai khoan)|internal transfer|own account)' then
    v_category := 'transfer_internal';
    v_excluded := true;
  elsif v_text ~ '(góp vốn|gop von|rút vốn|rut von|capital contribution|capital withdrawal)' then
    v_category := 'capital';
    v_excluded := true;
  elsif v_text ~ '(khoản vay|khoan vay|vay vốn|vay von|trả nợ|tra no|repay loan|loan)' then
    v_category := 'loan';
    v_excluded := true;
  elsif v_text ~ '(hoàn tiền|hoan tien|refund|reversal)' then
    v_category := 'refund';
    v_excluded := true;
  elsif p_transfer_type = 'in' then
    if v_text ~ '(lương|luong|salary|payroll)' then
      v_category := 'income_salary';
    elsif v_text ~ '(đơn hàng|don hang|bán hàng|ban hang|sale|order)' then
      v_category := 'income_sales';
    elsif v_text ~ '(dịch vụ|dich vu|tư vấn|tu van|project|service|consult)' then
      v_category := 'income_service';
    else
      v_category := 'income_other';
    end if;
  else
    if v_text ~ '(nhà cung cấp|nha cung cap|nhập hàng|nhap hang|giá vốn|gia von|supplier|inventory)' then
      v_category := 'expense_cogs';
    elsif v_text ~ '(lương|luong|salary|payroll)' then
      v_category := 'expense_salary';
    elsif v_text ~ '(quảng cáo|quang cao|facebook ads|google ads|tiktok ads|marketing)' then
      v_category := 'expense_marketing';
    elsif v_text ~ '(thuê nhà|thue nha|thuê văn phòng|thue van phong|rent)' then
      v_category := 'expense_rent';
    elsif v_text ~ '(điện|dien|nước|nuoc|internet|điện thoại|dien thoai|utility|utilities)' then
      v_category := 'expense_utilities';
    elsif v_text ~ '(vận chuyển|van chuyen|giao hàng|giao hang|shipping|shipper|delivery)' then
      v_category := 'expense_shipping';
    elsif v_text ~ '(phí ngân hàng|phi ngan hang|phí giao dịch|phi giao dich|bank fee|transaction fee)' then
      v_category := 'expense_fee';
    elsif v_text ~ '(thuế|thue|tax|lệ phí|le phi)' then
      v_category := 'expense_tax';
    elsif v_text ~ '(grabfood|shopeefood|ăn uống|an uong|cơm|com |food|restaurant|cafe|coffee)' then
      v_category := 'expense_food';
    elsif v_text ~ '(grab|be |xanh sm|taxi|xăng|xang|parking|gửi xe|gui xe)' then
      v_category := 'expense_transport';
    elsif v_text ~ '(shopee|lazada|tiki|mua sắm|mua sam|shopping)' then
      v_category := 'expense_shopping';
    else
      v_category := 'expense_other';
    end if;
  end if;

  return query select v_category, v_excluded;
end;
$$;

revoke all on function private.finan_classify_transaction(text,text,text,text) from public, anon, authenticated;

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
  return jsonb_build_object(
    'status', case when v_inserted = 1 then 'inserted' else 'duplicate' end,
    'user_id', v_user_id,
    'category', coalesce(v_category,'uncategorized'),
    'excluded_from_flow', coalesce(v_excluded,false)
  );
end;
$$;
