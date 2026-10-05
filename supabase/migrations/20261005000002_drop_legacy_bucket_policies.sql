-- The browser never talks to the legacy student-records bucket directly:
-- all access flows through edge functions using the service role, which
-- bypasses RLS entirely. Any policy on it only widens the attack surface,
-- so remove everything attached to that bucket — including policies added
-- ad hoc from the dashboard that never made it into migrations.

drop policy if exists "Authenticated users can read student records files"
  on storage.objects;
drop policy if exists "Authenticated users can upload student records files"
  on storage.objects;
drop policy if exists "Authenticated users can update student records files"
  on storage.objects;
drop policy if exists "Authenticated users can delete student records files"
  on storage.objects;

-- Safety net: drop any other policy on storage.objects whose expressions
-- still reference the student-records bucket.
do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') like '%student-records%'
        or coalesce(with_check, '') like '%student-records%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end $$;
