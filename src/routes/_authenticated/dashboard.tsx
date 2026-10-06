import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  FileSpreadsheet,
  FileText,
  FolderTree,
  Layers,
  Upload,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { StudentRecord } from "@/data/records";
import { useRecords } from "@/lib/use-records";
import { useVault } from "@/lib/vault-store";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — NurseVault Records Office" },
      {
        name: "description",
        content:
          "Overview of archived nursing student records, batches and the latest uploads in the NurseVault records office.",
      },
      { property: "og:title", content: "Dashboard — NurseVault Records Office" },
      {
        property: "og:description",
        content: "Overview of archived nursing student records, batches and latest uploads.",
      },
    ],
  }),
  component: DashboardPage,
});

const fileIcon = (type: StudentRecord["fileType"]) =>
  type === "xlsx" ? FileSpreadsheet : FileText;

function DashboardPage() {
  const { search } = useVault();
  const { data: records = [], isLoading, isError } = useRecords();

  const batches = Array.from(new Set(records.map((r) => r.batch)));
  const query = search.trim().toLowerCase();
  const recent = records
    .filter(
      (r) =>
        !query ||
        r.studentName.toLowerCase().includes(query) ||
        r.studentNumber.toLowerCase().includes(query) ||
        r.batch.toLowerCase().includes(query),
    )
    .slice(0, 5);

  const stats = [
    {
      label: "Total Records",
      value: `${records.length}`,
      sub: "Documents stored in the vault",
      icon: FileText,
    },
    {
      label: "Batches / Folders",
      value: `${batches.length}`,
      sub: `${batches.length === 1 ? "batch" : "batches"} currently indexed`,
      icon: Layers,
    },
    {
      label: "Students Covered",
      value: `${new Set(records.map((r) => r.studentNumber)).size}`,
      sub: "Unique students archived so far",
      icon: Users,
    },
  ];

  return (
    <AppShell
      title="Dashboard"
      description="A quick look at the College of Nursing digital archive."
    >
      <div className="space-y-8">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading
            ? [0, 1, 2].map((i) => (
                <div key={i} className="vault-card p-5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="mt-3 h-8 w-16" />
                  <Skeleton className="mt-2 h-3 w-36" />
                </div>
              ))
            : stats.map(({ label, value, sub, icon: Icon }) => (
                <div
                  key={label}
                  className="vault-card group p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{label}</p>
                      <p className="mt-2 text-3xl font-semibold tracking-tight text-primary">
                        {value}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
                    </div>
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft transition-colors group-hover:bg-gold-soft">
                      <Icon className="h-5 w-5 text-primary transition-colors group-hover:text-gold-foreground" />
                    </span>
                  </div>
                </div>
              ))}
        </section>

        <section className="vault-card flex flex-col gap-4 overflow-hidden p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Add a scanned record</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              File a new student document into its batch, category and status folder.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              className="h-11 rounded-xl bg-gold text-gold-foreground shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-gold/90 hover:shadow-lift"
            >
              <Link to="/upload">
                <Upload className="mr-2 h-4 w-4" />
                Upload New Record
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-11 rounded-xl border-primary/30 text-primary hover:bg-primary-soft"
            >
              <Link to="/browse">
                <FolderTree className="mr-2 h-4 w-4" />
                Browse Folders
              </Link>
            </Button>
          </div>
        </section>

        <section className="vault-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">Recent uploads</h2>
              <p className="text-xs text-muted-foreground">Last five documents filed</p>
            </div>
            <Link
              to="/browse"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-secondary"
            >
              View all
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <ul className="divide-y divide-border">
            {isLoading &&
              [0, 1, 2, 3, 4].map((i) => (
                <li key={i} className="flex items-center gap-3 px-6 py-4">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="mt-2 h-3 w-56" />
                  </div>
                </li>
              ))}
            {!isLoading &&
              recent.map((record) => {
                const Icon = fileIcon(record.fileType);
                return (
                  <li
                    key={record.id}
                    className="flex flex-col gap-3 px-6 py-4 transition-colors hover:bg-surface sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft">
                        <Icon className="h-5 w-5 text-primary" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {record.studentName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {record.studentNumber}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="rounded-lg bg-primary-soft text-primary hover:bg-primary-soft">
                        {record.batch}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="rounded-lg border-border text-muted-foreground"
                      >
                        {record.category}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{record.uploadDate}</span>
                    </div>
                  </li>
                );
              })}
            {!isLoading && recent.length === 0 && (
              <li className="px-6 py-10 text-center text-sm text-muted-foreground">
                {isError
                  ? "Records could not be loaded. Please try again."
                  : "No records match your search."}
              </li>
            )}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
