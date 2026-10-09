# Staging validation of export cancellation CHECK constraint

Prepared 2026-10-10 in D:\pull from git\JACK-CUT, branch Jack, base HEAD 1c1c8f3b152192bcc8062b421fd3e39041cedc85 plus preserved uncommitted fixes. This document supersedes older source/revision references only for this validation. Read LEASE_RECOVERY_SQL_INVESTIGATION_REPORT.md and NORTHFLANK_STAGING_VALIDATION_PLAN.md for historical evidence.

**No remote connection or change was executed. No commit, push, image build, deployment, paid resource creation, branch/worktree change or production data access.** Staging and production steps below are instructions for later explicitly approved execution.

## Migration review

The supplied Neon CHECK permits processing/completed/failed and rejects cancelled with SQLSTATE 23514. The model and lifecycle already require cancelled. The migration only replaces public.export_jobs.export_jobs_status_check to add that status; it contains no INSERT/UPDATE/DELETE or table reset. Other constraints, indexes, columns and existing job values are preserved. It is explicit, not run automatically by server startup.

BEGIN/COMMIT makes DROP+ADD+VALIDATE atomic. lock_timeout=5s bounds each lock acquisition; statement_timeout=30s bounds each statement, not total transaction wall time or a network outage. ADD NOT VALID defers scanning until VALIDATE, but ACCESS EXCLUSIVE is retained through commit, including validation: reads AND writes can be blocked. This is appropriate for a small job table/maintenance window; large-table validation exceeding 30s must be reviewed rather than disabling deadlines. Do not execute while active exports, downloads or long transactions are holding this table.

Repeat execution produces the same accepted statuses and preserves data, but takes the same lock again. On lock/validation error, immediately ROLLBACK in the same persistent SQL-editor session. An aborted open transaction can retain locks until rollback/disconnect. A psql process with ON_ERROR_STOP exits and its disconnect rolls back. Successful rollback of application code should retain the expanded CHECK: removing cancelled later is unsafe while such rows exist.

Preflight must confirm the named constraint is the known three-state or four-state CHECK. If missing, differently named, or imposing additional business rules, STOP and review before running this migration. DROP IF EXISTS is not permission to discard an unexpected policy. All other CHECKs must be examined too: an additional restrictive status CHECK could continue rejecting cancelled.

## Fresh local validation

- backend/benchmarks/leaseRecoverySchemaLive.cjs: PASS, nine scenarios, database lease_schema_1791575305594. It compares every column value of every fixture row before/after migration, checks all unrelated pg_constraint definitions/validation flags, columns, indexes and user triggers are unchanged, confirms new CHECK validated, and repeats migration with preservation checks. Existing processing/completed/failed records remain intact. Invalid status and progress remain rejected. Expired cancellation recovers, live ownership survives, late completion cannot overwrite cancelled, and a held row lock forces safe migration rollback.
- Backend tests: 233/233 PASS, zero skips/failures, 2.580 seconds. Frontend tests: 129/129 PASS, zero skips/failures, 1.039 seconds. Includes native FFmpeg close/SIGKILL, active/queued/repeated cancellation, conflict instead of silently reusing cancelling jobs, new export after a terminal cancellation, polling/UI races and unchanged rendering behavior.
- Real 60-second MP4: PASS in predeploy_1791574967541, FFmpeg 420.480s, API-to-terminal 420.601s, render plus validation 427.030s. 1920x1080, 30fps, 1800 decoded frames; every scene/caption checked, no fully black frames, all-frame historical SSIM minimum/mean 1.0; contact sheet inspected. Never entered cancelling.
- Measured Windows render envelope: peak Job Object committed memory 944.0508 MiB, sampled combined working set 921.8047 MiB under a 1024 MiB commit limit and one CPU affinity; PostgreSQL outside measured process group. This does NOT prove Linux/Neon/Northflank/R2 or full sequential 1 GiB acceptance.
- IMPORTANT: that combined replay ended FAIL after successful MP4 validation with TypeError/fetch failed on the next API operation. No detailed cause/exit evidence was captured; do not attribute it to OOM or claim the complete constrained sequence passed. A separate disposable HTTP keep-alive pattern test did not reproduce the failure, so no speculative network/runtime fix was made. Investigate/collect transport cause and backend process-exit diagnostics during staging sequential testing.
- Corrected separate cancellation replay predeploy_1791575626161: eight PASS scenarios, explicitly skipping previously completed A/B rendering fixtures. Expired cancellation recovery, active/repeated cancel (582ms), export after cancel (48.053s including decoding), cross-process cancel (1068ms), queued cancel, active release (652ms), native corrupt-image failure and 1500ms row-lock delay all passed. This replay was not measured under the earlier 1 GiB Job Object envelope.
- Focused real API replay predeploy_1791575737363 on loopback port 5003: four PASS scenarios. Normal five-second MP4, cancelling-job 409 without reuse/new renderer, reproduced 23514 followed by migrated recovery, and a DIFFERENT fresh job on the SAME project rendering a five-second MP4 after cancellation became terminal (45.910s including validation). Normal states never requested cancellation.
- A redundant replay predeploy_1791575504347 was ABORTED when the new skip control had not applied due to the source replacement missing CRLF lines. Only its verified owned process tree was stopped; its new database/jobs were retained without fabricating terminal states. The test-only option was corrected before the passing cancellation replay. No application runtime change.
- Evidence is retained under backend/benchmarks/results: the above databases' evidence.json and logs; original render staging-render-summary.json; predeploy-envelope-a47ddd5858804d74881a51fefa08f751-memory.json and resource samples; visual-1791575525071/verification.json and contact sheet; constraint-staging-backend-tests.log, constraint-staging-frontend-tests.log, constraint-staging-cancellation-replay-final.log, constraint-staging-conflict-recovery.log. Browser-auth fixture files contain local credentials and must NOT be shared; they are excluded from the source archive.

The schema fixture reproduces supplied columns/types/defaults/CHECKs/PK/FK. Varchar lengths were not shown in screenshots; unspecified in the fixture. Local PostgreSQL/Windows results do not prove Neon/Linux/R2 behavior. Disposable databases/artifacts are retained; existing records are not deleted.

## Exact-source staging artifact

Offline artifact: backend/benchmarks/results/staging-source-1791575119683/jackcut-staging-source.tar.gz.
Archive SHA256: f3f291acbbb9edd5db6f3a195c9b91cde4ea0cd3e9bb847f16b52c11784679c7.
SOURCE_MANIFEST.json SHA256: 05c0f91cf92fede9a038ead746e369c73370beb951402f30214641f98680fc71.

53 allowlisted files, including actual uncommitted backend fixes, Dockerfile/config/lockfile, shared frontend rendering math and an operator migration copy. No .env, credentials, media, node_modules or database contents. Archive extraction and SHA256 comparison to the actual checkout both PASS. Generated verification scripts are protected by the archive checksum. Base Git SHA alone cannot identify these uncommitted files.

The source archive contains operations/20261010-export-jobs-cancelled.sql for an external operator. Current Docker allowlist excludes it from the runtime image; migration execution is separate from deployment. The image includes scripts/exportCleanup.js as before. Tests/benchmarks are excluded from the image.

On a later authorized Linux builder, in a NEW directory, verify archive SHA256, extract and run:

```sh
sha256sum jackcut-staging-source.tar.gz
tar -xzf jackcut-staging-source.tar.gz
node operations/verifySource.cjs
docker build --pull -f backend/Dockerfile -t jackcut-staging:check-05c0f91cf92f .
docker run --rm --network none --entrypoint node \
  --mount type=bind,src="$(pwd)/SOURCE_MANIFEST.json",dst=/inspection/SOURCE_MANIFEST.json,readonly \
  --mount type=bind,src="$(pwd)/operations/verifyImage.cjs",dst=/inspection/verifyImage.cjs,readonly \
  jackcut-staging:check-05c0f91cf92f /inspection/verifyImage.cjs
docker image inspect jackcut-staging:check-05c0f91cf92f --format '{{.Id}}'
```

STOP before registry push/deployment until approved. Publish to an approved staging registry and deploy the immutable digest, recording both source manifest hash and image digest. If Northflank only supports Git builds in the available account, these uncommitted fixes require a separately approved delivery workflow; do not deploy Jack HEAD and claim exact source. No dedicated branch is created here. Docker/Podman/WSL are unavailable locally, so image checks remain unexecuted.

## Exact isolated Neon staging execution

1. With approval, create/use a completely separate staging database using synthetic fixtures only. Never clone production rows into this staging validation. Confirm project/branch/connection selection is STAGING, not Neon Primary production. Use a dedicated staging owner/migration role and distinct application secrets. Record environment identity through the approved inventory; current_database() alone cannot distinguish branches sharing a database name.
2. Drain/pause staging exports and downloads. Retain a staging schema/data backup (or approved snapshot) before applying DDL; verify restoration is possible. Never use production credentials.
3. In the STAGING SQL editor run this read-only preflight and save results securely:

```sql
SELECT current_database(), current_user;
SELECT column_name, data_type, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='export_jobs'
ORDER BY ordinal_position;
SELECT conname, contype, convalidated, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid='public.export_jobs'::regclass
ORDER BY conname;
SELECT trigger_name,event_manipulation,action_timing,action_statement
FROM information_schema.triggers
WHERE event_object_schema='public' AND event_object_table='export_jobs';
-- Synthetic staging rows only; aggregate fingerprints expose no row values.
SELECT count(*) AS rows,
       md5(coalesce(string_agg(md5(to_jsonb(j)::text), '' ORDER BY id), '')) AS fingerprint
FROM public.export_jobs j;
SELECT count(*) AS fresh_processing_owners FROM public.export_jobs
WHERE status='processing' AND heartbeat_at > now()-interval '30 seconds';
```

The aggregate fingerprint is suitable for the small isolated staging fixture set; do not run an unbounded aggregate on a large production table. Keep all writers stopped between before/after fingerprint captures. Review long transactions/table locks in the database dashboard before execution; a zero fresh-owner count is not proof no FFmpeg or download process exists.
4. Paste the COMPLETE backend/scripts/migrations/20261010-export-jobs-cancelled.sql (or identical operations copy from the verified archive) as one script, including BEGIN and COMMIT. Alternatively, use an already configured secure libpq staging service:

```sh
psql 'service=jackcut_staging' --set=ON_ERROR_STOP=1 \
  --file=operations/20261010-export-jobs-cancelled.sql
```

Do not put passwords/URLs into command history or reports. On any editor error execute ROLLBACK on the same session and investigate SQLSTATE. Do not blindly retry while locks remain.
5. Rerun the constraint and fingerprint queries before restarting writers. REQUIRE unchanged row count/fingerprint and unchanged unrelated constraints; export_jobs_status_check must be validated and allow exactly processing/completed/failed/cancelled. Verify indexes/columns/triggers match the preflight. If another status CHECK still excludes cancelled, stop. Never manually edit the stuck production job.
6. Resume the isolated staging backend and use synthetic fixtures to validate cancellation recovery and subsequent export creation. A fresh schema made by sequelize.sync() lacks the legacy status CHECK, so merely starting a new staging database is insufficient to test this defect: use the known legacy schema fixture first, then the migration. Do this fixture setup only in an empty disposable staging DB under approval.

## Northflank staging configuration

Separate staging service, one replica, one Node process, 2 vCPU and 2048 MiB RAM. Immutable tested image digest; port 5001 (or matching PORT), HTTP /health startup/readiness/liveness probes. Suggested startup allowance 60s; poll every 30s, timeout 5s, three failures. Confirm Northflank probe capabilities and startup behavior rather than assuming Docker HEALTHCHECK applies. Health is process availability, not continuous DB/R2 readiness.

Configuration names/values, with credential VALUES deliberately absent:

| Variable | Staging setting |
| --- | --- |
| NODE_ENV | production |
| PORT | 5001 |
| DATABASE_URL | dedicated staging Neon only |
| DB_LOCK_TIMEOUT_MS | 5000 |
| DB_STATEMENT_TIMEOUT_MS | 30000 |
| FFMPEG_THREADS | 1 |
| EXPORT_MAX_CONCURRENT_RENDERS | 1 |
| FFMPEG_VIDEO_ENCODER | libx264 |
| FFMPEG_PATH / FFPROBE_PATH | /usr/bin/ffmpeg / /usr/bin/ffprobe |
| TEMP_STORAGE_DIR | /tmp/jackcut, writable disk, not tmpfs |
| STORAGE_DRIVER | r2 |
| R2_ACCOUNT_ID / R2_ENDPOINT / R2_BUCKET_NAME | staging account/endpoint and separate private bucket |
| R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY | separate staging bucket-scoped credentials |
| JWT_SECRET / JWT_EXPIRES_IN / REFRESH_TOKEN_EXPIRES_IN_DAYS | separate staging auth settings |
| EXPORT_TIMEOUT_MS / EXPORT_STALL_TIMEOUT_MS / EXPORT_LEASE_TIMEOUT_MS | retain tested defaults 1800000 / 120000 / 30000 unless staging evidence justifies changes |
| EXPORT_KILL_GRACE_MS | 5000 |
| EXPORT_CLEANUP_ENABLED | false during evidence capture; enable only after scoped dry-run and approval |
| EXPORT_CLEANUP_INTERVAL_MS | 60000 when enabled |
| EXPORT_RETENTION_HOURS | 24; verify scoped dry-run before enabling deletion |

Also review actual storage retention settings and TRUST_PROXY/CORS needs from current code before enabling a browser staging frontend. Do not reuse production frontend auth/storage secrets. Set no auto-scaling or multiple workers until ownership/concurrency behavior is separately evaluated. RAM recommendation is headroom based on Windows measurements, not a verified Linux peak or a guaranteed 1 GiB target.

## Real staging acceptance plan

- Record source/image/database identities, backup, effective timeout settings (SHOW lock_timeout; SHOW statement_timeout;), Node/FFmpeg/FFprobe versions, fonts/ASS/libx264 availability, free disk and mount type.
- Authenticate using a synthetic staging user; health and protected export APIs must work. Render 5 seconds, then 60 seconds with 10 images and 10 animated subtitles using the existing storytelling fixture. Never request cancel during normal completion. Verify progress does not enter cancelling, final 100% corresponds to committed completed status, downloadable MP4 works.
- Download authorized staging output. ffprobe -v error -count_frames -show_streams -show_format -of json output.mp4; ffmpeg -v error -threads 1 -i output.mp4 -f null -. Expect 1920x1080/30fps/1800 frames/~60sec for this fixture. Decode every frame and inspect all images, captions, fade/slide/zoom positions/timing and no unintended black frames.
- Start active rendering; click cancel once and repeat rapidly. Check one frontend request, idempotent backend replies, SIGTERM then SIGKILL only if needed, ffmpeg_close, terminal cancelled/error null/output null, stop polling/UI reset, safe scratch/R2/multipart cleanup. Test queued cancellation and a new export on the same project after terminal settlement. While previous job is still cancelling, POST must return 409 EXPORT_CANCELLATION_PENDING and frontend must explain why; it must not silently attach to that job.
- For recovery, stop a SYNTHETIC fixture owner in staging with durable cancel requested and no surviving FFmpeg. Allow its normal lease to expire, verify recovery reaches cancelled, and a late owner cannot publish. Keep a live owner untouched. Hold/release fixture row locks to verify bounded failures/retry and connection reuse. Do not delete rows to force results.
- Monitor container CPU, memory peak/limit (include Node+FFmpeg, cgroup memory where available), OOM/restarts, child-process counts, spawn-to-close render time, cancel-to-terminal time, progress heartbeat age, lease diagnostics, database lock/statement waits and temporary disk. Record exact image digest and metrics interval. Fail staging if any active child survives cancellation, recovery repeats 23514, ownership is reclaimed while live, data/constraints disappear, output is corrupt, or source hashes mismatch.
- Verify isolated R2 upload/download, interrupted multipart cleanup, durable deletion intent and retention dry-run before enabling scheduler. Confirm no production objects/endpoints are used. Linux signal semantics/cgroup memory and R2 have not been validated by local tests.

## Later production procedure — requires separate explicit approval

1. Review staging pass evidence and exact deployed/source identity. Inventory production schema/status constraints and deployed image via an approved read-only session; this task performs neither. Confirm all code fixes required for cancellation/conflict/recovery are actually present in that revision.
2. Obtain explicit approval for production maintenance, backup, migration and deployment. Confirm Neon restore/PITR retention and create a secure backup/snapshot before DDL. Do not assume a screenshot is a backup. Example operator backup using preconfigured production libpq service: pg_dump 'service=jackcut_production' --format=custom --file=<secure-backup-location>. Verify backup integrity/restoration through an approved protected backup workflow; do not expose production rows in staging fixtures. New backup branches/resources may be billable and require approval.
3. Pause new export submissions through an approved maintenance/routing procedure; drain healthy renders/downloads, verify child processes, then stop old workers to prevent recovery/heartbeat writes during migration. These are infrastructure changes and require approval. Do not delete or rewrite pending jobs. Review long transactions; do not terminate arbitrary sessions blindly.
4. Verify the exact known CHECK and unrelated constraints. Execute the reviewed migration transaction with bounded waits through an authorized migration role. On timeout or validation failure roll back, restore service safely, inspect locks/schema, and reschedule. Do not disable timeout or CHECK enforcement just to get through it.
5. Verify expanded validated CHECK and all other schema invariants. Deploy/start the exact staging-tested approved image. Existing expired durable cancellations should be resolved by normal lease recovery without manual row changes. Watch SQLSTATE/constraint/operation diagnostics, cancellation UI and new exports. Confirm production MP4/safe storage behavior using only separately approved test data.
6. If application behavior regresses, roll back to the recorded previously approved image and configuration. Keep the expanded CHECK, which remains compatible with old three-state writes. Restoring a whole database backup may lose newer data and is NOT an automatic rollback step. Never drop cancelled support after such rows exist, delete jobs, or rewrite cancelled to failed to force rollback. Any data restore/schema reversal requires incident-specific approval and recovery review.

## Automation and approval boundary

Automated now: local schema reconstruction/reproduction, row/constraint preservation, idempotency/rollback/recovery, regression suites, real native export/cancel replay, memory measurement, offline source archive/manifest and extraction verification, and these instructions. No remote operations.

Requires approval: staging resource/database/bucket creation if absent, any billable resources, registry publication, commit/push if Git delivery is selected, staging SQL migration/deployment/remote fixture writes and tests, enabling remote retention, and all production maintenance/backups/migration/deployment. A remote read-only inventory can be prepared after the user authorizes the intended staging endpoints; production access is prohibited in this task. The current tool inventory exposes no dedicated Northflank or Neon deployment connector. An approved authenticated API/CLI or operator workflow, staging identities and secrets are needed for remote automation. No remote integration was used here.

Remaining risks: unresolved post-render transport failure in the combined constrained replay; Linux build/fonts/native signals and cgroup memory; staging R2/multipart/retention; current production revision/schema drift; exclusive lock duration and active downloads; established network partition deadlines; existing rejectUnauthorized=false production TLS configuration; missing parent-process graceful drain; delivery of uncommitted tested source. These are not resolved by expanding the status CHECK.

## Files changed by this preparation

- backend/benchmarks/leaseRecoverySchemaLive.cjs: full row/unrelated-constraint/column/index/trigger preservation and repeat checks.
- backend/benchmarks/predeployLocal.cjs: optional legacy CHECK/migration acceptance plus an explicit completion-fixture skip for independent cancellation replay.
- backend/benchmarks/automaticCancellationLive.cjs: optional legacy migration, recovery and real same-project restart after conflict; guarded alternate loopback port.
- backend/benchmarks/prepareStagingSource.cjs: offline allowlisted source context, manifest, archive, source and future image verification.
- STAGING_CHECK_CONSTRAINT_VALIDATION.md: this complete execution/approval/rollback plan and evidence.
- NORTHFLANK_STAGING_VALIDATION_PLAN.md: appended current constraint validation results; historical evidence preserved.

Pre-existing local lifecycle/diagnostic changes, regression files, migration, fixture and investigation report were preserved. The migration SQL itself was reviewed and tested unchanged. No new application runtime or frontend feature changes were made. Generated source/evidence artifacts are ignored local files.
