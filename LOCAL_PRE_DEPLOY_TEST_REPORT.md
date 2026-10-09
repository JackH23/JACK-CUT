# JACK-CUT local pre-deployment test report

Date: 10 October 2026, Asia/Bangkok. Evidence timestamps use UTC.
Final deployment verdict: **UNVERIFIED**.

Local Windows acceptance passed. This is not authorization to deploy, and does not prove the Northflank Linux image, Cloudflare adapter bundle, production R2 transfers, or production cancellation stall are resolved. Controlled staging validation is the next step.

## Repository and preservation

- Actual repository: D:/pull from git/JACK-CUT.
- Branch at start and finish: Jack.
- Commit: 557af0c4d72d63eb80d4d08ba48d0f9665106e39.
- Seven pre-existing changed files were inspected and preserved.
- No branch switch, worktree creation, commit, push, merge, deployment, production connection, or production data modification.
- No existing database, media, project, export, or source file was reset or deleted.
- Owned test servers and the temporary browser tab were stopped after verification; ports 3000/5001/5002 are closed. Existing PostgreSQL services remain running; isolated databases and evidence were retained.

## Environment and safe startup

| Item | Verified result |
| --- | --- |
| Node / npm | v24.21.0 / 11.19.0 |
| Native FFmpeg / FFprobe | FFmpeg 9.0.2 full Windows build; successful native ASS, libx264, AAC and MP4 execution |
| PostgreSQL | Live local PostgreSQL 17.11 at 127.0.0.1:5434; authentication and CREATE DATABASE permission verified |
| Other PostgreSQL services | Versions 17 and 18 services present; unrelated instances were not stopped or changed |
| Backend | Local 5001; second owned backend 5002 only for cross-process cancellation |
| Frontend | Local 3000, NEXT_PUBLIC_API_URL=http://localhost:5001 |
| Docker / WSL | Docker executable absent; WSL reported not installed |
| Secrets | Environment key presence and safe host/port values inspected; credential values omitted from logs/report |

The existing backend environment includes R2 settings and a DATABASE_URL. Starting with defaults could use R2, so tests explicitly forced NODE_ENV=development, STORAGE_DRIVER=local and a newly created DB_NAME. The production URL was never used. Dotenv can still populate unused R2 variables; the explicit local driver prevents R2 operations.

The retained isolated databases are predeploy_1791568592436 (initial harness assertion run) and predeploy_1791568714787 (passing run). Original configured database contents were not modified. The initial database was used only to authenticate and create the new databases. Fixture accounts, projects, media and outputs remain available in these isolated resources.

The reusable harness also refuses occupied test ports before connecting to PostgreSQL; its occupied/free-port guards were tested separately after the main acceptance run.

Backend package start is node server.js; the harness invokes that exact script body with explicit local overrides. It authenticated PostgreSQL and completed the normal startup schema checks in the new database. Backend health, registration, login, /auth/me, authenticated project listing, project lookup and editor timeline loading passed.

The frontend build and npm run dev -- --port 3000 ran in a plain isolated source copy under backend/benchmarks/results/predeploy-build-eacb9e96a2a3417587dacd5cbf2e4952. This is not a Git worktree. Automatic approval rejected overwriting the original .next output; the copy preserves it. All 161 compared source files match the actual project byte-for-byte, with zero mismatches. The copied next.config.ts only adds the repository Turbopack root for a dependency junction; generated AGENTS.md and next-env.d.ts were excluded from comparison. No actual frontend configuration was changed.

Browser login succeeded with the generated fixture account. Project listing and the seeded editor loaded ten media files and twenty timeline items. Browser-created export/cancel requests reached the owned localhost backend and the isolated PostgreSQL database. Test timelines were seeded through real Sequelize models and uniquely named local media files; live upload and individual editing-control interaction were not tested.

## Commands and automated results

Commands below ran from backend or frontend as appropriate, always against this actual checkout unless the isolated frontend copy is stated.

| Command/check | Result |
| --- | --- |
| backend: npm test | PASS: 219/219, zero failures/skips |
| frontend: node --test tests/*.test.mjs tests/*.test.cjs, initial run | FAIL: 120/127; seven stale test-harness dependencies |
| frontend: node --test tests/textRendering.test.mjs tests/projectLifecycle.test.mjs, after correction | PASS: 43/43 |
| frontend: node --test tests/*.test.mjs tests/*.test.cjs, final | PASS: 127/127, zero failures/skips |
| frontend: node node_modules/typescript/bin/tsc --noEmit --incremental false | PASS, exit 0 |
| frontend: npm run lint | PASS, exit 0; zero errors and six existing warnings |
| isolated frontend source copy: npm run build | PASS: Next 16.3.8 Turbopack compile, TypeScript and all eight static-page generation steps completed |
| node --check on all 45 backend .js files | PASS |
| node --check on new acceptance/verifier .cjs harnesses | PASS |
| git diff --check | PASS; Git emitted normal LF/CRLF conversion notices |
| pwsh -NoProfile -File backend/benchmarks/predeployMeasure.ps1 | PASS: nine live API/PostgreSQL/native-render acceptance scenarios; wrapper exit 0 |
| backend: node benchmarks/predeployVerify.cjs benchmarks/results/predeploy_1791568714787 | PASS: full MP4 decode, all scenes/subtitles, black-frame detection, all-frame SSIM |
| Reusable harness port guard | PASS: occupied test port rejected before database connection; a free port permitted; prevents reuse of an unrelated local app |
| Live API integration | PASS: auth/project/export/cancel/status/download/range routes against actual Express and PostgreSQL |
| Docker build/runtime | UNVERIFIED: Docker unavailable; no Docker build claimed |
| Cloudflare OpenNext/Worker adapter build | UNVERIFIED: Next production build passed; no adapter build or deployment run |
| Linux cgroup and POSIX shutdown behavior | UNVERIFIED: Windows testing is not Linux container validation |

ESLint warnings: three existing next/no-img-element warnings, unused ArrowLeft imports in sign-in/sign-up components, and unused targetTrack in useTimelineDrag.ts. They were left unchanged.

Backend regression coverage includes active/queued/repeated cancellation, completion/start races, a pending progress write, expired-owner fencing, delayed terminal locking, logger failure/privacy, independent watchdog operation during a hung heartbeat, and native FFmpeg SIGTERM/SIGKILL closure. Those fault injections use model doubles unless explicitly identified below as live PostgreSQL.

## Live scenarios and MP4 evidence

Passing evidence directory:
D:/pull from git/JACK-CUT/backend/benchmarks/results/predeploy_1791568714787.

| Scenario | Result and evidence |
| --- | --- |
| A: five seconds, one image + one subtitle | PASS. Job 26ae480e-8ec4-4a5b-b44f-88191d06f03c; completed/100%; 1920x1080, 30 fps, 150 frames, 5 seconds; complete decode |
| B: sixty seconds, ten images + ten subtitles | PASS. Job aba7a95f-2137-41c0-9970-5dbe01d724c5; completed/100%; 1920x1080, 30 fps, 1800 frames, 60.000 seconds; complete decode |
| C/D: active cancellation with three simultaneous API requests | PASS. Job e230fb9b-cb78-420f-8c7e-a5b0c22fb995; one SIGTERM, one terminal commit; cancelled with null error/output |
| E: export after cancellation | PASS. New job 5442a38e-dc2c-4c03-924a-183c50d2ae69 completed/100%; another five-second MP4 decoded; admission and locks released |
| Cancellation handled by another backend | PASS. POST on 5002 observed not_local owner; owner on 5001 observed durable intent, signalled its FFmpeg child and committed cancelled |
| Queued cancellation | PASS. Job 2c3adcb8-cf4f-4fac-b27a-5a053d602051 never spawned FFmpeg; terminal cancelled and cleanup; active owner subsequently cancelled |
| F: unavailable/unlinked source | PASS expected preparation failure. Job 7088af8c-420e-4bb7-aa6f-f84df42146df persisted failed, exposed no download, removed scratch; FFmpeg was not spawned |
| F: actual native corrupt-image failure | PASS focused live rerun. Linked corrupt PNG reached native FFmpeg; job efd66802-66ac-4dc0-ae12-0447b9db6190 exited/closed with code 69, committed failed once, exposed no download and removed scratch |
| F: real PostgreSQL row lock | PASS. Only fixture job 6d0e0bf6-3daf-4cd0-8c7c-b8fbbbcc8f10 was locked for 1500 ms; after releasing the lock cancellation settled |
| F: recovery and persistence | PASS. Synthetic expired uncancelled row became failed; expired cancellation-intent row became cancelled. Restarted backend observed all 12 then-existing fixture jobs terminal |
| Actual browser queued cancellation | PASS. One POST; modal closed, Export cancelled shown, Export button enabled |
| Actual browser active cancellation | PASS. Cancel clicked at visible 9%; job 802da321-f316-4e65-a1b4-d06d2d06d30b; one POST, SIGTERM/exit/close, one cancelled commit, no generic/error modal |
| Browser polling settlement | PASS. Active job GET count remained exactly 30 for a further 41.278 seconds after confirmation; POST count exactly one |
| Final database/scratch state | PASS. Zero processing fixture jobs; no render-* workspace; empty uploads staging directory correctly retained |
| Download protection | PASS. Completed download HTTP 200 matched source bytes by SHA256; 1024-byte range HTTP 206; cancelled download HTTP 409; unauthenticated project list HTTP 401 |
| Interrupted progress writes / forced escalation | PASS in automated fault fixtures, including native FFmpeg SIGKILL after simulated rejected SIGTERM. Not live Linux/PostgreSQL fault injection |

MP4s retained:
- backend/exports/26ae480e-8ec4-4a5b-b44f-88191d06f03c.mp4.
- backend/exports/aba7a95f-2137-41c0-9970-5dbe01d724c5.mp4.
- backend/exports/5442a38e-dc2c-4c03-924a-183c50d2ae69.mp4.
- The isolated evidence directory also retains a downloaded simple MP4 and the validated storytelling copy/contact sheet.

Visual verification found all ten expected image palettes in order and subtitle pixels in every corresponding scene. Full decode detected no fully black frames. Comparison of every decoded storytelling frame against the retained historical baseline reference produced minimum and mean SSIM 1.0 across 1800 frames, covering the animation intervals as well as static intervals. The reference was historical, not a newly rerun baseline performance measurement. Image scaling/positioning, timing, image zoom/slide/fade and text fades match that fixture reference. This is synthetic fixture coverage, not a test of arbitrary real user timelines.

## Memory, CPU and duration

The Windows Job Object enforced a 1024 MiB combined committed-memory limit and affinity to one logical CPU. Node, FFmpeg and other owned child processes inherited the job; the live PostgreSQL server and frontend/browser ran outside it. Process membership was enumerated and memory sampled every 100 ms. The job's peak committed-memory counter is an OS counter; combined current working set and Node aggregate values are sampled. Separate process peaks are not simultaneous and must not be added.

| Measurement | Observed |
| --- | --- |
| Backend Node process lifetime peak working set | 269541376 bytes = 257.05 MiB |
| Aggregate Node sampled peak, including API harness and second backend | 302436352 bytes = 288.43 MiB |
| FFmpeg process peak working set | 794619904 bytes = 757.81 MiB |
| Sampled simultaneous combined working set | 965496832 bytes = 920.77 MiB |
| Windows Job Object peak combined committed memory | 990629888 bytes = 944.74 MiB |
| Storytelling FFmpeg spawn-to-close | 427.825 seconds |
| Storytelling API start-to-terminal observation | 428.134 seconds |
| Storytelling including full decode validation | 433.824 seconds |
| Storytelling render-window job CPU time | 384.125 seconds, approximately 89.79% of one logical core |
| Entire nine-scenario run | 635.639 seconds wall, 569.797 seconds job CPU |
| Active repeated cancellation | 108 ms request-to-confirmation; 33 ms signal-to-close; cleanup 10 ms |
| Cross-process cancellation | 1606 ms request-to-confirmation; 28 ms signal-to-close; cleanup recorded 0 ms at millisecond resolution |
| Active browser cancellation after restart | 40 ms SIGTERM-to-close; terminal transaction 3 ms; cleanup 2 ms |
| Completed storytelling workspace cleanup | 1 ms log measurement |

No OOM occurred in the passing measured run. The cap had only approximately 79 MiB of committed-memory headroom. Windows committed memory is not Linux cgroup memory accounting, affinity is not a Linux CPU quota, and Windows SIGTERM/SIGKILL map to forceful native termination rather than POSIX cooperative handlers. The measured run used local storage and synthetic media; production R2 buffering, Linux FFmpeg/fonts, filesystem cache and real workload contention remain unverified.

Recommended initial Northflank staging allocation: **2 vCPU / 2 GiB RAM**, one Node renderer process per container, EXPORT_MAX_CONCURRENT_RENDERS=1 and FFMPEG_THREADS=1. Measure Linux cgroup memory peak/events and CPU throttling on the exact image before reducing resources. The one-CPU render took about seven minutes; two vCPU is a scheduling/headroom recommendation, not a measured promise of twice the render speed. Do not claim the Northflank 1 GiB target is proven.

## Cancellation lifecycle and root-cause limits

Actual trace:
ExportProgress button -> useEditorWorkspace/useExportVideo -> exportService/shared authenticated API -> exportRoutes POST /:id/cancel -> exportController ownership lookup -> exportLifecycle PostgreSQL cancellation UPDATE RETURNING -> local owner abort/SIGTERM, or another owner observing the database flag -> native exit/close -> renderer slot release -> fenced terminal transaction -> safe workspace cleanup -> frontend GET/terminal confirmation -> modal close and polling abort.

The existing patch uses UPDATE RETURNING so a successful cancellation mutation does not wait for a redundant owner SELECT before local signalling. Its existing regression reproduces that extra-read defect by blocking the read; it passed in this run. PostgreSQL 17.11 exercised the real returning-row behavior.

The production response processing/cancelling/cancelRequested:true is an acknowledgement of intent, not proof of termination. Local tests did not reproduce a persistent stuck cancellation. Local and non-local ownership were both observed in structured logs. Signal acceptance was corroborated by native exit and close, and cancellation only finalized after physical closure (or queued work abort). No status was fabricated to close the UI, and necessary polling was preserved.

Current PostgreSQL configuration still has no explicit statement/lock timeout. A permanently blocked terminal transaction can remain processing while a live owner renews its lease. The bounded 1500 ms lock test passed; it does not prove arbitrary permanent database blockage cannot hang cancellation. A lease-recovered terminal row fences publication but alone cannot prove an unreachable remote OS process stopped.

For the production stall, collect one job UUID, UTC POST and subsequent GET sequence, deployed image/revision, replica/process counts, restart/OOM history and actual timeout settings. Correlate allowlisted lifecycle JSON from every backend instance: owner resolution, signal attempts, exit/close, progress writes, terminal lock/update/commit, pending phase and cleanup. Read-only PostgreSQL row and pg_stat_activity snapshots with wait_event and pg_blocking_pids are required during a stall. Do not include connection URLs, credentials, raw worker tokens, SQL text, media paths or captions. No production diagnostics were executed here.

## Confirmed failures and minimal corrections

1. Initial full frontend suite: six export text tests failed with Unexpected dependency: ../utils/mediaStreams. Their VM harness predated current lifecycle/admission helpers and lacked a mutable owner row, checkpoint lookup and asynchronous rendering settlement. Added current real helpers and realistic model methods, awaited command construction and emitted fake child close to release the slot. Original geometry, font and subtitle assertions remain.
2. Initial project-page test failed with AssertionError: @/components/projects/ProjectsHeader. The page had extracted four real components, but its harness only mocked the prior monolithic page. Loaded all four real components; retained the modal/error/disabled/layout assertions.
3. Final audit reproduced an insufficient native-failure assertion: the original missing/unlinked source failed during preparation, so no ffmpeg_spawned event existed. The reproduced assertion was: Native FFmpeg failure fixture must actually spawn FFmpeg. Corrected the new runner to link an existing corrupt PNG and require both spawn and nonzero close. The focused live rerun passed with exit code 69. The full resource run retained the original preparation-failure fixture; the stronger native-failure check was exercised separately. The resource benchmark was not repeated because runtime rendering code and its memory behavior did not change.
4. Initial new live harness incorrectly required the entire scratch root to be empty. Native logs proved terminal commit and render cleanup succeeded in 2 ms; only the intentionally retained empty uploads directory remained. Corrected the new harness to require no render-* directories. This was not an application cleanup defect. The full corrected run passed.

No runtime rendering, animation, export-quality, frontend cancellation or unrelated feature change was introduced by this testing task.

## Every Git-visible changed file

The first seven entries existed before this task and were preserved. Line numbers identify relevant current locations.

| File | Scope/location |
| --- | --- |
| backend/benchmarks/storytellingFixture.cjs | Existing model mock RETURNING support, line 28 |
| backend/controllers/exportController.js | Existing diagnostic instrumentation at renderer admission 542, progress 612, child close 718, cleanup 752 |
| backend/services/exportLifecycle.js | Existing diagnostic transitions/signalling 14, terminal persistence 95, UPDATE RETURNING cancellation 129 |
| backend/tests/exportLifecycle.test.cjs | Existing mock RETURNING at 21 and cancellation/diagnostic/native escalation regressions from 153 |
| backend/CANCELLATION_DIAGNOSTICS_REPORT.md | Existing report preserved |
| backend/tests/exportLifecycleDiagnostics.test.cjs | Existing logging/privacy tests preserved |
| backend/utils/exportLifecycleDiagnostics.js | Existing allowlisted structured logging, line 14 |
| frontend/tests/textRendering.test.mjs | This task: corrected export harness from line 39 |
| frontend/tests/projectLifecycle.test.mjs | This task: real extracted page components from line 62 |
| backend/benchmarks/predeployLocal.cjs | This task: isolated live PostgreSQL/API/FFmpeg acceptance runner |
| backend/benchmarks/predeployMeasure.ps1 | This task: Windows job cap, CPU affinity, process memory/CPU sampling |
| backend/benchmarks/predeployVerify.cjs | This task: strict MP4/scene/subtitle/full-frame reference verification |
| LOCAL_PRE_DEPLOY_TEST_REPORT.md | This task: report |

Generated/ignored artifacts are grouped under backend/benchmarks/results: unique test/build logs; the two isolated run directories; the isolated frontend source/build/dev output and dependency junction; the resource sample JSONL and summary; the temporary browser-server script; browser state/screenshots; and fixture authentication files (values intentionally omitted). New synthetic UUID media copies are under backend/uploads/media and outputs under backend/exports. These and the new databases were retained; no existing artifacts were overwritten.

## Evidence index

Under the passing run directory:
- evidence.json: all nine live scenarios and progress histories.
- summary.json: exact timings, counters and terminal-commit counts.
- download-api.json; recovery-and-browser.json; restart-persistence.json; final-database.json; native-corrupt-failure.json.
- backend.log; other-backend.log; browser-backend.log: structured transitions and local export HTTP records.
- browser-poll-baseline.json; browser-poll-stopped.json: one POST and no subsequent polling for 41.278 seconds.
- browser-queued-state.txt; browser-queued-cancelled.png.
- jackcut-active-before.txt; jackcut-active-cancelled.txt; jackcut-active-cancelled.png.
- visual-1791569224265/verification.json, current-contact-sheet.png and per-frame ssim.log.
- frontend-copy-integrity.json: 161 files identical, no mismatches.

Under backend/benchmarks/results:
- predeploy-backend-tests.log; predeploy-frontend-tests.log (initial failures).
- predeploy-frontend-rerun-398cd6c1b57c47deb3782869904665c3.log.
- predeploy-eslint-aefb11ef04a14cd3a9c512c6ac22556b.log.
- predeploy-build-eacb9e96a2a3417587dacd5cbf2e4952/build.log.
- predeploy-envelope-94c86cb4f8a64a82bae63f37e0094789-memory.json, -samples.jsonl, -output.log, -error.log.
- Initial assertion-failure evidence: predeploy_1791568592436 and predeploy-envelope-ab1957e2c94b4177b4cf42069d90fac1-*.

## Deployment review, checklist and rollback

Dockerfile and root .dockerignore were inspected. The image uses Node 24 Debian slim, installs FFmpeg/fontconfig/libass-compatible dependencies and fonts, copies the shared frontend math files and all backend utils (including the new diagnostics), runs as node with writable /tmp/jackcut, checks subtitle rendering at build and exposes a backend health check. Secrets and local media/test artifacts are excluded from its allowlisted context. No Northflank manifest was found; actual host settings were not inspected.

Required names: NODE_ENV, DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_IN_DAYS, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT. Frontend NEXT_PUBLIC_API_URL must point to the HTTPS backend when building the Cloudflare bundle. Configure writable TEMP_STORAGE_DIR, PORT, FFMPEG_PATH, FFPROBE_PATH, FFMPEG_VIDEO_ENCODER=libx264 and accurately scoped TRUST_PROXY.

Lifecycle defaults remain EXPORT_TIMEOUT_MS=1800000, EXPORT_STALL_TIMEOUT_MS=120000, EXPORT_LEASE_TIMEOUT_MS=30000, EXPORT_KILL_GRACE_MS=5000. Queue time counts toward total timeout; slot wait is exempt from the stall timer. Cleanup recovery is controlled by EXPORT_CLEANUP_ENABLED, EXPORT_RETENTION_HOURS and EXPORT_CLEANUP_INTERVAL_MS; test deletion automation was disabled. Normal render workspace cleanup still ran.

Before a later authorized deployment:
1. Build and execute the exact Linux image, retaining its FFmpeg version and fonts; run this fixture and a representative real project against isolated staging PostgreSQL/R2.
2. Build and verify the Cloudflare OpenNext adapter bundle with the correct staging backend URL.
3. Use 2 vCPU/2 GiB initially, one renderer per container. Measure actual cgroup memory peak, OOM events, CPU throttling and render/cancel latency.
4. Verify PostgreSQL UPDATE RETURNING, schema permissions and lifecycle/cleanup columns and indexes on staging; no destructive migration is required for this patch.
5. Route a cancel to a different staging replica; prove owner signal/close and terminal commit across all logs. Drain old renders and run the same lifecycle revision on every replica.
6. Exercise active/queued/repeated cancellation, network polling interruption, completed-versus-cancel races, bounded DB delay and POSIX SIGKILL escalation; verify no download exposure after cancellation.
7. Verify scoped staging R2 permissions, abort-multipart recovery and output cleanup intent without touching production projects. Provide scratch disk headroom and safe orphan reconciliation.
8. Resolve any measured terminal database blockage using actual evidence before claiming the production stuck-modal issue fixed.

Rollback plan: retain the known-good backend image and frontend bundle; drain active renders before reverting a lifecycle version; keep database rows, media, R2 objects, lifecycle columns and indexes intact. Revert application artifacts/configuration only after checking compatibility of ownership, cancellation and schema. Never roll back by deleting data, dropping tables, rewriting projects or re-enabling legacy unsafe downloads. Keep the diagnostic evidence for any unfinished jobs.

The locally exercised scenarios have no remaining processing/cancelling fixture. Permanent database waits, unreachable render processes, production R2 behavior, Linux resource accounting/shutdown and the reported Northflank stall remain explicit limits. Local success supports staging investigation; production deployment readiness remains UNVERIFIED.
