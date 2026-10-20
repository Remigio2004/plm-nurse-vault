-- Each requirement may have any number of attachments. Document IDs remain unique.
drop index if exists public.student_documents_student_type_uidx;
create index if not exists student_documents_student_type_idx
  on public.student_documents(student_id, document_type) where deleted_at is null;

-- Older dashboard schema changes did not have a migration for the folder column.
alter table public.student_documents add column if not exists folder text;
update public.student_documents set folder = case
  when document_type = 'IdentificationRecords' then 'personal'
  when document_type = 'Others' then 'others'
  else 'academic' end
where folder is null;
alter table public.student_documents alter column folder set not null;
