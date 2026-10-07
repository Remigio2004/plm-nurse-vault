import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, ClipboardCheck, FileText, Layers, Upload, Users } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DOCUMENT_INFO, FOLDER_LABELS } from "@/data/document-catalog";
import { useStudents } from "@/lib/use-students";
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

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });

function DashboardPage() {
  const { search } = useVault();
  const { data: students = [], isLoading, isError } = useStudents();

  const batches = Array.from(new Set(students.map((s) => s.batch)));
  const allDocs = students.flatMap((s) => s.documents.map((d) => ({ doc: d, student: s })));
  const query = search.trim().toLowerCase();
  const recent = allDocs
    .filter(
      ({ student: s }) =>
        !query ||
        s.studentName.toLowerCase().includes(query) ||
        (s.studentNumber ?? "").toLowerCase().includes(query) ||
        s.batch.toLowerCase().includes(query),
    )
    .sort((a, b) => new Date(b.doc.uploadedAt).getTime() - new Date(a.doc.uploadedAt).getTime())
    .slice(0, 5);

  const stats = [
    {
      label: "Total Files",
      value: `${allDocs.length}`,
      sub: "Documents stored in student folders",
      icon: FileText,
    },
    {
      label: "Batches",
      value: `${batches.length}`,
      sub: `${batches.length === 1 ? "batch" : "batches"} on the Master File`,
      icon: Layers,
    },
    {
      label: "Students",
      value: `${students.length}`,
      sub: "Students on the Master File",
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
              File student documents into their Academic Records, Personal Records or Others folder.
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
              <Link to="/master-file">
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Open Master File
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
              to="/master-file"
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
              recent.map(({ doc, student }) => {
                const Icon = FileText;
                return (
                  <li
                    key={doc.id}
                    className="flex flex-col gap-3 px-6 py-4 transition-colors hover:bg-surface sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft">
                        <Icon className="h-5 w-5 text-primary" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {student.studentName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {student.studentNumber ?? "No student no."} ·{" "}
                          {DOCUMENT_INFO[doc.documentType].label}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="rounded-lg bg-primary-soft text-primary hover:bg-primary-soft">
                        Batch {student.batch}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="rounded-lg border-border text-muted-foreground"
                      >
                        {FOLDER_LABELS[doc.folder]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(doc.uploadedAt)}
                      </span>
                    </div>
                  </li>
                );
              })}
            {!isLoading && recent.length === 0 && (
              <li className="px-6 py-10 text-center text-sm text-muted-foreground">
                {isError
                  ? "Records could not be loaded. Please try again."
                  : query
                    ? "No uploads match your search."
                    : "No uploads yet."}
              </li>
            )}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
