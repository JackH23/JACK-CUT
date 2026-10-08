# JackCut FFmpeg export production readiness

Reviewed 2026-10-09 in D:\pull from git\JACK-CUT, branch Jack. No commit, push, deployment, branch change, production API mutation, database connection or production data change was performed.

## Decision and evidence

The local fix is ready for a Linux image build and staging validation; production release is conditional on the gates below. All 174 backend tests pass. Real FFmpeg tests cover silent video, audio-only (black visual track with audible AAC), and mixed silent video plus an independent audio clip. FFprobe checks H.264/AAC output and duration; volumedetect checks that audio was retained. Existing geometry, text animation, ownership, storage, cleanup and lifecycle tests pass. The earlier local 30-second demo render remains local evidence, not a production export.

Review found and fixed an additional audio-only defect: the final video map used [0:v], a filter-label reference, when no visual filter existed. It now maps the input stream as 0:v. The mixed test consumes the actual controller's map argument, so it catches this failure. Silent video is probed once per unique source with FFprobe; the graph adds its audio input only when present. Audio media remains included, images contribute no audio, and the silent base guarantees an output audio stream. A malformed or timed-out probe fails the job rather than guessing. Corrupt/mislabeled audio assets can still fail rendering and are not silently ignored.

The known local silent-video failure is reproducible: the old graph references a nonexistent :a stream and FFmpeg reports matches no streams. The deployed failure's exclusive cause is not confirmed without its backend logs and deployed revision.

## Affected files

- backend/controllers/exportController.js: stream-aware mixing, correct audio-only video mapping, render/publish/status stages and safe failure diagnostics.
- backend/utils/mediaStreams.js (new): FFprobe JSON audio-stream detection, 15-second timeout, bounded output and configurable binary path.
- backend/utils/exportDiagnostics.js (new): allowlisted classifications and metadata; no raw stderr, paths, SQL, URLs, text, credentials or exception objects.
- backend/tests/exportMediaGeometry.test.cjs: actual-controller graph tests and real FFmpeg/FFprobe media combinations, including audible output checks.
- backend/tests/exportDiagnostics.test.cjs (new): classification and sensitive-data suppression.
- backend/tests/projectLifecycle.test.cjs and backend/tests/storageFlow.test.cjs: probe mocks for existing lifecycle/storage tests.
- EXPORT_ARCHITECTURE_AUDIT.md: earlier architecture and reproduction evidence.
- PRODUCTION_EXPORT_READINESS.md: this runbook.

Dockerfile, storage service, models, auth, routes, frontend and existing project timelines were inspected and not changed for this review. New untracked utils/tests must be included in the release; a tracked diff alone omits them.

## Runtime and configuration assessment

The frontend Cloudflare Worker calls the separate Node backend at the existing code.run service. FFmpeg runs in that Linux backend, not the Cloudflare Worker. Keep the backend service and public endpoint in place.

backend/Dockerfile uses Node 24 Debian Bookworm, installs ffmpeg (including ffprobe), fonts and Fontconfig, runs as node, and configures /tmp/jackcut. Build-time checks execute FFprobe, an ASS/libx264 render, font metrics and shared-module imports. Root .dockerignore includes the new backend utils and shared frontend/lib modules and excludes .env and generated assets. Build context MUST be repository root. Docker/Podman is unavailable on this machine, so no Linux image build or running-container verification is claimed.

Local .env contains DATABASE_URL and all five R2 settings, plus JWT settings. This establishes local variable presence only, not credential validity or deployed values. Do not upload .env or print secret values. Linux runtime overrides must not retain Windows executable paths. Required deployment settings:

| Setting | Required value/check |
| --- | --- |
| NODE_ENV | production |
| STORAGE_DRIVER | r2; production rejects local storage |
| DATABASE_URL | Existing PostgreSQL connection secret; preserve destination and access |
| JWT_SECRET and auth settings | Preserve existing secrets/settings to retain sessions |
| R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT | Existing private bucket and matching scoped credentials; endpoint must belong to account |
| FFMPEG_PATH | /usr/bin/ffmpeg |
| FFPROBE_PATH | /usr/bin/ffprobe |
| FFMPEG_VIDEO_ENCODER | libx264; avoid Windows hardware encoder overrides |
| TEMP_STORAGE_DIR | /tmp/jackcut, writable by node; provision space for inputs plus output and intermediate work |
| PORT | Existing internal service port; default 5001; public port mapping must match |
| Export cleanup settings | Preserve existing values; do not enable cleanup as part of this fix |

R2 must permit reads of existing media and writes/multipart uploads to exports, including aborting failed multipart uploads. Production write permission has NOT been tested because that would mutate production storage. Validate publish/download against a dedicated staging bucket and database first. R2 errors are safely summarized by HTTP status/allowlisted code when available; some SDK/DB errors will have no recognized code. PostgreSQL production TLS currently uses rejectUnauthorized:false; keep this outside the export hotfix and plan certificate-verification hardening separately.

Job reservation, ownership and progress/status updates have mock-backed tests. Success is recorded only after storage.persist succeeds; failure is recorded with the generic user-facing message. This is not proof of deployed DB write access. /health is basic process readiness, not a continuous DB/R2/FFmpeg check.

IMPORTANT: existing server startup runs sequelize.sync, additive column checks and CREATE INDEX IF NOT EXISTS. This fix adds no model/schema change, but starting the whole current checkout can execute existing DDL. Before rollout compare the release to the deployed version and have an operator verify required schema/indexes and review all unrelated local changes. Do not run server.js against production as a preflight. No schema action is authorized by this runbook.

## Exact deployment procedure (future actions require explicit approval)

1. In the existing Northflank/code.run service dashboard, confirm service identity against p01--jack-cut--bqpgh5v9gs6m.code.run. Record deployed image digest/revision, replica count, internal/public ports, health checks, resources, secret group references and deployment strategy. Do not create a replacement service or expose a second API endpoint. Dashboard access/configuration is currently unavailable to this review.
2. Review the complete dirty checkout against the running release, including untracked files. A remote Git rebuild cannot pick up these uncommitted fixes. Choose either an explicitly approved commit/push on Jack followed by the existing service build, or an explicitly approved private immutable image build/push from this checkout. Do not rebuild a stale remote revision expecting it to contain the fix.
3. On a Docker-capable machine, from repository root, execute the local checks and image build below. Use the platform matching the existing service; linux/amd64 below is an example that must be confirmed in the dashboard.

```powershell
Set-Location 'D:\pull from git\JACK-CUT\backend'
node --test tests/*.test.cjs
Set-Location 'D:\pull from git\JACK-CUT'
docker build --platform linux/amd64 -f backend/Dockerfile -t jackcut-backend:export-audio-fix .
docker run --rm --entrypoint /usr/bin/ffprobe jackcut-backend:export-audio-fix -version
docker run --rm --entrypoint /usr/bin/ffmpeg jackcut-backend:export-audio-fix -version
```

The image build must pass its actual ASS/libx264/font/scratch smoke check. Run integration validation in an isolated staging service using separate DB and bucket, including silent, audio-only, mixed and animated-title exports, persist/completed status, protected download and non-owner denial. Benchmark CPU/RAM/disk at expected concurrency; no production capacity guarantee follows from local timings.

4. Git build route: configure the EXISTING service Build options to Dockerfile, location /backend/Dockerfile and root build context, from the approved revision. Image route: tag/push the validated image to the operator's existing private registry and select its immutable digest as the EXISTING service's deployment source. Registry, architecture, service ID and image digest are not available here; do not substitute guessed targets. Preserve access to the previous image for rollback.
5. Review the table above in service runtime secret/config settings; preserve existing database/bucket/auth bindings. The frontend's API base URL remains the existing service endpoint. Ensure Northflank readiness/liveness uses GET /health on the internal port; Docker HEALTHCHECK alone is not evidence that dashboard probes are configured.
6. Drain all active exports and prevent new requests during the maintenance window. Export jobs/child processes reside in process memory; PostgreSQL rows survive but processing jobs do not automatically resume. Northflank default rolling replacement overlaps old/new containers. Prefer an approved maintenance replacement after draining rather than assume a single replica prevents overlap. Do not manually mark jobs complete/failed or delete records. Stuck preexisting processing jobs require a separately reviewed recovery action.
7. After explicit deployment approval, release the validated image/revision to the existing service. Confirm ready state and startup logs without pasting secrets. Use the container console (in /app/backend) for read-only checks:

```sh
/usr/bin/ffmpeg -version
/usr/bin/ffprobe -version
/usr/bin/ffmpeg -hide_banner -filters | grep -E ' ass +V->V'
/usr/bin/ffmpeg -hide_banner -encoders | grep libx264
df -h /tmp/jackcut
node -e 'const fs=require("node:fs"); fs.accessSync(process.env.TEMP_STORAGE_DIR||"/tmp/jackcut",fs.constants.W_OK); console.log("scratch writable");'
node -e 'const names=["DATABASE_URL","JWT_SECRET","R2_ACCOUNT_ID","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY","R2_BUCKET_NAME","R2_ENDPOINT"]; console.log(Object.fromEntries(names.map(n=>[n,Boolean(process.env[n])])));'
```

Check actual Linux executable overrides and startup database authentication in the dashboard privately. Presence checks do not prove valid credentials. Never paste the full environment, connection URLs, container credential files or authenticated request headers.
8. Run the single approved existing-project retry below. If readiness fails, retain maintenance restriction and use the recorded previous image through an approved rollback. Do not alter DB/R2 objects to force a success.

Official operator references: [Dockerfile build configuration](https://northflank.com/docs/v1/application/build/build-with-a-dockerfile), [production replacement behavior](https://northflank.com/docs/v1/application/production-workloads/release-for-production), [health checks](https://northflank.com/docs/v1/application/observe/configure-health-checks), [container logs and metrics](https://northflank.com/docs/v1/application/observe/monitor-containers).

## Safe retry of the existing demo after deployment approval

Open https://jack-cut.sihalardjacky.workers.dev/editor/915052e4-b3f6-44b1-8db6-ec4d2c8ee335 in the existing signed-in browser. Confirm the saved six 5-second videos and six titles span 0-30 seconds. Do not recreate or edit the project. Ensure there is no active export, click Export Video once, and record the NEW job ID from the authenticated UI/network response. The old failed record remains history; retry creates a new export job/output. This future retry writes production export data and has not been performed or authorized by the preparation request.

Watch POST /api/exports and GET /api/exports/<new-job-id> in Network: accepted, processing progress, then completed, progress 100 and downloadAvailable true. Download through the UI's protected download flow; do not extract or copy tokens. Verify the downloaded file locally:

```sh
ffprobe -v error -show_streams -show_format -of json downloaded-export.mp4
ffmpeg -v error -i downloaded-export.mp4 -f null -
```

Expect H.264, 1920x1080, 30 fps, approximately 30 seconds and AAC (the six demo sources are silent). Play all six scenes/title transitions. Only a completed job AND playable downloaded MP4 establish production export success.

## Diagnostics if retry fails

In the existing backend service Observe/container logs, search the new job UUID and `Export diagnostic` around the failure timestamp. Select the replica that rendered the job; include previous/restarted replicas when relevant. Record only job ID, stage, reason, exitCode, signal, errorCode, httpStatus and sanitized resource metrics. The generic frontend error is intentionally insufficient to diagnose the cause.

| Stage/reason | First operator check |
| --- | --- |
| reserve_job/start failure | PostgreSQL connectivity, schema and duplicate active export; inspect safe service status |
| prepare_sources | R2 bucket/account/key permissions, object existence and scratch capacity |
| probe_streams | Linux FFprobe path, supported/corrupt media, timeout; no credential-bearing command dumps |
| build_filter_graph | shared files/fonts and sanitized clip metadata |
| spawn_ffmpeg / ffmpeg_binary_missing | executable path and runtime image contents |
| missing_input_stream | deployed revision, source stream types and new probe behavior |
| encoder_unavailable / subtitle_filter_unavailable | libx264/ASS build checks |
| memory_exhausted / SIGKILL | container OOM/restart metrics; SIGKILL alone does not prove OOM |
| scratch_disk_full / permission_denied | scratch free space, ownership and runtime security settings |
| persist_output | R2 write/multipart permissions and network; output was rendered but not yet published |
| save_completed_status | DB write/connection failure after R2 publication; do not delete objects manually |
| Failed to save export progress | DB issue; render may continue, check terminal status |

No terminal diagnostic plus a stuck processing row can indicate restart/termination; correlate container history before attributing a cause. Logs intentionally omit raw FFmpeg stderr; unrecognized failures remain ffmpeg_failed and require controlled reproduction with a staging asset. Do not share HAR files, Copy as cURL, bearer tokens, presigned URLs or raw SQL/error objects. Avoid repeated retries while investigating.

## Remaining release gates

- Actual Linux Docker build/smoke checks and isolated staging end-to-end validation.
- Existing service configuration, deployed revision, resources, rollout strategy and immutable release/rollback target access.
- Deployed R2 validity/read/write permissions and PostgreSQL schema/status persistence verification.
- Review existing startup DDL and all differences between current local checkout and deployed backend.
- Drain/restart plan: no durable queue/lease/recovery exists. For sustained production concurrency, a separate queue-backed FFmpeg rendering service with job leases, idempotent publication and crash recovery remains the recommended follow-up architecture.
- Explicit approval for commit/push or image publication, deployment, and the production export retry.
