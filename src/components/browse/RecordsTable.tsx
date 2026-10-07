import { format } from "date-fns";
import { ArrowUpDown, FolderOpen, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { EditStudentDialog } from "@/components/browse/EditStudentDialog";
import { StudentPanel } from "@/components/browse/StudentPanel";
import { PaginationBar } from "@/components/PaginationBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FOLDERS, MAX_FILES_PER_STUDENT, type FolderKey } from "@/data/document-catalog";
import { CLASSIFICATIONS, type StudentWithRequirements } from "@/data/students";
import { searchStudents } from "@/lib/browse-tree";
import { useStudents } from "@/lib/use-students";
import { cn } from "@/lib/utils";
import { useVault } from "@/lib/vault-store";

const PAGE_SIZE = 8;

type SortKey = "name" | "batch" | "classification" | "files" | "lastUpload";

const FOLDER_SHORT: Record<FolderKey, string> = {
  academic: "Academic",
  personal: "Personal",
  others: "Others",
};

function lastUploadOf(student: StudentWithRequirements): string {
  return student.documents.reduce((max, d) => (d.uploadedAt > max ? d.uploadedAt : max), "");
}

function compareStudents(key: SortKey, a: StudentWithRequirements, b: StudentWithRequirements) {
  switch (key) {
    case "name":
      return a.studentName.localeCompare(b.studentName);
    case "batch":
      return a.batch.localeCompare(b.batch, undefined, { numeric: true });
    case "classification":
      return a.classification.localeCompare(b.classification);
    case "files":
      return a.documents.length - b.documents.length;
    case "lastUpload":
      return lastUploadOf(a).localeCompare(lastUploadOf(b));
  }
}

export function RecordsTable() {
  const { search } = useVault();
  const { data, isLoading, isError } = useStudents();
  const students = useMemo<StudentWithRequirements[]>(() => data ?? [], [data]);

  const [batchFilter, setBatchFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "lastUpload",
    dir: "desc",
  });
  const [page, setPage] = useState(1);
  const [panelId, setPanelId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [search, batchFilter, classFilter, sort]);

  const batches = useMemo(
    () =>
      Array.from(new Set(students.map((s) => s.batch))).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
    [students],
  );

  const rows = useMemo(() => {
    const filtered = searchStudents(students, search).filter(
      (s) =>
        (batchFilter === "all" || s.batch === batchFilter) &&
        (classFilter === "all" || s.classification === classFilter),
    );
    return [...filtered].sort((a, b) => {
      const cmp = compareStudents(sort.key, a, b);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [students, search, batchFilter, classFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const rangeStart = rows.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, rows.length);

  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );

  const openPanel = (id: string) => {
    setPanelId(id);
    setPanelOpen(true);
  };

  const panelStudent = panelId ? (students.find((s) => s.id === panelId) ?? null) : null;
  const editStudent = editId ? students.find((s) => s.id === editId) : undefined;

  const head = (key: SortKey, label: string, center = false) => (
    <TableHead className={cn("whitespace-nowrap", center && "text-center")}>
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-primary",
          center && "justify-center",
        )}
      >
        {label}
        <ArrowUpDown
          className={cn(
            "h-3.5 w-3.5",
            sort.key === key ? "text-primary" : "text-muted-foreground/50",
          )}
        />
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select value={batchFilter} onValueChange={setBatchFilter}>
          <SelectTrigger className="h-10 rounded-xl bg-background">
            <SelectValue placeholder="All batches" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="all">All batches</SelectItem>
            {batches.map((b) => (
              <SelectItem key={b} value={b}>
                Batch {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="h-10 rounded-xl bg-background">
            <SelectValue placeholder="All classifications" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="all">All classifications</SelectItem>
            {CLASSIFICATIONS.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {rangeStart}–{rangeEnd} of {rows.length} students · double-click a row to open their
        files.
      </p>

      <div className="vault-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-surface hover:bg-surface">
                {head("name", "Student Info")}
                {head("batch", "Batch", true)}
                {head("classification", "Classification")}
                {head("files", "Files", true)}
                <TableHead className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Folders
                </TableHead>
                {head("lastUpload", "Last Upload")}
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

              {!isLoading &&
                pagedRows.map((student) => {
                  const lastUpload = lastUploadOf(student);
                  return (
                    <TableRow
                      key={student.id}
                      tabIndex={0}
                      onDoubleClick={() => openPanel(student.id)}
                      onKeyDown={(e) => {
                        if (e.target === e.currentTarget && e.key === "Enter")
                          openPanel(student.id);
                      }}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-none",
                        panelOpen && panelId === student.id && "bg-primary-soft/40",
                      )}
                    >
                      <TableCell className="min-w-56">
                        <button
                          type="button"
                          onClick={() => openPanel(student.id)}
                          className="text-left font-medium text-foreground hover:text-primary"
                        >
                          {student.studentName}
                        </button>
                        <p className="text-xs text-muted-foreground">
                          {student.studentNumber ?? "No student no."}
                        </p>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className="rounded-lg bg-primary-soft text-primary hover:bg-primary-soft">
                          Batch {student.batch}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {student.classification}
                      </TableCell>
                      <TableCell className="text-center text-sm text-foreground">
                        {student.documents.length} / {MAX_FILES_PER_STUDENT}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {FOLDERS.filter(
                            (f) =>
                              student.folders[f].status !== "N/A" || student.folders[f].count > 0,
                          ).map((f) => (
                            <span
                              key={f}
                              className="rounded-lg border border-border px-2 py-0.5 text-xs text-muted-foreground"
                            >
                              {FOLDER_SHORT[f]} {student.folders[f].count}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {lastUpload ? format(new Date(lastUpload), "MMM d, yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Open files"
                                className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-primary-soft hover:text-primary"
                                onClick={() => openPanel(student.id)}
                              >
                                <FolderOpen className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Open files</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Edit student"
                                className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-primary-soft hover:text-primary"
                                onClick={() => setEditId(student.id)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit student</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}

              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    {isError
                      ? "Could not load students. Please refresh and try again."
                      : "No students match your search and filters."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <PaginationBar page={currentPage} totalPages={totalPages} onChange={setPage} />

      <StudentPanel student={panelStudent} open={panelOpen} onOpenChange={setPanelOpen} />

      {editStudent && (
        <EditStudentDialog
          student={editStudent}
          open
          onOpenChange={(open) => {
            if (!open) setEditId(null);
          }}
          onSaved={() => undefined}
        />
      )}
    </div>
  );
}
