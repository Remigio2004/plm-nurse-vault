import { createFileRoute } from "@tanstack/react-router";
import { Eye, FileUp, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AuditAction, AuditLogEntry } from "@/data/records";
import { useAuditLogs } from "@/lib/use-records";
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
      <div className="space-y-5">
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
      </div>
    </AppShell>
  );
}
