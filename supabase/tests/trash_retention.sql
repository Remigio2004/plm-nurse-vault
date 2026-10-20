-- Run: supabase db query --linked --file supabase/tests/trash_retention.sql
-- Retention mutations, including changes to pre-existing trash, are rolled back.
begin;
do $$
declare
  active_folder uuid := gen_random_uuid();
  expired_folder uuid := gen_random_uuid();
  old_file uuid := gen_random_uuid();
  young_file uuid := gen_random_uuid();
  active_file uuid := gen_random_uuid();
  folder_file uuid := gen_random_uuid();
begin
  insert into public.students(id,student_name,batch,classification) values
    (active_folder,'__retention_active_'||active_folder,'2026','CN Graduate'),
    (expired_folder,'__retention_expired_'||expired_folder,'2026','CN Graduate');
  insert into public.student_documents(id,student_id,document_type,folder,file_name,storage_path,deleted_at) values
    (old_file,active_folder,'Others','others','old.pdf','retention-test/'||old_file,now()-interval '31 days'),
    (young_file,active_folder,'Others','others','young.pdf','retention-test/'||young_file,now()-interval '29 days'),
    (active_file,active_folder,'Others','others','active.pdf','retention-test/'||active_file,null),
    (folder_file,expired_folder,'Others','others','folder.pdf','retention-test/'||folder_file,null);
  update public.students set deleted_at=now()-interval '31 days' where id=expired_folder;
  perform public.purge_expired_trash();
  if exists(select 1 from public.students where id=expired_folder) then raise exception 'Expired folder survived'; end if;
  if exists(select 1 from public.student_documents where id in (old_file,folder_file)) then raise exception 'Expired files survived'; end if;
  if (select count(*) from public.student_documents where id in (young_file,active_file))<>2 then raise exception 'Active or unexpired file was purged'; end if;
  if (select count(*) from public.storage_cleanup_jobs where storage_path in ('retention-test/'||old_file,'retention-test/'||folder_file))<>2 then raise exception 'Expired blob cleanup was not queued'; end if;
  if exists(select 1 from public.storage_cleanup_jobs where storage_path in ('retention-test/'||young_file,'retention-test/'||active_file)) then raise exception 'Active file was queued for removal'; end if;
  if public.authorize_trash_cleanup('invalid-token') then raise exception 'Invalid scheduler token was accepted'; end if;
end;
$$;
select 'PASS: 30-day file/folder expiry, preserved active/unexpired files, queued blobs and scheduler authorization' as result;
rollback;
