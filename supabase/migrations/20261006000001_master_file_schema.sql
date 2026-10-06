-- Master File system schema — IDEMPOTENT version.
--
-- NOTE: This migration was already applied to the live database
-- (2026-10-06). Unlike the original applied version, this file:
--   1. is safe to re-run (create if not exists / drop policy if exists),
--   2. does NOT drop the legacy "records" table — that drop was executed
--      by mistake once and is intentionally never repeated here.

-- 1) Students (one row = one student folder) -------------------------

create table if not exists public.students (
  id uuid not null default gen_random_uuid() primary key,
  student_name text not null,
  student_number text,
  batch text not null,
  classification text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_name_not_blank check (length(btrim(student_name)) > 0),
  constraint students_classification_valid check (
    classification in ('CN Graduate', 'CN Honorable Dismissal', 'CN Others')
  )
);

-- Duplicate folder prevention: one folder per student name,
-- case-insensitive.
create unique index if not exists students_folder_name_uidx
  on public.students (lower(btrim(student_name)));

-- Fast lookups by batch and student number
create index if not exists students_batch_idx on public.students (batch);
create unique index if not exists students_number_uidx
  on public.students (student_number)
  where student_number is not null and length(btrim(student_number)) > 0;

-- 2) Documents (one row = one file inside a student's folder) --------

create table if not exists public.student_documents (
  id uuid not null default gen_random_uuid() primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  document_type text not null,
  file_name text not null,
  cloudinary_public_id text,
  storage_path text,
  file_size bigint,
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint student_documents_type_valid check (
    document_type in (
      'TOR', 'HonorableDismissal', 'CurriculumChecklist',
      'StudyPlan', 'LibraryCard', 'Other'
    )
  ),
  constraint student_documents_has_location check (
    cloudinary_public_id is not null or storage_path is not null
  )
);

-- One live document per type per student.
create unique index if not exists student_documents_student_type_uidx
  on public.student_documents (student_id, document_type)
  where deleted_at is null;

create index if not exists student_documents_student_idx on public.student_documents (student_id);

-- updated_at trigger for students
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists students_set_updated_at on public.students;
create trigger students_set_updated_at before update on public.students
for each row execute function public.set_updated_at();

-- 3) Statuses (auto-derived) -----------------------------------------
-- Kept for future use; the app currently derives statuses from
-- documents only (file present = Submitted, absent = Missing).

create table if not exists public.student_status_overrides (
  student_id uuid not null references public.students(id) on delete cascade,
  document_type text not null,
  status text not null,
  updated_at timestamptz not null default now(),
  constraint student_status_overrides_type_valid check (
    document_type in (
      'TOR', 'HonorableDismissal', 'CurriculumChecklist',
      'StudyPlan', 'LibraryCard', 'Other'
    )
  ),
  constraint student_status_overrides_status_valid check (
    status in ('Pending', 'Complete')
  ),
  primary key (student_id, document_type)
);

-- 4) RLS: admin allowlist + verified OTP session, same as before -----

alter table public.students enable row level security;
alter table public.student_documents enable row level security;
alter table public.student_status_overrides enable row level security;

drop policy if exists "Verified admin manages students" on public.students;
create policy "Verified admin manages students"
  on public.students for all to authenticated
  using (public.is_admin() and public.is_session_verified())
  with check (public.is_admin() and public.is_session_verified());

drop policy if exists "Verified admin manages student documents" on public.student_documents;
create policy "Verified admin manages student documents"
  on public.student_documents for all to authenticated
  using (public.is_admin() and public.is_session_verified())
  with check (public.is_admin() and public.is_session_verified());

drop policy if exists "Verified admin manages status overrides" on public.student_status_overrides;
create policy "Verified admin manages status overrides"
  on public.student_status_overrides for all to authenticated
  using (public.is_admin() and public.is_session_verified())
  with check (public.is_admin() and public.is_session_verified());

grant select, insert, update, delete on public.students to authenticated;
grant select, insert, update, delete on public.student_documents to authenticated;
grant select, insert, update, delete on public.student_status_overrides to authenticated;
