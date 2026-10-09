-- Admin allowlist: replaces hardcoded UUIDs in is_admin() and edge functions.
-- Add/remove admins via SQL insert/delete on this table — no code deploy needed.
--
-- Post-deploy: insert your admin's UUID. Example:
--   insert into admin_users (user_id, email, role)
--   values ('<UUID>', 'plmcollegeofnursing1969@gmail.com', 'admin');

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null unique,
  role text not null default 'admin' check (role in ('admin', 'super_admin')),
  added_at timestamptz not null default now()
);

grant select on public.admin_users to service_role;
-- RLS: no policies on admin_users; it's queried only via is_admin() (server-side)
-- and edge functions (service-role client). Never expose to the browser.

-- is_admin() now reads from the table instead of a hardcoded array.
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;