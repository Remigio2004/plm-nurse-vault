// Master File domain model.

import {
  FOLDERS,
  documentFileToken,
  foldersForClassification,
  type DocumentType,
  type FolderKey,
} from "@/data/document-catalog";

export type { DocumentType, FolderKey };

export type FolderStatus = "Submitted" | "Missing" | "N/A";

export type OverallStatus = "Complete" | "Incomplete";

export interface Student {
  id: string;
  studentName: string;
  studentNumber: string | null;
  batch: string;
  classification: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentDocument {
  id: string;
  studentId: string;
  documentType: DocumentType;
  folder: FolderKey;
  fileName: string;
  fileSize: number | null;
  uploadedAt: string;
  cloudinaryPublicId: string | null;
  storagePath: string | null;
}

export interface FolderSummary {
  status: FolderStatus;
  count: number;
}

export interface StudentWithRequirements extends Student {
  folders: Record<FolderKey, FolderSummary>;
  documents: StudentDocument[];
  overall: OverallStatus;
}

export type StudentClassification = "CN Graduate" | "CN Honorable Dismissal" | "CN Others";

export const CLASSIFICATIONS: StudentClassification[] = [
  "CN Graduate",
  "CN Honorable Dismissal",
  "CN Others",
];

/**
 * Name format: "Lastname, Firstname Middlename" (Title Case).
 * Returns null when the input has no "Lastname, Firstname" shape.
 */
export function formatStudentName(raw: string): string | null {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned.includes(",")) return null;
  const [lastRaw = "", restRaw = ""] = cleaned.split(",", 2);
  const last = titleCase(lastRaw.trim());
  const rest = titleCase(restRaw.trim());
  if (!last || !rest) return null;
  return `${last}, ${rest}`;
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * The storage folder for a student: their display name, used verbatim.
 */
export function studentFolderName(studentName: string): string {
  return studentName.trim();
}

/**
 * File-name fragment: "Dela Cruz, Juan Pandoro" -> "DelaCruzJuanPandoro"
 */
export function studentNameToken(studentName: string): string {
  return studentName
    .replace(/,/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

/**
 * Locked naming convention: DocumentKey_StudentName.pdf
 * e.g. AdmissionSlip_DelaCruzJuanPandoro.pdf
 */
export function standardFileName(documentType: DocumentType, studentName: string): string {
  return `${documentFileToken(documentType)}_${studentNameToken(studentName)}.pdf`;
}

/**
 * Per-folder status from the documents a student has.
 * Applicable folder with >= 1 file = Submitted, empty = Missing,
 * folder that doesn't apply to the classification = N/A.
 * Overall is Complete when every applicable folder has a file.
 */
export function deriveFolders(
  classification: string,
  documents: StudentDocument[],
): { folders: Record<FolderKey, FolderSummary>; overall: OverallStatus } {
  const applicable = new Set(foldersForClassification(classification));
  const folders = {} as Record<FolderKey, FolderSummary>;
  let complete = true;

  for (const folder of FOLDERS) {
    const count = documents.filter((d) => d.folder === folder).length;
    if (!applicable.has(folder)) {
      folders[folder] = { status: "N/A", count };
      continue;
    }
    folders[folder] = { status: count > 0 ? "Submitted" : "Missing", count };
    if (count === 0) complete = false;
  }

  return { folders, overall: complete ? "Complete" : "Incomplete" };
}
