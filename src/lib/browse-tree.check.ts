// Run: npx tsx src/lib/browse-tree.check.ts
import assert from "node:assert/strict";

import { DOCUMENT_INFO, type DocumentType } from "@/data/document-catalog";
import { deriveFolders, type StudentDocument, type StudentWithRequirements } from "@/data/students";
import {
  childNodes,
  folderContents,
  normalizePath,
  searchStudents,
  visibleFolders,
} from "@/lib/browse-tree";

function makeStudent(
  id: string,
  studentName: string,
  classification: string,
  types: DocumentType[],
  batch = "2024",
): StudentWithRequirements {
  const documents: StudentDocument[] = types.map((documentType, i) => ({
    id: `${id}-doc-${i}`,
    studentId: id,
    documentType,
    folder: DOCUMENT_INFO[documentType].folder,
    fileName: `${documentType}_${studentName.replace(/\W/g, "")}.pdf`,
    fileSize: 1024,
    uploadedAt: "2024-01-01T00:00:00Z",
    cloudinaryPublicId: null,
    storagePath: `test/${id}/${i}.pdf`,
  }));
  const { folders, overall } = deriveFolders(classification, documents);
  return {
    id,
    studentName,
    studentNumber: null,
    batch,
    classification,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    folders,
    documents,
    overall,
  };
}

const juan = makeStudent("s-juan", "Dela Cruz, Juan", "CN Graduate", []);
const maria = makeStudent("s-maria", "Santos, Maria", "CN Honorable Dismissal", [
  "AdmissionSlip",
  "IdentificationRecords",
  "Others",
]);
const pedro = makeStudent(
  "s-pedro",
  "Reyes, Pedro",
  "CN Graduate",
  ["EvaluationForGraduationForm", "Others"],
  "2023",
);
const all = [juan, maria, pedro];
const keys = (path: string[]) => childNodes(all, path).map((n) => n.key);

// Status is derived
assert.equal(juan.overall, "Incomplete");
assert.equal(maria.overall, "Complete");
assert.equal(pedro.overall, "Complete");

// Top levels
assert.deepEqual(keys([]), ["2023", "2024"]);
assert.equal(childNodes(all, [])[0]?.label, "Batch 2023");
assert.deepEqual(keys(["2024"]), ["CN Graduate", "CN Honorable Dismissal"]);
assert.deepEqual(keys(["2024", "CN Graduate"]), ["Incomplete"]);
assert.deepEqual(keys(["2024", "CN Honorable Dismissal"]), ["Complete"]);

// Student level uses the id, and counts missing docs (9 academic + 1 others)
const studentNodes = childNodes(all, ["2024", "CN Graduate", "Incomplete"]);
assert.deepEqual(
  studentNodes.map((n) => n.key),
  ["s-juan"],
);
assert.equal(studentNodes[0]?.missing, 10);

// Folder counts: CN Graduate = 2, HD = 3
assert.deepEqual(keys(["2024", "CN Graduate", "Incomplete", "s-juan"]), ["academic", "others"]);
assert.deepEqual(keys(["2024", "CN Honorable Dismissal", "Complete", "s-maria"]), [
  "academic",
  "personal",
  "others",
]);

// A folder that already has files is never hidden after a classification change
const juanWithId = makeStudent("s-juan2", "Dela Cruz, Juan", "CN Graduate", [
  "IdentificationRecords",
]);
assert.equal(visibleFolders(juanWithId).length, 3);

// Files level
const contents = folderContents(all, [
  "2024",
  "CN Honorable Dismissal",
  "Complete",
  "s-maria",
  "academic",
]);
assert.equal(contents?.documents.length, 1);
assert.equal(contents?.missing.length, 11);

// Path cut when status moves away
assert.deepEqual(normalizePath(all, ["2024", "CN Graduate", "Complete"]), ["2024", "CN Graduate"]);

// Search
assert.equal(searchStudents(all, "santos").length, 1);
assert.equal(searchStudents(all, "admission slip").length, 1);
assert.equal(searchStudents(all, "batch 2023").length, 1);
assert.equal(searchStudents(all, "").length, 3);

console.log("browse-tree: all checks passed");
