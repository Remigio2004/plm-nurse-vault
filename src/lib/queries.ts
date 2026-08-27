import { queryOptions } from "@tanstack/react-query";

import { fetchAuditLogs, fetchRecords } from "./records-api";

export const recordsQuery = queryOptions({
  queryKey: ["records"],
  queryFn: fetchRecords,
});

export const auditLogsQuery = queryOptions({
  queryKey: ["audit_logs"],
  queryFn: fetchAuditLogs,
});
