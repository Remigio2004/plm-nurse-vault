import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileCheck2, FileUp, X } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DOCUMENT_INFO,
  FOLDER_LABELS,
  MAX_FILES_PER_STUDENT,
  allDocumentsForClassification,
  documentsForFolder,
  foldersForClassification,
  type DocumentType,
  type FolderKey,
} from "@/data/document-catalog";
import { CLASSIFICATIONS, formatStudentName, standardFileName } from "@/data/students";
import { errorMessage, logStudentAudit, validateUploadFile } from "@/lib/students-api";
import {
  useFindOrCreateStudent,
  useReplaceDocument,
  useStudents,
  useUploadDocument,
} from "@/lib/use-students";
import { capitalizeWords, formatStudentNumber } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({
    meta: [
      { title: "Upload Record — NurseVault" },
      {
        name: "description",
        content:
          "File scanned nursing student documents into the student's Academic Records, Personal Records or Others folder.",
      },
      { property: "og:title", content: "Upload Record — NurseVault" },
      {
        property: "og:description",
        content: "File a scanned student document into the NurseVault digital archive.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { student?: string } => {
    const student = search["student"];
    return typeof student === "string" && student ? { student } : {};
  },
  component: UploadPage,
});

// Checked document -> its PDF (null until a file is attached).
type Selection = Partial<Record<DocumentType, File | null>>;

function UploadPage() {
  const navigate = useNavigate();
  const { data: students = [] } = useStudents();
  const findOrCreate = useFindOrCreateStudent();
  const upload = useUploadDocument();
  const replace = useReplaceDocument();
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingType = useRef<DocumentType | null>(null);

  const { student: presetStudent } = Route.useSearch();
  const [studentName, setStudentName] = useState(presetStudent ?? "");
  const [studentNumber, setStudentNumber] = useState("");
  const [batchYear, setBatchYear] = useState("");
  const [classification, setClassification] = useState("");
  const [folder, setFolder] = useState<FolderKey | "all" | "">(presetStudent ? "all" : "");
  const [selected, setSelected] = useState<Selection>({});
  const [submitting, setSubmitting] = useState(false);

  const formattedName = formatStudentName(studentName);
  const existing = formattedName
    ? students.find((s) => s.studentName.toLowerCase() === formattedName.toLowerCase())
    : undefined;

  // An existing folder locks number / batch / classification.
  const effClassification = existing?.classification ?? classification;
  const effNumber = existing ? (existing.studentNumber ?? "") : studentNumber;
  const effBatch = existing ? existing.batch : batchYear;

  const availableFolders = effClassification ? foldersForClassification(effClassification) : [];
  const activeFolder: FolderKey | "all" | "" =
    folder === "all" ? "all" : folder && availableFolders.includes(folder) ? folder : "";
  const visibleFolders: FolderKey[] =
    activeFolder === "all" ? availableFolders : activeFolder ? [activeFolder] : [];

  const onFile = new Set<DocumentType>(existing?.documents.map((d) => d.documentType) ?? []);
  const validTypes = new Set<DocumentType>(allDocumentsForClassification(effClassification));
  const entries = (Object.entries(selected) as [DocumentType, File | null][]).filter(([t]) =>
    validTypes.has(t),
  );
  const readyEntries = entries.filter(([, f]) => f !== null) as [DocumentType, File][];
  const missingFileCount = entries.length - readyEntries.length;
  const newEntryCount = readyEntries.filter(([t]) => !onFile.has(t)).length;
  const totalAfter = (existing?.documents.length ?? 0) + newEntryCount;
  const overLimit = totalAfter > MAX_FILES_PER_STUDENT;

  const ready =
    !!formattedName &&
    !!effClassification &&
    !!effBatch.trim() &&
    readyEntries.length > 0 &&
    missingFileCount === 0 &&
    !overLimit;

  const toggle = (type: DocumentType, checked: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (checked) next[type] = prev[type] ?? null;
      else delete next[type];
      return next;
    });
  };

  const assignFile = async (type: DocumentType, file: File) => {
    try {
      await validateUploadFile(file);
    } catch (err) {
      toast.error("File skipped", { description: `"${file.name}" — ${errorMessage(err)}` });
      return;
    }
    setSelected((prev) => ({ ...prev, [type]: file }));
  };

  const openPicker = (type: DocumentType) => {
    pendingType.current = type;
    inputRef.current?.click();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formattedName) {
      toast.error("Name format", {
        description: 'Use "Lastname, Firstname Middlename" — e.g. "Dela Cruz, Juan Pandoro".',
      });
      return;
    }
    if (!ready) {
      toast.error("Please complete the form and attach a PDF for every checked document.");
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

      const uploaded: DocumentType[] = [];
      const failed: string[] = [];
      for (const [type, file] of readyEntries) {
        try {
          const current = existing?.documents.find((d) => d.documentType === type);
          if (current) {
            await replace.mutateAsync({
              document: current,
              studentName: student.studentName,
              file,
            });
          } else {
            await upload.mutateAsync({
              studentId: student.id,
              studentName: student.studentName,
              documentType: type,
              file,
            });
          }
          await logStudentAudit({
            action: "upload",
            summary: student.studentName,
            details: {
              module: "master-file",
              requirement: DOCUMENT_INFO[type].label,
              folder: FOLDER_LABELS[DOCUMENT_INFO[type].folder],
              file: standardFileName(type, student.studentName),
              ...(current ? { replaced: true } : {}),
            },
          }).catch(() => undefined);
          uploaded.push(type);
        } catch (err) {
          failed.push(`${DOCUMENT_INFO[type].label}: ${errorMessage(err)}`);
        }
      }

      if (uploaded.length > 0) {
        toast.success(
          uploaded.length === 1 ? "Record uploaded" : `${uploaded.length} records uploaded`,
          {
            description: `${student.studentName} — filed in the student folder.`,
          },
        );
      }
      if (failed.length > 0) {
        toast.error(
          failed.length === 1
            ? "One file failed to upload"
            : `${failed.length} files failed to upload`,
          { description: failed.join(" · ") },
        );
        // Keep only the failed ones so the user can retry.
        setSelected((prev) => {
          const next = { ...prev };
          for (const type of uploaded) delete next[type];
          return next;
        });
        return;
      }
      void navigate({ to: "/master-file" });
    } catch (err) {
      toast.error("Could not save student", { description: errorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell
        title="Upload Record"
        description="Pick a folder, tick the documents you're filing, then attach each PDF."
        showSearch={false}
      >
        <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <div className="vault-card p-6">
              <h2 className="text-base font-semibold text-foreground">Student details</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Files go into the student's folder, under Academic Records, Personal Records or
                Others.
              </p>

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="studentName">Student Name (SN, FN, MI)</Label>
                  <Input
                    id="studentName"
                    value={studentName}
                    onChange={(e) => setStudentName(capitalizeWords(e.target.value))}
                    placeholder="Dela Cruz, Juan P."
                    className="h-11 rounded-xl"
                  />
                  <p className="text-xs text-muted-foreground">
                    {existing ? (
                      <span className="text-secondary">
                        Existing folder — number, batch and classification are locked.
                      </span>
                    ) : formattedName ? (
                      <span className="text-secondary">New folder: {formattedName}</span>
                    ) : (
                      "Format: Lastname, Firstname Middlename"
                    )}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="studentNumber">Student Number (optional)</Label>
                  <Input
                    id="studentNumber"
                    inputMode="numeric"
                    value={effNumber}
                    disabled={!!existing}
                    onChange={(e) => setStudentNumber(formatStudentNumber(e.target.value))}
                    placeholder="2022-23091"
                    maxLength={10}
                    className="h-11 rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="batchYear">Batch</Label>
                  <Input
                    id="batchYear"
                    inputMode="numeric"
                    value={effBatch}
                    disabled={!!existing}
                    onChange={(e) => setBatchYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="2024"
                    maxLength={4}
                    className="h-11 rounded-xl"
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label>Student Classification</Label>
                  <Select
                    value={effClassification}
                    disabled={!!existing}
                    onValueChange={(v) => {
                      setClassification(v);
                      setFolder("");
                      setSelected({});
                    }}
                  >
                    <SelectTrigger className="h-11 rounded-xl sm:max-w-xs">
                      <SelectValue placeholder="Select classification" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {CLASSIFICATIONS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="vault-card p-6">
              <h2 className="text-base font-semibold text-foreground">Documents</h2>
              <p className="mt-1 text-sm text-muted-foreground">PDF only · max 20 MB each</p>

              <div className="mt-5 space-y-2">
                <Label>Upload File Types</Label>
                <Select
                  value={activeFolder}
                  disabled={!effClassification}
                  onValueChange={(v) => setFolder(v as FolderKey | "all")}
                >
                  <SelectTrigger className="h-11 rounded-xl sm:max-w-xs">
                    <SelectValue
                      placeholder={
                        effClassification ? "Select folder" : "Select classification first"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="all">All folders</SelectItem>
                    {availableFolders.map((f) => (
                      <SelectItem key={f} value={f}>
                        {FOLDER_LABELS[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {visibleFolders.map((f) => (
                <div key={f} className="mt-5 space-y-2">
                  {activeFolder === "all" && (
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {FOLDER_LABELS[f]}
                    </p>
                  )}
                  {documentsForFolder(effClassification, f).map((type) => {
                    const isOthers = f === "others";
                    const info = DOCUMENT_INFO[type];
                    const alreadyOn = onFile.has(type);
                    const isChecked = type in selected;
                    const file = selected[type] ?? null;
                    const existingDoc = existing?.documents.find((d) => d.documentType === type);
                    const showPicker = isChecked || alreadyOn || (isOthers && !alreadyOn);
                    return (
                      <div
                        key={type}
                        className="rounded-xl border border-border bg-surface px-3 py-2.5"
                      >
                        <div className="flex items-center gap-3 text-sm">
                          {!isOthers &&
                            (alreadyOn ? (
                              <FileCheck2 className="h-4 w-4 shrink-0 text-primary" />
                            ) : (
                              <input
                                id={`doc-${type}`}
                                type="checkbox"
                                className="h-4 w-4 accent-primary"
                                checked={isChecked}
                                onChange={(e) => toggle(type, e.target.checked)}
                              />
                            ))}
                          <label htmlFor={`doc-${type}`} className="flex-1 text-foreground">
                            {info.label}
                          </label>
                        </div>
                        {showPicker && (
                          <div className={`mt-2 flex items-center gap-2 ${isOthers ? "" : "pl-7"}`}>
                            <FileUp className="h-4 w-4 shrink-0 text-primary" />
                            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                              {file
                                ? file.name
                                : existingDoc
                                  ? existingDoc.fileName
                                  : "No PDF attached yet"}
                            </span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  aria-label={file || existingDoc ? "Change PDF" : "Upload PDF"}
                                  className="rounded-lg border-border bg-white text-foreground hover:bg-primary-soft hover:text-primary"
                                  onClick={() => openPicker(type)}
                                >
                                  {file || existingDoc ? "Change" : "Upload"}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {file || existingDoc ? "Change PDF" : "Upload PDF"}
                              </TooltipContent>
                            </Tooltip>
                            {(isOthers || alreadyOn) && file && (
                              <button
                                type="button"
                                aria-label="Remove file"
                                onClick={() => toggle(type, false)}
                                className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="vault-card p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Destination folder
              </p>
              <p className="mt-2 text-sm font-medium text-primary">
                {formattedName ?? "Student —"} /{" "}
                {activeFolder === "all"
                  ? "All folders"
                  : activeFolder
                    ? FOLDER_LABELS[activeFolder]
                    : "Folder —"}
              </p>
              <p
                className={`mt-2 text-xs ${overLimit ? "text-destructive" : "text-muted-foreground"}`}
              >
                {totalAfter} / {MAX_FILES_PER_STUDENT} files for this student
              </p>

              {entries.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {entries.map(([type, file]) => (
                    <li
                      key={type}
                      className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">
                          {FOLDER_LABELS[DOCUMENT_INFO[type].folder]} · {DOCUMENT_INFO[type].label}
                        </span>
                        <span className="block truncate text-muted-foreground">
                          {file ? file.name : "No PDF attached yet"}
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label="Remove document"
                        onClick={() => toggle(type, false)}
                        className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="mt-5 h-11 w-full rounded-xl bg-gold text-gold-foreground shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-gold/90 hover:shadow-lift"
              >
                {submitting
                  ? "Filing records…"
                  : readyEntries.length > 1
                    ? `Upload ${readyEntries.length} records`
                    : "Upload Record"}
              </Button>
            </div>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              const type = pendingType.current;
              if (file && type) void assignFile(type, file);
              e.target.value = "";
              pendingType.current = null;
            }}
          />
        </form>
      </AppShell>
    </TooltipProvider>
  );
}
