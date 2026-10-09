# Automatic cancellation investigation and local fix

Date: 10 October 2026, Asia/Bangkok. Actual repository: D:/pull from git/JACK-CUT. Branch: Jack. Base HEAD and GitHub Jack: a3725204ebd5335701d3aed44442a390d3aadfaa. The checkout was clean at this task's start; its newer committed base was preserved. No commit, push, merge, branch switch, deployment or production database/storage operation occurred.

## Finding and limits

**Confirmed local defect: POST /exports silently reused an existing processing job even if that job already had cancel_requested_at set and stage=cancelling.** A regression seeded the exact observed processing/cancelling/progress=3 state. Before the fix it received HTTP 202 and attached the editor to that cancelling job, without a new Cancel click. The frontend's existing reducer correctly displayed the returned cancelRequested=true; it did not originate that durable intent.

**This does not establish the deployed incident's root cause.** A genuinely new export did not cancel itself in the executed local tests. The reuse defect reproduces a matching path when prior cancellation exists; the production POST response/job identity and earlier cancel request history are unavailable. The user confirmed the Northflank deployed SHA/image digest is unknown. No live production export, cancellation or data inspection was performed.

## Complete lifecycle trace

1. Editor toolbar invokes useEditorWorkspace's export callback -> useExportVideo.startExport -> exportService.create -> authenticated POST /api/exports. The server checks project ownership/timeline and locks the project row during reservation.
2. Previously, the first processing job for that project was reused unconditionally. A stale/pending cancelling row therefore returned HTTP 202, its old ID/progress and cancelRequested=true. After the fix it returns 409 EXPORT_CANCELLATION_PENDING with a clear explanation, does not mutate the prior row, and does not start an overlapping FFmpeg child. Healthy processing jobs still reuse their reservation; terminal rows do not block a new reservation.
3. A new reservation receives a new UUID, worker token, creation time, preparing stage and heartbeat. The owner materializes sources, waits in the process-local cancellable FIFO, serializes its final start decision against cancellation, then spawns FFmpeg with the existing optimized graph/threads/encoder settings.
4. Progress writes are fenced by processing status, owner token and cancel_requested_at IS NULL. GET /exports/:id loads the owned user's durable row, combines progress with any local owner and reports cancelling only when durable cancellation exists. GET does not call requestCancel.
5. Only POST /exports/:id/cancel calls requestCancel in runtime code. That function is the sole runtime writer of cancel_requested_at and stage=cancelling, guarded by processing status and a null previous timestamp. An authorized HTTP request proves endpoint reception, not that a human physically clicked; another tab/client can send the same request.
6. The receiving worker signals only its verified local owned child; a different owner learns the durable flag through checkpoints/heartbeat. SIGTERM then SIGKILL escalation, close, fenced terminal commit, unpublished-output cleanup, scratch cleanup and ownership release remain unchanged.
7. In-memory cancelRequested becomes true only after observing the durable flag in checkpoint/start lock/requestCancel or terminal serialization. These observations do not independently create a cancellation timestamp.
8. Total timeout uses now-createdAt, defaults 1800000 ms and includes queue time. Stall timeout defaults 120000 ms and exempts renderer-slot waiting. Watchdogs, database/lease loss and preparation failure abort work as failed; they do not create cancellation intent. Aborting an AbortController is not user cancellation. Updated regressions explicitly assert that watchdog stops leave cancel_requested_at null and cancelRequested false.
9. Recovery identifies expired heartbeat/legacy leases (default 30000 ms). Already-requested expired cancellation becomes cancelled; uncancelled expiry/total deadline becomes failed. Recovery does not create cancel_requested_at. PostgreSQL SQL deadlines, terminal serialization/retry and lease fencing from the earlier fix remain intact.
10. Frontend polling follows the specific job ID, stops only on confirmed terminal status and uses bounded retry/backoff for transient failures. React effect cleanup clears its timer and aborts an in-flight GET; it does not POST cancellation. Cancel is only invoked by the button callback. Unmount/rerender regression verifies zero cancellation calls.

A creation/reuse request can still race a legitimate later cancellation from another client. Do not clear a durable flag or suppress polling to conceal that race. No such state is fabricated by this patch.

## Fix and safe diagnostics

Creation now rejects an already cancelling processing job with:

```json
{
  "code": "EXPORT_CANCELLATION_PENDING",
  "message": "The previous export is still cancelling. Wait for cancellation to finish before starting another export."
}
```

HTTP status: 409. The existing frontend Axios error handling displays that message through the editor error modal/alert, stops its unsuccessful start state and permits retry. No frontend production logic change was necessary. A new export succeeds after the prior job is terminal; confirmed-cancellation polling for jobs already tracked by the editor is preserved.

Added allowlisted events create_new, create_reused and create_rejected_cancelling. Existing cancel_request_begin identifies trigger=cancel_endpoint for HTTP cancellation. stop_requested identifies heartbeat_timeout/stall, watchdog_timeout/stall, lease_lost, database_error, preparation_error, durable_cancel or internal_stop. Recovery retains distinct lease_recovery events. An HTTP trigger is not labeled as proof of a human click. Logs include only existing safe UUID/owner-hash/PID/status/progress metadata and known trigger enums; no captions, request bodies, SQL, raw tokens, credentials or error messages were added.

## Tests and executed runtime results

| Check | Result |
| --- | --- |
| Cancelling job reuse regression before fix | Reproduced failure: 202 returned when 409 expected |
| Full final backend suite | 226/226 PASS, zero failures/skips |
| Full final frontend suite | 129/129 PASS, zero failures/skips |
| Existing healthy-job deduplication | PASS; reused ID, one reservation, no second spawn |
| Terminal prior cancellation permits new job | PASS; new ID, null cancel timestamp, prior terminal history preserved |
| Frontend conflict explanation/retry | PASS; exact server message, no stale cancelling state/polling or automatic cancel; retry and completion succeed |
| Frontend normal polling/rerenders/unmount | PASS; 3% remains normal rendering; GET signal aborted at unmount; zero cancel requests |
| Watchdog origin and non-cancellation assertions | PASS; failed outcome, no durable cancel flag; safe trigger logging verified |
| Focused native five-second export | PASS; completed without cancellation, playable/decoded 1920x1080/30 fps/150 frames, 46.413 s including validation |
| Focused actual API seeded prior cancelling row at 3% | PASS; HTTP 409, one existing row preserved, no new renderer, explicit rejection diagnostic and no cancel endpoint request |
| Full constrained native replay | Nine scenarios PASS: simple, 60-second story, active repeated cancel, export after cancel, remote-owner cancel, queued/active cancel, corrupt-source native failure, real 1500 ms PostgreSQL row-lock delay |
| Requested 60-second story | PASS; no cancel POST/flag/stage before completion, progress to committed 100, 60.000 s MP4, 1920x1080/30 fps/1800 decoded frames |
| Story scene/subtitle/animation QA | All ten images and subtitles present, no fully black frames, minimum/mean full-frame SSIM 1.0 against retained reference; contact sheet visually inspected |
| Native story duration | 419.684 s FFmpeg spawn-to-close; 419.825 s API-to-terminal; 425.542 s including decoding |
| Repeated active cancellation | 110 ms to confirmed cancelled |
| Cross-process cancellation | 1638 ms to confirmed cancelled |
| Active cancellation releasing queue | 543 ms to confirmed cancelled |
| Windows constrained memory | Peak combined commit 944.43 MiB under 1024 MiB; simultaneous sampled working set 921.79 MiB; no OOM |
| Replay CPU/wall | 565.969 s Job Object CPU / 627.934 s wall; affinity one logical core |
| Full replay final state | Nine jobs terminal, cancelled/failed output absent, zero render workspaces; owned ports 5001/5002 stopped |
| Syntax / whitespace | Changed runtime/runner node --check and git diff --check PASS, CRLF notices only |

The first full backend run during native rendering passed 224/225: an existing watchdog test asserted both signals after a fixed 55 ms, but CPU contention delayed SIGKILL scheduling. It was changed to wait for the actual two signals with a bounded 2 s deadline, retaining all escalation assertions. The next run passed 225/225; after follow-up terminal/retry tests, the final full suite passed 226/226. This was a test timing defect, not a weakened watchdog requirement. Frontend's initial 127/127 and final 129/129 runs passed. A generated harness initially failed to locate CRLF boundaries before running; normalized its source copy and reran successfully, without changing existing benchmark boundaries/source during that attempt.

Windows tests do not verify Linux/POSIX signals, Northflank cgroup accounting, real R2 I/O or Cloudflare deployment behavior. This task did not repeat a browser end-to-end session; frontend behavior was tested using its real extracted hook/reducer and inspected page wiring. PostgreSQL and later visual verification are outside the Windows Job Object. Keep staging recommendation 2 vCPU/2048 MiB, one process/slot and one FFmpeg thread; no Northflank 1 GiB claim.

## Exact files changed by this task

| File | Location and purpose |
| --- | --- |
| [backend/controllers/exportController.js](<D:/pull from git/JACK-CUT/backend/controllers/exportController.js:128>) | Reject cancelling-job reuse; creation events; cancel-endpoint and preparation-error origin |
| [backend/services/exportLifecycle.js](<D:/pull from git/JACK-CUT/backend/services/exportLifecycle.js:21>) | Diagnostic stop/request origins only; cancellation/timeout semantics unchanged |
| [backend/utils/exportLifecycleDiagnostics.js](<D:/pull from git/JACK-CUT/backend/utils/exportLifecycleDiagnostics.js:4>) | New event/trigger allowlists |
| [backend/tests/projectLifecycle.test.cjs](<D:/pull from git/JACK-CUT/backend/tests/projectLifecycle.test.cjs:246>) | Regression for rejected cancelling reuse and new export after terminal history |
| [backend/tests/exportLifecycle.test.cjs](<D:/pull from git/JACK-CUT/backend/tests/exportLifecycle.test.cjs:65>) | Watchdogs cannot create cancel intent; bounded asynchronous signal assertion |
| [backend/tests/exportLifecycleDiagnostics.test.cjs](<D:/pull from git/JACK-CUT/backend/tests/exportLifecycleDiagnostics.test.cjs:20>) | Safe source classification and privacy |
| [frontend/tests/projectLifecycle.test.mjs](<D:/pull from git/JACK-CUT/frontend/tests/projectLifecycle.test.mjs:229>) | Conflict/retry and rerender/unmount tests; test harness cleanup support at lines 25/79 |
| [backend/benchmarks/predeployLocal.cjs](<D:/pull from git/JACK-CUT/backend/benchmarks/predeployLocal.cjs>) | Complete-export helper asserts no unrequested cancelling stage/flag |
| [backend/benchmarks/automaticCancellationLive.cjs](<D:/pull from git/JACK-CUT/backend/benchmarks/automaticCancellationLive.cjs:1>) | New isolated focused native export/real API regression runner |
| [AUTOMATIC_CANCELLATION_INVESTIGATION_REPORT.md](<D:/pull from git/JACK-CUT/AUTOMATIC_CANCELLATION_INVESTIGATION_REPORT.md>) | This report |

FFmpeg filter graph, encoder/thread memory optimizations, animation/text/subtitle math, PostgreSQL budget configuration, storage/cleanup implementation and production frontend polling/modal logic were not changed.

## Evidence

Under D:/pull from git/JACK-CUT/backend/benchmarks/results:

- automatic-cancel-final-backend-5b633b6f5bcb4d75816831f68ac63076.log: final 226 backend tests.
- automatic-cancel-final-frontend-0546c3ca81b341e3b9e4934b055e0a97.log: final 129 frontend tests.
- automatic-cancel-backend-2a6f96dacdba4c15826127be794c61e8.log: recorded initial timing failure; automatic-cancel-backend-rerun-cc4659022a264796a1e645ec52fcd52c.log: 225 pass after correction.
- predeploy_1791572515679/evidence.json and backend.log: focused export and seeded 3% conflict. Its synthetic cancelling row is deliberately retained in this isolated database; no real FFmpeg owner was created for it. Do not mistake it for a stuck production export.
- predeploy_1791572662717/evidence.json and automatic-cancellation-summary.json: full nine-scenario pass, exact timing/resources and final DB states.
- predeploy_1791572662717/backend.log and other-backend.log: worker/child close, origin, terminal persistence, progress and cleanup.
- predeploy_1791572662717/visual-1791573285315/verification.json, current-contact-sheet.png, current.mp4 and ssim.log: complete frame/scene QA.
- predeploy-envelope-37e1dcd63d5a41ac9b61cfc5fbda3086-memory.json and sibling samples/output/error logs: measured envelope.

Two new loopback-only databases and uniquely named fixture media/exports were retained. Only test-owned render workspaces were cleaned normally. Existing user data was preserved. Fixture authentication files must not be published. No production credentials, database or object storage were used for these tests.

## Deployed revision and remaining evidence

GitHub connector confirmed the base commit exists, and read-only git ls-remote confirmed refs/heads/Jack=a3725204ebd5335701d3aed44442a390d3aadfaa, matching local HEAD. That committed base contains the earlier cancellation, PostgreSQL timeout and cleanup fixes, but still contains the now-reproduced reuse defect. Today's patch is uncommitted and has not reached GitHub or a deployment.

**Whether Northflank currently runs that base or another revision is unknown.** A GitHub branch match is not deployed image proof. Required operator evidence: actual service commit/image digest and start/restart times; redacted creation response with returned job ID/stage/flag; any earlier cancel POST for that ID across clients/replicas; cancellation timestamp versus creation/start timestamps; owner/receiver lifecycle logs; effective timeout/lease settings and database waits. If a genuinely new ID gains cancellation without any cancel endpoint event, inspect the deployed implementation and read-only database column defaults/triggers for export_jobs.cancel_requested_at. Those production conditions were not inspected; do not guess or reset rows.

## Safe next deployment steps

1. Review this local diff and obtain separate explicit authorization before committing/pushing/deploying. Preserve Jack/main and production infrastructure; do not merge or trigger production branch automation accidentally.
2. Confirm the tested source/image identity and deployed Northflank revision; include the prior fixes plus this guard and diagnostics in the reviewed artifact.
3. On isolated staging, test fresh 5/60-second exports, the seeded prior-cancellation conflict and frontend explanation/retry, healthy duplicate reuse, completion/cancel races, terminal recovery and same-project restart. Retain genuine confirmation polling; do not reset flags or synthesize terminal states to pass.
4. Execute exact Linux image build, POSIX child close/escalation, cgroup CPU/RAM/OOM, effective PostgreSQL waits/network recovery, R2 upload/abort/cleanup, and Cloudflare frontend tests from NORTHFLANK_STAGING_VALIDATION_PLAN.md. Required provider integrations and production revision evidence remain unavailable here.
5. Require all staging gates before production. Keep known-good artifacts for a compatibility-checked rollback, drain active jobs and preserve database rows, media and objects.

**Local requested checks passed. Fresh exports did not spontaneously cancel; the existing-job reuse defect reproduces locally and is fixed. Production cause/version and Linux/staging readiness remain unverified.**