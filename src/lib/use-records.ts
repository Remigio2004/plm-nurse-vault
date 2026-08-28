import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { StudentRecord } from "@/data/records";
import { auditLogsQuery, recordsQuery } from "./queries";
import { createRecord, deleteRecord, updateRecord } from "./records-api";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Unexpected error. Please try again.";

export function useRecords() {
  return useQuery(recordsQuery);
}

export function useAuditLogs() {
  return useQuery(auditLogsQuery);
}

export function useCreateRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createRecord,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["records"] });
      void qc.invalidateQueries({ queryKey: ["audit_logs"] });
    },
    onError: (error) => toast.error("Upload failed", { description: message(error) }),
  });
}

export function useUpdateRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      record: StudentRecord;
      patch: { fileName?: string; studentName?: string; studentNumber?: string };
    }) => updateRecord(vars.record, vars.patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["records"] });
      void qc.invalidateQueries({ queryKey: ["audit_logs"] });
    },
    onError: (error) => toast.error("Update failed", { description: message(error) }),
  });
}

export function useDeleteRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (record: StudentRecord) => deleteRecord(record),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["records"] });
      void qc.invalidateQueries({ queryKey: ["audit_logs"] });
    },
    onError: (error) => toast.error("Delete failed", { description: message(error) }),
  });
}
