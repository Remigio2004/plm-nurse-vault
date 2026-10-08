// Browse Folders tree — derived from the Master File (students + student_documents).
//
//   Batch → Classification → Student → Folder → files
//
// Nothing here is stored. A folder exists because a student/document exists,
// so every upload shows up in Browse with no extra writes and no sync step:
// Browse reads the same ["students"] query that Upload already invalidates.
//
// Path segments are plain strings, in this order:
//   [batch, classification, studentId, folderKey]
// The student segment is the student's id (not the name) so renaming a student
// or two students sharing a name can't break the path.

import {
  DOCUMENT_INFO,
  FOLDERS,
  FOLDER_LABELS,
  compareDocumentTypes,
  foldersForClassification,
  type FolderKey,
} from "@/data/document-catalog";
import {
  CLASSIFICATIONS,
  type StudentDocument,
  type StudentWithRequirements,
} from "@/data/students";

export const BROWSE_LEVELS = ["batch", "classification", "student", "folder"] as const;
export type BrowseLevel = (typeof BROWSE_LEVELS)[number];

/** Path length at which the view shows files instead of sub-folders. */
export const FILE_DEPTH = BROWSE_LEVELS.length;

const CLASSIFICATION_ORDER: string[] = [...CLASSIFICATIONS];

export interface BrowseNode {
  /** Value to append to the path when this folder is opened. */
  key: string;
  label: string;
  level: BrowseLevel;
  /** Students for batch/classification folders; files for student/folder. */
  count: number;
  unit: "student" | "file";
  subtitle: string | null;
}

export interface FolderContents {
  student: StudentWithRequirements;
  folder: FolderKey;
  documents: StudentDocument[];
}

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

const rankOf = (order: string[], value: string) => {
  const index = order.indexOf(value);
  return index === -1 ? order.length : index;
};

function inScope(student: StudentWithRequirements, path: string[]): boolean {
  const [batch, classification, studentId] = path;
  if (batch !== undefined && student.batch !== batch) return false;
  if (classification !== undefined && student.classification !== classification) return false;
  if (studentId !== undefined && student.id !== studentId) return false;
  return true;
}

/** Students that sit under the given path (only the first three segments narrow it). */
export function scopeStudents(
  students: StudentWithRequirements[],
  path: string[],
): StudentWithRequirements[] {
  return students.filter((s) => inScope(s, path));
}

/** Files of one folder: A–Z by document name, "Others" always last. */
export function folderDocuments(
  student: StudentWithRequirements,
  folder: FolderKey,
): StudentDocument[] {
  return student.documents
    .filter((d) => d.folder === folder)
    .sort((a, b) => compareDocumentTypes(a.documentType, b.documentType));
}

/**
 * Folders shown inside a student: the ones that apply to the classification
 * (CN Graduate → Academic + Others, otherwise all three), plus any folder that
 * already holds files so nothing is ever hidden after a classification change.
 */
export function visibleFolders(student: StudentWithRequirements): FolderKey[] {
  const applicable = new Set(foldersForClassification(student.classification));
  return FOLDERS.filter((f) => applicable.has(f) || student.documents.some((d) => d.folder === f));
}

function groupNodes(
  scoped: StudentWithRequirements[],
  level: BrowseLevel,
  keyOf: (student: StudentWithRequirements) => string,
  labelOf: (key: string) => string,
  compare: (a: string, b: string) => number,
): BrowseNode[] {
  const counts = new Map<string, number>();
  for (const student of scoped) {
    const key = keyOf(student);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts, ([key, count]): BrowseNode => ({
    key,
    label: labelOf(key),
    level,
    count,
    unit: "student",
    subtitle: null,
  })).sort((a, b) => compare(a.key, b.key));
}

function studentNode(student: StudentWithRequirements): BrowseNode {
  return {
    key: student.id,
    label: student.studentName,
    level: "student",
    count: student.documents.length,
    unit: "file",
    subtitle: student.studentNumber ?? "No student no.",
  };
}

function folderNode(student: StudentWithRequirements, folder: FolderKey): BrowseNode {
  return {
    key: folder,
    label: FOLDER_LABELS[folder],
    level: "folder",
    count: student.documents.filter((d) => d.folder === folder).length,
    unit: "file",
    subtitle: null,
  };
}

/**
 * The sub-folders to show at `path`. Empty once the path is deep enough to
 * show files (see `folderContents`).
 */
export function childNodes(students: StudentWithRequirements[], path: string[]): BrowseNode[] {
  if (path.length >= FILE_DEPTH) return [];
  const scoped = scopeStudents(students, path);

  if (path.length === 0) {
    return groupNodes(
      scoped,
      "batch",
      (s) => s.batch,
      (k) => `Batch ${k}`,
      byText,
    );
  }
  if (path.length === 1) {
    return groupNodes(
      scoped,
      "classification",
      (s) => s.classification,
      (k) => k,
      (a, b) => rankOf(CLASSIFICATION_ORDER, a) - rankOf(CLASSIFICATION_ORDER, b) || byText(a, b),
    );
  }
  if (path.length === 2) {
    return scoped
      .map(studentNode)
      .sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
  }

  // path.length === 3 → the student's own folders
  const student = scoped[0];
  if (!student) return [];
  return visibleFolders(student).map((folder) => folderNode(student, folder));
}

/** The files of the folder at a full-depth path, or null while the path is shallower. */
export function folderContents(
  students: StudentWithRequirements[],
  path: string[],
): FolderContents | null {
  if (path.length < FILE_DEPTH) return null;
  const student = scopeStudents(students, path)[0];
  const folder = FOLDERS.find((f) => f === path[3]);
  if (!student || !folder) return null;
  return {
    student,
    folder,
    documents: folderDocuments(student, folder),
  };
}

/** Human labels for each path segment — used by the breadcrumb. */
export function pathLabels(students: StudentWithRequirements[], path: string[]): string[] {
  return path.map((key, i) => {
    const match = childNodes(students, path.slice(0, i)).find((n) => n.key === key);
    return match?.label ?? key;
  });
}

/**
 * Cuts the path at the first segment that no longer exists, e.g. after a
 * student's batch or classification is edited while someone is browsing inside
 * it. Returns the same array when nothing changed.
 */
export function normalizePath(students: StudentWithRequirements[], path: string[]): string[] {
  for (let i = 0; i < path.length; i++) {
    const exists = childNodes(students, path.slice(0, i)).some((n) => n.key === path[i]);
    if (!exists) return path.slice(0, i);
  }
  return path;
}

/** Name, student no., batch, classification, file names and document labels. */
export function studentMatchesQuery(student: StudentWithRequirements, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    student.studentName,
    student.studentNumber ?? "",
    student.batch,
    `batch ${student.batch}`,
    student.classification,
    ...student.documents.flatMap((d) => [
      d.fileName,
      DOCUMENT_INFO[d.documentType].label,
      FOLDER_LABELS[d.folder],
    ]),
  ];
  return haystack.some((value) => value.toLowerCase().includes(q));
}

export function searchStudents(
  students: StudentWithRequirements[],
  query: string,
): StudentWithRequirements[] {
  return students.filter((s) => studentMatchesQuery(s, query));
}
