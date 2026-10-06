import { supabase } from "@/integrations/supabase/client";
import {
  deriveRequirements,
  standardFileName,
  type DocumentType,
  type Student,
  type StudentDocument,
  type StudentWithRequirements,
} from "@/data/students";

const STUDENT_COLUMNS = "id, student_name, student_number, batch, classification, created_at, updated_at";
const DOCUMENT_COLUMNS =
  "id, student_id, document_type, file_name, file_size, uploaded_at, cloudinary_public_id, storage_path";

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
  file_name: string;
  file_size: number | null;
  uploaded_at: string;
  cloudinary_public_id: string | null;
  storage_path: string | null;
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
    fileName: row.file_name,
    fileSize: row.file_size,
    uploadedAt: row.uploaded_at,
    cloudinaryPublicId: row.cloudinary_public_id,
    storagePath: row.storage_path,
  };
}

export async function fetchStudentsWithRequirements(): Promise<StudentWithRequirements[]> {
  const [studentsRes, documentsRes] = await Promise.all([
    supabase.from("students").select(STUDENT_COLUMNS).order("student_name", { ascending: true }),
    supabase.from("student_documents").select(DOCUMENT_COLUMNS).is("deleted_at", null),
  ]);
  if (studentsRes.error) throw studentsRes.error;
  if (documentsRes.error) throw documentsRes.error;

  const docsByStudent = new Map<string, StudentDocument[]>();
  for (const row of (documentsRes.data ?? []) as DocumentRow[]) {
    const list = docsByStudent.get(row.student_id) ?? [];
    list.push(mapDocument(row));
    docsByStudent.set(row.student_id, list);
  }

  return ((studentsRes.data ?? []) as StudentRow[]).map((row) => {
    const documents = docsByStudent.get(row.id) ?? [];
    const { requirements, overall } = deriveRequirements(documents);
    return { ...mapStudent(row), documents, requirements, overall };
  });
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

export async function validateUploadFile(file: File): Promise<void> {
  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("PDF only — the enforced format is PDF.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("File too large — the limit is 20 MB per document.");
  }
}

async function uploadBlob(
  studentName: string,
  documentType: DocumentType,
  file: File,
): Promise<{ cloudinaryPublicId: string | null; storagePath: string | null }> {
  if (file.size <= CLOUDINARY_LIMIT) {
    const formData = new FormData();
    formData.append("file", file, file.name);
    const { data: uploadData, error: uploadError } = await supabase.functions.invoke("student-docs", {
      body: formData,
    });
    if (uploadError) throw uploadError;
    const publicId = (uploadData as { publicId?: string }).publicId;
    if (!publicId) throw new Error("Upload failed — try again.");
    return { cloudinaryPublicId: publicId, storagePath: null };
  }

  const folder = studentName.trim();
  const storagePath = `${folder}/${standardFileName(documentType, studentName)}`;
  const { error: uploadError } = await supabase.storage
    .from("student-records")
    .upload(storagePath, file, { contentType: "application/pdf", upsert: true });
  if (uploadError) throw uploadError;
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
export async function uploadDocument(params: {
  studentId: string;
  studentName: string;
  documentType: DocumentType;
  file: File;
}): Promise<StudentDocument> {
  const { studentId, studentName, documentType, file } = params;

  const blob = await uploadBlob(studentName, documentType, file);

  const fileName = standardFileName(documentType, studentName);
  const { data, error } = await supabase
    .from("student_documents")
    .insert({
      student_id: studentId,
      document_type: documentType,
      file_name: fileName,
      cloudinary_public_id: blob.cloudinaryPublicId,
      storage_path: blob.storagePath,
      file_size: file.size,
    })
    .select(DOCUMENT_COLUMNS)
    .single();
  if (error) {
    // Roll back the uploaded blob if the row failed (e.g. duplicate type).
    await deleteBlob(blob);
    throw error;
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
}): Promise<StudentDocument> {
  const { document, studentName, file } = params;

  const blob = await uploadBlob(studentName, document.documentType, file);

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
    await deleteBlob(blob);
    throw error;
  }

  await deleteBlob({
    cloudinaryPublicId: document.cloudinaryPublicId,
    storagePath: document.storagePath,
  });
  return mapDocument(data as DocumentRow);
}

/** Soft delete only — the blob stays for future restore/purge tooling. */
export async function removeDocument(doc: StudentDocument): Promise<void> {
  const { error } = await supabase
    .from("student_documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", doc.id);
  if (error) throw error;
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
