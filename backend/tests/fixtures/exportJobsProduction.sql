-- Reconstructed from the user's Neon screenshots, 2026-10-10.
-- Varchar lengths were not shown; no recovery operation depends on their length.
CREATE TABLE projects (id uuid PRIMARY KEY);
CREATE TABLE public.export_jobs (
 id uuid PRIMARY KEY,
 status varchar NOT NULL DEFAULT 'processing',
 output_path text, error_message text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
 metrics jsonb, cleanup_reference text,
 progress integer NOT NULL DEFAULT 0,
 worker_token uuid, heartbeat_at timestamptz, cancel_requested_at timestamptz,
 stage varchar,
 CONSTRAINT export_jobs_status_check CHECK (status IN ('processing','completed','failed')),
 CONSTRAINT export_jobs_progress_check CHECK (progress >= 0 AND progress <= 100)
);
-- The supplied information_schema.triggers query returned no rows.
