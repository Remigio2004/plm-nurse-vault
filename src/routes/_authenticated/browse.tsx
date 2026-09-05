import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowUpDown,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Folder,
  Grid2x2,
  List,
  Pencil,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RecordStatus, StudentCategory, StudentRecord } from "@/data/records";
import { Label } from "@/components/ui/label";
import { createSignedUrl, unlockFileInfo } from "@/lib/records-api";
import { useDeleteRecord, useRecords, useRenameFile, useUpdateRecord } from "@/lib/use-records";
import { useVault } from "@/lib/vault-store";
import { capitalizeWords, cn, formatStudentNumber } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/browse")({
  head: () => ({
    meta: [
      { title: "Browse Folders — NurseVault" },
      {
        name: "description",
        content:
          "Navigate nursing student records by batch, student category and status, or search the full records table.",
      },
      { property: "og:title", content: "Browse Folders — NurseVault" },
      {
        property: "og:description",
        content: "Navigate records by batch, category and status, or search the full records table.",
      },
    ],
  }),
  component: BrowsePage,
});

type SortKey = "studentName" | "studentNumber" | "batch" | "category" | "status" | "uploadDate";

function matches(record: StudentRecord, query: string) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [
    record.studentName,
    record.studentNumber,
    record.batch,
    record.category,
    record.status,
  ].some((v) => v.toLowerCase().includes(q));
}

type RecordGroup = {
  key: string;
  studentName: string;
  studentNumber: string;
  batch: string;
  category: StudentCategory;
  status: RecordStatus;
  records: StudentRecord[];
};

function groupRecords(records: StudentRecord[]): RecordGroup[] {
  const map = new Map<string, RecordGroup>();
  for (const r of records) {
    const key = `${r.studentNumber}|${r.batch}|${r.category}|${r.status}`;
    const existing = map.get(key);
    if (existing) {
      existing.records.push(r);
    } else {
      map.set(key, {
        key,
        studentName: r.studentName,
        studentNumber: r.studentNumber,
        batch: r.batch,
        category: r.category,
        status: r.status,
        records: [r],
      });
    }
  }
  return Array.from(map.values());
}

function soloGroup(record: StudentRecord): RecordGroup {
  return {
    key: record.id,
    studentName: record.studentName,
    studentNumber: record.studentNumber,
    batch: record.batch,
    category: record.category,
    status: record.status,
    records: [record],
  };
}

function BrowsePage() {
  const { search } = useVault();
  const { data, isLoading, isError } = useRecords();
  const records: StudentRecord[] = data ?? [];
  const updateMutation = useUpdateRecord();
  const deleteMutation = useDeleteRecord();
  const renameMutation = useRenameFile();

  const [path, setPath] = useState<string[]>([]);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [previewGroup, setPreviewGroup] = useState<RecordGroup | null>(null);
  const [previewRecord, setPreviewRecord] = useState<StudentRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleteGroup, setDeleteGroup] = useState<RecordGroup | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StudentRecord | null>(null);
  const [deletePasskey, setDeletePasskey] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<RecordGroup | null>(null);
  const [editUnlock, setEditUnlock] = useState<{ passkey: string | null; fileName: string } | null>(
    null,
  );
  const [editStudentName, setEditStudentName] = useState("");
  const [editStudentNumber, setEditStudentNumber] = useState("");
  const [editBatchYear, setEditBatchYear] = useState("");
  const [editCategory, setEditCategory] = useState<StudentCategory | "">("");
  const [editStatus, setEditStatus] = useState<RecordStatus | "">("");
  const [editFileName, setEditFileName] = useState("");

    const [passkeyPrompt, setPasskeyPrompt] = useState<
    | { purpose: "open"; record: StudentRecord }
    | { purpose: "edit"; record: StudentRecord; group: RecordGroup }
    | { purpose: "delete"; record: StudentRecord }
    | null
  >(null);
  const [passkeyInput, setPasskeyInput] = useState("");
  const [passkeyShow, setPasskeyShow] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  const closeEdit = () => {
    setEditingGroup(null);
    setEditUnlock(null);
  };

  const closeDeletePrompt = () => {
    setPendingDelete(null);
    setDeletePasskey(null);
  };

  const closePasskeyPrompt = () => {
    setPasskeyPrompt(null);
    setPasskeyInput("");
    setPasskeyError(null);
    setPasskeyShow(false);
  };

  const startEdit = async (group: RecordGroup, passkey: string | null) => {
    if (group.records.length === 1) {
      const info = await unlockFileInfo(group.records[0], passkey);
      setEditUnlock({ passkey, fileName: info.fileName });
      setEditFileName(info.fileName);
    } else {
      setEditUnlock(null);
      setEditFileName("");
    }
    setEditingGroup(group);
    setEditStudentName(group.studentName);
    setEditStudentNumber(group.studentNumber);
    setEditBatchYear(group.batch.replace(/\D/g, "").slice(0, 4));
    setEditCategory(group.category);
    setEditStatus(group.status);
  };

  const requestEdit = (group: RecordGroup) => {
    if (group.records.length === 1 && group.records[0].hasPasskey) {
      setPasskeyPrompt({ purpose: "edit", record: group.records[0], group });
      return;
    }
    void startEdit(group, null).catch((error) => {
      toast.error("Could not open record", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    });
  };

  const requestDelete = (record: StudentRecord) => {
    if (record.hasPasskey) {
      setPasskeyPrompt({ purpose: "delete", record });
      return;
    }
    setDeletePasskey(null);
    setPendingDelete(record);
  };

  const requestDeleteGroup = (group: RecordGroup) => {
    if (group.records.length === 1) {
      requestDelete(group.records[0]);
      return;
    }
    setDeleteGroup(group);
  };

  const requestOpenFile = (record: StudentRecord) => {
    if (record.hasPasskey) {
      setPasskeyPrompt({ purpose: "open", record });
      return;
    }
    void openFile(record, null).catch((error) => {
      toast.error("Could not open file", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    });
  };

  const submitPasskey = async () => {
    if (!passkeyPrompt) return;
    setPasskeyBusy(true);
    setPasskeyError(null);
    try {
      if (passkeyPrompt.purpose === "open") {
        await openFile(passkeyPrompt.record, passkeyInput);
        closePasskeyPrompt();
      } else if (passkeyPrompt.purpose === "edit") {
        await startEdit(passkeyPrompt.group, passkeyInput);
        closePasskeyPrompt();
      } else {
        const record = passkeyPrompt.record;
        const passkey = passkeyInput;
        closePasskeyPrompt();
        setTimeout(() => {
          setDeletePasskey(passkey);
          setPendingDelete(record);
        }, 0);
      }
    } catch (error) {
      setPasskeyError(error instanceof Error ? error.message : "Incorrect passkey.");
    } finally {
      setPasskeyBusy(false);
    }
  };

  const [batchFilter, setBatchFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "uploadDate",
    dir: "desc",
  });

  const batches = useMemo(
    () => Array.from(new Set(records.map((r) => r.batch))).sort(),
    [records],
  );

  const scoped = useMemo(
    () =>
      records.filter(
        (r) =>
          (path[0] === undefined || r.batch === path[0]) &&
          (path[1] === undefined || r.category === path[1]) &&
          (path[2] === undefined || r.status === path[2]),
      ),
    [records, path],
  );

  const folders = useMemo(() => {
    if (path.length >= 3) return [];
    const key = (["batch", "category", "status"] as const)[path.length] ?? "batch";
    const names = Array.from(new Set(scoped.map((r) => r[key]))).sort();
    return names.map((name) => ({
      name,
      count: scoped.filter((r) => r[key] === name).length,
    }));
  }, [scoped, path]);

  const folderRecords = path.length >= 3 ? scoped.filter((r) => matches(r, search)) : [];
  const folderGroups = useMemo(() => groupRecords(folderRecords), [folderRecords]);
  const isSearching = search.trim().length > 0;
  const searchResults = isSearching ? records.filter((r) => matches(r, search)) : [];
  const searchGroups = useMemo(() => groupRecords(searchResults), [searchResults]);

  const tableRows = useMemo(() => {
    const rows = records.filter(
      (r) =>
        matches(r, search) &&
        (batchFilter === "all" || r.batch === batchFilter) &&
        (categoryFilter === "all" || r.category === categoryFilter) &&
        (statusFilter === "all" || r.status === statusFilter),
    );
    return rows.sort((a, b) => {
      const cmp = a[sort.key].localeCompare(b[sort.key]);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [records, search, batchFilter, categoryFilter, statusFilter, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    const passkey = deletePasskey;
    closeDeletePrompt();
    await deleteMutation.mutateAsync({ record: target, passkey }).then(
      () => toast.success("Record deleted", { description: target.studentName }),
      () => undefined,
    );
  };

  const confirmEdit = async () => {
    if (!editingGroup) return;
    const group = editingGroup;
    const nextBatch = editBatchYear ? `Batch ${editBatchYear}` : group.batch;
    const passkey = editUnlock?.passkey ?? null;
    const originalFileName = editUnlock?.fileName ?? "";
    const trimmedFileName = editFileName.trim();
    const soleRecord = group.records.length === 1 ? group.records[0] : null;
    closeEdit();

    const patch = {
      studentName: editStudentName.trim(),
      studentNumber: editStudentNumber.trim(),
      batch: nextBatch,
      category: editCategory as StudentCategory,
      status: editStatus as RecordStatus,
    };

    let updatedCount = 0;
    for (const target of group.records) {
      try {
        await updateMutation.mutateAsync({ record: target, patch });
        updatedCount += 1;
      } catch {
        // individual failure is surfaced by the mutation's own error handling
      }
    }
    if (updatedCount > 0) {
      toast.success(updatedCount === 1 ? "Record updated" : `${updatedCount} records updated`, {
        description: editStudentName.trim(),
      });
    }

    if (soleRecord && trimmedFileName && trimmedFileName !== originalFileName) {
      await renameMutation
        .mutateAsync({ record: soleRecord, passkey, newFileName: trimmedFileName })
        .then(
          () => toast.success("File renamed", { description: trimmedFileName }),
          () => undefined,
        );
    }
  };

  const openFile = async (record: StudentRecord, passkey: string | null) => {
    setPreviewLoading(true);
    try {
      const url = await createSignedUrl(record, passkey);
      setPreviewUrl(url);
    } finally {
      setPreviewLoading(false);
    }
  };

  const openPreview = (group: RecordGroup) => {
    setPreviewGroup(group);
    setPreviewRecord(group.records.length === 1 ? group.records[0] : null);
    setPreviewUrl(null);
    setPreviewLoading(false);
  };

  const closePreview = () => {
    setPreviewGroup(null);
    setPreviewRecord(null);
    setPreviewUrl(null);
    setPreviewLoading(false);
  };

  const selectPreviewFile = (record: StudentRecord) => {
    setPreviewRecord(record);
    setPreviewUrl(null);
    setPreviewLoading(false);
  };

  const backToFileList = () => {
    setPreviewRecord(null);
    setPreviewUrl(null);
    setPreviewLoading(false);
  };

  const openRecordDirectly = (record: StudentRecord) => {
    openPreview(soloGroup(record));
  };

  useEffect(() => {
    if (!previewUrl) return;
    const timer = setTimeout(() => {
      closePreview();
    }, 5 * 60 * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewUrl]);

  if (isLoading || isError) {
    return (
      <AppShell title="Browse Folders" description="Batch → Student Category → Status → records.">
        {isError ? (
          <p className="vault-card p-10 text-center text-sm text-destructive">
            Could not load records. Please refresh and try again.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="vault-card h-28 animate-pulse bg-muted/40 p-5" />
            ))}
          </div>
        )}
      </AppShell>
    );
  }

  return (
    <AppShell title="Browse Folders" description="Batch → Student Category → Status → records.">
      <Tabs defaultValue="folders" className="space-y-6">

        <TabsList className="rounded-xl bg-muted p-1">
          <TabsTrigger value="folders" className="rounded-lg px-4 data-[state=active]:bg-background data-[state=active]:text-primary">
            Folder View
          </TabsTrigger>
          <TabsTrigger value="table" className="rounded-lg px-4 data-[state=active]:bg-background data-[state=active]:text-primary">
            Records Table
          </TabsTrigger>
        </TabsList>

        <TabsContent value="folders" className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
              {isSearching ? (
                <span className="rounded-lg px-2 py-1 font-medium text-primary">
                  Search results for &quot;{search.trim()}&quot;
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
                  {path.map((segment, i) => (
                    <span key={segment} className="flex items-center gap-1">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      <button
                        onClick={() => setPath(path.slice(0, i + 1))}
                        className={cn(
                          "rounded-lg px-2 py-1 font-medium transition-colors hover:bg-primary-soft",
                          i === path.length - 1 ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {segment}
                      </button>
                    </span>
                  ))}
                </>
              )}
            </nav>

            <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Grid view"
                onClick={() => setView("grid")}
                className={cn("h-8 w-8 rounded-lg", view === "grid" && "bg-primary-soft text-primary")}
              >
                <Grid2x2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="List view"
                onClick={() => setView("list")}
                className={cn("h-8 w-8 rounded-lg", view === "list" && "bg-primary-soft text-primary")}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {!isSearching && folders.length > 0 && (
            <div
              className={cn(
                view === "grid"
                  ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                  : "flex flex-col gap-2",
              )}
            >
              {folders.map((folder) => (
                <button
                  key={folder.name}
                  onClick={() => setPath([...path, folder.name])}
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
                      {folder.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {folder.count} {folder.count === 1 ? "record" : "records"}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          )}

          {!isSearching && path.length >= 3 && (
            <div
              className={cn(
                view === "grid"
                  ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                  : "flex flex-col gap-2",
              )}
            >
              {folderGroups.map((group) => (
                <div
                  key={group.key}
                  className={cn(
                    "vault-card group transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift",
                    view === "grid" ? "p-5" : "flex items-center gap-4 p-4",
                  )}
                >
                  <button
                    onClick={() => openPreview(group)}
                    className={cn(
                      "text-left",
                      view === "grid" ? "block w-full" : "flex min-w-0 flex-1 items-center gap-4",
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
                      <span className="flex items-center gap-2">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {group.studentName}
                        </span>
                        {group.records.length > 1 && (
                          <Badge className="shrink-0 rounded-lg bg-primary-soft text-primary hover:bg-primary-soft">
                            {group.records.length} files
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {group.studentNumber}
                      </span>
                    </span>
                  </button>
                  <div className={cn("flex gap-1", view === "grid" && "mt-4")}>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit record"
                      className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-primary-soft hover:text-primary"
                      onClick={() => requestEdit(group)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete record"
                      className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => requestDeleteGroup(group)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {folderGroups.length === 0 && (
                <p className="vault-card p-10 text-center text-sm text-muted-foreground sm:col-span-full">
                  This folder has no records matching your search.
                </p>
              )}
            </div>
          )}

          {isSearching && (
            <div
              className={cn(
                view === "grid"
                  ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                  : "flex flex-col gap-2",
              )}
            >
              {searchGroups.map((group) => (
                <div
                  key={group.key}
                  className={cn(
                    "vault-card group transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift",
                    view === "grid" ? "p-5" : "flex items-center gap-4 p-4",
                  )}
                >
                  <button
                    onClick={() => openPreview(group)}
                    className={cn(
                      "text-left",
                      view === "grid" ? "block w-full" : "flex min-w-0 flex-1 items-center gap-4",
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
                      <span className="flex items-center gap-2">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {group.studentName}
                        </span>
                        {group.records.length > 1 && (
                          <Badge className="shrink-0 rounded-lg bg-primary-soft text-primary hover:bg-primary-soft">
                            {group.records.length} files
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {group.studentNumber}
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        <Badge className="rounded-lg bg-primary-soft text-primary hover:bg-primary-soft">
                          {group.batch}
                        </Badge>
                        <Badge variant="outline" className="rounded-lg border-border text-muted-foreground">
                          {group.category}
                        </Badge>
                        <Badge variant="outline" className="rounded-lg border-border text-muted-foreground">
                          {group.status}
                        </Badge>
                      </span>
                    </span>
                  </button>
                  <div className={cn("flex gap-1", view === "grid" && "mt-4")}>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit record"
                      className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-primary-soft hover:text-primary"
                      onClick={() => requestEdit(group)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete record"
                      className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => requestDeleteGroup(group)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {searchGroups.length === 0 && (
                <p className="vault-card p-10 text-center text-sm text-muted-foreground sm:col-span-full">
                  No records match your search.
                </p>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="table" className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Select value={batchFilter} onValueChange={setBatchFilter}>
              <SelectTrigger className="h-10 rounded-xl bg-background">
                <SelectValue placeholder="All batches" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">All batches</SelectItem>
                {batches.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-10 rounded-xl bg-background">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="CN Graduate">CN Graduate</SelectItem>
                <SelectItem value="CN Honorable Dismissal">CN Honorable Dismissal</SelectItem>
                <SelectItem value="CN Transferee">CN Transferee</SelectItem>
                <SelectItem value="CN Others">CN Others</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-10 rounded-xl bg-background">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Regular">Regular</SelectItem>
                <SelectItem value="Irregular">Irregular</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="vault-card overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface hover:bg-surface">
                    {(
                      [
                        ["studentName", "Student Name"],
                        ["studentNumber", "Student Number"],
                        ["batch", "Batch"],
                        ["category", "Category"],
                        ["status", "Status"],
                        ["uploadDate", "Upload Date"],
                      ] as [SortKey, string][]
                    ).map(([key, label]) => (
                      <TableHead
                        key={key}
                        className={cn(
                          "whitespace-nowrap",
                          (key === "batch" || key === "status") && "text-center",
                        )}
                      >
                        <button
                          onClick={() => toggleSort(key)}
                          className={cn(
                            "inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-primary",
                            (key === "batch" || key === "status") && "justify-center",
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
                    ))}
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableRows.map((record) => (
                    <TableRow
                      key={record.id}
                      className="cursor-pointer transition-colors hover:bg-surface"
                      onDoubleClick={() => openRecordDirectly(record)}
                    >
                      <TableCell className="font-medium text-foreground">
                        <button
                          onClick={() => openPreview(soloGroup(record))}
                          className="text-left hover:text-primary"
                        >
                          {record.studentName}
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{record.studentNumber}</TableCell>
                      <TableCell className="text-center">
                        <Badge className="rounded-lg bg-primary-soft text-primary hover:bg-primary-soft">
                          {record.batch}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{record.category}</TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-lg",
                            record.status === "Regular"
                              ? "border-accent/40 text-secondary"
                              : "border-gold/50 text-gold-foreground",
                          )}
                        >
                          {record.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {record.uploadDate}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit record"
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-primary-soft hover:text-primary"
                            onClick={() => requestEdit(soloGroup(record))}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete record"
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => requestDelete(record)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {tableRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                        No records match your search and filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Showing {tableRows.length} of {records.length} records.
          </p>
        </TabsContent>
      </Tabs>

      <Dialog open={!!previewGroup} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className={cn("rounded-xl", previewUrl ? "sm:max-w-5xl" : "sm:max-w-2xl")}>
          <DialogHeader>
            <DialogTitle className="text-base">{previewGroup?.studentName}</DialogTitle>
          </DialogHeader>

          {previewGroup && previewGroup.records.length > 1 && !previewRecord && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                This student has {previewGroup.records.length} files. Select one to open:
              </p>
              {previewGroup.records.map((record, index) => (
                <button
                  key={record.id}
                  onClick={() => selectPreviewFile(record)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-accent hover:bg-primary-soft"
                >
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    File {index + 1} — uploaded {record.uploadDate}
                  </span>
                  {record.hasPasskey && (
                    <Badge
                      variant="outline"
                      className="shrink-0 rounded-lg border-border text-muted-foreground"
                    >
                      Locked
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          )}

          {previewRecord && (
            <>
              {previewGroup && previewGroup.records.length > 1 && (
                <button
                  onClick={backToFileList}
                  className="text-left text-xs font-medium text-primary hover:underline"
                >
                  ← Back to files
                </button>
              )}
              {previewUrl ? (
                <div className="overflow-hidden rounded-xl border border-input">
                  <iframe src={previewUrl} title="Document preview" className="h-[62vh] w-full" />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-input bg-surface px-6 py-10 text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-soft">
                    <FileText className="h-8 w-8 text-gold-foreground" />
                  </span>
                  <p className="mt-4 text-sm font-medium text-foreground">Secured document</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Opens here using a temporary signed link.
                  </p>
                  <Button
                    className="mt-4 rounded-xl bg-primary text-primary-foreground hover:bg-secondary"
                    onClick={() => requestOpenFile(previewRecord)}
                    disabled={previewLoading}
                  >
                    {previewLoading ? "Loading…" : "Open file"}
                  </Button>
                </div>
              )}
            </>
          )}

          {previewGroup && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Student</dt>
                <dd className="font-medium">{previewGroup.studentName}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Student Number</dt>
                <dd className="font-medium">{previewGroup.studentNumber}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Folder</dt>
                <dd className="font-medium">
                  {previewGroup.batch} / {previewGroup.category} / {previewGroup.status}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Files</dt>
                <dd className="font-medium">{previewGroup.records.length}</dd>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingGroup} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="rounded-xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Edit record</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="editStudentName">Student Name</Label>
              <Input
                id="editStudentName"
                value={editStudentName}
                onChange={(e) => setEditStudentName(capitalizeWords(e.target.value))}
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="editStudentNumber">Student Number</Label>
              <Input
                id="editStudentNumber"
                inputMode="numeric"
                value={editStudentNumber}
                onChange={(e) => setEditStudentNumber(formatStudentNumber(e.target.value))}
                maxLength={10}
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="editBatchYear">Batch</Label>
              <div className="flex h-11 items-center overflow-hidden rounded-xl border border-input bg-transparent focus-within:ring-1 focus-within:ring-ring">
                <input
                  id="editBatchYear"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={editBatchYear}
                  onChange={(e) => setEditBatchYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  maxLength={4}
                  className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground md:text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Student Category</Label>
              <Select value={editCategory} onValueChange={(v) => setEditCategory(v as StudentCategory)}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="CN Graduate">CN Graduate</SelectItem>
                  <SelectItem value="CN Honorable Dismissal">CN Honorable Dismissal</SelectItem>
                  <SelectItem value="CN Transferee">CN Transferee</SelectItem>
                  <SelectItem value="CN Others">CN Others</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as RecordStatus)}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="Regular">Regular</SelectItem>
                  <SelectItem value="Irregular">Irregular</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editingGroup && editingGroup.records.length > 1 && (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Editing shared details for {editingGroup.records.length} files.
              </p>
            )}

            {editingGroup && editingGroup.records.length === 1 && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="editFileName">File Name</Label>
                <Input
                  id="editFileName"
                  value={editFileName}
                  onChange={(e) => setEditFileName(e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="rounded-xl" onClick={closeEdit}>
              Cancel
            </Button>
            <Button
              className="rounded-xl bg-primary text-primary-foreground hover:bg-secondary"
              onClick={confirmEdit}
            >
              Save changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

            <Dialog open={!!deleteGroup} onOpenChange={(open) => !open && setDeleteGroup(null)}>
        <DialogContent className="rounded-xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Select a file to delete</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {deleteGroup?.studentName} has {deleteGroup?.records.length} files. Choose which one to
            delete.
          </p>
          <div className="space-y-2">
            {deleteGroup?.records.map((record, index) => (
              <button
                key={record.id}
                onClick={() => {
                  setDeleteGroup(null);
                  requestDelete(record);
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-destructive/40 hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 shrink-0 text-destructive" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  File {index + 1} — uploaded {record.uploadDate}
                </span>
                {record.hasPasskey && (
                  <Badge
                    variant="outline"
                    className="shrink-0 rounded-lg border-border text-muted-foreground"
                  >
                    Locked
                  </Badge>
                )}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <Button variant="outline" className="rounded-xl" onClick={() => setDeleteGroup(null)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!passkeyPrompt} onOpenChange={(open) => !open && closePasskeyPrompt()}>
        <DialogContent className="rounded-xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Enter passkey</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {passkeyPrompt?.record.studentName} is locked. Enter its passkey to continue.
          </p>
          <div className="space-y-2">
            <Label htmlFor="passkeyInput">Passkey</Label>
            <div className="relative">
              <Input
                id="passkeyInput"
                type={passkeyShow ? "text" : "password"}
                value={passkeyInput}
                onChange={(e) => setPasskeyInput(e.target.value)}
                className="h-11 rounded-xl pr-10"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && void submitPasskey()}
              />
              <button
                type="button"
                onClick={() => setPasskeyShow((v) => !v)}
                className="absolute inset-y-0 right-3 flex items-center text-muted-foreground"
                aria-label={passkeyShow ? "Hide passkey" : "Show passkey"}
              >
                {passkeyShow ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {passkeyError && <p className="text-xs text-destructive">{passkeyError}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="rounded-xl" onClick={closePasskeyPrompt}>
              Cancel
            </Button>
            <Button
              className="rounded-xl bg-primary text-primary-foreground hover:bg-secondary"
              onClick={() => void submitPasskey()}
              disabled={passkeyBusy || !passkeyInput}
            >
              {passkeyBusy ? "Verifying..." : "Unlock"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && closeDeletePrompt()}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.studentName}'s record and its stored file will be permanently deleted.
              This action is recorded in the activity log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
