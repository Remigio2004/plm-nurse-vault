import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createStudent,
  fetchStudentsWithRequirements,
  removeDocument,
  replaceDocument,
  uploadDocument,
  type NewStudentInput,
} from "@/lib/students-api";
import type { StudentDocument } from "@/data/students";

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

export function useUploadDocument() {
  const invalidate = useInvalidateStudents();
  return useMutation({
    mutationFn: uploadDocument,
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

export type { NewStudentInput };
