# JackCut export investigation — 9 October 2026 (Asia/Bangkok)

Project: 915052e4-b3f6-44b1-8db6-ec4d2c8ee335
Checkout: D:\pull from git\JACK-CUT, branch Jack. No branch change, commit, push, deployment, production API mutation, database connection, or production retry was performed in this investigation.

## Evidence and root-cause confidence

Confirmed local defect: the original export controller unconditionally referenced an audio stream for every video clip. The six generated backgrounds were encoded with -an and have no audio stream. FFprobe confirms video-only input. Real FFmpeg reproduces the old graph failure: "Stream specifier ':a' ... matches no streams. Error binding filtergraph inputs/outputs: Invalid argument." The regression test constructs both graphs using the actual controller: the old graph fails, the patched graph succeeds.

This defect is sufficient to prevent this demo's export. It is the leading explanation for the live failure, but the exclusive production root cause is NOT confirmed: the deployed backend revision, actual FFmpeg stderr/exit code and backend logs have not been obtained. A missing binary, unsupported encoder/filter, resource limit, R2 write failure or database persistence failure may also cause the same generic error.

The supplied Network screenshot shows a failed job, progress 0, fps null, approximately 0.188 render seconds and 4.008 total seconds, downloadAvailable false and downloadUrl null. In the inspected controller, these metrics are computed in the child-process close handler. This narrows the observed failure to the finish path if production runs this revision; it does not prove successful process startup or identify the failed stage.

Read-only browser inspection of media element URLs identified the API host as http://p01--jack-cut--bqpgh5v9gs6m.code.run. Only the origin was returned; no tickets or tokens were copied. The separate API host and local source contradict the assumption that a workers.dev frontend necessarily runs FFmpeg inside a Worker. Export API services are configured with NEXT_PUBLIC_API_URL; no frontend app route hosts the Express exporter.

## Complete architecture trace

1. frontend/components/layout/NavbarRight.tsx exposes Export Video through frontend/components/layout/Navbar.tsx. frontend/app/editor/[projectId]/page.tsx connects it through frontend/composables/useEditorWorkspace.ts to export actions. frontend/composables/useExportVideo.ts prevents duplicate starts and calls exportService.create(projectId).
2. frontend/services/exportService.ts sends POST NEXT_PUBLIC_API_URL/api/exports with projectId. frontend/services/api.ts adds the existing access token and refreshes via the normal authentication endpoint. The investigation never extracted these values.
3. backend/routes/exportRoutes.js applies JWT authentication and project ownership to creation. Status/cancel reload owner access; downloads require a scoped file ticket or bearer authentication and owner checks.
4. backend/controllers/exportController.js locks the owned Project in a transaction, reads timeline items and creates an ExportJob. Media references are resolved through Media and checked against ProjectMedia.
5. backend/services/storage.js creates a unique temporary directory and materializes private R2 objects using streamed S3 GetObject calls. Local sources remain supported in development.
6. The exporter creates a 1920x1080, 30 FPS filter graph, preserves source offsets and media geometry, and writes an ASS subtitle file from persisted font/text properties and the shared text animation math. Node child_process.spawn executes FFmpeg. Output uses libx264 by default, yuv420p, AAC and faststart. The existing silent audio bed remains in the output.
7. FFmpeg progress is serialized into PostgreSQL. On successful exit, storage.persist streams the MP4 to a unique private R2 exports/job-id.mp4 object. Only then is the database job completed. Scratch is cleaned after process close. Download links are authorized backend links, not public bucket URLs.
8. The frontend polls GET /api/exports/id every two seconds, handles transient failures, shows a failed error or offers the protected download URL on success. The original finish catch collapsed FFmpeg, storage and database failures into one message and discarded the useful stderr/exit metadata.

Models involved: Project, TimelineItem, Media, ProjectMedia, ExportJob. Database: Sequelize/PostgreSQL; production uses DATABASE_URL. Storage: private R2 via AWS S3 SDK, not a frontend Worker R2 binding. No schema change was made.

## Cloudflare compatibility

frontend/wrangler.jsonc configures an OpenNext frontend Worker, compatibility date 2026-10-07, nodejs_compat, ASSETS and observability. The checked-in config has no R2, queue, service, Durable Object or Container binding. Dashboard-only configuration was not inspected.

Cloudflare documents node:child_process as a non-functional stub; enabling nodejs_compat permits imports, not native subprocess execution. Native FFmpeg requires a Node/Linux service or container. Workers node:fs provides a memory-backed VFS with read-only bundled files and temporary files, not a persistent native rendering disk. Workers have 128 MB isolate memory, default paid HTTP CPU budget 30 seconds (maximum 5 minutes), and waitUntil extends work only up to 30 seconds after response/disconnection. These constraints do not apply to an independently hosted Node renderer, but make the current spawn-and-background-render model unsuitable for a normal Worker.

References:
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/#non-functional-stub-modules
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/containers/platform/limits/

## Available runtime logs

Wrangler whoami reports no authenticated Cloudflare session. No Cloudflare dashboard/log connector or separate backend runtime logs are connected here. A Workers tail would primarily expose frontend activity, not this separate backend's FFmpeg stderr. The supplied API response and read-only editor inspection are available; historical server diagnostics are not. No new production job was triggered to manufacture log evidence.

To confirm the live cause, inspect the rendering backend's logs for the failed export job ID and the failure time from the supplied screenshot. Request FFmpeg exit code/signal, spawn error code, missing-stream/filter/encoder category and stage. Use Cloudflare Worker logs only if frontend routing/authentication itself fails. Do not share tokens, R2 keys, database URLs or raw environment dumps.

## Local changes

- backend/controllers/exportController.js: probes video audio presence; mixes only existing audio streams; records preparation, probing, spawn, rendering, output upload and status persistence stages; reports safe structured diagnostics; removes raw filter graph/path and Error-object logging.
- backend/utils/mediaStreams.js (new): FFprobe audio-stream inspection using argument arrays, a 15-second timeout and bounded output. Probe errors fail closed instead of silently discarding audio.
- backend/utils/exportDiagnostics.js (new): allowlisted error codes/signals, job IDs, exit codes, stages, HTTP status and safe FFmpeg failure categories. Raw stderr is used only for classification; credentials, paths, URLs, text, SQL, arguments, error messages and stack traces are not emitted.
- backend/tests/exportMediaGeometry.test.cjs: silent-video regression and real FFmpeg old/fixed graph comparison, plus real FFprobe audio/no-audio verification.
- backend/tests/exportDiagnostics.test.cjs (new): failure classification and secret non-disclosure tests.
- backend/tests/projectLifecycle.test.cjs and backend/tests/storageFlow.test.cjs: probe stubs preserve isolated lifecycle/storage tests.
- EXPORT_ARCHITECTURE_AUDIT.md (this report).

No authentication, ownership, timeline persistence, text-animation math, R2 reference format, database schema or public export response contract was changed. The broad client error remains compatible; structured server logs provide the actionable detail.

## Safest production architecture

Retain the Cloudflare/OpenNext frontend and existing authenticated API boundary. Keep native FFmpeg in the existing backend Linux container for the smallest correction; backend/Dockerfile already installs FFmpeg, FFprobe, libass, fonts and writable /tmp scratch. Confirm that the deployed backend actually uses this image and supports HTTPS. The observed HTTP API origin should be replaced with verified HTTPS configuration in a separately approved rollout.

For production reliability, separate rendering from HTTP request serving. The API should validate ownership, take an immutable timeline/media snapshot and atomically reserve/enqueue a job. A durable queue/outbox delivers only a job reference to an internal Node/Linux render service. A renderer claims the job with a lease/heartbeat, streams authorized sources from private R2, probes media, reuses the existing filter/text math, renders with bounded concurrency and resource budgets, uploads a unique object, and commits completed status. Require idempotent claims and retries, bounded retries/dead-letter handling, cancellation acknowledgement, stale lease recovery, scratch quotas and terminal-state persistence. Keep protected status/download APIs unchanged. Never accept arbitrary user-supplied object paths or FFmpeg commands from a public render endpoint.

A normal Cloudflare Worker can orchestrate queue delivery; a Cloudflare Container or another dedicated Linux container service can execute FFmpeg. R2 stores source/output bytes, PostgreSQL stores ownership and durable job state, and temporary container disk stores render scratch. A process-local jobs Map alone is insufficient across replicas, restarts or rolling deployments; do not scale the current exporter to multiple replicas without durable worker ownership.

This is a proposed architecture, not an implemented queue migration. Infrastructure changes, secrets, schema changes and rollout are separate future work. Do not migrate the editor or recreate the saved project to solve the rendering bug.

## Verification

- All 173 backend tests passed after the audio fix and diagnostic changes.
- Real FFmpeg regression: original audio assumption fails; fixed controller graph succeeds.
- Isolated full 30-second integration: actual generated backgrounds + matching persisted title settings, actual controller, actual FFprobe/FFmpeg/ASS/font rendering; fake in-memory model adapters and local storage, no database/R2/API calls.
- Local artifact: backend/uploads/ai-demo/audit-local-30s.mp4. FFprobe: H.264, 1920x1080, 30/1 FPS, 900 frames, 30.000000 seconds; AAC silent bed retained by existing exporter.
- FFmpeg decoded all 900 frames; blackdetect found no black intervals at pix_th=0.02 and d=0.1. Contact sheet at scene midpoints shows all six readable violet titles with generated backgrounds.
- Local harness: backend/uploads/ai-demo/verify-export.cjs; contact sheet: backend/uploads/ai-demo/audit-contact-sheet.png. These are ignored local artifacts, not production outputs.
- Git diff --check passed. Branch remains Jack. Docker was unavailable, so Linux container execution was not verified. Production rendering remains unverified and unchanged.

