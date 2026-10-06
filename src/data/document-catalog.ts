// Document catalog — single source of truth for the Master File folders
// and the documents that can be filed inside them (spec: Revisions.pdf).
// Keys are PascalCase and double as the file-name token.
// Keep in sync with the CHECK constraint in the document_folders migration.

export const FOLDERS = ["academic", "personal", "others"] as const;
export type FolderKey = (typeof FOLDERS)[number];

export const FOLDER_LABELS: Record<FolderKey, string> = {
  academic: "Academic Records",
  personal: "Personal Records",
  others: "Others",
};

export const MAX_FILES_PER_STUDENT = 15;

export const DOCUMENT_TYPES = [
  "AdmissionSlip",
  "CertificateOfEnrollment",
  "CertificateOfHonorableDismissal",
  "CurriculumChecklist",
  "StudyPlan",
  "StudentEnrollmentRecord",
  "ShiftingForm",
  "StudentPermanentRecord",
  "SecondaryStudentsPermanentRecord",
  "ClassCard",
  "CertificateOfUHS",
  "Form138",
  "EvaluationForGraduationForm",
  "ApplicationForGraduation",
  "RecordOfRelatedLearningExperience",
  "CertificationOfCompletion",
  "DeliveryRoomCaseRecord",
  "SummaryOfOperatingRoomExperience",
  "EvaluationChecklistForCommunityHealthNursing",
  "IdentificationRecords",
  "Others",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_INFO: Record<DocumentType, { label: string; folder: FolderKey }> = {
  AdmissionSlip: { label: "Admission Slip", folder: "academic" },
  CertificateOfEnrollment: { label: "Certificate of Enrollment", folder: "academic" },
  CertificateOfHonorableDismissal: {
    label: "Certificate of Honorable Dismissal",
    folder: "academic",
  },
  CurriculumChecklist: { label: "Curriculum Checklist", folder: "academic" },
  StudyPlan: { label: "Study Plan", folder: "academic" },
  StudentEnrollmentRecord: { label: "Student Enrollment Record", folder: "academic" },
  ShiftingForm: { label: "Shifting Form", folder: "academic" },
  StudentPermanentRecord: { label: "Student Permanent Record", folder: "academic" },
  SecondaryStudentsPermanentRecord: {
    label: "Secondary Student's Permanent Record",
    folder: "academic",
  },
  ClassCard: { label: "Class Card", folder: "academic" },
  CertificateOfUHS: { label: "Certificate of UHS", folder: "academic" },
  Form138: { label: "Form 138", folder: "academic" },
  EvaluationForGraduationForm: { label: "Evaluation for Graduation Form", folder: "academic" },
  ApplicationForGraduation: { label: "Application for Graduation", folder: "academic" },
  RecordOfRelatedLearningExperience: {
    label: "Record of Related Learning Experience",
    folder: "academic",
  },
  CertificationOfCompletion: { label: "Certification of Completion", folder: "academic" },
  DeliveryRoomCaseRecord: { label: "Delivery Room Case Record", folder: "academic" },
  SummaryOfOperatingRoomExperience: {
    label: "Summary of Operating Room Experience",
    folder: "academic",
  },
  EvaluationChecklistForCommunityHealthNursing: {
    label: "Evaluation Checklist for Community Health Nursing",
    folder: "academic",
  },
  IdentificationRecords: { label: "Identification Records", folder: "personal" },
  Others: { label: "Others", folder: "others" },
};

const FILE_TOKEN_OVERRIDES: Partial<Record<DocumentType, string>> = {
  Others: "OtherDocuments",
};

export const documentFileToken = (type: DocumentType): string => FILE_TOKEN_OVERRIDES[type] ?? type;

// HD students and CN Others share this list.
const HONORABLE_DISMISSAL_ACADEMIC: DocumentType[] = [
  "AdmissionSlip",
  "CertificateOfEnrollment",
  "CertificateOfHonorableDismissal",
  "CurriculumChecklist",
  "StudyPlan",
  "StudentEnrollmentRecord",
  "ShiftingForm",
  "StudentPermanentRecord",
  "SecondaryStudentsPermanentRecord",
  "ClassCard",
  "CertificateOfUHS",
  "Form138",
];

const GRADUATE_ACADEMIC: DocumentType[] = [
  "EvaluationForGraduationForm",
  "StudentPermanentRecord",
  "CurriculumChecklist",
  "ApplicationForGraduation",
  "RecordOfRelatedLearningExperience",
  "CertificationOfCompletion",
  "DeliveryRoomCaseRecord",
  "SummaryOfOperatingRoomExperience",
  "EvaluationChecklistForCommunityHealthNursing",
];

export function foldersForClassification(classification: string): FolderKey[] {
  if (classification === "CN Graduate") return ["academic", "others"];
  return ["academic", "personal", "others"];
}

export function documentsForFolder(classification: string, folder: FolderKey): DocumentType[] {
  if (!foldersForClassification(classification).includes(folder)) return [];
  if (folder === "personal") return ["IdentificationRecords"];
  if (folder === "others") return ["Others"];
  return classification === "CN Graduate" ? GRADUATE_ACADEMIC : HONORABLE_DISMISSAL_ACADEMIC;
}

export function allDocumentsForClassification(classification: string): DocumentType[] {
  return foldersForClassification(classification).flatMap((folder) =>
    documentsForFolder(classification, folder),
  );
}
