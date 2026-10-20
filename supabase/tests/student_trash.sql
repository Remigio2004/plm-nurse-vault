-- Run: supabase db query --linked --file supabase/tests/student_trash.sql
-- Every fixture, audit entry and cleanup job is rolled back.
begin;
do $$
declare
  actor uuid;
  session text := 'revision-check-'||gen_random_uuid();
  source uuid := gen_random_uuid();
  target uuid := gen_random_uuid();
  expired uuid := gen_random_uuid();
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  restored uuid;
  name text := '__revision_check_'||gen_random_uuid();
  rejected boolean := false;
begin
  select user_id into actor from public.admin_users limit 1;
  if actor is null then raise exception 'A configured admin is required for this check.'; end if;
  insert into public.verified_sessions(session_id,user_id,expires_at,revoked)
    values(session,actor,now()+interval '1 hour',false);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',session,'email','revision-check@example.invalid')::text,true);
  insert into public.students(id,student_name,batch,classification) values(source,name,'2026','CN Honorable Dismissal');
  insert into public.student_documents(id,student_id,document_type,folder,file_name,storage_path)
    values(a,source,'SecondaryAcademicRecords','academic','a.pdf','revision-test/'||a),
      (b,source,'SecondaryAcademicRecords','academic','b.pdf','revision-test/'||b);
  perform public.manage_student_trash('delete',b,'document');
  perform public.manage_student_trash('delete',source,'student');
  if not exists(select 1 from public.students where id=source and deleted_at is not null) then raise exception 'Folder was not soft deleted'; end if;
  if (select count(*) from public.student_documents where student_id=source)<>2 then raise exception 'Folder delete lost files'; end if;
  insert into public.students(id,student_name,batch,classification) values(target,name,'2026','CN Honorable Dismissal');
  insert into public.student_documents(id,student_id,document_type,folder,file_name,storage_path)
    values(c,target,'SecondaryAcademicRecords','academic','c.pdf','revision-test/'||c);
  restored := public.manage_student_trash('restore',source,'student');
  if restored<>target then raise exception 'Restore did not merge into the existing folder'; end if;
  if (select count(*) from public.students where lower(student_name)=lower(name))<>1 then raise exception 'Restore duplicated a folder'; end if;
  if (select count(*) from public.student_documents where student_id=target)<>3 then raise exception 'Merge lost files'; end if;
  if not exists(select 1 from public.student_documents where id=b and deleted_at is not null) then raise exception 'Merge resurrected an individually deleted file'; end if;
  perform public.manage_student_trash('restore',b,'document');
  if (select count(*) from public.student_documents where student_id=target and deleted_at is null)<>3 then raise exception 'Document restore failed'; end if;
  perform public.manage_student_trash('delete',a,'document');
  perform public.manage_student_trash('purge',a,'document');
  if exists(select 1 from public.student_documents where id=a) then raise exception 'Permanent deletion retained the row'; end if;
  if not exists(select 1 from public.storage_cleanup_jobs where storage_path='revision-test/'||a) then raise exception 'Permanent deletion did not queue storage cleanup'; end if;
  insert into public.students(id,student_name,batch,classification,deleted_at)
    values(expired,name||'_expired','2026','CN Graduate',now()-interval '31 days');
  begin
    perform public.manage_student_trash('restore',expired,'student');
  exception when others then rejected := sqlerrm like '%expired%'; end;
  if not rejected then raise exception 'An expired folder was restorable'; end if;
  perform set_config('request.jwt.claims','{}',true);
  rejected := false;
  begin
    perform public.manage_student_trash('delete',target,'student');
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'An unverified caller could mutate trash'; end if;
end;
$$;
select 'PASS: soft delete, multi-attachment merge, no duplicate folder, preserved deleted files, restore, purge cleanup, expiry and authorization' as result;
rollback;
