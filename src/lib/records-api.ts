import { supabase } from "@/integrations/supabase/client";
import {
  fileKindFromName,
  type AuditAction,
  type AuditLogEntry,
  type RecordStatus,
  type StudentCategory,
  type StudentRecord,
} from "@/data/records";

export const RECORDS_BUCKET = "student-records";

type RecordRow = {
  id: string;
  student_name: string;
  student_number: string;
  batch: string;
  student_category: string;
  status: string;
  storage_path: string;
  file_name: string;
  file_type: string;
  file_size: number | null;
  uploaded_at: string;
  updated_at: string;
};

const mapRecord = (row: RecordRow): StudentRecord => ({
  id: row.id,
  studentName: row.student_name,
  studentNumber: row.student_number,
  batch: row.batch,
  category: row.student_category as StudentCategory,
  status: row.status as RecordStatus,
  fileName: row.file_name,
  fileType: fileKindFromName(row.file_type ? `x.${row.file_type}` : row.file_name),
  fileSize: row.file_size,
  storagePath: row.storage_path,
  uploadedAt: row.uploaded_at,
  uploadDate: row.uploaded_at.slice(0, 10),
});

export async function fetchRecords(): Promise<StudentRecord[]> {
  const { data, error } = await supabase
    .from("records")
    .select("*")
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return (data as RecordRow[]).map(mapRecord);
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
    details: params.details ?? null,
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
}): Promise<StudentRecord> {
  const ext = input.file.name.includes(".") ? input.file.name.split(".").pop()! : "bin";
  const storagePath = `${input.batch}/${crypto.randomUUID()}.${ext}`.replace(/\s+/g, "_");

  const upload = await supabase.storage
    .from(RECORDS_BUCKET)
    .upload(storagePath, input.file, { contentType: input.file.type || undefined });
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
    })
    .select("*")
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
  patch: { fileName?: string; studentName?: string; studentNumber?: string },
): Promise<void> {
  const payload: Record<string, unknown> = {};
  const changed: Record<string, unknown> = {};
  if (patch.fileName && patch.fileName !== record.fileName) {
    payload["file_name"] = patch.fileName;
    changed["file_name"] = { from: record.fileName, to: patch.fileName };
  }
  if (patch.studentName && patch.studentName !== record.studentName) {
    payload["student_name"] = patch.studentName;
    changed["student_name"] = { from: record.studentName, to: patch.studentName };
  }
  if (patch.studentNumber && patch.studentNumber !== record.studentNumber) {
    payload["student_number"] = patch.studentNumber;
    changed["student_number"] = { from: record.studentNumber, to: patch.studentNumber };
  }
  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase.from("records").update(payload).eq("id", record.id);
  if (error) throw error;

  await logAudit({
    action: "edit",
    recordId: record.id,
    recordSummary: summaryOf(record),
    details: { changed },
  });
}

export async function deleteRecord(record: StudentRecord): Promise<void> {
  await logAudit({
    action: "delete",
    recordId: record.id,
    recordSummary: summaryOf(record),
    details: { file_name: record.fileName },
  });

  const removal = await supabase.storage.from(RECORDS_BUCKET).remove([record.storagePath]);
  if (removal.error) throw removal.error;

  const { error } = await supabase.from("records").delete().eq("id", record.id);
  if (error) throw error;
}

export async function createSignedUrl(record: StudentRecord): Promise<string> {
  const { data, error } = await supabase.storage
    .from(RECORDS_BUCKET)
    .createSignedUrl(record.storagePath, 60);
  if (error) throw error;
  await logAudit({
    action: "view",
    recordId: record.id,
    recordSummary: summaryOf(record),
    details: { file_name: record.fileName },
  });
  return data.signedUrl;
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
