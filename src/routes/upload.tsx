import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, FileUp, UploadCloud, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RecordStatus, StudentCategory, StudentRecord } from "@/data/records";
import { useVault } from "@/lib/vault-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "Upload Record — NurseVault" },
      {
        name: "description",
        content:
          "File a scanned nursing student document into its batch, student category and status folder in NurseVault.",
      },
      { property: "og:title", content: "Upload Record — NurseVault" },
      {
        property: "og:description",
        content: "File a scanned student document into the NurseVault digital archive.",
      },
    ],
  }),
  component: UploadPage,
});

const extToType = (name: string): StudentRecord["fileType"] => {
  const lower = name.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv")) return "xlsx";
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) return "docx";
  return "pdf";
};

function UploadPage() {
  const { addRecord } = useVault();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [studentName, setStudentName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [batch, setBatch] = useState("");
  const [category, setCategory] = useState<StudentCategory | "">("");
  const [status, setStatus] = useState<RecordStatus | "">("");
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const ready =
    studentName.trim() && studentNumber.trim() && batch.trim() && category && status && fileName;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) {
      toast.error("Please complete all fields and attach a scanned record.");
      return;
    }
    setSubmitting(true);
    setTimeout(() => {
      addRecord({
        studentName: studentName.trim(),
        studentNumber: studentNumber.trim(),
        batch: batch.trim(),
        category: category as StudentCategory,
        status: status as RecordStatus,
        fileName,
        fileType: extToType(fileName),
      });
      toast.success("Record uploaded", {
        description: `${studentName.trim()} filed under ${batch.trim()} → ${category} → ${status}.`,
        icon: <CheckCircle2 className="h-4 w-4" />,
      });
      setSubmitting(false);
      navigate({ to: "/browse" });
    }, 700);
  };

  return (
    <AppShell title="Upload Record" description="Attach a scanned document and file it into the vault.">
      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="vault-card p-6">
          <h2 className="text-base font-semibold text-foreground">Student details</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Folders are generated automatically from batch, category and status.
          </p>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="studentName">Student Name</Label>
              <Input
                id="studentName"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="Juan Dela Cruz"
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="studentNumber">Student Number</Label>
              <Input
                id="studentNumber"
                value={studentNumber}
                onChange={(e) => setStudentNumber(e.target.value)}
                placeholder="2024-0001"
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="batch">Batch</Label>
              <Input
                id="batch"
                value={batch}
                onChange={(e) => setBatch(e.target.value)}
                placeholder="Batch 2024"
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label>Student Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as StudentCategory)}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="HD Student">HD Student</SelectItem>
                  <SelectItem value="RLE Student">RLE Student</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as RecordStatus)}>
                <SelectTrigger className="h-11 rounded-xl sm:max-w-xs">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="Regular">Regular</SelectItem>
                  <SelectItem value="Irregular">Irregular</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="vault-card p-6">
            <h2 className="text-base font-semibold text-foreground">Scanned Record</h2>
            <p className="mt-1 text-sm text-muted-foreground">PDF, Word or Excel · max 25 MB</p>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) setFileName(file.name);
              }}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
              className={cn(
                "mt-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all duration-200",
                dragging
                  ? "border-gold bg-gold-soft"
                  : "border-input bg-surface hover:border-accent hover:bg-primary-soft",
              )}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft">
                <UploadCloud className="h-7 w-7 text-primary" />
              </span>
              <p className="mt-4 text-sm font-medium text-foreground">
                Drag &amp; drop the scanned file here
              </p>
              <p className="mt-1 text-xs text-muted-foreground">or click to browse your computer</p>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setFileName(file.name);
                }}
              />
            </div>

            {fileName && (
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
                <FileUp className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{fileName}</span>
                <button
                  type="button"
                  aria-label="Remove file"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFileName("");
                  }}
                  className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <div className="vault-card p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Destination folder
            </p>
            <p className="mt-2 text-sm font-medium text-primary">
              {batch.trim() || "Batch —"} / {category || "Category —"} / {status || "Status —"}
            </p>
            <Button
              type="submit"
              disabled={submitting}
              className="mt-5 h-11 w-full rounded-xl bg-gold text-gold-foreground shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-gold/90 hover:shadow-lift"
            >
              {submitting ? "Filing record…" : "Upload Record"}
            </Button>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
