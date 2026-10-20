alter table public.students add column if not exists deleted_at timestamptz;
drop index if exists public.students_folder_name_uidx;
create unique index students_folder_name_uidx on public.students(lower(btrim(student_name))) where deleted_at is null;
drop index if exists public.students_number_uidx;
create unique index students_number_uidx on public.students(student_number)
  where deleted_at is null and student_number is not null and length(btrim(student_number)) > 0;
create index if not exists students_deleted_idx on public.students(deleted_at) where deleted_at is not null;
create index if not exists documents_deleted_idx on public.student_documents(deleted_at) where deleted_at is not null;

-- Durable storage cleanup: permanent deletion and replacement enqueue old blobs
-- in the SAME transaction. Failed provider requests can be retried independently.
create table public.storage_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  cloudinary_public_id text,
  storage_path text,
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  check (cloudinary_public_id is not null or storage_path is not null)
);
alter table public.storage_cleanup_jobs enable row level security;
revoke all on public.storage_cleanup_jobs from anon, authenticated;
grant all on public.storage_cleanup_jobs to service_role;

create or replace function public.queue_blob_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.cloudinary_public_id is not null or old.storage_path is not null then
      insert into public.storage_cleanup_jobs(cloudinary_public_id,storage_path)
      values(old.cloudinary_public_id,old.storage_path);
    end if;
  else
    if old.cloudinary_public_id is not null and old.cloudinary_public_id is distinct from new.cloudinary_public_id then
      insert into public.storage_cleanup_jobs(cloudinary_public_id) values(old.cloudinary_public_id);
    end if;
    if old.storage_path is not null and old.storage_path is distinct from new.storage_path then
      insert into public.storage_cleanup_jobs(storage_path) values(old.storage_path);
    end if;
  end if;
  return old;
end;
$$;
revoke all on function public.queue_blob_cleanup() from public;
create trigger student_document_blob_cleanup after delete or update of cloudinary_public_id,storage_path
  on public.student_documents for each row execute function public.queue_blob_cleanup();
create trigger legacy_record_blob_cleanup after delete or update of cloudinary_public_id,storage_path
  on public.records for each row execute function public.queue_blob_cleanup();

-- Lock the parent during writes so a file cannot be attached after its folder
-- has moved to trash (including uploads that race with a folder deletion).
create or replace function public.require_active_student_folder() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.students where id=new.student_id and deleted_at is null for share;
  if not found then raise exception 'Student folder is in Recently Deleted. Restore the folder first.' using errcode='23514'; end if;
  return new;
end;
$$;
revoke all on function public.require_active_student_folder() from public;
create trigger require_active_student_folder before insert or update on public.student_documents
  for each row execute function public.require_active_student_folder();

-- All trash mutations are server-side and atomic; callers still need both
-- admin membership and the OTP-verified session.
create or replace function public.manage_student_trash(p_action text,p_id uuid,p_kind text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  source public.students%rowtype;
  target public.students%rowtype;
  doc public.student_documents%rowtype;
  parent_id uuid;
  result_id uuid;
  candidates integer;
  summary text;
begin
  if not (public.is_admin() and public.is_session_verified()) then
    raise exception 'A verified admin session is required.' using errcode='42501';
  end if;
  if p_action not in ('delete','restore','purge') or p_kind not in ('student','document') then
    raise exception 'Invalid trash action.' using errcode='22023';
  end if;
  -- ponytail: one transaction lock for trash mutations; use per-student locks
  -- if concurrent records-office trash activity becomes a throughput bottleneck.
  perform pg_advisory_xact_lock(61020003);
  result_id := p_id;
  if p_kind='student' then
    -- Serialize name/number matching with folder creation as well as restores.
    lock table public.students in share row exclusive mode;
    select * into source from public.students where id=p_id for update;
    if not found then raise exception 'Student folder not found.' using errcode='P0002'; end if;
    summary := source.student_name;
    if p_action='delete' then
      if source.deleted_at is not null then return p_id; end if;
      update public.students set deleted_at=now() where id=p_id;
    else
      if source.deleted_at is null then raise exception 'This folder is not in Recently Deleted.'; end if;
      if p_action='purge' then
        delete from public.students where id=p_id;
      else
        if source.deleted_at<=now()-interval '30 days' then raise exception 'The 30-day restore period has expired.'; end if;
        select count(*) into candidates from public.students where deleted_at is null and id<>p_id
          and (lower(btrim(student_name))=lower(btrim(source.student_name))
            or (nullif(btrim(source.student_number),'') is not null and student_number=source.student_number));
        if candidates>1 then raise exception 'Student name and number match different folders. Correct the student details before restoring.'; end if;
        select * into target from public.students where deleted_at is null and id<>p_id
          and (lower(btrim(student_name))=lower(btrim(source.student_name))
            or (nullif(btrim(source.student_number),'') is not null and student_number=source.student_number)) for update;
        if found then
          if nullif(btrim(source.student_number),'') is not null and nullif(btrim(target.student_number),'') is not null
            and source.student_number<>target.student_number then
            raise exception 'The existing folder has a different student number. Correct the details before restoring.';
          end if;
          -- Preserve each file ID, blob, and individual deleted_at timestamp.
          -- Individually deleted files must not be resurrected by a folder merge.
          update public.student_documents set student_id=target.id where student_id=p_id;
          insert into public.student_status_overrides select target.id,document_type,status,updated_at
            from public.student_status_overrides where student_id=p_id on conflict do nothing;
          delete from public.students where id=p_id;
          result_id := target.id;
        else
          update public.students set deleted_at=null where id=p_id;
        end if;
      end if;
    end if;
  else
    select student_id into parent_id from public.student_documents where id=p_id;
    select * into source from public.students where id=parent_id for share;
    select * into doc from public.student_documents where id=p_id for update;
    if not found then raise exception 'Document not found.' using errcode='P0002'; end if;
    summary := source.student_name || ' — ' || doc.file_name;
    if source.deleted_at is not null and p_action<>'purge' then raise exception 'Restore the student folder first.'; end if;
    if p_action='delete' then
      if doc.deleted_at is not null then return p_id; end if;
      update public.student_documents set deleted_at=now() where id=p_id;
    else
      if doc.deleted_at is null then raise exception 'This document is not in Recently Deleted.'; end if;
      if p_action='purge' then delete from public.student_documents where id=p_id;
      else
        if doc.deleted_at<=now()-interval '30 days' then raise exception 'The 30-day restore period has expired.'; end if;
        update public.student_documents set deleted_at=null where id=p_id;
      end if;
    end if;
  end if;
  insert into public.audit_logs(action,record_id,record_summary,performed_by,performed_by_email,details)
    values(p_action,null,summary,auth.uid(),auth.jwt()->>'email',jsonb_build_object('module','master-file','kind',p_kind,'source_id',p_id,'restored_to',result_id,'merged',result_id<>p_id));
  return result_id;
end;
$$;
revoke all on function public.manage_student_trash(text,uuid,text) from public;
grant execute on function public.manage_student_trash(text,uuid,text) to authenticated;

create or replace function public.trash_student_folders(p_ids uuid[]) returns void
language plpgsql security invoker set search_path = public as $$
declare student_id uuid;
begin
  foreach student_id in array p_ids loop
    perform public.manage_student_trash('delete',student_id,'student');
  end loop;
end;
$$;
revoke all on function public.trash_student_folders(uuid[]) from public;
grant execute on function public.trash_student_folders(uuid[]) to authenticated;
