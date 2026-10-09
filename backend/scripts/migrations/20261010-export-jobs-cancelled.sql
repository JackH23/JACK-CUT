-- Explicit operator-run migration; never invoked by server startup.
-- Apply to isolated staging first. Existing job values are not rewritten.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- One atomic ALTER keeps the constraint in place until commit. Validation
-- failure or lock timeout rolls back to the original constraint.
ALTER TABLE public.export_jobs
 DROP CONSTRAINT IF EXISTS export_jobs_status_check,
 ADD CONSTRAINT export_jobs_status_check
 CHECK (status IN ('processing', 'completed', 'failed', 'cancelled')) NOT VALID;
ALTER TABLE public.export_jobs VALIDATE CONSTRAINT export_jobs_status_check;
COMMIT;
