# JackCut storage and deployment

## Flow and inspection map

- Upload: routes/mediaRoutes.js → middleware/mediaUpload.js (disk-backed temporary uploads) → controllers/mediaController.js (FFprobe, shared storage, database transaction) → models/Media.js + models/ProjectMedia.js.
- Edit: routes/timelineRoutes.js and routes/timelineTrackRoutes.js → controllers/timelineController.js and controllers/timelineTrackController.js → models/TimelineItem.js + models/TimelineTrack.js; project ownership uses models/Project.js. Media URLs are emitted by both media and timeline controllers.
- Export: routes/exportRoutes.js → controllers/exportController.js → services/storage.js downloads sources into a unique OS temporary render directory → FFmpeg plus utils/mediaLayout.js, utils/clipAnimationFilter.js, utils/textAnimationAss.js, utils/textFontMetrics.js and assets/fonts → completed MP4 uploaded → models/ExportJob.js stores status, metrics and persistent reference.
- Download/playback: services/fileAccess.js issues one-hour resource-scoped tickets after authenticated listing/status calls. Content/download endpoints verify ticket or normal bearer authentication, reload the user and check current project ownership, then stream the private object (including byte ranges). Tickets cannot authenticate ordinary API calls. Reload the project/status to renew expired links. No R2 URL or credential goes to the browser.
- Server: server.js removes public upload static serving, loads routes and adds the export metrics column without altering existing columns. config/database.js retains existing production DATABASE_URL and configurable local database behavior.
- Frontend: services/mediaService.ts, timelineService.ts and exportService.ts use services/api.ts for existing bearer authentication and refresh. Existing response fields and direct download links remain usable.

R2 references are stored as r2:/media/<unique filename> and r2:/exports/<job UUID>.mp4, not signed URLs or temporary absolute paths. No source object is made public. Upload batches compensate completed object writes if their database transaction fails. Each export uses a new object key: no previous export is deleted. All caught errors and successful renders remove their own temporary directory; interrupted processes can leave scratch files, so configure container ephemeral disk cleanup. A database failure after object upload retains the object for reconciliation rather than risking deletion of a committed object.

## Configuration (names only; supply private values in host secret settings)

Required production variables: NODE_ENV (production), DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_IN_DAYS, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT.

Optional: PORT, STORAGE_DRIVER (r2), TEMP_STORAGE_DIR (writable scratch directory), FFMPEG_PATH, FFPROBE_PATH, FFMPEG_VIDEO_ENCODER, TRUST_PROXY (set accurately for the host proxy, normally 1 for one trusted hop). Frontend build needs NEXT_PUBLIC_API_URL pointing to the HTTPS backend.

Development keeps DB_NAME, DB_USER, DB_PASSWORD, DB_HOST and optional DB_PORT. With no R2 variables, disk storage remains the default. Configured R2 automatically selects R2; set STORAGE_DRIVER=local in the shell to work offline without modifying .env. Production refuses local mode; incomplete R2 configuration fails startup. R2_ENDPOINT is used directly; R2_ACCOUNT_ID is required for configuration completeness, never used to reconstruct the endpoint.

## Deployment requirements and limitations

1. Keep R2 public access and public custom domains disabled. Grant a bucket-scoped object read/write/delete token (multipart upload/abort required). The backend proxies content, so bucket browser CORS is unnecessary.
2. Install Node.js 22+ (Node 24 recommended), dependencies with npm ci, FFmpeg/FFprobe with libass, and required fonts in the Linux image. The current export controller imports frontend/lib/textLayout.json and frontend/lib/mediaAnimation.js indirectly: retain frontend/lib beside backend in the image. Choose an encoder supported by the container (libx264 is the default); Windows-only GPU encoders require hardware/runtime support.
3. Supply a reachable PostgreSQL DATABASE_URL and permission for the existing startup schema sync/additive migrations. TLS behavior in config/database.js is unchanged.
4. Existing local media and JSON export jobs are not automatically migrated. Copy legacy uploads and associate ownerless projects with their verified owners before an ephemeral deployment; migrate media references to R2. Never delete legacy files until verified object upload and database update succeed. Legacy export JSON files have no project ownership metadata, so they cannot safely be exposed through the new authenticated API; re-export them.
5. Render execution remains in one backend process, not a durable job queue. Deploy one backend instance: owner-authorized status/download reads mark interrupted processing jobs failed. Multiple replicas require worker ownership/leases and a durable queue before scaling. No automatic retry of interrupted FFmpeg jobs.
6. Provide sufficient temporary disk for source downloads plus rendered outputs, request limits that allow multipart uploads, and generous render time/memory limits. Abrupt termination may leave temporary files or orphan objects; schedule safe scratch cleanup and DB/object reconciliation. Long editing sessions must reload media URLs after ticket expiry. Configure HTTPS and proxy access-log query redaction so file tickets are never logged.

Run npm test and npm start from backend. .env, uploads/, exports/, tmp/, temp/, subtitle and local job artifacts are ignored. Do not commit .env.

## Files changed by this integration

Modified: backend/.gitignore; backend/controllers/exportController.js; backend/controllers/mediaController.js; backend/controllers/timelineController.js; backend/middleware/authMiddleware.js; backend/middleware/mediaUpload.js; backend/models/ExportJob.js; backend/nodemon.json; backend/package.json; backend/package-lock.json; backend/routes/exportRoutes.js; backend/routes/mediaRoutes.js; backend/routes/timelineRoutes.js; backend/routes/timelineTrackRoutes.js; backend/server.js; backend/tests/exportMediaGeometry.test.cjs; frontend/services/exportService.ts; frontend/services/mediaService.ts; frontend/services/timelineService.ts.

Created: backend/DEPLOYMENT.md; backend/middleware/projectAccess.js; backend/services/fileAccess.js; backend/services/storage.js; backend/tests/storageFlow.test.cjs.

Only @aws-sdk/client-s3 and @aws-sdk/lib-storage were added. Configuration is consumed from process.env; backend/.env was never opened for inspection or edited. No commit, push, branch change or new worktree was performed.

## Validation completed

- npm test: 118 backend tests passed.
- Safe real server.js startup/health check passed; unauthenticated media/timeline/export/content/download requests were rejected and the old public /uploads route returned 404. Validation servers were stopped.
- Disposable live R2 upload/download integrity and object cleanup passed.
- Complete authenticated image upload → timeline edit → FFmpeg export → private download → byte-range request → backend restart → persistent completed status passed in R2 and Windows local storage modes.
- Complete R2 video-and-audio upload (including FFprobe duration extraction), export and download passed with the configured encoder. Validation database rows, objects and local files were removed.
- git diff --check passed; main remained selected; backend/.env is ignored and untracked. DATABASE_URL support was preserved.
- The previously reported frontend missing type exports were fixed separately; frontend TypeScript and production build now pass.

Linux image execution and R2 dashboard public-access settings were not validated from this Windows session. Keep the bucket private and satisfy the deployment requirements above before launch.


## Linux production container

Build from the repository root (not backend) because three shared frontend/lib files are required:

~~~powershell
Set-Location 'D:\pull from git\JACK-CUT'
docker build --pull -f backend/Dockerfile -t jackcut-backend:local .
~~~

Linux/macOS equivalent, from the repository root:

~~~sh
docker build --pull -f backend/Dockerfile -t jackcut-backend:local .
~~~

The two-stage image uses node:24-bookworm-slim, installs production npm dependencies from package-lock.json, and runs as the non-root node user. It defaults to NODE_ENV=production, STORAGE_DRIVER=r2, FFMPEG_VIDEO_ENCODER=libx264, FFMPEG_PATH=/usr/bin/ffmpeg, FFPROBE_PATH=/usr/bin/ffprobe and TEMP_STORAGE_DIR=/tmp/jackcut. These are non-secret runtime defaults, overridable by the platform. The application binds 0.0.0.0 and uses PORT or 5001. Existing Windows environment overrides and local storage behavior remain intact; only the requested no-PORT default changes from 5000 to 5001.

The repository-root .dockerignore uses an allowlist. It excludes backend/.env and all other .env variants, node_modules, Git metadata, local uploads/exports, scratch files, frontend app/build output and private key files. There are no secret build arguments, secret ENV values or secret files in image layers. Do not use backend/.env as a Docker build/run input: it may contain Windows paths and local database settings. Set production secrets through the hosting platform; never paste or echo them into build commands/logs.

Required production secret/configuration variable NAMES:

- DATABASE_URL (Neon PostgreSQL connection URL; current TLS behavior is preserved)
- JWT_SECRET
- JWT_EXPIRES_IN
- REFRESH_TOKEN_EXPIRES_IN_DAYS
- R2_ACCOUNT_ID
- R2_ACCESS_KEY_ID
- R2_SECRET_ACCESS_KEY
- R2_BUCKET_NAME
- R2_ENDPOINT

Runtime defaults/names supplied by the image: NODE_ENV, STORAGE_DRIVER, FFMPEG_VIDEO_ENCODER, FFMPEG_PATH, FFPROBE_PATH, TEMP_STORAGE_DIR. Optional host variables: PORT and TRUST_PROXY. Set TRUST_PROXY only for the actual trusted proxy topology. Do not inject DB_NAME/DB_USER/DB_PASSWORD/DB_HOST or Windows FFmpeg paths into production. NEXT_PUBLIC_API_URL belongs to the separate frontend build, not this backend image.

For a local container validation, first populate the required named variables in the current shell using your private secret manager. The following command forwards existing environment variables by NAME without placing values in the command or mounting a secret file (PowerShell and POSIX shell both accept this single line):

~~~sh
docker run --rm --name jackcut-backend -p 5001:5001 -e PORT=5001 -e DATABASE_URL -e JWT_SECRET -e JWT_EXPIRES_IN -e REFRESH_TOKEN_EXPIRES_IN_DAYS -e R2_ACCOUNT_ID -e R2_ACCESS_KEY_ID -e R2_SECRET_ACCESS_KEY -e R2_BUCKET_NAME -e R2_ENDPOINT jackcut-backend:local
~~~

This intentionally creates no persistent volume for media, exports or scratch. R2 is persistent storage. /tmp/jackcut is ephemeral and owned by node; multer uploads and per-export directories use it and retain existing success/error cleanup. If enabling a read-only root filesystem, provide ephemeral writable tmpfs at /tmp with ownership for UID/GID 1000 and sufficient render capacity; it is not a persistent media volume. Abrupt termination can leave scratch until the container is discarded. Provide enough scratch for downloaded sources plus output, and sufficient CPU/memory/time limits.

In another terminal, validate health:

~~~sh
curl --fail http://localhost:5001/health
~~~

PowerShell equivalent:

~~~powershell
Invoke-RestMethod http://localhost:5001/health
~~~

Expected response: {"status":"ok"}. It is unauthenticated and contains no configuration or credentials. The server starts listening only after database authentication and existing schema initialization succeed, so failed startup does not return a healthy response. The image HEALTHCHECK checks this endpoint using the runtime PORT. It is a liveness check; it does not continuously probe Neon or R2.

### FFmpeg and fonts

Debian's ffmpeg package provides both ffmpeg and ffprobe, including libx264 and libass. The image sets Linux executable paths explicitly, avoiding host Windows paths. Its build-time check verifies FFprobe, libass filter availability, a real short Arial ASS render with libx264, required shared module imports, font metric discovery and writable scratch, all as node. No database or R2 access/secrets are needed during the image build.

Fonts: fontconfig, fonts-liberation2 (metric-compatible Arial/Times New Roman/Courier New substitutes), fonts-dejavu-core and fonts-noto-core (broad Unicode coverage, including Thai). The existing backend/assets/fonts/Inter-Regular.ttf is empty (zero bytes), so the image deliberately excludes that placeholder and installs Debian fonts-inter instead. fc-cache builds the system font index. Standard system Fontconfig handles requested saved font families; the exporter now uses fc-match on Linux to obtain metrics from the same installed substitute that libass uses. Windows font lookup is unchanged. Proprietary fonts such as Georgia/Verdana are substituted; exact Windows glyph fidelity requires legally supplied exact fonts. CJK or specialist scripts may require adding appropriate font packages. Do not point FONTCONFIG_FILE at the legacy backend/assets/fonts/fonts.conf: it omits normal system font directories.

Only these three frontend files enter the image, at /app/frontend/lib:

- textLayout.json: shared design units, default text styles, and media geometry reference dimensions.
- mediaAnimation.js: shared media animation math used by timeline/export utilities and text animation.
- textAnimation.js: shared text animation state used by the ASS subtitle generator; imports mediaAnimation.js.

No Next.js app, frontend dependencies, TypeScript files or browser build is needed in the backend image.

### Remaining deployment requirements

Keep R2 public access disabled and provision bucket-scoped object read/write/delete permissions. Supply reachable Neon credentials with schema permissions for the existing startup initialization. Migrate legacy disk media before relying on ephemeral containers. Run one backend instance until durable worker leases/queueing are implemented. Configure HTTPS, uploads/request time limits and query-redacted proxy logs. Confirm actual Linux text rendering/encoder behavior by building and running this image before deployment; static validation on Windows cannot certify a Linux runtime.

### Container preparation validation

- All 120 backend tests passed, including Linux Fontconfig substitution/cache behavior and unchanged Windows font lookup.
- A temporary backend process started successfully with a supplied PORT; GET /health returned {"status":"ok"} without authentication, and protected media remained unauthorized without authentication. The process was stopped afterward.
- Static checks passed for Dockerfile JSON instructions, runtime COPY paths, the three-file shared dependency closure, and the restrictive context. backend/.env and secret variants are excluded without reading their contents.
- Docker was not available in this Windows session, so no Linux image was built or run. The real image build and its embedded FFmpeg/libass/font/scratch smoke checks must be executed on a Docker-capable host before deployment.
- Files changed for container preparation: .dockerignore (new), backend/Dockerfile (new), backend/server.js, backend/utils/textFontMetrics.js, backend/tests/textFontMetrics.test.cjs, backend/DEPLOYMENT.md. Existing frontend service changes were preserved without modification.

## Export cleanup audit and operation

Cleanup deletion is now **disabled by default**. `EXPORT_RETENTION_HOURS` remains a positive number of hours (default 24). Expired downloads are unavailable even while deletion is disabled: status preserves completed status/progress/metrics/history, supplies `downloadAvailable: false`, and download requests return HTTP 410 with `EXPORT_EXPIRED`. No rendering or subtitle timing changed: each FFmpeg workspace is cleaned after its process closes.

### Read-only dry run

From PowerShell:

~~~powershell
Set-Location 'D:\pull from git\JACK-CUT\backend'
npm run cleanup:dry-run
~~~

The CLI loads the configured backend environment, reads export and media references in a PostgreSQL read-only repeatable-read transaction, and inspects only the local exports directory. It never starts the HTTP server, performs schema synchronization/migration, alters database rows, or calls storage deletion. It prints JSON to stdout; redirect to a report file if needed. Failure to read database references or inspect the directory aborts the report rather than treating references as absent. Old schemas without `cleanup_reference` can still report orphan candidates; reference-backed cleanup reporting states that the recovery migration is absent. The CLI supports only `--dry-run`, regardless of `EXPORT_CLEANUP_ENABLED`.

An `orphan-candidate` is a regular MP4 older than retention with no matching basename in this configured database's export output/pending cleanup references or media references. Recent unreferenced files, referenced files and unsafe entries are distinguished. Matching legacy `.job.json` and `.ass` sidecars are listed without parsing or removing them. Age is only a reporting filter, never evidence that a render has completed. No current backend code reads `.job.json`, but legacy sidecars can still contain reconciliation evidence.

**Orphan files cannot be deleted by this tool or by the scheduled worker.** Every report marks `deletionAllowed: false`. Before any separately authorized manual removal, inspect all relevant local/remote databases and legacy metadata, stop every backend/worker and verify no FFmpeg process or existing HTTP transfer/open file handle uses those files, then repeat the scan. Other database references, OS render processes and active download usage are explicitly marked unverified; an empty local-reference result from an R2-only database is insufficient. Never automate deletion from this report alone. Keep files when any verification is uncertain.

### Enable reference-backed automatic cleanup

Review the dry run and ensure the deployment uses the intended database/bucket and managed local exports directory. Install the additive schema migration through normal backend startup (nullable `export_jobs.cleanup_reference` plus a partial recovery index); the dry-run CLI does not install it. In the backend runtime environment set:

~~~powershell
$env:EXPORT_RETENTION_HOURS = '24'
$env:EXPORT_CLEANUP_ENABLED = 'true'
npm start
~~~

This enables deletion of **database-backed expired completed exports only**, including R2 objects. The scheduler runs every minute, up to 100 candidates per run, and never sweeps on startup. Stop/restart without `EXPORT_CLEANUP_ENABLED=true` to disable deletion. Pending recovery intents remain stored while disabled; downloads for those exports stay unavailable. No environment file is automatically edited. Existing deployment schema permissions must allow the additive migration/index creation.

### Crash recovery and locking

1. Under the shared worker advisory lock and update row locks with `SKIP LOCKED`, move each verified expired output reference into `cleanup_reference` and clear `output_path`. **Commit the deletion intent before calling storage.** A claim/database failure executes no deletion.
2. In a separate per-export transaction, acquire an update row lock with `SKIP LOCKED`, reload the intent, and call the existing `storage.remove()` for the exact UUID export key/path. Duplicate recovery workers skip locked intents and recheck current state.
3. Clear only `cleanup_reference` after successful/idempotent storage removal. If deletion, acknowledgement, transaction commit or the process fails, the already committed intent remains for a later run. Recovery does not depend on a new retention setting or file age. Individual failures do not abort deletion of other claimed exports. Error logs use generic messages without exception details or storage credentials.

Export status, progress, metrics, completion dates, timestamps and PostgreSQL history remain intact (`silent: true` prevents timestamp rewriting). Both initial claiming and recovery skip download-locked rows. HTTP downloads retain a shared row lock/connection until transfer finish or disconnection; clients that disconnected before lock acquisition do not open storage. R2 disconnection aborts the SDK request. Size the database pool for long concurrent downloads. Existing render execution still requires one backend instance until durable rendering leases/queues exist; cleanup locking alone does not make the render/status architecture safe for multiple replicas.

`storage.remove()` uses S3 `DeleteObject` with the configured bucket and validated exact key; missing keys are idempotent. Local ENOENT and explicit NoSuchKey are accepted. Bucket-not-found, generic 404, authorization and transport errors propagate and retain the durable intent. R2 deletion uses the existing SDK credentials/configuration; no new storage integration was added.

### Audit validation scope

Regression tests cover read-only/default-disabled behavior, claim-commit and acknowledgement failures, recovery after restart/retention change, per-file failures, worker/row locking, HTTP finish/disconnection, R2 abort and DeleteObject error semantics, orphan reference/sidecar checks and fail-closed inspection. Tests use mocks or newly created temporary fixtures. No live PostgreSQL migration, production mutation, real R2 deletion or existing MP4/ASS/JSON deletion is part of this audit's validation. Earlier validation entries above describe previous integration work, not this audit.
