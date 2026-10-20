import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createStudent,
  deleteStudent,
  deleteStudents,
  fetchStudentsWithRequirements,
  fetchStudentTrash,
  manageStudentTrash,
  findOrCreateStudent,
  removeDocument,
  restoreDocument,
  replaceDocument,
  updateStudent,
  uploadDocument,
  type NewStudentInput,
} from "@/lib/students-api";
import type { StudentDocument, StudentWithRequirements } from "@/data/students";
import { retryUpload } from "@/lib/upload-queue";

export const studentsQuery = queryOptions({
  queryKey: ["students"],
  queryFn: fetchStudentsWithRequirements,
});

export function useStudents() {
  return useQuery(studentsQuery);
}

export function useInvalidateStudents() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      ["students", "student-trash", "audit_logs"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
}

export function useStudentTrash() {
  return useQuery({ queryKey: ["student-trash"], queryFn: fetchStudentTrash });
}

export function useManageStudentTrash() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: manageStudentTrash,
    onSuccess: async () => {
      await Promise.all(
        ["students", "student-trash", "audit_logs"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
}

export function useCreateStudent() {
  const invalidate = useInvalidateStudents();
  return useMutation({
    mutationFn: createStudent,
    onSuccess: () => invalidate(),
  });
}

export function useFindOrCreateStudent() {
  const invalidate = useInvalidateStudents();
  return useMutation({
    mutationFn: findOrCreateStudent,
    onSuccess: (result) => {
      if (result.created) invalidate();
    },
  });
}

export function useUploadDocument() {
  const invalidate = useInvalidateStudents();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["upload-documents"],
    mutationFn: (params: Parameters<typeof uploadDocument>[0]) => {
      const uploadId = params.uploadId ?? crypto.randomUUID();
      return retryUpload(() => uploadDocument({ ...params, uploadId }));
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: ["upload-documents"] }) === 1) void invalidate();
    },
  });
}

export function useUpdateStudent() {
  const invalidate = useInvalidateStudents();
  return useMutation({
    mutationFn: updateStudent,
    onSuccess: () => invalidate(),
  });
}

export function useReplaceDocument() {
  const invalidate = useInvalidateStudents();
  return useMutation({
    mutationFn: (params: Parameters<typeof replaceDocument>[0]) => {
      const uploadId = crypto.randomUUID();
      return retryUpload(() => replaceDocument({ ...params, uploadId }));
    },
    onSuccess: () => invalidate(),
  });
}

export function useRemoveDocument() {
  const invalidate = useInvalidateStudents();
  return useMutation({
    mutationFn: (doc: StudentDocument) => removeDocument(doc),
    onSuccess: () => invalidate(),
  });
}

export function useRestoreDocument() {
  const invalidate = useInvalidateStudents();
  return useMutation({ mutationFn: restoreDocument, onSuccess: () => invalidate() });
}

export function useDeleteStudent() {
  const invalidate = useInvalidateStudents();
  return useMutation({
    mutationFn: (student: StudentWithRequirements) => deleteStudent(student),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteStudents() {
  const invalidate = useInvalidateStudents();
  return useMutation({
    mutationFn: (ids: string[]) => deleteStudents(ids),
    onSuccess: () => invalidate(),
  });
}

export type { NewStudentInput };
