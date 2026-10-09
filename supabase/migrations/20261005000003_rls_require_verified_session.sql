-- Server-side OTP enforcement at the database layer (Phase 1a).
--
-- The live policies already restrict records/audit_logs to the two admin
-- IDs, but a stolen password alone still satisfies them: the OTP gate
-- lived only in React. Every policy below now ALSO requires an
-- OTP-verified, unrevoked, unexpired session via is_session_verified()
-- (already present in the live DB, SECURITY DEFINER).

-- Helper so the admin allowlist lives in one place (admin_users table).
-- is_admin() now queries that table instead of using a hardcoded array.
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select auth.uid() = any (array[
    '68a6a069-5220-481c-b36a-3cc478169a36'::uuid,
    '13877d07-25dc-4c1a-8fa5-38a9eb2fdde5'::uuid
  ]);
$$;

-- records ------------------------------------------------------------
drop policy if exists "Admin can view records" on public.records;
create policy "Admin can view records"
  on public.records for select to authenticated
  using (public.is_admin() and public.is_session_verified());

drop policy if exists "Admin can create records" on public.records;
create policy "Admin can create records"
  on public.records for insert to authenticated
  with check (public.is_admin() and public.is_session_verified());

drop policy if exists "Admin can update records" on public.records;
create policy "Admin can update records"
  on public.records for update to authenticated
  using (public.is_admin() and public.is_session_verified())
  with check (public.is_admin() and public.is_session_verified());

drop policy if exists "Admin can delete records" on public.records;
create policy "Admin can delete records"
  on public.records for delete to authenticated
  using (public.is_admin() and public.is_session_verified());

-- audit_logs ---------------------------------------------------------
drop policy if exists "Admin can view audit logs" on public.audit_logs;
create policy "Admin can view audit logs"
  on public.audit_logs for select to authenticated
  using (public.is_admin() and public.is_session_verified());

drop policy if exists "Admin can create audit logs" on public.audit_logs;
create policy "Admin can create audit logs"
  on public.audit_logs for insert to authenticated
  with check (
    public.is_admin()
    and public.is_session_verified()
    and auth.uid() = performed_by
  );
