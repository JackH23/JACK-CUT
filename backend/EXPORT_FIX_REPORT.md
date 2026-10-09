# JackCut export repair report

Work completed in `D:\pull from git\JACK-CUT` on the existing `Jack` branch. No branch changes, commits, pushes or deployments were made. Existing media, projects, exports and database records were not modified by this investigation. Tests used temporary synthetic media and mocked database/storage boundaries; the application server and its startup migrations were not run against the existing database.

## Findings

The export path is editor Export button → `useExportVideo` → authenticated `exportService` → `exportRoutes` → `exportController` → PostgreSQL `ExportJob` reservation → source materialization and FFprobe → native FFmpeg → storage upload → database completion → status polling → authorized MP4 download. The existing graph already checks whether videos contain audio and supplies a silent base audio track. Audio-less input was therefore not established as the cause of the reported production incident.

**Stuck at 0%:** the previous implementation persisted `processing` but relied on an in-memory process map and FFmpeg close callbacks to finalize jobs. It had no total deadline, no-work deadline, heartbeat ownership or automatic recovery. A lost/restarted renderer or hung preparation/render/upload could leave a durable processing row indefinitely. Errors while saving a terminal status were logged without later recovery. Preparation also finished before returning the job ID, and the frontend displayed one generic rendering message for every stage.

**Cancellation failure:** the previous cancellation endpoint required a local active FFmpeg child and rejected both missing children and the finishing/upload stage with `Active FFmpeg process not found.` That excluded preparation, upload, process restarts and another backend instance. Cancellation intent existed only in memory. Upload completion could race cancellation and save completed status without a durable cancellation guard.

These defects are confirmed by code inspection and regression tests. The exact initiating event for the reported production job is not proven: deployed worker logs, production PostgreSQL job rows and the backend's live runtime were not available. The public frontend URL could not be read through the web tool. No claim is made that FFmpeg is missing in the current production image.

## Fixes and exact files

All paths below are relative to the requested checkout.

| File | Change |
|---|---|
| `backend/controllers/exportController.js` | Return job ID before preparation; deduplicate active project exports under the existing project lock; bounded parallel source preparation; serialize native renderer start against cancellation; process FFmpeg telemetry; expose stages; abort/check each stage; fence completion; stage-safe errors and unpublished-output compensation. |
| `backend/services/exportLifecycle.js` (new) | Per-job worker token, durable cancellation, heartbeats, independent stall/deadline watchdog, targeted SIGTERM/SIGKILL escalation, terminal updates guarded against cancellation/expired ownership, and periodic stale-job recovery independent of browser polling. |
| `backend/models/ExportJob.js` | Nullable worker token, heartbeat, cancellation timestamp and stage attributes. Existing terminal statuses are retained; cancelling is a stage while status remains processing. |
| `backend/server.js` | Additive, duplicate-column-safe startup migration, active heartbeat index, and automatic recovery startup. No destructive schema alteration. |
| `backend/services/storage.js` | Abortable R2 reads and streaming download activity; output reference calculation; abort underlying SDK upload requests and wait for native upload/part cleanup, instead of using the SDK's early-returning Upload.abort race. Abort-multipart cleanup is allowed to finish. |
| `backend/utils/mediaStreams.js` | Pass cancellation signal to the existing bounded FFprobe execution. |
| `frontend/lib/export.ts` | Stage/cancellation fields and display labels. |
| `frontend/services/exportService.ts` | Bounded create/cancel HTTP requests. Existing authenticated API service is reused. |
| `frontend/composables/useExportVideo.ts` | Accept terminal cancellation immediately; continue polling while confirmation is pending; stop on terminal status; ignore late in-flight status responses after termination. |
| `frontend/reducers/exportReducer.ts` | Reflect durable cancellation and prevent stale processing responses from reopening terminal jobs. |
| `frontend/app/editor/[projectId]/page.tsx` | Display preparation/start/render/upload stages and remote cancellation; terminal cancellation closes the progress overlay and shows the existing cancelled message. A polling error no longer leaves an endless overlay. |
| `backend/tests/exportLifecycle.test.cjs` (new) | Cross-instance cancellation, legacy/expired jobs, completion fencing, start lock, independent watchdog, kill escalation and real FFmpeg cancellation. |
| `backend/tests/projectLifecycle.test.cjs` | Update mocks for asynchronous preparation/durable cancellation and test early/render/upload cancellation, idempotence, kill failure, missing media/binary, duplicate reservations and fragmented progress. Existing project lifecycle coverage is retained. |
| `backend/tests/storageFlow.test.cjs` | Durable metadata mocks, asynchronous preparation contract, abort propagation, and cancellation through the installed AWS single/multipart Upload implementation. |
| `backend/tests/exportMediaGeometry.test.cjs` | Preserve geometry checks; verify silent/sounding video, audio-only/mixed timelines, image storytelling, animated captions and MP4 decode/playback with real FFmpeg/FFprobe. |
| `frontend/tests/projectLifecycle.test.mjs` | Stage, terminal cancellation, remote cancellation, stale-poll and editor cancellation display coverage. |
| `backend/DEPLOYMENT.md` | Correct previous lifecycle/scaling guidance and document configuration, additive migration and rollout prerequisites. |
| `backend/EXPORT_FIX_REPORT.md` (new) | This report. |

Rendering percentage uses actual FFmpeg output time, scaled to 0–95%. Preparation remains 0% with its own label; upload stays below 100%; only an atomically committed completed row reports 100%. No timer invents progress. A cancellation response acknowledges intent, not completion. The renderer confirms its work has settled before saving cancelled. An unreachable/unknown renderer expires to failed rather than being falsely declared cancelled. Every completion update checks processing status, worker token and absence of durable cancellation.

Performance changes retain the existing graph and quality defaults: distinct sources are prepared with bounded parallelism, repeated active export requests reuse the same job, polling never overlaps and stops on terminal states, and the libx264 preset is configurable. No automatic GPU encoder or speculative stream-copy shortcut was introduced; transformed/composited/subtitled timelines still need rendering.

## Validation

- Complete backend suite: **194 passed, 0 failed** (`node --test backend/tests/*.test.cjs`).
- Frontend export-focused suite: **13 passed, 0 failed** (`node --test --test-name-pattern='export|polling|cancellation|reducer|stages|editor renders' frontend/tests/projectLifecycle.test.mjs`).
- Full frontend lifecycle suite: **26 passed, 1 pre-existing failure**. The project deletion modal test omits the existing `@/components/projects/ProjectsHeader` dependency from its mock. The same failure was reproduced using the original test from `HEAD`; unrelated project UI was left unchanged.
- `npx tsc --noEmit`: passed.
- ESLint on the five modified frontend implementation files: passed.
- `npm run build` in frontend: passed, including production compilation, TypeScript and static page generation.
- Git diff whitespace validation: passed; branch remains Jack.

Real media checks render/decode H.264/AAC MP4s and verify duration and expected audible/silent streams. Image storytelling includes animated ASS captions. Lifecycle tests cover cancellation before native startup, during actual FFmpeg execution, during mocked controller upload and native AWS multipart work, repeated cancellation, renderer/startup failure, missing media, timeouts, stalled jobs, worker disappearance and completion/cancellation races. Database row locking/fencing is tested through mocks; no live PostgreSQL/R2 integration or deployed Linux-container run was performed.

## Production limitations and readiness

The repository's `frontend/wrangler.jsonc` runs OpenNext on Cloudflare. `backend/Dockerfile` runs the Express backend in a Node 24 Linux container, installs FFmpeg/FFprobe with ASS support/fonts, and selects portable libx264. Native FFmpeg executes in that backend, not the Cloudflare frontend worker. The local public API setting is `http://localhost:5001`; production must supply its actual HTTPS backend URL when building the frontend. Neither the live backend URL nor whether production currently uses the supplied Docker image was verified.

The changes are ready for staging verification. Production readiness still requires a real PostgreSQL/R2/container smoke test, correct frontend API configuration, sufficient CPU/memory/scratch disk and an always-running rendering backend. A request-scoped or scale-to-zero host must be replaced by a persistent Node/container renderer or a durable worker architecture. Rendering is not automatically retried after worker loss; the user receives an actionable failure and can re-export.

Startup adds fields/indexes and recovers stale/legacy jobs; this migration has not been executed here. Drain old exports and update every backend instance together. Older versions can bypass the new cancellation/ownership guards, so do not mix them with the new version while renders run. Enable the existing output cleanup recovery to retry storage deletion failures and configure R2 abandoned-multipart expiration. During a complete database/backend outage, terminal state persistence must wait for service recovery; expired jobs then fail automatically. Interrupted uploads may require existing orphan inspection/storage reconciliation.

Configuration defaults: `EXPORT_TIMEOUT_MS=1800000`, `EXPORT_STALL_TIMEOUT_MS=120000`, `EXPORT_LEASE_TIMEOUT_MS=30000`, `EXPORT_KILL_GRACE_MS=5000`, `EXPORT_PREPARE_CONCURRENCY=3` (cap 8), and `FFMPEG_PRESET=medium`. Tune these for real workloads. Heartbeat/recovery/cancellation observation runs at most every two seconds. No deployment was performed.
