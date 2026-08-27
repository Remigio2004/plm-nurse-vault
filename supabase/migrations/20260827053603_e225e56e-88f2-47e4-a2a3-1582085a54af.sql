CREATE TABLE public.records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_name TEXT NOT NULL,
  student_number TEXT NOT NULL,
  batch TEXT NOT NULL,
  student_category TEXT NOT NULL,
  status TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.records TO authenticated;
GRANT ALL ON public.records TO service_role;
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view records" ON public.records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create records" ON public.records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update records" ON public.records FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete records" ON public.records FOR DELETE TO authenticated USING (true);

CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action TEXT NOT NULL,
  record_id UUID REFERENCES public.records(id) ON DELETE SET NULL,
  record_summary TEXT NOT NULL,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_email TEXT,
  "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  details JSONB
);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = performed_by);

CREATE INDEX records_batch_idx ON public.records (batch);
CREATE INDEX audit_logs_timestamp_idx ON public.audit_logs ("timestamp" DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER records_set_updated_at BEFORE UPDATE ON public.records
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();