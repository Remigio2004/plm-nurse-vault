import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Eye, FileText, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";

import { EditStudentDialog } from "@/components/browse/EditStudentDialog";
import { useDocumentActions } from "@/components/browse/useDocumentActions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DOCUMENT_INFO, FOLDER_LABELS, MAX_FILES_PER_STUDENT } from "@/data/document-catalog";
import type { StudentWithRequirements } from "@/data/students";
import { folderDocuments, visibleFolders } from "@/lib/browse-tree";

function formatBytes(size: number | null): string {
  if (size == null) return "";
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

interface StudentPanelProps {
  student: StudentWithRequirements | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Slide-in panel with one student's folders and files (right side). */
export function StudentPanel({ student, open, onOpenChange }: StudentPanelProps) {
  const actions = useDocumentActions();
  const [editing, setEditing] = useState(false);
  const folders = student ? visibleFolders(student) : [];

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
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Edit student
                </Button>
                <Button asChild variant="outline" size="sm" className="rounded-lg">
                  <Link to="/master-file/$studentId" params={{ studentId: student.id }}>
                    Open Master File
                  </Link>
                </Button>
              </div>
            </SheetHeader>

            <div className="p-6">
              <Accordion type="multiple" defaultValue={folders} className="space-y-3">
                {folders.map((folder) => {
                  const docs = folderDocuments(student, folder);
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
                            {docs.length} file{docs.length === 1 ? "" : "s"}
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        {docs.length === 0 ? (
                          <p className="pb-1 text-xs text-muted-foreground">No files yet.</p>
                        ) : (
                          <ul className="space-y-2 pb-1">
                            {docs.map((doc) => (
                              <li
                                key={doc.id}
                                className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
                              >
                                <FileText className="h-4 w-4 shrink-0 text-gold-foreground" />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-foreground">
                                    {DOCUMENT_INFO[doc.documentType].label}
                                  </span>
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
                                </span>
                                <span className="flex shrink-0 items-center gap-0.5">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label="View file"
                                        disabled={actions.busy}
                                        onClick={() => actions.openFile(doc)}
                                        className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-primary-soft hover:text-primary"
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>View file</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Replace file"
                                        disabled={actions.busy}
                                        onClick={() => actions.startReplace(doc, student)}
                                        className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-primary-soft hover:text-primary"
                                      >
                                        <RefreshCw className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Replace file</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label="Delete file"
                                        disabled={actions.busy}
                                        onClick={() => actions.requestDelete(doc, student)}
                                        className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Delete file</TooltipContent>
                                  </Tooltip>
                                </span>
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
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
