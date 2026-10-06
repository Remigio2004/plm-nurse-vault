import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useRef } from "react";
import { format } from "date-fns";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DOCUMENT_LABELS,
  DOCUMENT_TYPES,
  REQUIRED_DOCUMENT_TYPES,
  standardFileName,
  type DocumentType,
  type RequirementStatus,
  type StudentDocument,
  type StudentWithRequirements,
} from "@/data/students";
import { supabase } from "@/integrations/supabase/client";
import { logStudentAudit, validateUploadFile } from "@/lib/students-api";
import {
  useRemoveDocument,
  useReplaceDocument,
  useStudents,
  useUploadDocument,
} from "@/lib/use-students";

export const Route = createFileRoute("/_authenticated/master-file/$studentId")({
  head: () => ({
    meta: [{ title: "Student Folder — NurseVault Master File" }],
  }),
  component: StudentFolderPage,
});

const STATUS_PILL_CLASS: Record<RequirementStatus, string> = {
  Submitted: "bg-primary-soft text-primary",
  Missing: "bg-destructive/10 text-destructive",
};

function formatBytes(size: number | null): string {
  if (size == null) return "";
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function DocumentCard({
  student,
  type,
  doc,
  optional = false,
  onUpload,
  onReplace,
  onRemove,
  onOpen,
  busy,
}: {
  student: StudentWithRequirements;
  type: DocumentType;
  doc: StudentDocument | undefined;
  optional?: boolean;
  onUpload: (type: DocumentType, file: File) => Promise<void>;
  onReplace: (doc: StudentDocument, file: File) => Promise<void>;
  onRemove: (doc: StudentDocument) => Promise<void>;
  onOpen: (doc: StudentDocument) => Promise<void>;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const status: RequirementStatus = doc ? "Submitted" : "Missing";
  const fileName = standardFileName(type, student.studentName);

  const handleFile = (file: File) => {
    if (doc) {
      void onReplace(doc, file);
    } else {
      void onUpload(type, file);
    }
  };

  return (
    <div className={`vault-card flex flex-col p-5 ${optional && !doc ? "border-dashed" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{DOCUMENT_LABELS[type]}</h3>
          {optional && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Optional — hindi binibilang sa 5 requirements.
            </p>
          )}
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-lg px-2 py-1 text-xs font-semibold ${STATUS_PILL_CLASS[status]}`}
        >
          {status}
        </span>
      </div>

      <div
        className={`mt-4 break-all rounded-lg border px-3 py-2 font-mono text-xs ${
          doc
            ? "border-border bg-surface text-foreground"
            : "border-dashed border-border bg-surface/60 text-muted-foreground"
        }`}
      >
        {fileName}
      </div>

      <p className="mt-2 min-h-4 text-xs text-muted-foreground">
        {doc
          ? [formatBytes(doc.fileSize), format(new Date(doc.uploadedAt), "MMM d, yyyy")]
              .filter(Boolean)
              .join(" · ")
          : "No file yet"}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {doc ? (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void onOpen(doc)}
              className="rounded-lg"
            >
              View
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="rounded-lg"
            >
              Replace
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void onRemove(doc)}
              className="rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              Delete
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg bg-primary text-primary-foreground hover:bg-secondary"
          >
            Upload PDF
          </Button>
        )}
      </div>
    </div>
  );
}

function StudentFolderPage() {
  const { studentId } = Route.useParams();
  const navigate = useNavigate();
  const { data: students = [], isLoading, isError } = useStudents();
  const student = students.find((s) => s.id === studentId);
  const upload = useUploadDocument();
  const replace = useReplaceDocument();
  const remove = useRemoveDocument();

  if (isLoading) {
    return (
      <AppShell title="Student Folder" description="" showSearch={false}>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-48 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  if (!student) {
    return (
      <AppShell title="Student Folder" description="" showSearch={false}>
        <div className="vault-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {isError ? "Could not load this student." : "Student not found."}
          </p>
          <Button asChild variant="outline" className="mt-4 rounded-xl">
            <Link to="/master-file">Back to Master File</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const docsByType = new Map(student.documents.map((d) => [d.documentType, d]));
  const done = REQUIRED_DOCUMENT_TYPES.filter((t) => docsByType.has(t)).length;
  const initials = (student.studentName.split(",")[0] ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

  const busy = upload.isPending || replace.isPending || remove.isPending;

  const handleUpload = async (type: DocumentType, file: File) => {
    try {
      await validateUploadFile(file);
      await upload.mutateAsync({
        studentId: student.id,
        studentName: student.studentName,
        documentType: type,
        file,
      });
      await logStudentAudit({
        action: "upload",
        summary: student.studentName,
        details: {
          module: "master-file",
          requirement: DOCUMENT_LABELS[type],
          file: standardFileName(type, student.studentName),
        },
      });
      toast.success(`${DOCUMENT_LABELS[type]} uploaded`, {
        description: standardFileName(type, student.studentName),
      });
    } catch (err) {
      toast.error("Upload failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const handleReplace = async (doc: StudentDocument, file: File) => {
    try {
      await validateUploadFile(file);
      await replace.mutateAsync({ document: doc, studentName: student.studentName, file });
      await logStudentAudit({
        action: "upload",
        summary: student.studentName,
        details: {
          module: "master-file",
          requirement: DOCUMENT_LABELS[doc.documentType],
          file: standardFileName(doc.documentType, student.studentName),
          replaced: true,
        },
      });
      toast.success(`${DOCUMENT_LABELS[doc.documentType]} replaced`, {
        description: standardFileName(doc.documentType, student.studentName),
      });
    } catch (err) {
      toast.error("Replace failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const handleRemove = async (doc: StudentDocument) => {
    if (
      !window.confirm(
        `Remove "${standardFileName(doc.documentType, student.studentName)}" from ${student.studentName}?`,
      )
    ) {
      return;
    }
    try {
      await remove.mutateAsync(doc);
      await logStudentAudit({
        action: "delete",
        summary: student.studentName,
        details: {
          module: "master-file",
          requirement: DOCUMENT_LABELS[doc.documentType],
          file: standardFileName(doc.documentType, student.studentName),
        },
      });
      toast.success(`${DOCUMENT_LABELS[doc.documentType]} removed`);
    } catch (err) {
      toast.error("Could not delete", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const handleOpen = async (doc: StudentDocument) => {
    try {
      const { data, error } = await supabase.functions.invoke("student-docs", {
        body: { action: "open", documentId: doc.id },
      });
      if (error) throw error;
      const url = (data as { url?: string }).url;
      if (!url) throw new Error("No link returned");
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast.error("Could not open document", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const cardProps = { onUpload: handleUpload, onReplace: handleReplace, onRemove: handleRemove, onOpen: handleOpen, busy };

  return (
    <AppShell title="Student Folder" description="" showSearch={false}>
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 rounded-lg text-muted-foreground"
          onClick={() => void navigate({ to: "/master-file" })}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Master File
        </Button>

        <div className="vault-card flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-lg font-semibold text-primary">
              {initials || "—"}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold tracking-tight text-foreground">
                {student.studentName}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {[
                  student.studentNumber ?? "No student no.",
                  `Batch ${student.batch}`,
                  student.classification,
                ].join(" · ")}
              </p>
            </div>
          </div>
          <div className="w-full md:w-56">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Requirements</span>
              <span className="text-primary">{done} / 5</span>
            </div>
            <div className="mt-2 flex gap-1.5">
              {REQUIRED_DOCUMENT_TYPES.map((type) => (
                <span
                  key={type}
                  className={`h-2 flex-1 rounded-full ${docsByType.has(type) ? "bg-secondary" : "bg-muted"}`}
                />
              ))}
            </div>
          </div>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {DOCUMENT_TYPES.filter((t) => t !== "Other").map((type) => (
            <DocumentCard
              key={type}
              student={student}
              type={type}
              doc={docsByType.get(type)}
              {...cardProps}
            />
          ))}
          <DocumentCard
            student={student}
            type="Other"
            doc={docsByType.get("Other")}
            optional
            {...cardProps}
          />
        </section>
      </div>
    </AppShell>
  );
}
