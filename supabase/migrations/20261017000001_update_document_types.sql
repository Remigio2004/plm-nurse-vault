-- Remap rows that still use the retired document-type tokens so the new
-- CHECK constraint can be applied without failing on existing data.
-- Drop the old check BEFORE remapping: it rejects the replacement tokens.
alter table public.student_documents
  drop constraint if exists student_documents_type_valid;

update public.student_documents
  set document_type = 'ChecklistRecord'
  where document_type = 'EvaluationChecklistForCommunityHealthNursing';

update public.student_documents
  set document_type = 'EnrollmentAdjustmentRecord'
  where document_type = 'AddAndDropRecords';

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
      'ChecklistRecord',
      'EnrollmentAdjustmentRecord',
      'HygieneChecklist',
      'SecondaryAcademicRecords',
      'IdentificationRecords',
      'Others'
    )
  );
