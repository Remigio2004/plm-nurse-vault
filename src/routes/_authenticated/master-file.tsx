import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Plus, Search, Users } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  CLASSIFICATIONS,
  DOCUMENT_SHORT_LABELS,
  REQUIRED_DOCUMENT_TYPES,
  formatStudentName,
  type RequirementStatus,
  type StudentWithRequirements,
} from "@/data/students";
import { logStudentAudit } from "@/lib/students-api";
import { useCreateStudent, useStudents } from "@/lib/use-students";

export const Route = createFileRoute("/_authenticated/master-file")({
  head: () => ({
    meta: [
      { title: "Master File — NurseVault Records Office" },
      {
        name: "description",
        content:
          "Student requirement tracker for the PLM College of Nursing — TOR, Honorable Dismissal, Curriculum Checklist, Study Plan and Library Card status per student.",
      },
    ],
  }),
  component: MasterFilePage,
});

const STATUS_PILL_CLASS: Record<RequirementStatus, string> = {
  Submitted: "bg-primary-soft text-primary",
  Missing: "bg-destructive/10 text-destructive",
};

function StatusPill({ status }: { status: RequirementStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-lg px-2 py-1 text-xs font-semibold ${STATUS_PILL_CLASS[status]}`}
    >
      {status}
    </span>
  );
}

function AddStudentDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [batch, setBatch] = useState("");
  const [classification, setClassification] = useState<string>(CLASSIFICATIONS[0] ?? "CN Graduate");
  const create = useCreateStudent();

  const preview = formatStudentName(name);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formatted = formatStudentName(name);
    if (!formatted) {
      toast.error("Name format", {
        description: 'Use "Lastname, Firstname Middlename" — e.g. "Dela Cruz, Juan Pandoro".',
      });
      return;
    }
    if (!batch.trim()) {
      toast.error("Batch is required");
      return;
    }
    try {
      await create.mutateAsync({
        studentName: formatted,
        studentNumber: number,
        batch: batch.trim(),
        classification,
      });
      await logStudentAudit({
        action: "upload",
        summary: formatted,
        details: { module: "master-file", type: "student-created" },
      });
      toast.success("Student added", { description: `${formatted} — folder created.` });
      setOpen(false);
      setName("");
      setNumber("");
      setBatch("");
      setClassification(CLASSIFICATIONS[0] ?? "CN Graduate");
    } catch (err) {
      toast.error("Could not save student", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-11 rounded-xl bg-primary text-primary-foreground hover:bg-secondary">
          <Plus className="mr-2 h-4 w-4" />
          Add Student
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add student</DialogTitle>
          <DialogDescription>
            Creates the student folder in the Master File. The display name becomes the folder
            name.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="mf-name">Full name (Lastname, Firstname Middlename)</Label>
            <Input
              id="mf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dela Cruz, Juan Pandoro"
              className="h-11 rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              {preview ? (
                <span className="text-secondary">Saved as: {preview}</span>
              ) : (
                "Format: Lastname, Firstname Middlename"
              )}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="mf-number">Student no.</Label>
              <Input
                id="mf-number"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="Optional"
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mf-batch">Batch</Label>
              <Input
                id="mf-batch"
                value={batch}
                onChange={(e) => setBatch(e.target.value)}
                placeholder="2026"
                maxLength={4}
                className="h-11 rounded-xl"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Student classification</Label>
            <Select value={classification} onValueChange={setClassification}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue />
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
          <Button
            type="submit"
            disabled={create.isPending}
            className="h-11 w-full rounded-xl bg-primary text-primary-foreground hover:bg-secondary"
          >
            {create.isPending ? "Adding…" : "Add student"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExcelImportButton() {
  const fileRef = useRef<HTMLInputElement>(null);
  const create = useCreateStudent();
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
      if (!sheet) {
        toast.error("Could not read the Excel file", { description: "The first sheet is empty." });
        return;
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      // Accept a couple of header spellings per column.
      const pick = (row: Record<string, unknown>, ...keys: string[]) => {
        for (const key of keys) {
          const found = Object.keys(row).find((k) => k.trim().toLowerCase() === key.toLowerCase());
          if (found) return String(row[found] ?? "").trim();
        }
        return "";
      };

      let added = 0;
      let skipped = 0;
      const skippedNames: string[] = [];
      const seen = new Set<string>();

      for (const row of rows) {
        // Single "Student Name" column, or separate name parts.
        const rawName =
          pick(row, "Student Name", "Full Name", "Name", "student_name") ||
          (() => {
            const last = pick(row, "Lastname", "Last Name", "lastname");
            const first = pick(row, "Firstname", "First Name", "firstname");
            const middle = pick(row, "Middlename", "Middle Name", "middlename");
            if (!last || !first) return "";
            return `${last}, ${first}${middle ? ` ${middle}` : ""}`;
          })();

        const name = formatStudentName(rawName);
        if (!name) {
          skipped += 1;
          skippedNames.push(rawName || "(blank)");
          continue;
        }
        const key = name.toLowerCase();
        if (seen.has(key)) {
          skipped += 1;
          skippedNames.push(`${name} (duplicate row)`);
          continue;
        }
        seen.add(key);

        const rawClassification = pick(row, "Classification", "Student Classification", "Category");
        const classification = (CLASSIFICATIONS as readonly string[]).includes(rawClassification)
          ? rawClassification
          : (CLASSIFICATIONS[0] ?? "CN Graduate");

        const input = {
          studentName: name,
          studentNumber: pick(row, "Student No", "Student Number", "student_no") || null,
          batch: pick(row, "Batch", "batch"),
          classification,
        };
        if (!input.batch) {
          skipped += 1;
          skippedNames.push(`${name} (no batch)`);
          continue;
        }
        try {
          await create.mutateAsync(input);
          added += 1;
        } catch {
          skipped += 1;
          skippedNames.push(`${name} (already exists)`);
        }
      }

      await logStudentAudit({
        action: "import",
        summary: file.name,
        details: { module: "master-file", added, skipped },
      });

      if (added > 0) {
        toast.success(`${added} student${added === 1 ? "" : "s"} imported`, {
          description: skipped > 0 ? `${skipped} skipped (duplicates or invalid rows).` : undefined,
        });
      } else {
        toast.error("No students imported", {
          description:
            skippedNames.length > 0
              ? `Check the headers and rows. First skip: ${skippedNames[0]}`
              : "The sheet appears to be empty.",
        });
      }
    } catch {
      toast.error("Could not read the Excel file");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="h-11 rounded-xl border-primary/30 text-primary hover:bg-primary-soft"
      >
        <FileSpreadsheet className="mr-2 h-4 w-4" />
        {busy ? "Importing…" : "Import Excel"}
      </Button>
    </>
  );
}

function MasterFilePage() {
  const navigate = useNavigate();
  const { data: students = [], isLoading, isError } = useStudents();
  const [search, setSearch] = useState("");
  const [batchFilter, setBatchFilter] = useState("all");

  const batches = useMemo(
    () => Array.from(new Set(students.map((s) => s.batch))).sort(),
    [students],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (batchFilter !== "all" && s.batch !== batchFilter) return false;
      if (!q) return true;
      return (
        s.studentName.toLowerCase().includes(q) ||
        (s.studentNumber ?? "").toLowerCase().includes(q) ||
        s.batch.toLowerCase().includes(q)
      );
    });
  }, [students, search, batchFilter]);

  const completeCount = students.filter((s) => s.overall === "Complete").length;
  const kulangCount = students.length - completeCount;

  const stats = [
    {
      label: "Total Students",
      value: `${students.length}`,
      sub: "Folders in the Master File",
      icon: Users,
    },
    {
      label: "Complete (5/5)",
      value: `${completeCount}`,
      sub: "All requirements on file",
      icon: CheckCircle2,
    },
    {
      label: "Incomplete",
      value: `${kulangCount}`,
      sub: "Students missing at least one requirement",
      icon: AlertTriangle,
    },
  ];

  return (
    <AppShell
      title="Master File"
      description="Student requirement tracker — TOR, Honorable Dismissal, Curriculum Checklist, Study Plan, Library Card."
      showSearch={false}
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

        <section className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, student no. or batch…"
              className="h-11 rounded-xl pl-9"
            />
          </div>
          <Select value={batchFilter} onValueChange={setBatchFilter}>
            <SelectTrigger className="h-11 w-40 rounded-xl">
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
          <ExcelImportButton />
          <AddStudentDialog />
        </section>

        <section className="vault-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface hover:bg-surface">
                  <TableHead className="min-w-56">Student</TableHead>
                  <TableHead className="min-w-28">Student No.</TableHead>
                  <TableHead className="text-center">Batch</TableHead>
                  {REQUIRED_DOCUMENT_TYPES.map((type) => (
                    <TableHead key={type} className="min-w-20 text-center">
                      {DOCUMENT_SHORT_LABELS[type]}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  [0, 1, 2, 3, 4].map((i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                {!isLoading &&
                  filtered.map((student: StudentWithRequirements) => (
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
                      <TableCell>
                        <Link
                          to="/master-file/$studentId"
                          params={{ studentId: student.id }}
                          className="font-medium text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {student.studentName}
                        </Link>
                        <p className="text-xs text-muted-foreground">{student.classification}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {student.studentNumber ?? "—"}
                      </TableCell>
                      <TableCell className="text-center text-sm">{student.batch}</TableCell>
                      {REQUIRED_DOCUMENT_TYPES.map((type) => (
                        <TableCell key={type} className="text-center">
                          <StatusPill status={student.requirements[type]} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                {!isLoading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      {isError
                        ? "Students could not be loaded. Please try again."
                        : students.length === 0
                          ? "No students yet — add one manually or import an Excel master list."
                          : "No students match your filters."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Legend:</span>
            <StatusPill status="Submitted" />
            <StatusPill status="Missing" />
            <span className="sm:ml-auto">
              File present = <span className="font-medium text-foreground">Submitted</span>, no
              file = <span className="font-medium text-foreground">Missing</span>.
            </span>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
