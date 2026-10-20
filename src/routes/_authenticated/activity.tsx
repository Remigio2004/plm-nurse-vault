import { createFileRoute } from "@tanstack/react-router";
import { Eye, FileUp, Folder, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AuditAction } from "@/data/records";
import type { StudentTrashEntry } from "@/data/students";
import { errorMessage } from "@/lib/students-api";
import { useStudentTrash, useManageStudentTrash } from "@/lib/use-students";
import {
  useAuditLogs,
  useDeletedRecords,
  usePurgeRecord,
  useRestoreRecord,
} from "@/lib/use-records";
import { useVault } from "@/lib/vault-store";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({ meta: [{ title: "Activity Log — NurseVault" }] }),
  component: ActivityPage,
});

const actionMeta: Record<AuditAction, { label: string; icon: typeof Eye; className: string }> = {
  upload: { label: "Upload", icon: FileUp, className: "bg-primary-soft text-primary" },
  edit: { label: "Edit", icon: Pencil, className: "bg-gold-soft text-gold-foreground" },
  delete: { label: "Delete", icon: Trash2, className: "bg-destructive/10 text-destructive" },
  view: { label: "View", icon: Eye, className: "bg-muted text-muted-foreground" },
  restore: { label: "Restore", icon: RotateCcw, className: "bg-secondary/10 text-secondary" },
  purge: {
    label: "Permanently Deleted",
    icon: Trash2,
    className: "bg-destructive/10 text-destructive",
  },
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
type TrashItem = Omit<StudentTrashEntry, "kind"> & { kind: "student" | "document" | "legacy" };

function ActivityPage() {
  const { search } = useVault();
  const log = useAuditLogs();
  const trash = useStudentTrash();
  const legacy = useDeletedRecords();
  const manageTrash = useManageStudentTrash();
  const restoreLegacy = useRestoreRecord();
  const purgeLegacy = usePurgeRecord();
  const [actionFilter, setActionFilter] = useState<"all" | AuditAction>("all");
  const [purgeTarget, setPurgeTarget] = useState<TrashItem | null>(null);
  const busy = manageTrash.isPending || restoreLegacy.isPending || purgeLegacy.isPending;
  const q = search.trim().toLowerCase();
  const deleted = useMemo(
    () =>
      [
        ...(trash.data ?? []),
        ...(legacy.data ?? []).map((r): TrashItem => ({
          id: r.id,
          kind: "legacy",
          studentName: r.studentName,
          studentNumber: r.studentNumber,
          batch: r.batch,
          classification: r.category,
          fileName: null,
          fileCount: 1,
          deletedAt: r.deletedAt,
        })),
      ]
        .filter(
          (r) =>
            !q ||
            [r.studentName, r.studentNumber, r.batch, r.fileName].some((value) =>
              value?.toLowerCase().includes(q),
            ),
        )
        .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)),
    [trash.data, legacy.data, q],
  );
  const entries = (log.data ?? []).filter(
    (entry) =>
      (actionFilter === "all" || entry.action === actionFilter) &&
      (!q ||
        entry.recordSummary.toLowerCase().includes(q) ||
        entry.performedByEmail?.toLowerCase().includes(q)),
  );

  const act = async (item: TrashItem, action: "restore" | "purge") => {
    try {
      let merged = false;
      if (item.kind === "legacy") {
        if (action === "restore") await restoreLegacy.mutateAsync(item.id);
        else await purgeLegacy.mutateAsync(item.id);
      } else {
        const id = await manageTrash.mutateAsync({ id: item.id, kind: item.kind, action });
        merged = id !== item.id;
      }
      toast.success(
        action === "purge"
          ? "Permanently deleted"
          : merged
            ? "Files restored into the existing student folder"
            : "Restored",
        { description: item.fileName ?? item.studentName },
      );
    } catch (error) {
      if (item.kind !== "legacy")
        toast.error(action === "restore" ? "Could not restore" : "Could not delete permanently", {
          description: errorMessage(error),
        });
    }
  };

  return (
    <AppShell
      title="Activity Log"
      description="Record activity and recover deleted files or student folders within 30 days."
      searchPlaceholder="Search activity or deleted items…"
    >
      <Tabs defaultValue="log" className="space-y-5">
        <TabsList>
          <TabsTrigger value="log">Activity Log</TabsTrigger>
          <TabsTrigger value="deleted">Recently Deleted</TabsTrigger>
        </TabsList>
        <TabsContent value="log" className="space-y-5">
          <Select
            value={actionFilter}
            onValueChange={(v) => setActionFilter(v as "all" | AuditAction)}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {Object.entries(actionMeta).map(([key, meta]) => (
                <SelectItem key={key} value={key}>
                  {meta.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {log.isLoading && <p role="status">Loading activity…</p>}
          {log.isError && (
            <p className="text-destructive">
              Could not load activity.{" "}
              <Button variant="link" onClick={() => void log.refetch()}>
                Retry
              </Button>
            </p>
          )}
          <ol className="space-y-2">
            {entries.map((entry) => {
              const meta = actionMeta[entry.action] ?? actionMeta.view;
              const Icon = meta.icon;
              const filename = entry.details?.["file_name"] ?? entry.details?.["file"];
              return (
                <li key={entry.id} className="vault-card flex items-start gap-4 p-4">
                  <span className={`rounded-xl p-3 ${meta.className}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <Badge variant="outline">{meta.label}</Badge>
                    <p className="mt-1 break-words text-sm font-semibold">{entry.recordSummary}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.performedByEmail ?? "System"} · {formatTime(entry.timestamp)}
                    </p>
                    {typeof filename === "string" && (
                      <p className="break-all text-xs text-muted-foreground">{filename}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {!log.isLoading && !log.isError && !entries.length && (
            <p className="vault-card p-10 text-center text-sm text-muted-foreground">
              No activity found.
            </p>
          )}
        </TabsContent>
        <TabsContent value="deleted" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Items are kept for 30 days. Restoring a folder merges its files into an existing folder
            for the same student, without overwriting current files.
          </p>
          {trash.isLoading && <p role="status">Loading deleted files and folders…</p>}
          {trash.isError && (
            <p className="text-destructive">
              Could not load deleted files and folders.{" "}
              <Button variant="link" onClick={() => void trash.refetch()}>
                Retry
              </Button>
            </p>
          )}
          {legacy.isError && (
            <p className="text-sm text-muted-foreground">
              Older records could not be loaded.{" "}
              <Button variant="link" onClick={() => void legacy.refetch()}>
                Retry
              </Button>
            </p>
          )}
          <ol className="space-y-2">
            {deleted.map((item) => {
              const expiresAt = new Date(
                new Date(item.deletedAt).getTime() + 30 * 86400_000,
              ).toISOString();
              const expired = Date.parse(expiresAt) <= Date.now();
              return (
                <li
                  key={`${item.kind}-${item.id}`}
                  className="vault-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      {item.kind === "student" && <Folder className="h-4 w-4 shrink-0" />}
                      <span className="break-all">
                        {item.studentName}
                        {item.fileName ? ` · ${item.fileName}` : ""}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.kind === "student"
                        ? `Student folder · ${item.fileCount} files`
                        : item.kind === "legacy"
                          ? "Older record"
                          : "Document"}{" "}
                      · Batch {item.batch} · {item.classification}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Deleted {formatTime(item.deletedAt)} · Permanent deletion{" "}
                      {formatTime(expiresAt)}
                      {expired ? " · Cleanup pending" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || expired}
                      onClick={() => void act(item, "restore")}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      className="text-destructive"
                      onClick={() => setPurgeTarget(item)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete Permanently
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
          {!trash.isLoading &&
            !legacy.isLoading &&
            !trash.isError &&
            !legacy.isError &&
            !deleted.length && (
              <p className="vault-card p-10 text-center text-sm text-muted-foreground">
                Nothing in Recently Deleted.
              </p>
            )}
        </TabsContent>
      </Tabs>
      <AlertDialog open={!!purgeTarget} onOpenChange={(open) => !open && setPurgeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Permanently delete{" "}
              {purgeTarget?.kind === "student" ? "this folder and its files" : "this file"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {purgeTarget?.studentName} — this cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => {
                const target = purgeTarget;
                setPurgeTarget(null);
                if (target) void act(target, "purge");
              }}
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
