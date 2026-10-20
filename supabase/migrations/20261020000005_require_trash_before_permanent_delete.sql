-- Browser deletes must go through the verified trash RPC, which requires an
-- item to be trashed before permanent deletion and records the audit entry.
-- This also prevents an older open browser tab from hard-deleting a folder.
revoke delete on public.students, public.student_documents from authenticated;
