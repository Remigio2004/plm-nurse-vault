export type StudentCategory = "CN Graduate" | "CN Honorable Dismissal" | "CN Others";
export type RecordStatus = "Regular" | "Irregular" | "N/A";
export type FileKind = "pdf" | "docx" | "xlsx";

export interface StudentRecord {
  id: string;
  studentName: string;
  studentNumber: string;
  batch: string;
  category: StudentCategory;
  status: RecordStatus;
  // File name/type/size are fetched on demand via the file-access Edge
  // Function's "unlock" action — storage/Cloudinary identifiers stay
  // server-side only.
  fileName: string | null;
  fileType: FileKind | null;
  fileSize: number | null;
  storagePath: string | null;
  uploadDate: string;
  uploadedAt: string;
}

export type AuditAction = "upload" | "edit" | "delete" | "view" | "restore" | "purge";

export interface DeletedRecord {
  id: string;
  studentName: string;
  studentNumber: string;
  batch: string;
  category: StudentCategory;
  status: RecordStatus;
  deletedAt: string;
}

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
