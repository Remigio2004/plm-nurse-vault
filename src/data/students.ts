// Master File domain model.

export const DOCUMENT_TYPES = [
  "TOR",
  "HonorableDismissal",
  "CurriculumChecklist",
  "StudyPlan",
  "LibraryCard",
  "Other",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

// The five requirements that must all be present for an overall Complete.
export const REQUIRED_DOCUMENT_TYPES: readonly DocumentType[] = [
  "TOR",
  "HonorableDismissal",
  "CurriculumChecklist",
  "StudyPlan",
  "LibraryCard",
];

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  TOR: "Transcript of Records",
  HonorableDismissal: "Honorable Dismissal",
  CurriculumChecklist: "Curriculum Checklist",
  StudyPlan: "Study Plan",
  LibraryCard: "Library Card",
  Other: "Other Document",
};

// Short headers for the tracker table columns.
export const DOCUMENT_SHORT_LABELS: Record<DocumentType, string> = {
  TOR: "TOR",
  HonorableDismissal: "HD",
  CurriculumChecklist: "CC",
  StudyPlan: "SP",
  LibraryCard: "LC",
  Other: "Other",
};

// Filename tokens: no spaces, PascalCase per word.
export const DOCUMENT_FILE_TOKENS: Record<DocumentType, string> = {
  TOR: "TranscriptOfRecords",
  HonorableDismissal: "HonorableDismissal",
  CurriculumChecklist: "CurriculumChecklist",
  StudyPlan: "StudyPlan",
  LibraryCard: "LibraryCard",
  Other: "OtherDocument",
};

export type RequirementStatus = "Submitted" | "Missing";

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
  fileName: string;
  fileSize: number | null;
  uploadedAt: string;
  cloudinaryPublicId: string | null;
  storagePath: string | null;
}

export interface StudentWithRequirements extends Student {
  requirements: Record<DocumentType, RequirementStatus>;
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
 * Locked naming convention: DocumentType_StudentName.pdf
 * e.g. TranscriptOfRecords_DelaCruzJuanPandoro.pdf
 */
export function standardFileName(documentType: DocumentType, studentName: string): string {
  return `${DOCUMENT_FILE_TOKENS[documentType]}_${studentNameToken(studentName)}.pdf`;
}

/**
 * Derive per-requirement statuses and the overall status from the
 * documents a student has. File present = Submitted, absent = Missing.
 * Overall is Complete only when all five requirements are present.
 */
export function deriveRequirements(documents: StudentDocument[]): {
  requirements: Record<DocumentType, RequirementStatus>;
  overall: OverallStatus;
} {
  const present = new Set(documents.map((d) => d.documentType));
  const requirements = {} as Record<DocumentType, RequirementStatus>;
  let allComplete = true;

  for (const type of REQUIRED_DOCUMENT_TYPES) {
    const status: RequirementStatus = present.has(type) ? "Submitted" : "Missing";
    requirements[type] = status;
    if (status !== "Submitted") allComplete = false;
  }
  requirements.Other = present.has("Other") ? "Submitted" : "Missing";

  return { requirements, overall: allComplete ? "Complete" : "Incomplete" };
}
