import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createStudent,
  deleteStudent,
  deleteStudents,
  fetchStudentsWithRequirements,
  findOrCreateStudent,
  removeDocument,
  replaceDocument,
  updateStudent,
  uploadDocument,
  type NewStudentInput,
} from "@/lib/students-api";
import type { StudentDocument, StudentWithRequirements } from "@/data/students";

export const studentsQuery = queryOptions({
  queryKey: ["students"],
  queryFn: fetchStudentsWithRequirements,
});

export function useStudents() {
  return useQuery(studentsQuery);
}

export function useInvalidateStudents() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["students"] });
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
  return useMutation({
    mutationFn: uploadDocument,
    onSuccess: () => invalidate(),
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
    mutationFn: replaceDocument,
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
