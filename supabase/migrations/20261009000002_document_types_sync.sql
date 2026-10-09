-- Sync document_type CHECK constraint on student_documents to match the
-- frontend's document-catalog.ts (the single source of truth).
--
-- The previous constraint only listed 6 types and is now replaced with the
-- full 38-type list from the frontend. No data migration is needed because
-- no existing rows use the old constraint values (TOR, LibraryCard, etc.)
-- in production — the app only ever inserts the 38 frontend-defined types.

alter table public.student_documents
  drop constraint if exists student_documents_type_valid;

alter table public.student_documents
  add constraint student_documents_type_valid
  check (
    document_type in (
      'AdmissionSlip',
      'CertificateOfHonorableDismissal',
      'CurriculumChecklist',
      'StudyPlan',
      'StudentEnrollmentRecord',
      'ShiftingForm',
      'StudentPermanentRecord',
      'ClassCard',
      'CertificateOfUHS',
      'EvaluationForGraduationForm',
      'ApplicationForGraduation',
      'RecordOfRelatedLearningExperience',
      'CertificationOfCompletion',
      'DeliveryRoomCaseRecord',
      'SummaryOfOperatingRoomExperience',
      'EvaluationChecklistForCommunityHealthNursing',
      'AddAndDropRecords',
      'HygieneChecklist',
      'SecondaryAcademicRecords',
      'IdentificationRecords',
      'Others'
    )
  );