CREATE POLICY "Authenticated users can read student records files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'student-records');

CREATE POLICY "Authenticated users can upload student records files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'student-records');

CREATE POLICY "Authenticated users can update student records files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'student-records') WITH CHECK (bucket_id = 'student-records');

CREATE POLICY "Authenticated users can delete student records files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'student-records');