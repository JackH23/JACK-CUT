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
- Frontend tsc found existing missing type exports: User from services/authService.ts (used by NavbarRight.tsx and ProfileModal.tsx), and Project from services/projectService.ts (used by ProjectModal.tsx). Those files were outside this change; a full frontend production build remains blocked until corrected.

Linux image execution and R2 dashboard public-access settings were not validated from this Windows session. Keep the bucket private and satisfy the deployment requirements above before launch.
