import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  ChevronRight,
  Eye,
  FileText,
  Folder,
  Grid2x2,
  List,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { EditStudentDialog } from "@/components/browse/EditStudentDialog";
import { PaginationBar } from "@/components/PaginationBar";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DOCUMENT_INFO, FOLDER_LABELS } from "@/data/document-catalog";
import {
  standardFileName,
  type StudentDocument,
  type StudentWithRequirements,
} from "@/data/students";
import {
  FILE_DEPTH,
  childNodes,
  folderContents,
  normalizePath,
  pathLabels,
  searchStudents,
  type BrowseNode,
} from "@/lib/browse-tree";
import {
  errorMessage,
  logStudentAudit,
  openDocument,
  validateUploadFile,
} from "@/lib/students-api";
import { useRemoveDocument, useReplaceDocument, useStudents } from "@/lib/use-students";
import { cn } from "@/lib/utils";
import { useVault } from "@/lib/vault-store";

const PAGE_SIZE = { grid: 8, list: 4 } as const;

function formatBytes(size: number | null): string {
  if (size == null) return "";
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function paginate<T>(items: T[], page: number, size: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(page, totalPages);
  return {
    items: items.slice((current - 1) * size, current * size),
    current,
    totalPages,
  };
}

function countLabel(node: BrowseNode): string {
  const noun = node.unit === "student" ? "student" : "file";
  return `${node.count} ${noun}${node.count === 1 ? "" : "s"}`;
}

export function FolderView() {
  const { search, setSearch } = useVault();
  const { data, isLoading, isError } = useStudents();
  const students = useMemo<StudentWithRequirements[]>(() => data ?? [], [data]);

  const [rawPath, setPath] = useState<string[]>([]);
  const [view, setView] = useState<"grid" | "list">("list");
  const [page, setPage] = useState(1);
  const replace = useReplaceDocument();
  const remove = useRemoveDocument();
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<{ doc: StudentDocument; student: StudentWithRequirements } | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<{
    doc: StudentDocument;
    student: StudentWithRequirements;
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const busy = replace.isPending || remove.isPending;

  // A folder can vanish while someone is inside it (e.g. after editing a student).
  const path = useMemo(() => normalizePath(students, rawPath), [students, rawPath]);
  const query = search.trim();
  const isSearching = query.length > 0;
  const pageSize = PAGE_SIZE[view];

  useEffect(() => {
    setPage(1);
  }, [rawPath, query, view]);

  const labels = useMemo(() => pathLabels(students, path), [students, path]);
  const nodes = useMemo(
    () => (isSearching ? [] : childNodes(students, path)),
    [students, path, isSearching],
  );
  const contents = useMemo(
    () => (isSearching ? null : folderContents(students, path)),
    [students, path, isSearching],
  );
  const results = useMemo(
    () => (isSearching ? searchStudents(students, query) : []),
    [students, query, isSearching],
  );

  const pagedNodes = paginate(nodes, page, pageSize);
  const pagedFiles = paginate(contents?.documents ?? [], page, pageSize);
  const pagedResults = paginate(results, page, pageSize);

  const gridClass =
    view === "grid"
      ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      : "flex flex-col gap-2";

  const openStudent = (student: StudentWithRequirements) => {
    setSearch("");
    setPath([student.batch, student.classification, student.id]);
  };

  const handleOpen = (doc: StudentDocument) => {
    void openDocument(doc).catch((err) =>
      toast.error("Could not open document", { description: errorMessage(err) }),
    );
  };

  const startReplace = (doc: StudentDocument, student: StudentWithRequirements) => {
    replaceTarget.current = { doc, student };
    replaceInputRef.current?.click();
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
      await logStudentAudit({
        action: "delete",
        summary: student.studentName,
        details: {
          module: "master-file",
          requirement: label,
          folder: FOLDER_LABELS[doc.folder],
          file: standardFileName(doc.documentType, student.studentName),
        },
      }).catch(() => undefined);
      toast.success(`${label} removed`);
    } catch (err) {
      toast.error("Could not delete", { description: errorMessage(err) });
    }
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="vault-card p-10 text-center text-sm text-destructive">
        Could not load students. Please refresh and try again.
      </p>
    );
  }

  const studentId = path[2];
  const currentStudent = studentId ? students.find((s) => s.id === studentId) : undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
          {isSearching ? (
            <span className="rounded-lg px-2 py-1 font-medium text-primary">
              Search results for &quot;{query}&quot;
            </span>
          ) : (
            <>
              <button
                onClick={() => setPath([])}
                className={cn(
                  "rounded-lg px-2 py-1 font-medium transition-colors hover:bg-primary-soft",
                  path.length === 0 ? "text-primary" : "text-muted-foreground",
                )}
              >
                All Batches
              </button>
              {labels.map((label, i) => (
                <span key={path[i]} className="flex items-center gap-1">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  <button
                    onClick={() => setPath(path.slice(0, i + 1))}
                    className={cn(
                      "rounded-lg px-2 py-1 font-medium transition-colors hover:bg-primary-soft",
                      i === path.length - 1 ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </button>
                </span>
              ))}
            </>
          )}
        </nav>

        <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="List view"
                onClick={() => setView("list")}
                className={cn(
                  "h-8 w-8 rounded-lg",
                  view === "list" && "bg-primary-soft text-primary",
                )}
              >
                <List className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>List view</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Grid view"
                onClick={() => setView("grid")}
                className={cn(
                  "h-8 w-8 rounded-lg",
                  view === "grid" && "bg-primary-soft text-primary",
                )}
              >
                <Grid2x2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Grid view</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {!isSearching && studentId && (
        <div className="flex justify-end gap-2">
          {currentStudent && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg"
              onClick={() => setEditing(true)}
            >
              <Pencil className="mr-1 h-3.5 w-3.5" />
              Edit student
            </Button>
          )}
          <Button asChild variant="outline" size="sm" className="rounded-lg">
            <Link to="/master-file/$studentId" params={{ studentId }}>
              Open Master File
            </Link>
          </Button>
        </div>
      )}

      {currentStudent && (
        <EditStudentDialog
          student={currentStudent}
          open={editing}
          onOpenChange={setEditing}
          onSaved={(next) => {
            // Batch / classification changes move the student to another folder.
            if (
              next.batch !== currentStudent.batch ||
              next.classification !== currentStudent.classification
            ) {
              setPath([next.batch, next.classification, currentStudent.id]);
            }
          }}
        />
      )}

      {/* Search results: students whose name, number, batch, classification, file name or document label match */}
      {isSearching && (
        <>
          <div className={gridClass}>
            {pagedResults.items.map((student) => {
              const missing = student.documents.length;
              return (
                <button
                  key={student.id}
                  onClick={() => openStudent(student)}
                  className={cn(
                    "vault-card group text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift",
                    view === "grid" ? "p-5" : "flex items-center gap-4 p-4",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft",
                      view === "grid" && "mb-4",
                    )}
                  >
                    <Folder className="h-5 w-5 text-primary" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {student.studentName}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {student.studentNumber ?? "No student no."} · {missing}{" "}
                      {missing === 1 ? "file" : "files"}
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      <Badge className="rounded-lg bg-primary-soft text-primary hover:bg-primary-soft">
                        Batch {student.batch}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="rounded-lg border-border text-muted-foreground"
                      >
                        {student.classification}
                      </Badge>
                    </span>
                  </span>
                </button>
              );
            })}
            {results.length === 0 && (
              <p className="vault-card p-10 text-center text-sm text-muted-foreground sm:col-span-full">
                No students match your search.
              </p>
            )}
          </div>
          <PaginationBar
            page={pagedResults.current}
            totalPages={pagedResults.totalPages}
            onChange={setPage}
          />
        </>
      )}

      {/* Sub-folders: batch / classification / student / folder */}
      {!isSearching && path.length < FILE_DEPTH && (
        <>
          <div className={gridClass}>
            {pagedNodes.items.map((node) => (
              <button
                key={node.key}
                onClick={() => setPath([...path, node.key])}
                className={cn(
                  "vault-card group text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift",
                  view === "grid" ? "p-5" : "flex items-center gap-4 p-4",
                )}
              >
                <span
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft transition-colors group-hover:bg-gold-soft",
                    view === "grid" && "mb-4",
                  )}
                >
                  <Folder className="h-5 w-5 text-primary transition-colors group-hover:text-gold-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {node.label}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {[node.subtitle, countLabel(node)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            ))}
            {nodes.length === 0 && (
              <p className="vault-card p-10 text-center text-sm text-muted-foreground sm:col-span-full">
                {path.length === 0
                  ? "No students yet. Upload a document to create the first folder."
                  : "This folder is empty."}
              </p>
            )}
          </div>
          <PaginationBar
            page={pagedNodes.current}
            totalPages={pagedNodes.totalPages}
            onChange={setPage}
          />
        </>
      )}

      {/* Files inside one folder of one student */}
      {!isSearching && contents && (
        <>
          <p className="text-xs text-muted-foreground">
            {FOLDER_LABELS[contents.folder]} · {contents.documents.length}{" "}
            {contents.documents.length === 1 ? "file" : "files"}
          </p>
          <div className={gridClass}>
            {pagedFiles.items.map((doc) => (
              <div
                key={doc.id}
                className={cn(
                  "vault-card",
                  view === "grid" ? "p-5" : "flex items-center gap-4 p-4",
                )}
              >
                <span
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl bg-gold-soft",
                    view === "grid" && "mb-4",
                  )}
                >
                  <FileText className="h-5 w-5 text-gold-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {DOCUMENT_INFO[doc.documentType].label}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                    {doc.fileName}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {[formatBytes(doc.fileSize), format(new Date(doc.uploadedAt), "MMM d, yyyy")]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span
                  className={cn("flex items-center gap-1", view === "grid" ? "mt-4" : "shrink-0")}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="View file"
                        disabled={busy}
                        onClick={() => handleOpen(doc)}
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-primary-soft hover:text-primary"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>View file</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Replace file"
                        disabled={busy}
                        onClick={() => startReplace(doc, contents.student)}
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-primary-soft hover:text-primary"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Replace file</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete file"
                        disabled={busy}
                        onClick={() => setPendingDelete({ doc, student: contents.student })}
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete file</TooltipContent>
                  </Tooltip>
                </span>
              </div>
            ))}
            {contents.documents.length === 0 && (
              <p className="vault-card p-10 text-center text-sm text-muted-foreground sm:col-span-full">
                No files yet.
              </p>
            )}
          </div>
          <PaginationBar
            page={pagedFiles.current}
            totalPages={pagedFiles.totalPages}
            onChange={setPage}
          />
        </>
      )}

      <input
        ref={replaceInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleReplaceFile(file);
        }}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${DOCUMENT_INFO[pendingDelete.doc.documentType].label} will be removed from ${pendingDelete.student.studentName}'s folder, and the requirement will show as missing.`
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
    </div>
  );
}
