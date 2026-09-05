import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { RecordStatus, StudentCategory, StudentRecord } from "@/data/records";
import { auditLogsQuery, deletedRecordsQuery, recordsQuery } from "./queries";
import {
  createRecord,
  deleteRecord,
  purgeRecord,
  renameFile,
  restoreRecord,
  updateRecord,
} from "./records-api";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Unexpected error. Please try again.";

export function useRecords() {
  return useQuery(recordsQuery);
}

export function useAuditLogs() {
  return useQuery(auditLogsQuery);
}

export function useDeletedRecords() {
  return useQuery(deletedRecordsQuery);
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
      patch: {
        studentName?: string;
        studentNumber?: string;
        batch?: string;
        category?: StudentCategory;
        status?: RecordStatus;
      };
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
    mutationFn: (vars: { record: StudentRecord; passkey: string | null }) =>
      deleteRecord(vars.record, vars.passkey),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["records"] });
      void qc.invalidateQueries({ queryKey: ["deleted_records"] });
      void qc.invalidateQueries({ queryKey: ["audit_logs"] });
    },
    onError: (error) => toast.error("Delete failed", { description: message(error) }),
  });
}

export function useRenameFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { record: StudentRecord; passkey: string | null; newFileName: string }) =>
      renameFile(vars.record, vars.passkey, vars.newFileName),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["records"] });
      void qc.invalidateQueries({ queryKey: ["audit_logs"] });
    },
    onError: (error) => toast.error("Rename failed", { description: message(error) }),
  });
}

export function useRestoreRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recordId: string) => restoreRecord(recordId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["records"] });
      void qc.invalidateQueries({ queryKey: ["deleted_records"] });
      void qc.invalidateQueries({ queryKey: ["audit_logs"] });
    },
    onError: (error) => toast.error("Restore failed", { description: message(error) }),
  });
}

export function usePurgeRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recordId: string) => purgeRecord(recordId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["deleted_records"] });
      void qc.invalidateQueries({ queryKey: ["audit_logs"] });
    },
    onError: (error) => toast.error("Permanent delete failed", { description: message(error) }),
  });
}
