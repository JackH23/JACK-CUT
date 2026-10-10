-- Explicit operator-run migration. Apply to isolated staging first.
-- Never invoked by startup; do not backfill active jobs from an unknown policy.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.export_jobs ADD COLUMN IF NOT EXISTS deadline_at timestamptz;
-- IF NOT EXISTS alone would silently accept an incompatible pre-existing column.
DO $deadline_schema$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'export_jobs'
      AND column_name = 'deadline_at' AND udt_name = 'timestamptz'
      AND is_nullable = 'YES' AND column_default IS NULL
      AND is_generated = 'NEVER'
  ) THEN
    RAISE EXCEPTION 'Incompatible export_jobs.deadline_at; expected nullable timestamptz without default';
  END IF;
END;
$deadline_schema$;
COMMIT;
