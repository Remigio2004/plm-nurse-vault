import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { uploadError as formatUploadError, UploadRequestError } from "@/lib/upload-queue";
import {
  DOCUMENT_INFO,
  allDocumentsForClassification,
  type FolderKey,
} from "@/data/document-catalog";
import {
  deriveFolders,
  attachmentFileName,
  type DocumentType,
  type Student,
  type StudentDocument,
  type StudentWithRequirements,
  type StudentTrashEntry,
} from "@/data/students";

const STUDENT_COLUMNS =
  "id, student_name, student_number, batch, classification, created_at, updated_at, deleted_at";
const DOCUMENT_COLUMNS =
  "id, student_id, document_type, folder, file_name, file_size, uploaded_at, cloudinary_public_id, storage_path, deleted_at";

// Files up to 10 MB go to Cloudinary through the student-docs edge
// function; anything larger goes straight to Supabase Storage.
const CLOUDINARY_LIMIT = 10 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

interface StudentRow {
  id: string;
  student_name: string;
  student_number: string | null;
  batch: string;
  classification: string;
  created_at: string;
  updated_at: string;
}

interface DocumentRow {
  id: string;
  student_id: string;
  document_type: DocumentType;
  folder: FolderKey;
  file_name: string;
  file_size: number | null;
  uploaded_at: string;
  cloudinary_public_id: string | null;
  storage_path: string | null;
  deleted_at: string | null;
}

function mapStudent(row: StudentRow): Student {
  return {
    id: row.id,
    studentName: row.student_name,
    studentNumber: row.student_number,
    batch: row.batch,
    classification: row.classification,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDocument(row: DocumentRow): StudentDocument {
  return {
    id: row.id,
    studentId: row.student_id,
    documentType: row.document_type,
    folder: row.folder,
    fileName: row.file_name,
    fileSize: row.file_size,
    uploadedAt: row.uploaded_at,
    cloudinaryPublicId: row.cloudinary_public_id,
    storagePath: row.storage_path,
    deletedAt: row.deleted_at,
  };
}

export async function fetchStudentsWithRequirements(): Promise<StudentWithRequirements[]> {
  const [students, documents] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("students")
        .select(STUDENT_COLUMNS)
        .is("deleted_at", null)
        .order("student_name")
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("student_documents")
        .select(`${DOCUMENT_COLUMNS}, students!inner(id)`)
        .is("deleted_at", null)
        .is("students.deleted_at", null)
        .order("id")
        .range(from, to),
    ),
  ]);

  const docsByStudent = new Map<string, StudentDocument[]>();
  for (const row of documents as DocumentRow[]) {
    const list = docsByStudent.get(row.student_id) ?? [];
    list.push(mapDocument(row));
    docsByStudent.set(row.student_id, list);
  }

  return (students as StudentRow[]).map((row) => {
    const documents = docsByStudent.get(row.id) ?? [];
    const { folders, overall } = deriveFolders(row.classification, documents);
    return { ...mapStudent(row), documents, folders, overall };
  });
}

export async function restoreDocument(documentId: string): Promise<void> {
  await manageStudentTrash({ action: "restore", id: documentId, kind: "document" });
}

export interface NewStudentInput {
  studentName: string;
  studentNumber?: string | null;
  batch: string;
  classification: string;
}

export async function createStudent(input: NewStudentInput): Promise<Student> {
  const { data, error } = await supabase
    .from("students")
    .insert({
      student_name: input.studentName,
      student_number: input.studentNumber?.trim() ? input.studentNumber.trim() : null,
      batch: input.batch,
      classification: input.classification,
    })
    .select(STUDENT_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error(`A folder for "${input.studentName}" already exists.`);
    }
    throw error;
  }
  return mapStudent(data as StudentRow);
}

/**
 * Reuses the existing folder when the (case-insensitive) name already
 * exists; otherwise creates it. Existing number/batch/classification win.
 */
export async function findOrCreateStudent(
  input: NewStudentInput,
): Promise<{ student: Student; created: boolean }> {
  const escaped = input.studentName.trim().replace(/[\\%_]/g, "\\$&");
  const { data: existing, error: findError } = await supabase
    .from("students")
    .select(STUDENT_COLUMNS)
    .ilike("student_name", escaped)
    .is("deleted_at", null)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return { student: mapStudent(existing as StudentRow), created: false };
  try {
    return { student: await createStudent(input), created: true };
  } catch (error) {
    // Another tab may have created the same active folder during this request.
    const { data } = await supabase
      .from("students")
      .select(STUDENT_COLUMNS)
      .ilike("student_name", escaped)
      .is("deleted_at", null)
      .maybeSingle();
    if (data) return { student: mapStudent(data), created: false };
    throw error;
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Unknown error";
}

export async function validateUploadFile(file: File): Promise<void> {
  if (
    !file.name.toLowerCase().endsWith(".pdf") ||
    new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !== "%PDF-"
  ) {
    throw new UploadRequestError("PDF only — the file must be a valid PDF.", 415);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new UploadRequestError("File too large — the limit is 20 MB per document.", 413);
  }
}

async function uploadBlob(
  file: File,
  uploadId: string = crypto.randomUUID(),
): Promise<{ cloudinaryPublicId: string | null; storagePath: string | null }> {
  if (file.size <= CLOUDINARY_LIMIT) {
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("uploadId", uploadId);
    const { data: uploadData, error: uploadError } = await supabase.functions.invoke(
      "student-docs",
      {
        body: formData,
      },
    );
    if (uploadError) throw await formatUploadError(uploadError);
    const publicId = (uploadData as { publicId?: string }).publicId;
    if (!publicId) throw new Error("Upload failed — try again.");
    return { cloudinaryPublicId: publicId, storagePath: null };
  }

  const storagePath = `documents/${uploadId}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("student-records")
    .upload(storagePath, file, { contentType: "application/pdf", upsert: false });
  if (
    uploadError &&
    !["409", "Duplicate"].includes(String(uploadError.statusCode ?? uploadError.name))
  )
    throw await formatUploadError(uploadError);
  return { cloudinaryPublicId: null, storagePath };
}

async function deleteBlob(params: {
  cloudinaryPublicId: string | null;
  storagePath: string | null;
}): Promise<void> {
  if (!params.cloudinaryPublicId && !params.storagePath) return;
  try {
    await supabase.functions.invoke("student-docs", {
      body: { action: "delete-blob", ...params },
    });
  } catch {
    // Best-effort cleanup — never block the main flow.
  }
}

/**
 * Upload one requirement file for a student. The locked filename is
 * derived from the student name; files <=10 MB go to Cloudinary via the
 * student-docs edge function, larger files to Supabase Storage.
 */
async function findUploadedDocument(
  id: string,
  studentId: string,
): Promise<StudentDocument | null> {
  const { data, error } = await supabase
    .from("student_documents")
    .select(DOCUMENT_COLUMNS)
    .eq("id", id)
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw await formatUploadError(error);
  if (!data) return null;
  if (data.deleted_at)
    throw new UploadRequestError(
      "This file is in Recently Deleted. Restore it instead of uploading it again.",
      409,
    );
  return mapDocument(data as DocumentRow);
}

export async function uploadDocument(params: {
  studentId: string;
  studentName: string;
  documentType: DocumentType;
  file: File;
  uploadId?: string;
}): Promise<StudentDocument> {
  const { studentId, studentName, documentType, file } = params;
  await validateUploadFile(file);
  const id = params.uploadId ?? crypto.randomUUID();
  const existing = await findUploadedDocument(id, studentId);
  if (existing) return existing;
  const blob = await uploadBlob(file, id);

  const fileName = attachmentFileName(documentType, studentName, id);
  const { data, error } = await supabase
    .from("student_documents")
    .insert({
      id,
      student_id: studentId,
      document_type: documentType,
      folder: DOCUMENT_INFO[documentType].folder,
      file_name: fileName,
      cloudinary_public_id: blob.cloudinaryPublicId,
      storage_path: blob.storagePath,
      file_size: file.size,
    })
    .select(DOCUMENT_COLUMNS)
    .single();
  if (error) {
    // The response may have been lost after a successful commit. Reconcile by ID.
    const committed = await findUploadedDocument(id, studentId);
    if (committed) return committed;
    const failure = await formatUploadError(error);
    if (failure.status >= 400 && failure.status < 500) await deleteBlob(blob);
    throw failure;
  }
  return mapDocument(data as DocumentRow);
}

/**
 * Replace the file behind an existing document row: upload the new blob,
 * repoint the row, then best-effort clean up the old blob.
 */
export async function replaceDocument(params: {
  document: StudentDocument;
  studentName: string;
  file: File;
  uploadId?: string;
}): Promise<StudentDocument> {
  const { document, studentName, file } = params;

  await validateUploadFile(file);
  const uploadId = params.uploadId ?? crypto.randomUUID();
  const committed = await findUploadedDocument(document.id, document.studentId);
  if (
    committed?.cloudinaryPublicId === `students/${uploadId}.pdf` ||
    committed?.storagePath === `documents/${uploadId}.pdf`
  )
    return committed;
  const blob = await uploadBlob(file, uploadId);

  const { data, error } = await supabase
    .from("student_documents")
    .update({
      cloudinary_public_id: blob.cloudinaryPublicId,
      storage_path: blob.storagePath,
      file_size: file.size,
      uploaded_at: new Date().toISOString(),
    })
    .eq("id", document.id)
    .select(DOCUMENT_COLUMNS)
    .single();
  if (error) {
    const saved = await findUploadedDocument(document.id, document.studentId);
    if (
      saved?.cloudinaryPublicId === blob.cloudinaryPublicId &&
      saved?.storagePath === blob.storagePath
    )
      return saved;
    const failure = await formatUploadError(error);
    if (failure.status >= 400 && failure.status < 500) await deleteBlob(blob);
    throw failure;
  }

  // The database trigger durably queues the old blob for cleanup.
  return mapDocument(data as DocumentRow);
}

/** Soft delete only — the blob remains restorable for 30 days. */
export async function removeDocument(doc: StudentDocument): Promise<void> {
  await manageStudentTrash({ action: "delete", id: doc.id, kind: "document" });
}

/**
 * Move a folder to trash; the documents and blobs remain restorable for 30 days.
 */
export async function deleteStudent(student: StudentWithRequirements): Promise<void> {
  await manageStudentTrash({ action: "delete", id: student.id, kind: "student" });
}

/** Move a selection of folders to trash in one database transaction. */
export async function deleteStudents(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.rpc("trash_student_folders", { p_ids: ids });
  if (error) throw error;
}

export async function manageStudentTrash(params: {
  action: "delete" | "restore" | "purge";
  id: string;
  kind: "student" | "document";
}): Promise<string> {
  const { data, error } = await supabase.rpc("manage_student_trash", {
    p_action: params.action,
    p_id: params.id,
    p_kind: params.kind,
  });
  if (error) throw error;
  if (params.action === "purge") {
    // Cleanup is durable even if this immediate wake-up cannot reach the worker.
    void supabase.functions.invoke("trash-cleanup", { body: {} }).catch(() => undefined);
  }
  return data;
}

export async function fetchStudentTrash(): Promise<StudentTrashEntry[]> {
  const [folders, documents] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("students")
        .select(`${STUDENT_COLUMNS}, student_documents(count)`)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("student_documents")
        .select(
          `${DOCUMENT_COLUMNS}, students!inner(student_name,student_number,batch,classification,deleted_at)`,
        )
        .not("deleted_at", "is", null)
        .is("students.deleted_at", null)
        .order("deleted_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
  ]);
  return [
    ...folders.map((s): StudentTrashEntry => ({
      id: s.id,
      kind: "student",
      studentName: s.student_name,
      studentNumber: s.student_number,
      batch: s.batch,
      classification: s.classification,
      fileName: null,
      fileCount: s.student_documents[0]?.count ?? 0,
      deletedAt: s.deleted_at!,
    })),
    ...documents.map((d): StudentTrashEntry => ({
      id: d.id,
      kind: "document",
      studentName: d.students.student_name,
      studentNumber: d.students.student_number,
      batch: d.students.batch,
      classification: d.students.classification,
      fileName: d.file_name,
      fileCount: 1,
      deletedAt: d.deleted_at!,
    })),
  ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/** Documents that no longer belong to a student after a classification change. */
export function classificationConflicts(
  documents: StudentDocument[],
  classification: string,
): StudentDocument[] {
  const allowed = new Set<DocumentType>(allDocumentsForClassification(classification));
  return documents.filter((d) => !allowed.has(d.documentType));
}

/** Download a private PDF using the record's filename, not its storage ID. */
export async function downloadDocument(doc: StudentDocument): Promise<void> {
  const { data, error } = await supabase.functions.invoke("student-docs", {
    body: { action: "download", documentId: doc.id },
  });
  if (error) throw error;
  if (!(data instanceof Blob)) throw new Error("No PDF returned");
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = doc.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Opens a document in a new tab through a short-lived signed link. */
export async function openDocument(doc: StudentDocument): Promise<void> {
  const { data, error } = await supabase.functions.invoke("student-docs", {
    body: { action: "open", documentId: doc.id },
  });
  if (error) throw error;
  const url = (data as { url?: string }).url;
  if (!url) throw new Error("No link returned");
  window.open(url, "_blank", "noopener");
}

/**
 * Edit a student's name, number, batch or classification. When the name
 * changes, the stored file_name of every live document is re-derived from
 * the locked naming convention (the blobs themselves don't move).
 */
export async function updateStudent(params: {
  student: StudentWithRequirements;
  studentName: string;
  studentNumber: string | null;
  batch: string;
  classification: string;
}): Promise<Student> {
  const { student, studentName, studentNumber, batch, classification } = params;

  const conflicts = classificationConflicts(student.documents, classification);
  if (conflicts.length > 0) {
    throw new Error(
      `Can't change classification: ${conflicts.length} file(s) don't belong to ${classification}. Remove them first.`,
    );
  }

  const { data, error } = await supabase
    .from("students")
    .update({
      student_name: studentName,
      student_number: studentNumber?.trim() ? studentNumber.trim() : null,
      batch,
      classification,
    })
    .eq("id", student.id)
    .select(STUDENT_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error(
        error.message.includes("students_number_uidx")
          ? `Student number "${studentNumber}" already belongs to another student.`
          : `A folder for "${studentName}" already exists.`,
      );
    }
    throw error;
  }

  if (studentName !== student.studentName) {
    const results = await Promise.all(
      student.documents.map((doc) =>
        supabase
          .from("student_documents")
          .update({ file_name: attachmentFileName(doc.documentType, studentName, doc.id) })
          .eq("id", doc.id),
      ),
    );
    const failed = results.filter((r) => r.error).length;
    if (failed > 0) {
      throw new Error(`Student saved, but ${failed} file name(s) could not be updated.`);
    }
  }

  return mapStudent(data as StudentRow);
}

export async function logStudentAudit(params: {
  action: string;
  summary: string;
  details?: Record<string, unknown> | null;
}): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Not signed in");
  const { error } = await supabase.from("audit_logs").insert({
    action: params.action,
    record_id: null,
    record_summary: params.summary,
    performed_by: user.id,
    performed_by_email: user.email ?? null,
    details: (params.details ?? null) as never,
  });
  if (error) throw error;
}
