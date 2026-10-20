-- This trigger was installed directly in the production dashboard.
drop trigger if exists student_documents_file_limit on public.student_documents;
drop function if exists public.enforce_student_file_limit();
