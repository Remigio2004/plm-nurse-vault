export type StudentCategory = "HD Student" | "RLE Student";
export type RecordStatus = "Regular" | "Irregular";
export type FileKind = "pdf" | "docx" | "xlsx";

export interface StudentRecord {
  id: string;
  studentName: string;
  studentNumber: string;
  batch: string;
  category: StudentCategory;
  status: RecordStatus;
  fileName: string;
  fileType: FileKind;
  fileSize: number | null;
  storagePath: string;
  uploadDate: string;
  uploadedAt: string;
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
