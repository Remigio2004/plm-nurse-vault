import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DOCUMENT_INFO, FOLDER_LABELS } from "@/data/document-catalog";
import {
  standardFileName,
  type DocumentType,
  type StudentDocument,
  type StudentWithRequirements,
} from "@/data/students";
import {
  downloadDocument,
  errorMessage,
  logStudentAudit,
  openDocument,
  validateUploadFile,
} from "@/lib/students-api";
import { useRemoveDocument, useReplaceDocument, useUploadDocument } from "@/lib/use-students";
import { runUploadQueue } from "@/lib/upload-queue";

interface Target {
  doc: StudentDocument;
  student: StudentWithRequirements;
}

/**
 * View / replace / delete for a student's documents, with the confirm dialog,
 * audit logging and hidden file input. Render `dialogs` once, inside the
 * component that uses this hook.
 */
export function useDocumentActions() {
  const replace = useReplaceDocument();
  const remove = useRemoveDocument();
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<Target | null>(null);
  const upload = useUploadDocument();
  const uploadTarget = useRef<{
    documentType: DocumentType;
    student: StudentWithRequirements;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Target | null>(null);
  const busy = replace.isPending || remove.isPending || upload.isPending;

  const openFile = (doc: StudentDocument) => {
    void openDocument(doc).catch((err) =>
      toast.error("Could not open document", { description: errorMessage(err) }),
    );
  };

  const downloadFile = (doc: StudentDocument) => {
    void downloadDocument(doc).catch((err) =>
      toast.error("Could not download document", { description: errorMessage(err) }),
    );
  };

  const startReplace = (doc: StudentDocument, student: StudentWithRequirements) => {
    uploadTarget.current = null;
    replaceTarget.current = { doc, student };
    if (inputRef.current) inputRef.current.multiple = false;
    inputRef.current?.click();
  };

  const startUpload = (documentType: DocumentType, student: StudentWithRequirements) => {
    replaceTarget.current = null;
    uploadTarget.current = { documentType, student };
    if (inputRef.current) inputRef.current.multiple = true;
    inputRef.current?.click();
  };

  const handleUploadFiles = async (files: File[]) => {
    const target = uploadTarget.current;
    uploadTarget.current = null;
    if (!target) return;
    const { documentType, student } = target;
    const label = DOCUMENT_INFO[documentType].label;
    await runUploadQueue(files, async (file) => {
      try {
        await validateUploadFile(file);
        await upload.mutateAsync({
          studentId: student.id,
          studentName: student.studentName,
          documentType,
          file,
        });
        await logStudentAudit({
          action: "upload",
          summary: student.studentName,
          details: {
            module: "master-file",
            requirement: label,
            folder: FOLDER_LABELS[DOCUMENT_INFO[documentType].folder],
            file: standardFileName(documentType, student.studentName),
          },
        }).catch(() => undefined);
        toast.success(`${label} uploaded`);
      } catch (err) {
        toast.error("Upload failed", { description: errorMessage(err) });
      }
    });
  };

  const requestDelete = (doc: StudentDocument, student: StudentWithRequirements) => {
    setPendingDelete({ doc, student });
  };

  const handleReplaceFile = async (file: File) => {
    const target = replaceTarget.current;
    replaceTarget.current = null;
    if (!target) return;
    const { doc, student } = target;
    const label = DOCUMENT_INFO[doc.documentType].label;
    try {
      await validateUploadFile(file);
      await replace.mutateAsync({ document: doc, studentName: student.studentName, file });
      await logStudentAudit({
        action: "upload",
        summary: student.studentName,
        details: {
          module: "master-file",
          requirement: label,
          folder: FOLDER_LABELS[doc.folder],
          file: standardFileName(doc.documentType, student.studentName),
          replaced: true,
        },
      }).catch(() => undefined);
      toast.success(`${label} replaced`);
    } catch (err) {
      toast.error("Replace failed", { description: errorMessage(err) });
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const { doc, student } = pendingDelete;
    setPendingDelete(null);
    const label = DOCUMENT_INFO[doc.documentType].label;
    try {
      await remove.mutateAsync(doc);
      toast.success(`${label} removed`);
    } catch (err) {
      toast.error("Could not delete", { description: errorMessage(err) });
    }
  };

  const dialogs = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          const file = files[0];
          e.target.value = "";
          if (!file) return;
          if (uploadTarget.current) void handleUploadFiles(files);
          else void handleReplaceFile(file);
        }}
      />
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${DOCUMENT_INFO[pendingDelete.doc.documentType].label} will be removed from ${pendingDelete.student.studentName}'s folder.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return { busy, openFile, downloadFile, startReplace, startUpload, requestDelete, dialogs };
}
