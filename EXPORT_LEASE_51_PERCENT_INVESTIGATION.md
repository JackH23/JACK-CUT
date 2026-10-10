# Export 20b29260 lease-loss investigation

Local checkout D:\pull from git\JACK-CUT, branch Jack. Existing SAMURAI_EXPORT_RESTART_CORRELATION.md preserved. Production queried read-only for the exact export ID. No production writes/jobs, FFmpeg launches, commits/pushes/merges, branch switches or deployment occurred.

## Production evidence

Project 6a8101e7-dc7a-4480-8ef4-3bb835aaba3f; export 20b29260-bbdd-49f7-a75f-093dc241a5aa.
Created 2026-10-10 14:26:11.849 Asia/Bangkok (07:26:11.849 UTC).
Last heartbeat 14:56:10.691 (07:56:10.691 UTC).
Failed/completed_at 14:56:12.326 (07:56:12.326 UTC).
Lifetime 1,800,477 milliseconds. Heartbeat age at failure 1,635 milliseconds.
Status failed; stage failed; progress 51; cancel_requested_at NULL; metrics NULL.
Error: The rendering worker stopped responding or the export timed out. Please export again.

That exact message is written by reconcile's fail_expired UPDATE. The row's extremely fresh heartbeat excludes the expected 90-second expiry for this transition. The lifetime matches the default 1,800,000-ms total deadline plus a polling delay. The immediate mechanism is absolute-deadline recovery followed by an ownership check observing a terminal row. User logs then show lease_lost, SIGTERM, heartbeat_failed, FFmpeg exit/close 255 and terminal_committed. FFmpeg termination follows the application's signal; it is not evidence of an independent FFmpeg failure or OOM. terminal_committed may mean an existing failed row was preserved, not that the owner originated the failure.

Effective deployed configuration/revision/clock synchronization and identity of the process executing recovery are not captured in the supplied abbreviated logs. Very short unexpected lease overrides or large cross-host clock skew are theoretical alternatives, but the exact 30-minute age with a fresh heartbeat strongly supports total deadline recovery. This investigation does not claim a specific replica still has default settings without its effective-config evidence.

## Lifecycle trace and conditions

Lifecycle settings are captured once at createExportLifecycle invocation (the controller invokes it on module load). EXPORT_LEASE_TIMEOUT_MS=90000 is parsed by positive(), used for stale-heartbeat selection, and yields a 2000-ms heartbeat/recovery interval via min(2000,leaseMs/3). It does not alter EXPORT_TIMEOUT_MS. Local regression verifies the exact override. Northflank runtime settings must be present before startup, on every process that starts recovery, in the deployed revision that reads these names.

lease_lost is triggered by a row missing, status other than processing, or a worker_token different from the job's token. These checks run in checkpoint and under the pre-spawn row lock. A durable cancellation with matching processing ownership instead triggers durable_cancel. Expiry is not checked directly in checkpoint: recovery first changes status, then checkpoint detects loss. A SELECT/UPDATE database exception instead enters heartbeat_failed and database_error; heartbeat_failed can also be the assertRunning exception after lease_lost, so that event alone is not proof of a database outage.

Recovery's failed predicate is expired heartbeat OR absolute creation-age deadline, regardless of fresh heartbeat. Thus even a 90-second healthy lease does not protect a job from a 30-minute total deadline. Different runtime settings across replicas can let a short-deadline recovery process fence an otherwise healthy long-deadline owner. This was reproduced in mocked tests. Total timeout includes preparation/queue/render/upload; owner watchdog and recovery both enforce it.

Progress UPDATEs modify only progress with processing/token/cancel fencing; they do not renew heartbeat. Heartbeats independently read ownership and UPDATE stage/progress/heartbeat. Concurrent progress/terminal/cancel writes can contend for the row; pooled SQL is bounded locally by 5000-ms lock_timeout, 30000-ms statement_timeout, 15000-ms pool acquisition and 10000-ms connection establishment. Actual production settings must be verified. Long waits/DB failure can cause genuine stale renewal, but are not evidenced by this job's final 1.635-second heartbeat age. Progress/heartbeat writes can reorder progress snapshots; this patch does not claim to redesign all write serialization or clock semantics.

## Reproduced defect and local fix

Before the change, checkpoint ignored affectedRows from its fenced heartbeat UPDATE. Recovery or cancellation could commit after SELECT; UPDATE would affect zero rows and checkpoint still returned success. Two fault-injection tests failed with Missing expected rejection on the original code. The local fix requires exactly one updated row. Otherwise it rechecks the stored owner/cancel state, stops immediately on lost ownership or durable cancellation, and fails closed as database_error if renewal is inexplicably zero despite unchanged ownership. Cancellation still wins terminal persistence, and no expired/replaced owner is allowed to publish success. This defect was confirmed locally; it is not asserted to be the cause of the observed 30-minute production deadline.

No default deadline was increased, no timeout disabled, no recovered row reopened and no success status fabricated.

## Diagnostics added

lifecycle_configured logs allowlisted timeoutMs, stallMs, leaseMs, killGraceMs, intervalMs per instance/process.
lease_rejected logs stored status/stage, missing-row/token-mismatch relationship, hashed owner lease, job age and heartbeat age.
heartbeat_write_result logs zero-row/slow writes and duration; routine fast successful renewals are not logged every two seconds.
lease_recovered uses UPDATE RETURNING to log exact affected job IDs with total_timeout, heartbeat_expired, total_and_heartbeat_expired or cancelled_expired, plus effective bounds. This avoids relying only on aggregate failedRows counts. No raw tokens, SQL, query parameters or captions are logged.
heartbeat_failed includes the stop trigger, distinguishing a lease_lost assertion from an actual database_error.
Existing pre-spawn ownership checks use the same diagnostics helper; cancellation/start serialization remains under the row lock.

## Files and tests

Modified backend/services/exportLifecycle.js and backend/utils/exportLifecycleDiagnostics.js.
Modified backend/tests/exportLifecycleDiagnostics.test.cjs.
Added backend/tests/exportLeaseRace.test.cjs and backend/tests/leaseInvestigationGuard.cjs.
Added backend/tests/export-lease-investigation-tests.log and this report.

Guarded backend/structural-render tests: 215 total; 210 passed, 5 skipped, 0 failed. Skipped five real FFmpeg tests. The guard rejects every native process launch; mocked controller graph creation, text animations, cancellation, cleanup, ownership, SQL configuration and diagnostics were exercised. No full native video benchmark was performed. git diff --check passed. Tests include zero-row renewal/recovery/cancel races, delayed SELECT followed by recovery, every ownership-loss condition, 90-second lease boundary, fresh-heartbeat total recovery, extended deadline, and mixed-process configuration. Existing terminal cancellation and completion fencing tests remain passing.

## Production verification still required

Collect full logs from all instances around 10 October 14:55–14:57 Asia/Bangkok (07:55–07:57 UTC), including effective settings and image digest/revision. Correlate instance UUID + container ID + processPid + hashed lease; PID alone is insufficient. Needed events: progress_write begin/end and durations, heartbeat_pending/failed with SQLState/errorName, stop_requested trigger, recovery events, terminal_lock_acquired rowStatus, terminal_preserved versus terminal_write_end, and FFmpeg spawn/exit/close signal. Check non-secret EXPORT_TIMEOUT_MS and EXPORT_LEASE_TIMEOUT_MS for every replica/process, and clock synchronization.

The already recommended 7,200,000-ms total limit is a bounded allowance for a slow three-minute workload, but must be effective consistently and verified rather than presumed. EXPORT_LEASE_TIMEOUT_MS=90000 alone does not extend the total deadline. A staged deployment of the diagnostics/fix would identify the recovering instance and its exact reason. No production changes are authorized by this report. Await approval before deployment; do not retry merely by increasing a lease or assume this code patch changes the current 30-minute production policy.
