# JACK-CUT audit and safe fixes — 2026-10-08

## A. Project path and branch

Actual inspected/edited checkout: D:\pull from git\JACK-CUT. Branch main; initial HEAD 2788889. All implementation commands explicitly targeted D:, despite the desktop's initial existing-worktree cwd. No branch/worktree creation, commit, push, reset or staging.

Initial six modified files: backend projectController/projectRoutes and frontend projects/page, useProjectsPage, projectsReducer, projectService. Existing work was preserved and extended. Review focused on requested project/export/storage/authentication integrations; repository-wide checks do not prove every feature works live.

## B. Every modified/new file

Relative to D:\pull from git\JACK-CUT; includes pre-existing local modifications:
- backend/DEPLOYMENT.md (modified)
- backend/controllers/exportController.js (modified)
- backend/controllers/mediaController.js (modified)
- backend/controllers/projectController.js (modified)
- backend/routes/projectRoutes.js (modified)
- backend/services/exportCleanupService.js (modified)
- backend/tests/exportCleanup.test.cjs (modified)
- backend/tests/exportMediaGeometry.test.cjs (modified)
- backend/tests/storageFlow.test.cjs (modified)
- frontend/app/projects/page.tsx (modified)
- frontend/components/editor/timeline/EditTextModal.tsx (modified)
- frontend/composables/useAnimationOptions.ts (modified)
- frontend/composables/useEditorProject.ts (modified)
- frontend/composables/useEditorWorkspace.ts (modified)
- frontend/composables/useExportVideo.ts (modified)
- frontend/composables/useFontOptions.ts (modified)
- frontend/composables/useProjectsPage.ts (modified)
- frontend/composables/useTextEditor.ts (modified)
- frontend/eslint.config.mjs (modified)
- frontend/lib/export.ts (modified)
- frontend/reducers/projectsReducer.ts (modified)
- frontend/services/api.ts (modified)
- frontend/services/projectService.ts (modified)
- frontend/tests/textAnimation.test.mjs (modified)
- frontend/tests/textRendering.test.mjs (modified)
- frontend/tests/timelineClipboard.test.mjs (modified)
- frontend/tests/timelineProject.test.mjs (modified)
- backend/tests/projectLifecycle.test.cjs (new)
- frontend/tests/apiAuth.test.mjs (new)
- frontend/tests/projectLifecycle.test.mjs (new)
- AUDIT_REPORT.md (new; this report)

## C. Discovered problems and severity

Current source references point to fixes unless labeled remaining.

| Severity | Problem | File/line | Result |
|---|---|---|---|
| High | Export preparation/deletion race | backend/controllers/exportController.js:129; projectController.js:78 | Fixed; compatible parent locks |
| High | Project cascade removed export history/cleanup references | backend/controllers/projectController.js:87 | Fixed; detach terminal history |
| High | Missing process entry incorrectly failed possibly active export | backend/controllers/exportController.js:65 | Fixed; fail closed |
| High | Project disappeared during remote upload preparation | backend/controllers/mediaController.js:100 | Fixed; SHARE lock/recheck |
| Medium | Cancel during publication; signal errors blocked retry | backend/controllers/exportController.js:584,740,758 | Fixed and tested |
| Medium | Terminal render metrics omitted | backend/controllers/exportController.js:593 | Restored |
| Medium | Failed/cancelled published outputs never expired | backend/services/exportCleanupService.js:10 | Fixed; timestamp required |
| Medium | Expired completed download URL recreated | frontend/composables/useExportVideo.ts:176 | Fixed and tested |
| Medium | Refresh rejection prevented 401 redirect | frontend/services/api.ts:88 | Fixed and tested |
| Medium | Modal errors hidden; duplicate create requests | frontend/app/projects/page.tsx:138; useProjectsPage.ts:105 | Fixed and tested |
| Medium | Hook lint errors, stale async results and obsolete mocks | frontend/composables; frontend/tests | Fixed |
| High, remaining | Crash/double DB failure after storage publish can orphan output | backend/controllers/exportController.js:606 | Needs durable publication journal |
| Medium, remaining | Restart processing rows require reconciliation; render/cancel needs one backend | backend/controllers/exportController.js:65,740 | Safe block retained |
| Low, remaining | Three img warnings and unused drag argument | PreviewMonitor.tsx:161; MediaList.tsx:33; ClipMediaPreview.tsx:40; useTimelineDrag.ts:190 | Four lint warnings |

## D. Applied fixes

Approved backend patch reuses Sequelize/storage. Export reservation takes the owned Project UPDATE lock before preparation. Deletion takes the same lock, rejects active jobs, detaches terminal history, removes project-scoped timeline/link records and deletes the project transactionally. Shared Media records/objects are preserved. Upload ownership is rechecked under SHARE lock after remote preparation.

Registry entries remain until publication/workspace cleanup finishes. Cancellation refuses finishing jobs; signal errors allow retry. Metrics/progress tracking is retained. Cleanup now handles timestamped terminal outputs.

Frontend retains existing layout/styling; modal gains visible errors, keyboard focus containment/restoration and inert background. Duplicate create/delete requests are guarded synchronously. Project lookup uses the owned endpoint; refresh errors retain original 401; expired URLs remain unavailable. Modal state resets through component lifecycle, async hook results ignore stale requests. CommonJS lint exceptions apply only to actual CommonJS files. Existing rendering/clipboard assertions remain intact; outdated mocks were updated.

## E. Frontend results

Fixed and tested via hook/service tests and server-rendered modal assertions: load/create/navigation, Cancel sends no DELETE, encoded IDs/authenticated request, removal only after success, duplicate guards, disabled controls, errors for 401/403/404/409/500 and login redirect. Shared bearer authentication/concurrent refresh are tested.

Types, rendering/animation/clipboard regressions and production compilation pass. Responsive/dark-mode classes retained. Live browser interactions, screen-reader focus behavior, screenshots and frontend-to-live-backend requests are NOT TESTED.

## F. Backend/JWT results

Real jsonwebtoken tests with mocked User lookup accept valid owner token and reject missing/invalid/expired/unknown-user tokens with 401. Actual router tests verify authentication precedes DELETE /:id. Controller tests verify invalid UUID, non-owner 404, active export 409, rollback and both export/deletion ordering cases. Upload/timeline authorization tests pass.

Read-only schema inspection confirmed nullable export_jobs.project_id and existing cleanup_reference and inspected actual foreign-key rules. No schema change/database mutation. Real PostgreSQL lock contention and live DELETE calls are NOT TESTED.

## G. FFmpeg/export/storage and operating instructions

Retention defaults 24 hours via EXPORT_RETENTION_HOURS. Deletion defaults disabled. Eligible references are exact per-job export MP4 paths/keys with completed/failed/cancelled terminal status and timestamp, or existing recovery intent. Processing rows are excluded.

Cleanup commits output_path=null and cleanup_reference before storage.remove. Recovery takes an UPDATE lock, deletes with existing storage service and clears intent. Storage/acknowledgement errors retain retryable intent. Advisory lock, local run guard and SKIP LOCKED suppress duplicate work and protect download locks. History/progress/metrics/status/dates remain intact.

Downloads retain SHARE locks until HTTP finish/close, including local transfer APIs returning before completion. Expired attached downloads return 410/EXPORT_EXPIRED and status advertises downloadAvailable=false. R2 exact-key DeleteObject behavior and failure propagation are mocked; absent-object removal is idempotent. No real R2 calls.

FFmpeg close precedes ASS/workspace cleanup on completion/failure/cancellation. Processes are simulated; no live render. Current backend does not read legacy .job.json, but sidecars may contain reconciliation evidence; none were removed.

Run identification only from backend:
    Set-Location 'D:\pull from git\JACK-CUT\backend'
    npm run cleanup:dry-run

CLI uses read-only DB snapshot and refuses --apply; it never starts server/schema sync or enables deletion. Orphan reports ALWAYS have deletionAllowed=false. Absence from one database and age do not verify other references/processes/downloads.

Later opt-in reference-backed cleanup: review dry-run results, schema readiness and worker/download scope, explicitly set EXPORT_RETENTION_HOURS=24 and EXPORT_CLEANUP_ENABLED=true for backend. Existing normal startup performs schema synchronization/migrations; review those before production restart. No env flags/files changed here. Orphans remain excluded even when enabled. Full steps: backend/DEPLOYMENT.md.

## H. Commands and results

| Command | Final result |
|---|---|
| backend: npm test | 162 passed, 0 failed, 0 skipped |
| frontend: node --test tests/*.test.mjs tests/*.test.cjs | 100 passed, 0 failed, 0 skipped |
| frontend: npx tsc --noEmit | Passed |
| frontend: npm run lint | Passed; 0 errors, 4 warnings |
| frontend: npm run build | Passed; Next.js 16.3.8 |
| node --check all 40 backend JS source files | Passed |
| git diff --check | Passed |

Baseline backend 149/149; baseline frontend 64/81 with 17 obsolete-fixture failures; initial lint 12 errors/9 warnings; baseline types passed. Added 13 backend and 19 frontend tests. No skipped final tests.

Mocks/fresh temporary fixtures only. No existing MP4/ASS/JSON or R2 object deletion, production writes, migrations, server startup, commits or pushes. Existing Express promise-like handler deprecation warning remains in route tests.

## I. Remaining risks and approval

NOT TESTED: live FFmpeg termination/encoding, real deletion, database concurrency, full browser UX or deployment. Cancellation on a different backend process unsupported. Downloads hold pool connections. Exhausted polling can leave processing status requiring follow-up. Permanent temporary cleanup failure has no durable workspace scavenger.

Detached history remains in PostgreSQL but old project-authorized URLs return 404 after deletion. Cleanup still sees its references. No owner/history API or schema added.

Publication crash gap and upload compensation on ambiguous commit acknowledgement need separately reviewed durable journal design. Automatic orphan deletion is excluded. Older local files are not proven safe by one database's missing references.

Automatic approval review initially rejected backend lifecycle changes; the user explicitly approved the prepared patch, which was applied. No approval pending for completed work. Schema/production/deletion operations and broader architecture remain outside scope.

## J. Final Git status

Branch main; nothing staged; no commit/push. Complete status:
 M backend/DEPLOYMENT.md
 M backend/controllers/exportController.js
 M backend/controllers/mediaController.js
 M backend/controllers/projectController.js
 M backend/routes/projectRoutes.js
 M backend/services/exportCleanupService.js
 M backend/tests/exportCleanup.test.cjs
 M backend/tests/exportMediaGeometry.test.cjs
 M backend/tests/storageFlow.test.cjs
 M frontend/app/projects/page.tsx
 M frontend/components/editor/timeline/EditTextModal.tsx
 M frontend/composables/useAnimationOptions.ts
 M frontend/composables/useEditorProject.ts
 M frontend/composables/useEditorWorkspace.ts
 M frontend/composables/useExportVideo.ts
 M frontend/composables/useFontOptions.ts
 M frontend/composables/useProjectsPage.ts
 M frontend/composables/useTextEditor.ts
 M frontend/eslint.config.mjs
 M frontend/lib/export.ts
 M frontend/reducers/projectsReducer.ts
 M frontend/services/api.ts
 M frontend/services/projectService.ts
 M frontend/tests/textAnimation.test.mjs
 M frontend/tests/textRendering.test.mjs
 M frontend/tests/timelineClipboard.test.mjs
 M frontend/tests/timelineProject.test.mjs
?? backend/tests/projectLifecycle.test.cjs
?? frontend/tests/apiAuth.test.mjs
?? frontend/tests/projectLifecycle.test.mjs
?? AUDIT_REPORT.md

Ignored build caches are generated. All final Git changes are listed above.