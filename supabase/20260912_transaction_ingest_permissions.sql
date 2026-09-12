revoke all on function public.finan_ingest_transaction(text,bigint,text,text,text,text,bigint,text,text,timestamptz,text) from public, authenticated, service_role;
grant execute on function public.finan_ingest_transaction(text,bigint,text,text,text,text,bigint,text,text,timestamptz,text) to anon;
