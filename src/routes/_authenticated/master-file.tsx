import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpDown, FileText, FileX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { PaginationBar } from "@/components/PaginationBar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DOCUMENT_INFO,
  FOLDERS,
  FOLDER_LABELS,
  compareDocumentTypes,
  documentsForFolder,
  type FolderKey,
} from "@/data/document-catalog";
import { CLASSIFICATIONS, type StudentWithRequirements } from "@/data/students";
import { useStudents } from "@/lib/use-students";
import { useVault } from "@/lib/vault-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/master-file")({
  head: () => ({
    meta: [
      { title: "Master File — NurseVault Records Office" },
      {
        name: "description",
        content:
          "Student requirement tracker for the PLM College of Nursing — Academic Records, Personal Records and Others status per student.",
      },
    ],
  }),
  component: MasterFilePage,
});

// Expected + uploaded files of one folder, stacked vertically.
// Uploaded = green chip, not yet uploaded = red chip (can be hidden).
function FolderFiles({
  student,
  folder,
  showMissing,
}: {
  student: StudentWithRequirements;
  folder: FolderKey;
  showMissing: boolean;
}) {
  const expected = documentsForFolder(student.classification, folder);
  const uploaded = student.documents.filter((d) => d.folder === folder);
  const uploadedTypes = new Set(uploaded.map((d) => d.documentType));

  // Folder doesn't apply to this classification and has no files.
  if (expected.length === 0 && uploaded.length === 0) {
    return <span className="text-xs text-muted-foreground">N/A</span>;
  }

  const items = [
    ...uploaded.map((d) => ({
      key: d.id,
      type: d.documentType,
      title: d.fileName,
      missing: false,
    })),
    ...(showMissing
      ? expected
          .filter((t) => !uploadedTypes.has(t))
          .map((t) => ({
            key: `missing-${t}`,
            type: t,
            title: `${DOCUMENT_INFO[t].label} — N/A`,
            missing: true,
          }))
      : []),
  ].sort((a, b) => compareDocumentTypes(a.type, b.type));

  // Missing files are hidden and nothing is uploaded yet.
  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <Tooltip key={item.key}>
          <TooltipTrigger asChild>
            <li
              className={
                item.missing
                  ? "inline-flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive"
                  : "inline-flex items-start gap-1.5 rounded-lg bg-primary-soft px-2 py-1 text-xs font-semibold text-primary"
              }
            >
              {item.missing ? (
                <FileX className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <span>{DOCUMENT_INFO[item.type].label}</span>
            </li>
          </TooltipTrigger>
          <TooltipContent>{item.title}</TooltipContent>
        </Tooltip>
      ))}
    </ul>
  );
}

type SortKey = "studentName" | FolderKey;

const TABLE_PAGE_SIZE = 6;

// How many expected documents of a folder the student has not uploaded yet.
function missingCount(student: StudentWithRequirements, folder: FolderKey): number {
  const uploadedTypes = new Set(
    student.documents.filter((d) => d.folder === folder).map((d) => d.documentType),
  );
  return documentsForFolder(student.classification, folder).filter((t) => !uploadedTypes.has(t))
    .length;
}

function MasterFilePage() {
  const navigate = useNavigate();
  const { data: students = [], isLoading, isError } = useStudents();
  const { search } = useVault();
  const [batchFilter, setBatchFilter] = useState("all");
  const [classificationFilter, setClassificationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showMissing, setShowMissing] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "studentName",
    dir: "asc",
  });
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search, batchFilter, classificationFilter, statusFilter, sort]);

  const batches = useMemo(
    () => Array.from(new Set(students.map((s) => s.batch))).sort(),
    [students],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const dir = sort.dir === "asc" ? 1 : -1;
    const list = students.filter((s) => {
      if (batchFilter !== "all" && s.batch !== batchFilter) return false;
      if (classificationFilter !== "all" && s.classification !== classificationFilter) return false;
      if (statusFilter !== "all" && s.overall !== statusFilter) return false;
      if (!q) return true;
      return (
        s.studentName.toLowerCase().includes(q) ||
        (s.studentNumber ?? "").toLowerCase().includes(q) ||
        s.batch.toLowerCase().includes(q)
      );
    });
    return list.sort((a, b) => {
      const primary =
        sort.key === "studentName"
          ? a.studentName.localeCompare(b.studentName)
          : missingCount(a, sort.key) - missingCount(b, sort.key);
      return primary * dir || a.studentName.localeCompare(b.studentName);
    });
  }, [students, search, batchFilter, classificationFilter, statusFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = rows.slice((currentPage - 1) * TABLE_PAGE_SIZE, currentPage * TABLE_PAGE_SIZE);
  const rangeStart = rows.length === 0 ? 0 : (currentPage - 1) * TABLE_PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * TABLE_PAGE_SIZE, rows.length);

  // Folder columns sort by number of missing files (most missing first).
  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "studentName" ? "asc" : "desc" },
    );

  const headerButton =
    "inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide transition-colors hover:text-primary";

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell
        title="Master File"
        description="Student requirement tracker — Academic Records, Personal Records and Others."
        searchPlaceholder="Search name, student no. or batch…"
      >
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Uploaded
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive" /> N/A
              </span>
              <span>
                Showing {rangeStart}–{rangeEnd} of {rows.length} students
              </span>
            </div>
            <label
              htmlFor="show-missing"
              className="ml-auto inline-flex cursor-pointer items-center gap-2.5 text-sm font-medium text-foreground"
            >
              <Switch id="show-missing" checked={showMissing} onCheckedChange={setShowMissing} />
              Show files not yet uploaded
            </label>
          </div>

          <section className="grid gap-3 sm:grid-cols-3">
            <Select value={batchFilter} onValueChange={setBatchFilter}>
              <SelectTrigger className="h-11 w-full rounded-xl">
                <SelectValue />
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
            <Select value={classificationFilter} onValueChange={setClassificationFilter}>
              <SelectTrigger className="h-11 w-full rounded-xl">
                <SelectValue />
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
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-11 w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Complete">Complete</SelectItem>
                <SelectItem value="Incomplete">Incomplete</SelectItem>
              </SelectContent>
            </Select>
          </section>

          <section className="vault-card overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface hover:bg-surface">
                    <TableHead className="min-w-64">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => toggleSort("studentName")}
                            className={cn(
                              headerButton,
                              sort.key === "studentName" ? "text-primary" : "text-muted-foreground",
                            )}
                          >
                            Student Info
                            <ArrowUpDown className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Sort alphabetically by name (
                          {sort.key === "studentName" && sort.dir === "asc"
                            ? "click for Z–A"
                            : "A–Z"}
                          )
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                    {FOLDERS.map((folder) => (
                      <TableHead key={folder} className="min-w-56">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => toggleSort(folder)}
                              className={cn(
                                headerButton,
                                sort.key === folder ? "text-primary" : "text-muted-foreground",
                              )}
                            >
                              {FOLDER_LABELS[folder]}
                              <ArrowUpDown className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Sort by number of missing files</TooltipContent>
                        </Tooltip>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading &&
                    [0, 1, 2, 3, 4].map((i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 4 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-6 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  {!isLoading &&
                    pagedRows.map((student: StudentWithRequirements) => (
                      <TableRow
                        key={student.id}
                        className="cursor-pointer"
                        onClick={() =>
                          void navigate({
                            to: "/master-file/$studentId",
                            params: { studentId: student.id },
                          })
                        }
                      >
                        <TableCell className="align-top">
                          <Link
                            to="/master-file/$studentId"
                            params={{ studentId: student.id }}
                            className="font-medium text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {student.studentName}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {student.studentNumber ?? "No student no."} · Batch {student.batch}
                          </p>
                          <p className="text-xs text-muted-foreground">{student.classification}</p>
                        </TableCell>
                        {FOLDERS.map((folder) => (
                          <TableCell key={folder} className="align-top">
                            <FolderFiles
                              student={student}
                              folder={folder}
                              showMissing={showMissing}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  {!isLoading && rows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        {isError
                          ? "Students could not be loaded. Please try again."
                          : students.length === 0
                            ? "No students yet."
                            : "No students match your filters."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <PaginationBar page={currentPage} totalPages={totalPages} onChange={setPage} />
        </div>
      </AppShell>
    </TooltipProvider>
  );
}
