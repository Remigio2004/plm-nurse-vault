-- Lockout counters become per (ip_address, email) instead of per IP only,
-- so a shared campus IP can no longer lock everyone out, and rotating a
-- spoofed XFF header no longer resets the counter for one account.

alter table public.login_lockouts add column if not exists email text;
update public.login_lockouts set email = '' where email is null;
alter table public.login_lockouts alter column email set default '';

-- Drop any single-column unique/PK constraint on ip_address so multiple
-- emails can share one IP.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.login_lockouts'::regclass
      and contype in ('u', 'p')
      and (
        select array_agg(a.attname order by a.attnum)
        from unnest(conkey) k
        join pg_attribute a on a.attrelid = conrelid and a.attnum = k
      ) = array['ip_address']
  loop
    execute format('alter table public.login_lockouts drop constraint %I', c.conname);
  end loop;
end $$;

create unique index if not exists login_lockouts_ip_email_uidx
  on public.login_lockouts (ip_address, email);
