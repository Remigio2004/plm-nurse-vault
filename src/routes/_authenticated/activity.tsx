import { createFileRoute } from "@tanstack/react-router";
import { Eye, FileUp, Pencil, RotateCcw, Trash2 } from "lucide-react";
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
import type { AuditAction, AuditLogEntry, DeletedRecord } from "@/data/records";
import { useAuditLogs, useDeletedRecords, usePurgeRecord, useRestoreRecord } from "@/lib/use-records";
import { useVault } from "@/lib/vault-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Activity Log — NurseVault" },
      {
        name: "description",
        content:
          "Immutable audit trail of every record upload, edit, deletion and file view in the PLM College of Nursing records office.",
      },
      { property: "og:title", content: "Activity Log — NurseVault" },
      {
        property: "og:description",
        content: "Immutable audit trail of every record action in NurseVault.",
      },
    ],
  }),
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

function summarizeDetails(entry: AuditLogEntry) {
  const details = entry.details;
  if (!details) return null;
  if (typeof details["folder"] === "string") return `Folder: ${details["folder"]}`;
  if (details["changed"] && typeof details["changed"] === "object") {
    return `Changed: ${Object.keys(details["changed"] as Record<string, unknown>).join(", ")}`;
  }
  if (typeof details["file_name"] === "string") return `File: ${details["file_name"]}`;
  return null;
}

function ActivityPage() {
  const { search } = useVault();
  const { data, isLoading, isError } = useAuditLogs();
  const [actionFilter, setActionFilter] = useState<"all" | AuditAction>("all");

  const { data: deletedData, isLoading: deletedLoading, isError: deletedError } = useDeletedRecords();
  const restoreMutation = useRestoreRecord();
  const purgeMutation = usePurgeRecord();
  const [purgeTarget, setPurgeTarget] = useState<DeletedRecord | null>(null);

  const deletedEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (deletedData ?? []).filter(
      (r) =>
        !q ||
        r.studentName.toLowerCase().includes(q) ||
        r.studentNumber.toLowerCase().includes(q) ||
        r.batch.toLowerCase().includes(q),
    );
  }, [deletedData, search]);

  const handleRestore = (record: DeletedRecord) => {
    void restoreMutation.mutateAsync(record.id).then(
      () => toast.success("Record restored", { description: record.studentName }),
      () => undefined,
    );
  };

  const confirmPurge = () => {
    if (!purgeTarget) return;
    const target = purgeTarget;
    setPurgeTarget(null);
    void purgeMutation.mutateAsync(target.id).then(
      () => toast.success("Permanently deleted", { description: target.studentName }),
      () => undefined,
    );
  };

  const entries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter(
      (entry) =>
        (actionFilter === "all" || entry.action === actionFilter) &&
        (!q ||
          entry.recordSummary.toLowerCase().includes(q) ||
          (entry.performedByEmail ?? "").toLowerCase().includes(q)),
    );
  }, [data, actionFilter, search]);

  return (
    <AppShell
      title="Activity Log"
      description="Every upload, edit, deletion and file view is permanently recorded."
      searchPlaceholder="Search activity by student or user…"
    >
      <Tabs defaultValue="log" className="space-y-5">
        <TabsList className="rounded-xl bg-muted p-1">
          <TabsTrigger
            value="log"
            className="rounded-lg px-4 data-[state=active]:bg-background data-[state=active]:text-primary"
          >
            Activity Log
          </TabsTrigger>
          <TabsTrigger
            value="deleted"
            className="rounded-lg px-4 data-[state=active]:bg-background data-[state=active]:text-primary"
          >
            Recently Deleted
          </TabsTrigger>
        </TabsList>

        <TabsContent value="log" className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Select
              value={actionFilter}
              onValueChange={(value) => setActionFilter(value as "all" | AuditAction)}
            >
              <SelectTrigger className="h-10 w-full rounded-xl bg-background sm:w-56">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="upload">Upload</SelectItem>
                <SelectItem value="edit">Edit</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
                <SelectItem value="view">View</SelectItem>
                <SelectItem value="restore">Restore</SelectItem>
                <SelectItem value="purge">Permanently Deleted</SelectItem>
              </SelectContent>
            </Select>
            {!isLoading && !isError && (
              <p className="text-xs text-muted-foreground">
                Showing {entries.length} {entries.length === 1 ? "entry" : "entries"}.
              </p>
            )}
          </div>

          {isError && (
            <p className="vault-card p-10 text-center text-sm text-destructive">
              Could not load the activity log. Please refresh and try again.
            </p>
          )}

          {isLoading && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="vault-card h-20 animate-pulse bg-muted/40" />
              ))}
            </div>
          )}

          {!isLoading && !isError && (
            <ol className="flex flex-col gap-2">
              {entries.map((entry) => {
                const meta = actionMeta[entry.action] ?? actionMeta.view;
                const Icon = meta.icon;
                const detail = summarizeDetails(entry);
                return (
                  <li
                    key={entry.id}
                    className="vault-card flex items-start gap-4 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
                  >
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                        meta.className,
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="rounded-lg border-border text-[11px]">
                          {meta.label}
                        </Badge>
                        <p className="truncate text-sm font-semibold text-foreground">
                          {entry.recordSummary}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {entry.performedByEmail ?? "Unknown user"} · {formatTime(entry.timestamp)}
                      </p>
                      {detail && (
                        <p className="mt-1 truncate text-xs text-muted-foreground/80">{detail}</p>
                      )}
                    </div>
                  </li>
                );
              })}
              {entries.length === 0 && (
                <li className="vault-card p-10 text-center text-sm text-muted-foreground">
                  No activity recorded yet.
                </li>
              )}
            </ol>
          )}
        </TabsContent>

        <TabsContent value="deleted" className="space-y-5">
          {deletedError && (
            <p className="vault-card p-10 text-center text-sm text-destructive">
              Could not load recently deleted records. Please refresh and try again.
            </p>
          )}

          {deletedLoading && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="vault-card h-20 animate-pulse bg-muted/40" />
              ))}
            </div>
          )}

          {!deletedLoading && !deletedError && (
            <ol className="flex flex-col gap-2">
              {deletedEntries.map((record) => (
                <li
                  key={record.id}
                  className="vault-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {record.studentName}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {record.studentNumber} · {record.batch} / {record.category} / {record.status}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/80">
                      Deleted {formatTime(record.deletedAt)} · auto-purges after 30 days
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => handleRestore(record)}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      Restore
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10"
                      onClick={() => setPurgeTarget(record)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Delete Permanently
                    </Button>
                  </div>
                </li>
              ))}
              {deletedEntries.length === 0 && (
                <li className="vault-card p-10 text-center text-sm text-muted-foreground">
                  Nothing in Recently Deleted.
                </li>
              )}
            </ol>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!purgeTarget} onOpenChange={(open) => !open && setPurgeTarget(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              {purgeTarget?.studentName}'s file will be permanently removed from storage. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmPurge}
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
