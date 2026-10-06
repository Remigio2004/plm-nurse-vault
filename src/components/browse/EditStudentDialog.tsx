import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DOCUMENT_INFO } from "@/data/document-catalog";
import { CLASSIFICATIONS, formatStudentName, type StudentWithRequirements } from "@/data/students";
import { classificationConflicts, errorMessage, logStudentAudit } from "@/lib/students-api";
import { useUpdateStudent } from "@/lib/use-students";
import { capitalizeWords, formatStudentNumber } from "@/lib/utils";

interface EditStudentDialogProps {
  student: StudentWithRequirements;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (next: { batch: string; classification: string }) => void;
}

export function EditStudentDialog({
  student,
  open,
  onOpenChange,
  onSaved,
}: EditStudentDialogProps) {
  const update = useUpdateStudent();
  const [name, setName] = useState(student.studentName);
  const [number, setNumber] = useState(student.studentNumber ?? "");
  const [batch, setBatch] = useState(student.batch);
  const [classification, setClassification] = useState(student.classification);

  // Reset only when the dialog opens (not on every background refetch).
  useEffect(() => {
    if (!open) return;
    setName(student.studentName);
    setNumber(student.studentNumber ?? "");
    setBatch(student.batch);
    setClassification(student.classification);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, student.id]);

  const formattedName = formatStudentName(name);
  const renaming = !!formattedName && formattedName !== student.studentName;

  const handleSave = async () => {
    if (!formattedName) {
      toast.error("Name format", {
        description: 'Use "Lastname, Firstname Middlename" — e.g. "Dela Cruz, Juan Pandoro".',
      });
      return;
    }
    const nextBatch = batch.trim();
    if (!nextBatch) {
      toast.error("Batch is required");
      return;
    }
    const nextNumber = number.trim();

    const conflicts = classificationConflicts(student.documents, classification);
    if (conflicts.length > 0) {
      toast.error("Can't change classification", {
        description: `These files don't belong to ${classification}: ${conflicts
          .map((d) => DOCUMENT_INFO[d.documentType].label)
          .join(", ")}. Delete them first.`,
      });
      return;
    }

    type StudentFieldChange = { from: string | null; to: string | null };
    type StudentChangeKey = "studentName" | "studentNumber" | "batch" | "classification";
    const changes: Partial<Record<StudentChangeKey, StudentFieldChange>> = {};
    if (formattedName !== student.studentName) {
      changes.studentName = { from: student.studentName, to: formattedName };
    }
    if (nextNumber !== (student.studentNumber ?? "")) {
      changes.studentNumber = { from: student.studentNumber, to: nextNumber || null };
    }
    if (nextBatch !== student.batch) {
      changes.batch = { from: student.batch, to: nextBatch };
    }
    if (classification !== student.classification) {
      changes.classification = { from: student.classification, to: classification };
    }
    if (Object.keys(changes).length === 0) {
      onOpenChange(false);
      return;
    }

    try {
      await update.mutateAsync({
        student,
        studentName: formattedName,
        studentNumber: nextNumber || null,
        batch: nextBatch,
        classification,
      });
      await logStudentAudit({
        action: "edit",
        summary: formattedName,
        details: { module: "master-file", changes },
      }).catch(() => undefined);
      toast.success("Student updated", { description: formattedName });
      onOpenChange(false);
      onSaved({ batch: nextBatch, classification });
    } catch (err) {
      toast.error("Could not update student", { description: errorMessage(err) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Edit student</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="editStudentName">Student Name (SN, FN, MI)</Label>
            <Input
              id="editStudentName"
              value={name}
              onChange={(e) => setName(capitalizeWords(e.target.value))}
              className="h-11 rounded-xl"
            />
            {renaming && student.documents.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {student.documents.length} file name{student.documents.length === 1 ? "" : "s"} will
                be updated to match the new name.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="editStudentNumber">Student Number (optional)</Label>
            <Input
              id="editStudentNumber"
              inputMode="numeric"
              value={number}
              onChange={(e) => setNumber(formatStudentNumber(e.target.value))}
              maxLength={10}
              className="h-11 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editBatch">Batch</Label>
            <Input
              id="editBatch"
              inputMode="numeric"
              value={batch}
              onChange={(e) => setBatch(e.target.value.replace(/\D/g, "").slice(0, 4))}
              maxLength={4}
              className="h-11 rounded-xl"
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Student Classification</Label>
            <Select value={classification} onValueChange={setClassification}>
              <SelectTrigger className="h-11 rounded-xl sm:max-w-xs">
                <SelectValue placeholder="Select classification" />
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
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="rounded-xl bg-primary text-primary-foreground hover:bg-secondary"
            disabled={update.isPending}
            onClick={() => void handleSave()}
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
