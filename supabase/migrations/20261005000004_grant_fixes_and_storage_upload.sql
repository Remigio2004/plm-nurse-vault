-- Fix-ups found by re-dumping grants after the hardening pass:
--
-- 1. records grants: authenticated had only INSERT (SELECT/UPDATE were
--    lost when policies were tightened in the dashboard), but the app
--    reads the table directly (fetchRecords / fetchDeletedRecords) and
--    edits rows (updateRecord). Restore SELECT + UPDATE; DELETE stays
--    server-side via edge functions on purpose.
grant select, update on public.records to authenticated;

-- 2. Over-grants left over from the dashboard era. RLS already blocks
--    anon/authenticated on the OTP tables (no policies), but these
--    privileges should never have existed — revoke for defense in depth.
revoke all on public.otp_codes from anon, authenticated;
revoke all on public.trusted_devices from anon, authenticated;
revoke all on public.verified_sessions from anon, authenticated;
revoke all on public.login_lockouts from anon, authenticated;
revoke delete, truncate, update on public.audit_logs from authenticated;

-- 3. The browser still uploads large files (>10 MB) straight to the
--    student-records bucket, so an INSERT path must exist — but scoped to
--    OTP-verified admins. DELETE is needed for the client-side cleanup
--    after a failed record insert. Reads never happen from the browser
--    (open goes through signed URLs created with the service role).
create policy "Verified admin can upload student-records"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'student-records'
    and public.is_admin()
    and public.is_session_verified()
  );

create policy "Verified admin can clean up student-records"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'student-records'
    and public.is_admin()
    and public.is_session_verified()
  );
