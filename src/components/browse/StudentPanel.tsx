import { format } from "date-fns";
import {
  Eye,
  FileText,
  FileX,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EditStudentDialog } from "@/components/browse/EditStudentDialog";
import { useDocumentActions } from "@/components/browse/useDocumentActions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DOCUMENT_INFO,
  FOLDER_LABELS,
  MAX_FILES_PER_STUDENT,
  compareDocumentTypes,
  documentsForFolder,
  type FolderKey,
} from "@/data/document-catalog";
import type { DocumentType, StudentDocument, StudentWithRequirements } from "@/data/students";
import { folderDocuments, visibleFolders } from "@/lib/browse-tree";
import { errorMessage, logStudentAudit } from "@/lib/students-api";
import { useDeleteStudent } from "@/lib/use-students";

function formatBytes(size: number | null): string {
  if (size == null) return "";
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

interface PanelItem {
  type: DocumentType;
  doc: StudentDocument | null; // null = expected but not uploaded yet
}

/** Uploaded files + missing requirements of one folder, A–Z by document name. */
function folderItems(student: StudentWithRequirements, folder: FolderKey): PanelItem[] {
  const docs = folderDocuments(student, folder);
  const have = new Set(docs.map((d) => d.documentType));
  const missing = documentsForFolder(student.classification, folder).filter((t) => !have.has(t));
  return [
    ...docs.map((doc): PanelItem => ({ type: doc.documentType, doc })),
    ...missing.map((type): PanelItem => ({ type, doc: null })),
  ].sort((a, b) => compareDocumentTypes(a.type, b.type));
}

interface StudentPanelProps {
  student: StudentWithRequirements | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Slide-in panel with one student's folders and files (right side). */
export function StudentPanel({ student, open, onOpenChange }: StudentPanelProps) {
  const actions = useDocumentActions();
  const removeStudent = useDeleteStudent();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const folders = student ? visibleFolders(student) : [];

  const handleDeleteStudent = async () => {
    if (!student) return;
    setConfirmingDelete(false);
    try {
      await removeStudent.mutateAsync(student);
      await logStudentAudit({
        action: "delete",
        summary: student.studentName,
        details: {
          module: "master-file",
          student: student.studentName,
          batch: student.batch,
          classification: student.classification,
          files: student.documents.length,
        },
      }).catch(() => undefined);
      toast.success(`${student.studentName} deleted`);
      onOpenChange(false);
    } catch (err) {
      toast.error("Could not delete student", { description: errorMessage(err) });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 data-[state=closed]:duration-300 data-[state=open]:duration-300 sm:max-w-lg"
      >
        {student && (
          <>
            <SheetHeader className="space-y-1 border-b border-border p-6 text-left">
              <SheetTitle className="pr-8 text-lg font-semibold tracking-tight">
                {student.studentName}
              </SheetTitle>
              <SheetDescription>
                {[
                  student.studentNumber ?? "No student no.",
                  `Batch ${student.batch}`,
                  student.classification,
                ].join(" · ")}
              </SheetDescription>
              <p className="text-xs font-medium text-primary">
                {student.documents.length} / {MAX_FILES_PER_STUDENT} files
              </p>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Edit student
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={removeStudent.isPending}
                  className="rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </SheetHeader>

            <div className="p-6">
              <Accordion type="multiple" defaultValue={folders} className="space-y-3">
                {folders.map((folder) => {
                  const items = folderItems(student, folder);
                  const missingCount = items.filter((i) => !i.doc).length;
                  const uploadedCount = items.length - missingCount;
                  return (
                    <AccordionItem
                      key={folder}
                      value={folder}
                      className="rounded-xl border border-border bg-surface px-4"
                    >
                      <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
                        <span className="flex flex-1 items-center justify-between pr-2">
                          <span>{FOLDER_LABELS[folder]}</span>
                          <span className="text-xs font-normal text-muted-foreground">
                            {uploadedCount} file{uploadedCount === 1 ? "" : "s"}
                            {missingCount > 0 && ` · ${missingCount} missing`}
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        {items.length === 0 ? (
                          <p className="pb-1 text-xs text-muted-foreground">No files yet.</p>
                        ) : (
                          <ul className="space-y-2 pb-1">
                            {items.map(({ type, doc }) => (
                              <li
                                key={doc?.id ?? `missing-${type}`}
                                className={
                                  doc
                                    ? "flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
                                    : "flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2"
                                }
                              >
                                {doc ? (
                                  <FileText className="h-4 w-4 shrink-0 text-gold-foreground" />
                                ) : (
                                  <FileX className="h-4 w-4 shrink-0 text-destructive" />
                                )}
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-foreground">
                                    {DOCUMENT_INFO[type].label}
                                  </span>
                                  {doc ? (
                                    <>
                                      <span className="block truncate font-mono text-[11px] text-muted-foreground">
                                        {doc.fileName}
                                      </span>
                                      <span className="block text-[11px] text-muted-foreground">
                                        {[
                                          formatBytes(doc.fileSize),
                                          format(new Date(doc.uploadedAt), "MMM d, yyyy"),
                                        ]
                                          .filter(Boolean)
                                          .join(" · ")}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="block text-[11px] text-destructive">N/A</span>
                                  )}
                                </span>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      aria-label="File actions"
                                      disabled={actions.busy}
                                      className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:bg-primary-soft hover:text-primary"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="rounded-xl">
                                    {doc ? (
                                      <>
                                        <DropdownMenuItem onSelect={() => actions.openFile(doc)}>
                                          <Eye className="mr-2 h-4 w-4" />
                                          View
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onSelect={() => actions.startReplace(doc, student)}
                                        >
                                          <RefreshCw className="mr-2 h-4 w-4" />
                                          Replace
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          className="text-destructive focus:text-destructive"
                                          onSelect={() => actions.requestDelete(doc, student)}
                                        >
                                          <Trash2 className="mr-2 h-4 w-4" />
                                          Delete
                                        </DropdownMenuItem>
                                      </>
                                    ) : (
                                      <DropdownMenuItem
                                        onSelect={() => actions.startUpload(type, student)}
                                      >
                                        <Upload className="mr-2 h-4 w-4" />
                                        Upload
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </li>
                            ))}
                          </ul>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </div>

            <EditStudentDialog
              student={student}
              open={editing}
              onOpenChange={setEditing}
              onSaved={() => undefined}
            />
            {actions.dialogs}

            <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
              <AlertDialogContent className="rounded-xl">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this student?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {`${student.studentName}'s folder and all ${student.documents.length} file${student.documents.length === 1 ? "" : "s"} in it will be removed. This can't be undone.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => void handleDeleteStudent()}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
