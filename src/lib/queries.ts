import { queryOptions } from "@tanstack/react-query";

import { fetchAuditLogs, fetchDeletedRecords, fetchRecords } from "./records-api";

// Legacy compatibility query for the older records table. The active student-document
// browse flow is stored in the newer student_documents tree and should be treated as the
// source of truth for newly uploaded items.
export const recordsQuery = queryOptions({
  queryKey: ["records"],
  queryFn: fetchRecords,
});

export const auditLogsQuery = queryOptions({
  queryKey: ["audit_logs"],
  queryFn: fetchAuditLogs,
});

export const deletedRecordsQuery = queryOptions({
  queryKey: ["deleted_records"],
  queryFn: fetchDeletedRecords,
});
