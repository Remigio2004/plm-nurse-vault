import { createFileRoute } from "@tanstack/react-router";
import { FileUp, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DOCUMENT_INFO,
  FOLDER_LABELS,
  documentsForFolder,
  foldersForClassification,
  type DocumentType,
  type FolderKey,
} from "@/data/document-catalog";
import { CLASSIFICATIONS, formatStudentName } from "@/data/students";
import { errorMessage, logStudentAudit, validateUploadFile } from "@/lib/students-api";
import { useFindOrCreateStudent, useStudents, useUploadDocument } from "@/lib/use-students";
import { capitalizeWords, formatStudentNumber } from "@/lib/utils";
import { runUploadQueue } from "@/lib/upload-queue";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({ meta: [{ title: "Upload Records — NurseVault" }] }),
  validateSearch: (search: Record<string, unknown>): { student?: string } => {
    const student = search["student"];
    return typeof student === "string" && student ? { student } : {};
  },
  component: UploadPage,
});

interface UploadItem {
  id: string;
  type: DocumentType;
  file: File;
  status: "waiting" | "uploading" | "uploaded" | "failed";
  error?: string | undefined;
}

function UploadPage() {
  const { data: students = [] } = useStudents();
  const findOrCreate = useFindOrCreateStudent();
  const upload = useUploadDocument();
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingType = useRef<DocumentType | null>(null);
  const { student: presetStudent } = Route.useSearch();
  const [studentName, setStudentName] = useState(presetStudent ?? "");
  const [studentNumber, setStudentNumber] = useState("");
  const [batchYear, setBatchYear] = useState("");
  const [classification, setClassification] = useState("");
  const [folder, setFolder] = useState<FolderKey | "all">("all");
  const [items, setItems] = useState<UploadItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const formattedName = formatStudentName(studentName);
  const existing = students.find(
    (s) => s.studentName.toLowerCase() === formattedName?.toLowerCase(),
  );
  const effClassification = existing?.classification ?? classification;
  const effNumber = existing ? (existing.studentNumber ?? "") : studentNumber;
  const effBatch = existing?.batch ?? batchYear;
  const folders = effClassification ? foldersForClassification(effClassification) : [];
  const visibleFolders = folder === "all" ? folders : folders.filter((f) => f === folder);
  const pending = items.filter((item) => item.status !== "uploaded");

  const assignFiles = async (type: DocumentType, files: File[]) => {
    const additions: UploadItem[] = [];
    for (const file of files) {
      try {
        await validateUploadFile(file);
        additions.push({ id: crypto.randomUUID(), type, file, status: "waiting" });
      } catch (err) {
        toast.error("File skipped", { description: `${file.name}: ${errorMessage(err)}` });
      }
    }
    setItems((prev) => [...prev, ...additions]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formattedName || !effClassification || !effBatch.trim() || !pending.length || submitting) {
      toast.error("Complete the student details and add PDF files first.");
      return;
    }
    setSubmitting(true);
    try {
      const { student } = await findOrCreate.mutateAsync({
        studentName: formattedName,
        studentNumber: effNumber,
        batch: effBatch.trim(),
        classification: effClassification,
      });
      let uploaded = 0;
      let failed = 0;
      await runUploadQueue(pending, async (item) => {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: "uploading", error: undefined } : i)),
        );
        try {
          const doc = await upload.mutateAsync({
            studentId: student.id,
            studentName: student.studentName,
            documentType: item.type,
            file: item.file,
            uploadId: item.id,
          });
          await logStudentAudit({
            action: "upload",
            summary: student.studentName,
            details: {
              module: "master-file",
              requirement: DOCUMENT_INFO[item.type].label,
              file_name: doc.fileName,
            },
          }).catch(() => undefined);
          uploaded++;
          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, status: "uploaded" } : i)),
          );
        } catch (err) {
          failed++;
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id ? { ...i, status: "failed", error: errorMessage(err) } : i,
            ),
          );
        }
      });
      if (uploaded) toast.success(`${uploaded} file${uploaded === 1 ? "" : "s"} uploaded`);
      if (failed)
        toast.error(`${failed} file${failed === 1 ? "" : "s"} failed`, {
          description: "Retry failed files below. Uploaded files will not be sent again.",
        });
    } catch (err) {
      toast.error("Could not save student", { description: errorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      title="Upload Records"
      description="Add multiple PDFs to any document type, then upload the batch."
      showSearch={false}
    >
      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <fieldset disabled={submitting} className="min-w-0 space-y-6">
          <div className="vault-card space-y-5 p-6">
            <h2 className="font-semibold">Student details</h2>
            <div className="space-y-2">
              <Label htmlFor="studentName">Student Name (SN, FN, MI)</Label>
              <Input
                id="studentName"
                value={studentName}
                onChange={(e) => {
                  setStudentName(capitalizeWords(e.target.value));
                  setItems([]);
                }}
                placeholder="Dela Cruz, Juan P."
              />
              <p className="text-xs text-muted-foreground">
                {existing
                  ? "Existing folder — new files will be added here."
                  : 'Format: "Lastname, Firstname Middlename"'}
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="studentNumber">Student Number (optional)</Label>
                <Input
                  id="studentNumber"
                  value={effNumber}
                  disabled={!!existing}
                  maxLength={10}
                  onChange={(e) => setStudentNumber(formatStudentNumber(e.target.value))}
                  placeholder="2022-23091"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="batchYear">Batch</Label>
                <Input
                  id="batchYear"
                  value={effBatch}
                  disabled={!!existing}
                  maxLength={4}
                  onChange={(e) => setBatchYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="2024"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Student Classification</Label>
              <Select
                value={effClassification}
                disabled={!!existing || submitting}
                onValueChange={(v) => {
                  setClassification(v);
                  setItems([]);
                  setFolder("all");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select classification" />
                </SelectTrigger>
                <SelectContent>
                  {CLASSIFICATIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="vault-card space-y-5 p-6">
            <div>
              <h2 className="font-semibold">Documents</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                PDF only · max 20 MB each · no file-count limit
              </p>
            </div>
            <Select
              value={folder}
              disabled={!effClassification || submitting}
              onValueChange={(v) => setFolder(v as FolderKey | "all")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select folder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All folders</SelectItem>
                {folders.map((f) => (
                  <SelectItem key={f} value={f}>
                    {FOLDER_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {visibleFolders.map((f) => (
              <section key={f} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {FOLDER_LABELS[f]}
                </h3>
                {documentsForFolder(effClassification, f).map((type) => {
                  const count =
                    existing?.documents.filter((d) => d.documentType === type).length ?? 0;
                  const selected = items.filter((i) => i.type === type).length;
                  return (
                    <div
                      key={type}
                      className="flex items-center justify-between gap-3 rounded-xl border p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{DOCUMENT_INFO[type].label}</p>
                        <p className="text-xs text-muted-foreground">
                          {count} on file{selected > 0 ? ` · ${selected} selected` : ""}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          pendingType.current = type;
                          inputRef.current?.click();
                        }}
                      >
                        <FileUp className="mr-1.5 h-4 w-4" /> Add PDFs
                      </Button>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        </fieldset>
        <div className="vault-card h-fit space-y-4 p-6">
          <h2 className="font-semibold">Upload queue ({items.length} files)</h2>
          <p className="text-xs text-muted-foreground">
            {items.filter((i) => i.status === "uploaded").length} uploaded · {pending.length}{" "}
            remaining. New files are added; existing files are kept.
          </p>
          <ul className="max-h-[65vh] space-y-2 overflow-y-auto" aria-live="polite">
            {items.map((item) => (
              <li key={item.id} className="flex gap-2 rounded-xl border p-3 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{DOCUMENT_INFO[item.type].label}</p>
                  <p className="break-all text-muted-foreground">{item.file.name}</p>
                  <p className={item.status === "failed" ? "text-destructive" : "text-primary"}>
                    {item.status}
                    {item.error ? ` — ${item.error}` : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={submitting}
                  aria-label={`Remove ${item.file.name} from queue`}
                  onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
          <Button type="submit" disabled={submitting || !pending.length} className="w-full">
            {submitting
              ? "Uploading…"
              : items.some((i) => i.status === "failed")
                ? `Retry ${pending.length} remaining files`
                : `Upload ${pending.length} files`}
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,application/pdf"
          className="hidden"
          disabled={submitting}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            const type = pendingType.current;
            e.target.value = "";
            if (type) void assignFiles(type, files);
          }}
        />
      </form>
    </AppShell>
  );
}
