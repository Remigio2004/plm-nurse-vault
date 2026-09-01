-- Enable pgcrypto for passkey hashing (safe if already enabled)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Optional per-file passkey. NULL = no lock (existing records stay openable).
ALTER TABLE public.records ADD COLUMN passkey_hash TEXT;

-- Safe-to-expose flag so the client can show a "locked" indicator without
-- ever seeing the hash itself.
ALTER TABLE public.records
  ADD COLUMN has_passkey BOOLEAN GENERATED ALWAYS AS (passkey_hash IS NOT NULL) STORED;

-- Auto-hash the passkey on insert or whenever it's explicitly changed, so
-- plaintext is never persisted.
CREATE OR REPLACE FUNCTION public.hash_record_passkey()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.passkey_hash IS NOT NULL AND NEW.passkey_hash <> '' THEN
    IF TG_OP = 'INSERT' OR NEW.passkey_hash IS DISTINCT FROM OLD.passkey_hash THEN
      NEW.passkey_hash := extensions.crypt(NEW.passkey_hash, extensions.gen_salt('bf'));
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, extensions;

DROP TRIGGER IF EXISTS records_hash_passkey ON public.records;
CREATE TRIGGER records_hash_passkey
BEFORE INSERT OR UPDATE ON public.records
FOR EACH ROW EXECUTE FUNCTION public.hash_record_passkey();

-- Column-level lockdown: file identity/location and the passkey hash are no
-- longer readable/writable by the plain browser client. Only server-side code
-- using the service-role key (which bypasses grants) can touch them, after
-- verifying the passkey. This is enforced by Postgres itself, not just the UI.
REVOKE SELECT ON public.records FROM authenticated;
GRANT SELECT (
  id, student_name, student_number, batch, student_category, status,
  uploaded_at, updated_at, has_passkey
) ON public.records TO authenticated;

REVOKE UPDATE ON public.records FROM authenticated;
GRANT UPDATE (
  student_name, student_number, batch, student_category, status
) ON public.records TO authenticated;