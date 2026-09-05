import { queryOptions } from "@tanstack/react-query";

import { fetchAuditLogs, fetchDeletedRecords, fetchRecords } from "./records-api";

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
