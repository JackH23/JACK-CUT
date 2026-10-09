# Pending cancellation investigation — 2026-10-10

## Scope and conclusion

Actual checkout: `D:\pull from git\JACK-CUT`, branch **main at inspection start**, starting revision `557af0c4d72d63eb80d4d08ba48d0f9665106e39`. The tree was clean before this task. The final branch check showed **Jack at the same revision**, with all changes intact; that branch-name change occurred outside this task's commands. No branch switch was issued by the agent. Repository context supplied by the user: `JackH23/JACK-CUT`. No branch switch, worktree, commit, push, merge, deployment, production query or production data mutation occurred.

The provided `processing / cancelling / cancelRequested=true / error=null` response proves durable cancellation intent exists. It does **not** identify the render owner, establish that SIGTERM/SIGKILL was accepted, prove FFmpeg emitted close, or prove a terminal transaction committed. The frontend is correctly continuing status polling until a terminal result confirms cancellation.

**The production indefinite-pending cause is not established from this response alone.** If the response came from POST `/cancel`, the current handler already finished `requestCancel()`: its extra owner read cannot still be blocking that same POST. We fixed a separate, locally reproduced signal-delivery delay and added the diagnostics needed to identify the actual production wait. We did not force a terminal status or hide the pending cancellation UI.

## Current lifecycle trace

- Frontend: `useExportVideo.ts:72` guards repeated clicks, `:82` calls `exportService.cancel`, and `:128` polls status while processing. Confirmed terminal results clear cancelling and effect cleanup aborts outstanding GET requests. `exportService.ts:30` uses the shared authenticated Axios client.
- Express: `backend/routes/exportRoutes.js:24` applies authentication to POST `/:id/cancel`. `exportController.cancelExport` verifies project ownership before calling the lifecycle service. Status reads use PostgreSQL and a local progress map; they do not confirm shutdown solely from a missing local process.
- PostgreSQL: `requestCancel` writes `cancel_requested_at` and stage cancelling with `status=processing AND cancel_requested_at IS NULL`, preserving idempotency. The job's worker token identifies its render lease. Each backend process has its own in-memory job registry; the HTTP receiver can be a different process from the owner.
- Owner: a matching local job aborts its work, rejects a queued render wait, or signals its FFmpeg child. Another process observes the durable flag at checkpoints/heartbeat ticks. Queued/preparing jobs and uploads may have no active child to signal.
- FFmpeg: SIGTERM is attempted once; if close has not occurred, SIGKILL is attempted after `EXPORT_KILL_GRACE_MS` (default 5 seconds). `child.kill()` returning true means the signal API accepted the request, not that shutdown is confirmed. `exit` and `close` are logged separately; close releases the renderer slot and starts finalization.
- Finalization: progress writes are fenced and cancellation stops waiting for them. A PostgreSQL transaction locks the job row, checks the durable cancel flag/worker token/terminal winner, updates the terminal outcome, then commits. Unpublished output and scratch cleanup follow. Heartbeats continue while shutdown/finalization is pending; lease recovery does not expire a live owner simply to close the UI.

The backend Dockerfile starts one Node process per container. The number of Northflank replicas, other workers, deployed revisions and identity of the production render owner are not present in this local checkout's runtime state. They require Northflank evidence.

## Confirmed local defect and focused fix

Before the patch, `requestCancel()` awaited a separate `findByPk()` after the cancellation UPDATE, before signalling a verified local owner. A fault-injected stalled read reproduced: the cancel flag was already set, but **no SIGTERM had been sent**. The failing regression was added and run before changing this behavior. It also fails against the read-only original HEAD source, without replacing local files.

The fix requests PostgreSQL **UPDATE RETURNING**, obtaining the worker token and cancellation state from the successful mutation. For an affected row, the local owner is verified and signalled immediately without the redundant SELECT. Unaffected/duplicate/terminal cases retain an authoritative read and their existing guards. A returned foreign owner is never signalled by the receiver. PostgreSQL RETURNING behavior was checked in the installed Sequelize implementation; the configured database dialect is PostgreSQL.

This fixes the reproduced local delay. It is **not claimed as the proven cause of the persistent production state after an acknowledged POST**. The production modal remaining open indefinitely did not occur in the native local test.

## Diagnostic logging

New logs are single-line JSON with `component=export_lifecycle`, UTC timestamp, boot-instance UUID, Node PID, job UUID, hashed lease identity, child PID, local stage/status, cancellation/abort/close flags, heartbeat activity and finalization phase. Owner-resolution events also record database stage/status/cancel intent and the hashed database owner lease.

Only allowlisted metadata is emitted. No raw worker token, credential, SQL text, media path/URL, caption, FFmpeg command/stderr, error message or stack is logged. Signal return values and safe OS/SQLSTATE/error-name fields are recorded. Logger failures cannot prevent signalling or cleanup. Pending cancellation/heartbeat diagnostics begin after ten seconds and are limited to one per thirty seconds per job. Healthy recovery begin/end logs are limited to every thirty seconds; nonzero recovery counts are logged when they occur. Regular status polling and heartbeat success do not emit per-request lifecycle logs.

| Last event / state | Interpretation to verify |
| --- | --- |
| `cancel_request_begin`, no `cancel_request_persisted` | Cancellation UPDATE is pending/failing, potentially connection acquisition or a database row lock. |
| `cancel_owner_resolved`, ownerRelation `not_local` | The request receiver does not have the owner in its registry. Match `ownerLease` to another instance's `registered` event `lease`. This alone does not prove another owner is alive. |
| `token_mismatch` | A local stale registry entry does not own the database lease and was not signalled. |
| Owner `cancel_observed`, no active child | Inspect preparing/queued/uploading stage; no FFmpeg signal may be needed. |
| `signal_sent` with `killAccepted=false`, or `signal_failed` | Signal API rejected/failed; inspect the owner instance and child PID. Cancellation stays pending until work settles. |
| SIGTERM, then SIGKILL, no `ffmpeg_exit` | Require the actual owner container's process state and runtime/restart events. |
| `ffmpeg_exit`, no `ffmpeg_close` | Exit happened but stdio closure has not completed; do not treat exit as close. |
| `ffmpeg_close`, pending `progress_wait` | Inspect progress begin/end events and pending-write count. Cancellation already aborts this wait; verify the actual deployed revision. |
| `terminal_transaction_begin`, no `terminal_lock_acquired` | Transaction connection/row-lock read has not completed. Inspect PostgreSQL activity and blockers. |
| `terminal_write_begin`, no `terminal_write_end` | Terminal UPDATE is pending. |
| `terminal_write_end`, no `terminal_committed` | Transaction commit/connection outcome is pending; the update is not yet a confirmed commit. |
| `terminal_committed` with cancelled, status GET still processing | Compare job UUIDs, API origin, deployed revisions and database configuration across instances. Obtain the PostgreSQL row snapshot. |
| `cleanup_begin`, no `cleanup_end` | Cleanup is pending after terminal persistence; inspect storage/scratch activity. This should not keep a correctly polled cancelled status processing. |

## Every changed file and exact locations

All paths below are relative to `D:\pull from git\JACK-CUT`; line numbers are one-based.

| File | Locations and changes |
| --- | --- |
| `backend/services/exportLifecycle.js` | `:14` signal acceptance/failure logging; `:32` pending-heartbeat/cancel diagnostics; `:95` terminal lock/write/commit phases; `:129` owner-resolution and UPDATE RETURNING fix (`:136`); `:151` recovery counts/rate limiting. |
| `backend/controllers/exportController.js` | `:542` renderer wait/admission; `:616` pending progress-write diagnostics; `:645` progress-wait phases; `:718` close and renderer release (spawn/exit/error events nearby); `:752` scratch cleanup; `:761` unpublished-output cleanup. Cleanup failure behavior is retained. |
| `backend/utils/exportLifecycleDiagnostics.js` | New; `:11` lease fingerprinting; `:14` JSON sanitizer/allowlisted logger. |
| `backend/tests/exportLifecycle.test.cjs` | `:18` fixture supports PostgreSQL RETURNING and captures diagnostics; `:153` failing-before/fixed-after regression; `:162` remote receiver/local observation; `:172` foreign owner isolation; `:178` completion winner; `:183` blocked terminal lock; `:191` failed SIGTERM/SIGKILL; `:197` real native SIGKILL fallback after injected SIGTERM rejection. |
| `backend/tests/exportLifecycleDiagnostics.test.cjs` | New; `:5` privacy/structured-output regression; `:14` logger failures and safe database codes. |
| `backend/benchmarks/storytellingFixture.cjs` | `:28` mock UPDATE returns affected rows when requested, matching PostgreSQL behavior for the native controller test. |
| `backend/CANCELLATION_DIAGNOSTICS_REPORT.md` | New; this investigation, test evidence and deployment/evidence requirements. |

No frontend, rendering filter graph, thread limit, encoder quality, animation, subtitle, database schema or render-slot behavior was changed.

## Test results

| Test | Result |
| --- | --- |
| Original HEAD, `redundant owner read` regression | **1 failed**, confirming durable intent without SIGTERM while the extra read was stalled. |
| Lifecycle/diagnostic regressions in the full suite | **26 passed**, including native escalation. The earlier standalone diagnostic run passed 25 before the final escalation test was added. |
| Full backend: `cd backend; npm test` | **219/219 passed**, no failures/skips. |
| Frontend cancellation/poll/modal/reset: `cd frontend; node --test --test-name-pattern='export\|cancel\|poll\|reducer' tests/projectLifecycle.test.mjs` | **21/21 passed**. |
| Native optimized 60-second/10-image/10-caption graph, cancel after encoded frames | Passed; owner **local**, SIGTERM accepted, **exit and close** logged, cancelled transaction committed, cleanup completed and worker released. |
| Native close latency / final state | **53 ms** after request; progress reached 4%, then **cancelled**, null error, null published output reference. SIGKILL was unnecessary in this representative run; a separate native test injected SIGTERM rejection, then confirmed actual SIGKILL acceptance, FFmpeg close and cancelled persistence. |
| Native resource envelope | One logical CPU, 1,024 MiB Windows Job Object cap; peak combined Node+FFmpeg commit **812,515,328 bytes / 774.9 MiB**; harness duration **33.148 s**. This is a cancellation run, not a complete-video timing comparison or proof of Northflank Linux container memory. |
| JavaScript syntax / whitespace | `node --check` and `git diff --check` passed. |

The native test uses actual controller/FFmpeg behavior with synthetic fixtures and mocked database/storage. Fault-injected locking tests are not live PostgreSQL integration tests. Existing backend tests also verify active/queued/repeated cancellation, progress fencing, safe cleanup, upload settlement, completion races and lease recovery. The frontend was left unchanged; the full unrelated frontend suite was not rerun for this backend-only patch.

Evidence is retained only in ignored `backend/benchmarks/results/`:

- `cancellation-observability-before-test.log` and its read-only HEAD preload.
- `cancellation-observability-unit-tests.log`.
- `cancellation-observability-full-backend-tests.log`.
- `cancellation-observability-frontend-tests.log`.
- `cancellation-observability-cancel-render-progress.log` contains lifecycle JSON.
- `cancellation-observability-cancel-render-controller-state.json`, `...-controller-memory.json`, native progress/stderr and command manifest.

## Deployment requirements and Northflank evidence

The patch is ready for staging investigation. **Nothing has been deployed.** A later authorized backend build must include the new diagnostic module and updated controller/service, using the existing PostgreSQL dialect. No frontend release, dependency installation, migration or production data rewrite is required. All backend/render replicas must run the same revision; account for older active renders during rollout. Record image/commit identity and retain logs from every instance, not just the instance handling HTTP cancel.

For one affected production job, collect:

1. Export job UUID, cancellation time in UTC, HTTP POST status/body, and subsequent GET timestamps/bodies until terminal or the observed stall interval. Specify whether the supplied response was the POST response or a later GET.
2. Lifecycle JSON from **all Northflank instances**, beginning before `registered`/`ffmpeg_spawned` and continuing through cancellation: owner fingerprints/instance UUID/PID, signal attempts/return values, exit/close, progress writes, terminal lock/write/commit, cleanup, pending warnings and recovery counts.
3. Deployed backend revision/image, replica and Node-process counts, restarts/OOM events, CPU scheduling/memory metrics, and the actual lease/kill/timeout settings. On the identified owner, capture process names/PIDs for Node and FFmpeg; do not include full command arguments or media paths.
4. Read-only PostgreSQL snapshots of the affected row and blocked connections while it is pending. Examples for an operator with appropriate read access (not executed by this task):

```sql
SELECT id, status, stage, progress, cancel_requested_at,
       heartbeat_at, completed_at, updated_at
FROM export_jobs
WHERE id = '<affected export UUID>';

SELECT pid, state, wait_event_type, wait_event, xact_start, query_start,
       pg_blocking_pids(pid) AS blocking_pids
FROM pg_stat_activity
WHERE datname = current_database();
```

Do not share database URLs, credentials, raw SQL query text, media/caption data or raw worker tokens. Lease fingerprints in the lifecycle logs provide owner correlation without exposing those tokens.

Current database configuration has no explicit per-query or PostgreSQL lock timeout. A live owner's pending terminal transaction can keep cancellation processing while shutdown heartbeats renew; a forced frontend timeout would not establish process termination or transaction commit. Select timeout/lock remediation only after the blocking phase is established from the above evidence. A missing local owner, a successful signal API call and a lease-recovered terminal row each have different evidentiary meaning; none alone proves a remote operating-system process closed.

The confirmed extra-read defect is fixed and locally validated. Identification of the persistent production stall remains conditional on this evidence.
