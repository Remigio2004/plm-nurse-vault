export type StudentCategory = "CN Graduate" | "CN Honorable Dismissal" | "CN Transferee" | "CN Others";
export type RecordStatus = "Regular" | "Irregular";
export type FileKind = "pdf" | "docx" | "xlsx";

export interface StudentRecord {
  id: string;
  studentName: string;
  studentNumber: string;
  batch: string;
  category: StudentCategory;
  status: RecordStatus;
  // File details are only known once a correct passkey has been verified
  // server-side; the base list fetch never receives them.
  fileName: string | null;
  fileType: FileKind | null;
  fileSize: number | null;
  storagePath: string | null;
  uploadDate: string;
  uploadedAt: string;
  hasPasskey: boolean;
}

export type AuditAction = "upload" | "edit" | "delete" | "view";

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  recordId: string | null;
  recordSummary: string;
  performedByEmail: string | null;
  timestamp: string;
  details: Record<string, unknown> | null;
}

export const fileKindFromName = (name: string): FileKind => {
  const lower = name.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv")) return "xlsx";
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) return "docx";
  return "pdf";
};
