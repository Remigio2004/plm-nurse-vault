import { supabase } from "@/integrations/supabase/client";
import {
  fileKindFromName,
  type AuditAction,
  type AuditLogEntry,
  type DeletedRecord,
  type RecordStatus,
  type StudentCategory,
  type StudentRecord,
} from "@/data/records";

export const RECORDS_BUCKET = "student-records";

const SAFE_COLUMNS =
  "id, student_name, student_number, batch, student_category, status, uploaded_at, updated_at, has_passkey";

type RecordRow = {
  id: string;
  student_name: string;
  student_number: string;
  batch: string;
  student_category: string;
  status: string;
  uploaded_at: string;
  updated_at: string;
  has_passkey: boolean;
};

const mapRecord = (row: RecordRow): StudentRecord => ({
  id: row.id,
  studentName: row.student_name,
  studentNumber: row.student_number,
  batch: row.batch,
  category: row.student_category as StudentCategory,
  status: row.status as RecordStatus,
  // Not readable until a passkey is verified — see Phase 2.
  fileName: null,
  fileType: null,
  fileSize: null,
  storagePath: null,
  hasPasskey: row.has_passkey,
  uploadedAt: row.uploaded_at,
  uploadDate: row.uploaded_at.slice(0, 10),
});

export async function fetchRecords(): Promise<StudentRecord[]> {
  const { data, error } = await supabase
    .from("records")
    .select(SAFE_COLUMNS)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return (data as RecordRow[]).map(mapRecord);
}

type DeletedRecordRow = RecordRow & { deleted_at: string };

export async function fetchDeletedRecords(): Promise<DeletedRecord[]> {
  const { data, error } = await supabase
    .from("records")
    .select(`${SAFE_COLUMNS}, deleted_at`)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) throw error;
  return (data as DeletedRecordRow[]).map((row) => ({
    id: row.id,
    studentName: row.student_name,
    studentNumber: row.student_number,
    batch: row.batch,
    category: row.student_category as StudentCategory,
    status: row.status as RecordStatus,
    deletedAt: row.deleted_at,
  }));
}

export async function logAudit(params: {
  action: AuditAction;
  recordId: string | null;
  recordSummary: string;
  details?: Record<string, unknown> | null;
}) {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Not signed in");
  const { error } = await supabase.from("audit_logs").insert({
    action: params.action,
    record_id: params.recordId,
    record_summary: params.recordSummary,
    performed_by: user.id,
    performed_by_email: user.email ?? null,
    details: (params.details ?? null) as never,
  });
  if (error) throw error;
}

const summaryOf = (r: { studentName: string; studentNumber: string }) =>
  `${r.studentName} (${r.studentNumber})`;

export async function createRecord(input: {
  studentName: string;
  studentNumber: string;
  batch: string;
  category: StudentCategory;
  status: RecordStatus;
  file: File;
  passkey: string;
}): Promise<StudentRecord> {
  const ext = input.file.name.includes(".") ? input.file.name.split(".").pop()! : "bin";
  const storagePath = `${input.batch}/${crypto.randomUUID()}.${ext}`.replace(/\s+/g, "_");

  const upload = await supabase.storage
    .from(RECORDS_BUCKET)
    .upload(storagePath, input.file, input.file.type ? { contentType: input.file.type } : {});
  if (upload.error) throw upload.error;

  const { data, error } = await supabase
    .from("records")
    .insert({
      student_name: input.studentName,
      student_number: input.studentNumber,
      batch: input.batch,
      student_category: input.category,
      status: input.status,
      storage_path: storagePath,
      file_name: input.file.name,
      file_type: ext.toLowerCase(),
      file_size: input.file.size,
      passkey_hash: input.passkey.trim(),
    })
    .select(SAFE_COLUMNS)
    .single();

  if (error) {
    await supabase.storage.from(RECORDS_BUCKET).remove([storagePath]);
    throw error;
  }

  const record = mapRecord(data as RecordRow);
  await logAudit({
    action: "upload",
    recordId: record.id,
    recordSummary: summaryOf(record),
    details: { file_name: record.fileName, folder: `${record.batch}/${record.category}/${record.status}` },
  });
  return record;
}

export async function updateRecord(
  record: StudentRecord,
  patch: {
    studentName?: string;
    studentNumber?: string;
    batch?: string;
    category?: StudentCategory;
    status?: RecordStatus;
  },
): Promise<void> {
  const payload: Record<string, unknown> = {};
  const changed: Record<string, unknown> = {};
  if (patch.studentName && patch.studentName !== record.studentName) {
    payload["student_name"] = patch.studentName;
    changed["student_name"] = { from: record.studentName, to: patch.studentName };
  }
  if (patch.studentNumber && patch.studentNumber !== record.studentNumber) {
    payload["student_number"] = patch.studentNumber;
    changed["student_number"] = { from: record.studentNumber, to: patch.studentNumber };
  }
  if (patch.batch && patch.batch !== record.batch) {
    payload["batch"] = patch.batch;
    changed["batch"] = { from: record.batch, to: patch.batch };
  }
  if (patch.category && patch.category !== record.category) {
    payload["student_category"] = patch.category;
    changed["student_category"] = { from: record.category, to: patch.category };
  }
  if (patch.status && patch.status !== record.status) {
    payload["status"] = patch.status;
    changed["status"] = { from: record.status, to: patch.status };
  }
  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase
    .from("records")
    .update(payload as never)
    .eq("id", record.id);
  if (error) throw error;

  await logAudit({
    action: "edit",
    recordId: record.id,
    recordSummary: summaryOf(record),
    details: { changed },
  });
}

type FileAccessAction = "open" | "unlock" | "rename" | "delete";

async function callFileAccess<T = unknown>(
  action: FileAccessAction,
  recordId: string,
  passkey: string | null,
  extra?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("file-access", {
    body: { recordId, passkey, action, ...extra },
  });
  if (error) {
    let msg = error.message ?? "Request failed";
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === "function") {
      try {
        const body = await response.json();
        if (body?.error) msg = body.error;
      } catch {
        // fall back to error.message
      }
    }
    throw new Error(msg);
  }
  return data as T;
}

export async function unlockFileInfo(
  record: StudentRecord,
  passkey: string | null,
): Promise<{ fileName: string; fileType: string; fileSize: number }> {
  return callFileAccess("unlock", record.id, passkey);
}

export async function renameFile(
  record: StudentRecord,
  passkey: string | null,
  newFileName: string,
): Promise<void> {
  await callFileAccess("rename", record.id, passkey, { newFileName });
}

export async function deleteRecord(record: StudentRecord, passkey: string | null): Promise<void> {
  // Soft delete — the Edge Function marks deleted_at, it no longer removes
  // the row itself. See "Recently Deleted" (restoreRecord/purgeRecord).
  await callFileAccess("delete", record.id, passkey);

  await logAudit({
    action: "delete",
    recordId: record.id,
    recordSummary: summaryOf(record),
    details: { file_name: record.fileName },
  });
}

export async function restoreRecord(recordId: string): Promise<void> {
  await callFileAccess("restore", recordId, null);
}

export async function purgeRecord(recordId: string): Promise<void> {
  await callFileAccess("purge", recordId, null);
}

export async function createSignedUrl(record: StudentRecord, passkey: string | null): Promise<string> {
  const { url } = await callFileAccess<{ url: string }>("open", record.id, passkey);
  return url;
}

type AuditRow = {
  id: string;
  action: string;
  record_id: string | null;
  record_summary: string;
  performed_by_email: string | null;
  timestamp: string;
  details: Record<string, unknown> | null;
};

export async function fetchAuditLogs(): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .order("timestamp", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data as AuditRow[]).map((row) => ({
    id: row.id,
    action: row.action as AuditLogEntry["action"],
    recordId: row.record_id,
    recordSummary: row.record_summary,
    performedByEmail: row.performed_by_email,
    timestamp: row.timestamp,
    details: row.details,
  }));
}
