create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$ begin
  if not exists(select 1 from vault.decrypted_secrets where name='student_trash_cleanup_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'student_trash_cleanup_token','Authenticates the scheduled trash cleanup worker');
  end if;
end $$;

create or replace function public.authorize_trash_cleanup(p_token text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_token is not null and exists(select 1 from vault.decrypted_secrets where name='student_trash_cleanup_token' and decrypted_secret=p_token);
$$;
revoke all on function public.authorize_trash_cleanup(text) from public;
grant execute on function public.authorize_trash_cleanup(text) to service_role;

create or replace function public.purge_expired_trash() returns integer
language plpgsql security definer set search_path = public as $$
declare removed integer := 0; n integer;
begin
  perform pg_advisory_xact_lock(61020003);
  lock table public.students in share row exclusive mode;
  with expired as (
    delete from public.student_documents where deleted_at<=now()-interval '30 days' returning id,file_name
  ) insert into public.audit_logs(action,record_summary,details)
    select 'purge',file_name,jsonb_build_object('module','master-file','kind','document','source_id',id,'automatic',true) from expired;
  get diagnostics n = row_count; removed := removed+n;
  with expired as (
    delete from public.students where deleted_at<=now()-interval '30 days' returning id,student_name
  ) insert into public.audit_logs(action,record_summary,details)
    select 'purge',student_name,jsonb_build_object('module','master-file','kind','student','source_id',id,'automatic',true) from expired;
  get diagnostics n = row_count; removed := removed+n;
  with expired as (
    delete from public.records where deleted_at<=now()-interval '30 days' returning id,student_name
  ) insert into public.audit_logs(action,record_summary,details)
    select 'purge',student_name,jsonb_build_object('kind','legacy','source_id',id,'automatic',true) from expired;
  get diagnostics n = row_count;
  return removed+n;
end;
$$;
revoke all on function public.purge_expired_trash() from public;
grant execute on function public.purge_expired_trash() to service_role;

-- URL is supplied during deployment; no API keys or scheduler secrets in source.
create or replace function public.configure_trash_cleanup(p_base_url text) returns void
language plpgsql security definer set search_path = public as $$
declare previous bigint;
begin
  if p_base_url !~ '^https://[a-z0-9]+\.supabase\.co/?$' then raise exception 'Expected a Supabase project URL'; end if;
  for previous in select jobid from cron.job where jobname='student-trash-cleanup' loop
    perform cron.unschedule(previous);
  end loop;
  perform cron.schedule('student-trash-cleanup','*/15 * * * *',format($command$
    select net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type','application/json','x-cleanup-token',
        (select decrypted_secret from vault.decrypted_secrets where name='student_trash_cleanup_token')),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $command$,rtrim(p_base_url,'/')||'/functions/v1/trash-cleanup'));
end;
$$;
revoke all on function public.configure_trash_cleanup(text) from public;
grant execute on function public.configure_trash_cleanup(text) to service_role;
