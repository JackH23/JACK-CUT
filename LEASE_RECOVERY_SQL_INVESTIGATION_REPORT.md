# Export lease recovery SQL investigation

Date: 2026-10-10. Actual checkout: D:\pull from git\JACK-CUT. Branch: Jack.
Base HEAD: 1c1c8f3b152192bcc8062b421fd3e39041cedc85. Initial working tree was clean. No branch switches, commits, pushes, deployments, or production connections/data changes were performed.

## Confirmed cause

The user supplied screenshots of public.export_jobs columns, constraints, and triggers in production Neon neondb. All 15 model columns, including Sequelize created_at/updated_at, are present with compatible types/nullability/defaults. Varchar lengths were not included in the query output. No user triggers were returned; information_schema visibility is limited to the querying role.

The production constraint export_jobs_status_check accepts ONLY processing, completed, failed. ExportJob's application validation accepts cancelled as well. Existing server sequelize.sync() does not alter an existing CHECK constraint, and additive startup column migrations do not fix it. Consequently both cancelled terminal persistence and expired-cancellation recovery can fail.

The first recovery UPDATE, cancel_expired, is incompatible. Generated Sequelize SQL from the actual model/lifecycle was captured locally. Its shape below substitutes the synthetic lease timestamp with <expired> (bound values deliberately omitted):

```sql
UPDATE "export_jobs"
SET "status"=$1,"stage"=$2,"completed_at"=$3,"output_path"=$4,
    "error_message"=$5,"updated_at"=$6
WHERE ("heartbeat_at" < '<expired>' OR
       ("heartbeat_at" IS NULL AND "created_at" < '<expired>'))
  AND "status" = $7 AND "cancel_requested_at" IS NOT NULL;
```

The intended transition is processing -> cancelled, with stage cancelled, completed timestamp, and null output/error. PostgreSQL rejects it with SQLSTATE 23514, constraint export_jobs_status_check, wrapped in SequelizeDatabaseError. Because this first UPDATE throws, the second fail_expired UPDATE is not reached during that recovery cycle. Periodic retries encounter the same unchanged row and fail again. The old diagnostic code allowlist excluded 23514, explaining why this decisive code was omitted from lifecycle JSON.

This was reproduced on a new loopback PostgreSQL database from the supplied production schema metadata. It is not a guess based on the error name. It is not an SQL syntax defect or missing column. Independent locks/timeouts/connection errors remain possible in production; no full original production exception or deployed image revision was supplied. The supplied CHECK and observed row guarantee this incompatibility for the current recovery operation when a matching row is updated.

## Fix and changed files

- backend/scripts/migrations/20261010-export-jobs-cancelled.sql: explicit transaction replacing the named status CHECK with the same three statuses plus cancelled. 5-second lock_timeout, 30-second statement_timeout, validation before commit, no job value updates/deletes. Repeated execution safe. NOT VALID avoids an immediate scan during ADD; VALIDATE remains bounded. ALTER takes an ACCESS EXCLUSIVE lock through commit, so schedule carefully and retry after contention is removed.
- backend/services/exportLifecycle.js:151: recoveryUpdate wrapper identifies cancel_expired versus fail_expired failures, preserves the original rejection, and leaves lease predicates/terminal behavior unchanged.
- backend/utils/exportLifecycleDiagnostics.js:45: SQLSTATE/errorCode, fixed diagnostic category, safe severity, allowlisted table/column/constraint and operation. No raw message, detail, where, query, stack, connection string or parameter values. Unknown identifiers omitted. Logger failures remain isolated.
- backend/tests/exportLifecycle.test.cjs:213: both failed-operation regressions.
- backend/tests/exportLifecycleDiagnostics.test.cjs:27: check violation, missing column, statement cancellation/timeout, lock failure and secret omission regressions.
- backend/tests/fixtures/exportJobsProduction.sql: reconstructed 15-column production-schema fixture with both CHECKs, PK/FK and no user triggers; varchar lengths are deliberately unspecified because unavailable.
- backend/benchmarks/leaseRecoverySchemaLive.cjs: guarded loopback-only disposable database regression and sanitized evidence capture. Databases retained, not deleted. No production URLs used.
- LEASE_RECOVERY_SQL_INVESTIGATION_REPORT.md: this report and deployment instructions.

ExportJob, frontend, FFmpeg graphs, memory controls, rendering, polling and cleanup behavior were unchanged. The SQL migration is an operator artifact; it is not automatically invoked at startup and is not included by the current Docker allowlist. Apply it through the target database SQL editor or an external psql client. Deploying backend code alone does NOT fix the constraint.

## Executed evidence

1. BEFORE migration: backend/benchmarks/leaseRecoverySchemaLive.cjs exited 1 in lease_schema_1791574500302. Initial rejection assertion passed with SequelizeDatabaseError/23514/export_jobs_status_check; the desired recovery failed, leaving processing unchanged.
2. AFTER migration: same runner exited 0 in lease_schema_1791574538196. Eight PASS scenarios: old CHECK rejects without mutation; migrated recovery succeeds; repeat migration; late-owner fencing; live owner preservation plus stale failure and null-heartbeat cancellation recovery; active terminal cancellation and repeated cancellation; status/progress checks remain enforced; blocked migration times out and rolls back safely.
3. npm test in backend: 233/233 PASS, zero failures/skips, 3.644 seconds. Includes actual native FFmpeg close after cancellation (0.614 s), rejected SIGTERM -> SIGKILL/native close (0.687 s), queued/repeated cancellation, recovery fences and rendering tests.
4. node --test tests/*.test.mjs tests/*.test.cjs in frontend: 129/129 PASS, zero failures/skips, 1.661 seconds. Includes terminal polling stop, pending remote cancellation through polling outages, repeated clicks, late polling races, cancelling-job conflict/retry, normal rerenders and cleanup without unintended cancellation.
5. backend/benchmarks/databaseTimeoutsLive.cjs: six PASS in dbbudget_1791574557919. Real PostgreSQL terminal lock rollback (248 ms), completion retry, statement timeout rollback/pool reuse (509 ms), durable cancellation recovery after failed terminal retries, cancellation request retry without false acknowledgement, long download callback compatibility. Connection settings verified: lock_timeout 200ms, statement_timeout 500ms, idle transaction timeout 0.
6. git diff --check passed. Only line-ending conversion warnings from Git. No Linux/container/Northflank test was executed. No fresh full 60-second render was run in this SQL/diagnostics task; historical report measurements are not new evidence.

Evidence: backend/benchmarks/results/lease_schema_1791574500302/evidence.json; lease_schema_1791574538196/evidence.json and failing-operation.sql; dbbudget_1791574557919/evidence.json; lease-recovery-backend-tests.log; lease-recovery-frontend-tests.log. Local failing-operation.sql contains synthetic timestamps only; no production parameters or credentials. Tests do not delete existing jobs or artifacts.

## Safe staging validation and exact next steps

These are proposed operator steps, not executed deployment. Obtain explicit approval before any commit/push, billable resource creation or deployment. Preserve this checkout and review its diff before preparing a tested staging revision.

1. Create/use isolated staging PostgreSQL, staging R2 bucket/credentials and backend service; never point staging at production credentials. Use 2 vCPU, 2048 MiB RAM, one replica/Node process; FFMPEG_THREADS=1 and EXPORT_MAX_CONCURRENT_RENDERS=1. DB_LOCK_TIMEOUT_MS=5000, DB_STATEMENT_TIMEOUT_MS=30000. Retain existing validated export timeout/stall/lease/cleanup settings.
2. On staging only, inspect columns, CHECKs, triggers and pg_get_constraintdef for public.export_jobs, and record schema before the change. Start with the supplied legacy CHECK to exercise the migration. Verify no active render owners before scheduling the ALTER. It may block writes briefly and is intentionally bounded.
3. In staging Neon SQL editor, execute the complete contents of backend/scripts/migrations/20261010-export-jobs-cancelled.sql as one script. Alternatively run: psql --dbname="$STAGING_DATABASE_URL" --set=ON_ERROR_STOP=1 --file=backend/scripts/migrations/20261010-export-jobs-cancelled.sql. Supply credentials via a secure environment/session, never put them in reports or logs. If using a persistent SQL-editor connection and the script errors, execute ROLLBACK on that same connection before retrying. With psql ON_ERROR_STOP the connection exits and rolls back.
4. Verify convalidated=true and pg_get_constraintdef includes exactly processing/completed/failed/cancelled. Keep progress, PK and FK constraints intact. Do not manually rewrite the stuck production row.
5. After approval, deliver exact reviewed source to a dedicated staging revision; never overwrite main or production branches. Build with repository root context: docker build -f backend/Dockerfile -t jackcut-backend:<tested-staging-revision> . Configure separate staging URL, R2 and database secrets, port/health check /health. Record commit, image digest and configuration names without secrets. Do not assert artifact identity until image/source metadata is checked.
6. Validate health/auth, 5-second export, and a real 60-second/10-image/10-subtitle storytelling export. Decode full MP4 with ffmpeg -v error -i <staging-output.mp4> -f null -; inspect ffprobe duration/frame count; view all scenes and subtitles. Measure container CPU, peak memory, duration, restarts/OOM, active FFmpeg children and resource headroom.
7. Test active, queued and repeated cancel, polling races and a new export after terminal settlement. Confirm SIGTERM/SIGKILL as needed, ffmpeg_close before active-owner terminal persistence, consistent cancelled/error=null/no downloadable output, polling/UI reset and safe workspace/R2 cleanup.
8. For an expired-owner recovery scenario, use ONLY a synthetic staging fixture with no active FFmpeg child. Set its lease stale in staging, with durable cancellation, and verify the normal recovery reaches cancelled. Also preserve a live synthetic owner and check it is not reclaimed. Never shorten real production leases or fabricate a terminal production state. Exercise lock/statement timeouts on staging fixtures; release locks and verify retry/recovery, pool reuse and no leaked transactions.
9. Confirm no recurring lease_recovery_query_failed. Any failure must identify recoveryOperation/sqlState/databaseConstraint; compare 23514 with CHECK failure, 55P03 with lock waits, 57014 with statement cancellation/timeout, 42703 with column drift. Keep raw SQL parameters/error detail out of shared logs.
10. Production remains blocked until staging Linux rendering/cancellation, storage isolation, metrics and tested revision are verified and separately approved. This task does not authorize running the migration in production. A later approved schema migration must precede relying on cancelled persistence. Once the schema is compatible, the existing recovery loop can resolve an expired cancelled job without a manual row edit.

Rollback: the migration transaction is atomic; timeout/validation failure leaves the previous CHECK intact after rollback. After a successful migration, leave the expanded CHECK when rolling back application code: old code's three states are still valid. Do not restore the three-state CHECK after cancelled rows exist. Any schema reversal needs separate review and validation, never deletion or rewriting of jobs to force it.
