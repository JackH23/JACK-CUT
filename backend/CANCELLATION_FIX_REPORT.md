# Cancellation fix and test report — 2026-10-10

## Local scope

Project: `D:\pull from git\JACK-CUT`. Starting revision: `c383a464633d79afac2281bb44932ab2b1535e49`. The working tree was clean at the start. The current checkout is **Jack**, not main; the branch was preserved under the instruction not to change branches. No commit, push, merge, deployment, schema change, live database connection, production job mutation or deletion of existing project/media data was performed.

## Confirmed root cause

The reported text originates in `exportLifecycle.reconcile()`, not FFmpeg or the cancel API itself. It is written into `export_jobs.error_message` when a processing job's worker heartbeat expires or total deadline elapses. The frontend status poll passes that failed job through `exportReducer`, and the editor shows `exportError` in its generic ErrorModal.

Cancellation previously called `stop()`, which aborted the job's AbortController and sent SIGTERM to its owned child (then SIGKILL after the configured grace). However, the next heartbeat tick called `checkpoint()`, whose first instruction rejects an aborted job. Thus **accepted cancellation stopped renewing its own lease while shutdown/finalization was still pending**. Recovery made no distinction for `cancel_requested_at`: it changed such a row to failed with the exact timeout message. A later cancellation save was guarded by `status=processing` and could no longer replace recovery's terminal failure.

Two related races compounded this:

- Successful completion checked the durable cancellation flag, but failure finalization only trusted the local `job.cancelRequested`. A cancellation persisted through another backend instance could therefore be lost to failure before the owner observed it.
- Finalization awaited the queued progress writes before checking cancellation. A pending progress query could delay cancellation after FFmpeg closed. On the frontend, six transient poll failures could dispatch a generic export error even while an accepted cancellation was awaiting confirmation. Transport errors on the cancel response could also unlock the button and display an error although the request had already committed.

New regressions reproduced the lease-expiry failure, durable-cancel-versus-failure race and polling-error behavior before the fix; those tests now pass. This establishes a local causal path for the exact reported message. Northflank request logs, worker logs and production database rows were not accessed, so the precise timing and process exit of the user's individual production incident are **not independently confirmed**.

## Lifecycle trace and resulting behavior

1. Editor `ExportProgress` invokes `useEditorWorkspace.handleCancelExport`, then `useExportVideo.cancelExport`. The synchronous ref guard permits one logical cancel request while processing; the button is disabled while cancelling. Observed remote cancel requests also block duplicate clicks.
2. `exportService.cancel` POSTs the encoded job ID to `/api/exports/:id/cancel` through the shared authenticated Axios client. Express `exportRoutes` applies auth, and `cancelExport` checks the job's owned project before mutation.
3. `requestCancel` atomically sets `cancel_requested_at` and stage cancelling only on processing rows without a prior request. It checks the durable row before signalling its local owner; a previously committed completion is preserved. Repeated requests preserve the first timestamp and do not resend SIGTERM/SIGKILL.
4. Active FFmpeg receives SIGTERM and escalation through the existing stop path. A queued job aborts its FIFO wait; no FFmpeg starts and it does not consume a slot. Preparation/upload use the existing AbortSignal paths. The renderer slot remains held until child close; another render's process is not signalled.
5. While shutdown settles, heartbeat ticks continue renewing the owned processing row even though work is aborted. Queued waits remain excluded from the no-work timeout; total deadlines are unchanged. For an expired owner, recovery records cancelled only if there is a durable cancel request; uncancelled expired jobs remain failures.
6. Every terminal outcome is serialized in a row-locking transaction against cancellation. Accepted cancellation wins any later success/failure finalization; a completion committed first remains completed. Recovery/other terminal winners and worker-token fences are preserved. Cancellation clears the error and published output path, while retaining cleanup intent for an unpublished upload.
7. Cancelled progress writes are fenced by `cancel_requested_at IS NULL`, and finalization stops waiting for progress writes when the job aborts. Late progress writes cannot reopen terminal jobs. The existing discard and workspace cleanup run after child close or aborted preparation/queue settlement. Source media are not removed. Storage deletion failures keep the existing recovery intent.
8. The cancel endpoint returns authoritative metadata for processing and terminal jobs; completed/failed/cancelled repeats do not become HTTP 409 errors. Continued status polling after HTTP 202 is intentional until a terminal status confirms the outcome.
9. Frontend transient confirmation failures keep Cancelling with bounded GET backoff. An ambiguous cancel transport error does not resend the POST or claim CANCELLED. Polling stops on terminal confirmation, aborts an in-flight request, ignores late responses/errors, clears cancelling/exporting, and allows a new export. Real failures or authorization errors remain visible; completion that won the race retains its download.

The FFmpeg filter graph, memory thread limits, cached image loops, encoder quality, animations, ASS subtitles, transforms and timing were not modified. `renderSlots`, route authentication, database schema, reducer and editor components needed no production changes.

## Exact files changed

- `backend/services/exportLifecycle.js`: shutdown heartbeats, transactional terminal outcome, durable request checks and cancellation-aware recovery.
- `backend/controllers/exportController.js`: abortable progress-write wait, cancelled-progress fence and authoritative/idempotent cancel response.
- `frontend/composables/useExportVideo.ts`: single-request confirmation behavior, remote cancellation, transient polling and in-flight request abort.
- `frontend/services/exportService.ts`: optional AbortSignal for status GET.
- `backend/tests/exportLifecycle.test.cjs`: lease regression, durable outcome race, active/repeated/queued cancellation, terminal winner and recovery tests.
- `backend/tests/projectLifecycle.test.cjs`: terminal endpoint repeats and pending progress write regression; existing active/upload/cleanup tests retained.
- `frontend/tests/projectLifecycle.test.mjs`: polling outage, duplicate click, restart, late poll response/error, transport timeout, remote cancel and API signal regressions.
- `backend/benchmarks/storytellingFixture.cjs`: mock status metadata dependencies for the real-controller cancellation harness, preventing application database loading.
- `backend/DEPLOYMENT.md`: corrected cancellation/lease recovery semantics.
- `backend/CANCELLATION_FIX_REPORT.md`: this report.

## Tests and results

| Check | Command / scope | Result |
| --- | --- | --- |
| Entire backend suite | `cd backend; npm test` | **210/210 passed**, no failures/skips |
| Focused frontend lifecycle/API regressions | `cd frontend; node --test --test-name-pattern='export\|cancel\|poll\|reducer' tests/projectLifecycle.test.mjs` | **21/21 passed** |
| Entire frontend suite | `cd frontend; node --test tests/*.test.mjs tests/*.test.cjs` | **120/127 passed; 7 pre-existing fixture failures** |
| Frontend TypeScript | `node node_modules/typescript/bin/tsc --noEmit --incremental false` | Passed |
| Changed frontend file lint | `node node_modules/eslint/bin/eslint.js composables/useExportVideo.ts services/exportService.ts` | Passed |
| Native optimized FFmpeg cancellation after frames appear | Real controller, 60-second/10-image/10-caption graph, Windows Job Object limit 1,024 MiB, one logical CPU | Passed: 0→3% progress, cancelled, null error/output; child closed **177 ms** after request |
| Native cancellation resource envelope | Same run, database/storage mocked | Peak combined Node+FFmpeg commit **811,790,336 bytes (~774.2 MiB)**; harness elapsed **33.665 s** |
| Whitespace / scope review | `git diff --check`, branch and diff inspection | Passed; no rendering graph change |

Native FFmpeg process closure is tested both in the backend suite and through the updated actual controller's representative optimized graph. Active cancellation stays processing until close; queued cancellation never spawns; duplicate close/error callbacks are ignored. Existing tests cover SIGKILL escalation, independent watchdogs, upload settlement/unpublished removal, cancellation-save retry and safe scratch cleanup. No private user media were used. This native run is a cancellation test, **not a fresh complete-video performance benchmark**.

The seven unrelated frontend failures are:

- One existing project-page markup test lacks the `@/components/projects/ProjectsHeader` dependency mock.
- Six text preview/export tests lack the existing `../utils/mediaStreams` dependency mock in their stale controller harness: centered size 34, bottom center, heading default, moved text, resized text, and per-clip family/color/weight/size.

All seven also failed with read-only HEAD snapshots of the relevant source files, confirming they precede this patch. They were left unchanged to keep scope focused. Full test output and this baseline check are in ignored `backend/benchmarks/results/cancellation-frontend-tests.log` and `cancellation-baseline-frontend-tests.log`; native evidence is in `cancellation-regression-cancel-render-controller-state.json`, `...-memory.json` and progress/stderr logs.

## Remaining risks and staging verification

- Local lifecycle/database tests use mocks. Verify transaction behavior and resource scheduling against the actual Northflank Linux/FFmpeg/PostgreSQL deployment; no production request/process exit is claimed from these local results.
- A cancelled record recovered from an expired worker is a durable, fenced outcome, not direct proof that an unreachable machine's orphan FFmpeg has stopped. An owner that resumes sees the terminal fence and stops; host/container process supervision remains responsible for truly lost workers. Live owners are not marked cancelled by recovery before their lease expires.
- A genuine database/network outage can delay confirmation. While cancelling, transient GET polling continues at up to ten-second intervals until a terminal result or unmount. An ambiguous POST failure that never reached the server may eventually resolve as completion/failure; the UI deliberately does not falsely confirm cancellation or automatically resend it. Authorization/not-found errors remain actionable.
- Failed temporary/output cleanup follows existing safe recovery behavior; no broad deletion or orphan cleanup was enabled. Live R2 abort/deletion and browser interaction were not exercised here.
- Before deployment, stage-test rapid clicks, active/queued/upload cancellation, completion races, backend restart and slow database responses. Verify the export overlay closes on cancellation, no error modal appears for a confirmed cancel, no polling continues afterward, and a new export starts. The seven unrelated frontend fixtures keep the broad frontend suite red.

The local cancellation fix is ready for staging review within these limits. No deployment was performed.
