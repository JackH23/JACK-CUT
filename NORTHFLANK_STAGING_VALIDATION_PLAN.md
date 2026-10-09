# Northflank staging validation plan

Prepared 2026-10-10 for the actual local checkout `D:\pull from git\JACK-CUT`, branch `Jack`, HEAD `557af0c4d72d63eb80d4d08ba48d0f9665106e39`, including its existing uncommitted files.

**Decision: confirmed local SQL-wait, cleanup-interval and CLI packaging blockers have been addressed; Linux runtime and production readiness remain UNVERIFIED.** This revision changes only the related backend configuration, cleanup scheduling, CLI packaging, regressions and documentation. Live checks create new loopback-only databases and fixture files; production databases/storage are untouched. No commit, push, merge, deployment or branch switch. Existing unrelated local modifications are preserved.

## Evidence reviewed

Read LOCAL_PRE_DEPLOY_TEST_REPORT.md and the current Dockerfile, .dockerignore, database configuration, server startup, export controller, lifecycle, renderer slots, storage, cleanup and frontend cancellation code. The table below preserves the earlier report's historical measurements. New tests and runtime replay results are recorded in the implementation-results section at the end; do not substitute historical measurements for the changed runtime.

| Verified local evidence | Result and limits |
| --- | --- |
| Backend / frontend suites | 219/219 and 127/127 passing; TypeScript and Next production build passed; six existing lint warnings |
| 60-second storytelling | 10 images, 10 subtitles, fades/slides/zoom; 1920x1080, 30 fps, 1800 decoded frames; all scenes/captions present, no fully black frames; Windows historical-reference SSIM 1.0 |
| Render duration | 427.825 seconds FFmpeg spawn-to-close, 428.134 seconds API-to-terminal |
| Combined constrained memory | Windows Job Object peak committed memory 944.74 MiB under 1024 MiB; simultaneous sampled working set 920.77 MiB; Node process lifetime peak 257.05 MiB, FFmpeg 757.81 MiB |
| Cancellation | Active, queued, repeated and cross-process cancellation passed; active request-to-confirmation 108 ms, cross-process 1606 ms; browser one POST and no further status polling for 41.278 seconds after confirmation |
| Database / cleanup | Real local PostgreSQL 1500 ms row-lock delay and expired lease recovery passed; terminal states survived restart; fixture workspace cleanup and protected download checks passed |
| Native failure | Separately tested corrupt-image FFmpeg spawn and nonzero close (69), failed terminal state and cleanup; the full resource run used a preparation failure instead |

Windows memory accounting and forceful native signal behavior do not prove Linux cgroup or POSIX cancellation behavior. Local storage does not prove R2 upload, multipart abort or cleanup. Two CPUs have not been benchmarked; do not promise twice the speed or a Northflank 1 GiB success.

## Image inspection: verified declarations, unexecuted Linux checks

- backend/Dockerfile:1-37 uses repository-root build context, Node 24 Debian bookworm slim, production npm dependencies, FFmpeg, fontconfig, Liberation/DejaVu/Noto/Inter fonts, shared animation/text math and a non-root `node` user.
- Scratch `/tmp/jackcut` is created writable for node. Keep it on disk; do not put rendering scratch on `/dev/shm` or a memory-backed mount. Confirm its actual mount and free space on staging.
- The image build contains an FFprobe version check, ASS-filter check, a tiny ASS/libx264 render, shared-module and font-metric assertions and an assertion that `.env` is absent. Those instructions have not executed here.
- .dockerignore excludes secrets, local media, dependencies and test artifacts; it includes the untracked runtime diagnostic utility because backend/utils is allowed.
- There is no explicit Node parent SIGTERM/SIGINT drain handler in backend/server.js. Cancellation signals the owned FFmpeg directly; platform shutdown is a different lifecycle. A longer platform grace period alone does not add application draining. Avoid rollouts while renders are active, then test interrupted-owner recovery separately.
- Docker HEALTHCHECK uses `/health`, but configure Northflank probes explicitly rather than assuming image HEALTHCHECK is used. `/health` is HTTP process health, not ongoing database/R2 readiness. Startup authenticates the database and performs additive schema/index work before listening.
- No Docker/Podman executable is available; `wsl --status` confirms WSL is not installed. No Linux build, image startup, Debian FFmpeg compatibility, Linux fonts, actual SIGTERM/SIGKILL or Linux resource test is claimed.
- Packaging fix: .dockerignore now narrowly includes backend/scripts/exportCleanup.js; other scripts remain excluded. Dockerfile asserts its presence. `npm run cleanup:dry-run` is the supported read-only operational inspection command. Source-level packaging regression passed; Linux build execution remains unverified.

Later, on an authorized Linux builder, build the current working-tree context:

```sh
docker build --pull -f backend/Dockerfile -t jackcut-staging:local-predeploy .
docker image inspect jackcut-staging:local-predeploy --format '{{.Id}}'
```

Record build logs, image digest, runtime source hashes, Node/FFmpeg/FFprobe versions, filter/encoder availability and font selections. A Northflank Git build of Jack at HEAD excludes the current uncommitted changes. Do not use HEAD alone as proof of tested source identity. A later authorized image publication or commit/push is required to deliver these exact files; neither happened here.

## PostgreSQL terminal wait finding

**The missing SQL wait limits were confirmed and are now bounded on every pooled connection. This does not prove the observed production incident's cause, or provide a deadline for a network partition/storage I/O.**

- backend/config/database.js now supplies lock_timeout=5000 ms and statement_timeout=30000 ms to node-postgres on every pool connection in both production and development, using validated DB_LOCK_TIMEOUT_MS and DB_STATEMENT_TIMEOUT_MS overrides. Connection establishment is limited to 10000 ms and pool acquisition to 15000 ms; TCP keepalive is enabled. Effective Northflank settings remain uninspected.
- backend/services/exportLifecycle.js:95 `finish()` awaits a transaction and `SELECT FOR UPDATE`, then UPDATE and COMMIT. Cancellation's UPDATE at :129 also inherits the SQL wait limits.
- Its independent watchdog can abort work and signal FFmpeg; it cannot cancel an already pending SQL promise. After abort, `stop()` is idempotent. A child `close` or accepted kill is insufficient evidence of terminal commit.
- backend/controllers/exportController.js:638 waits for work/persistence; cancellation bypasses awaiting pending progress, but its terminal SQL is still awaited, now with server-side limits. At :696 it retries persistence once on failure; :708 then awaits unpublished-output inspection and cleanup before releasing ownership. Those database/storage operations also need fault testing. Lease recovery itself requires a responsive database and cannot guarantee recovery while the database remains blocked.
- backend/tests/exportLifecycle.test.cjs:183 explicitly demonstrates cancellation pending at `terminal_lock`, with no fabricated CANCELLED state, until the simulated lock is released. This existing test verifies diagnostics. New live tests separately verify real PostgreSQL lock and statement expiry, rollback, retries and durable cancellation recovery.

On isolated staging, inspect settings **through a connection using the same application role/database**:

```sql
SELECT current_database(), current_user, version();
SHOW lock_timeout;
SHOW statement_timeout;
SHOW idle_in_transaction_session_timeout;
-- PostgreSQL 17+ only:
SHOW transaction_timeout;
SELECT pid, state, wait_event_type, wait_event,
       clock_timestamp() - xact_start AS transaction_age,
       pg_blocking_pids(pid) AS blockers
FROM pg_stat_activity
WHERE datname = current_database();
```

Capture connection identity and pool usage without credentials, SQL text, captions or raw worker tokens. PostgreSQL defaults statement_timeout and lock_timeout to zero (disabled). Connection-pool acquisition timeout does not bound a query already using a connection.

Implemented application settings are DB_LOCK_TIMEOUT_MS=5000 and DB_STATEMENT_TIMEOUT_MS=30000. Values must be positive integers <=2147483647, with lock timeout strictly shorter than statement timeout. Restart/reconnect to apply them and verify SHOW values in application sessions. No ALTER ROLE or production database setting change was performed. Startup schema/index work also inherits these limits; evaluate slow migrations on staging. A role-wide setting is not required for this fix.

The implementation bounds each SQL statement, not total transaction lifetime or external I/O. Real PostgreSQL tests with 200/500 ms budgets verified rollback and recovery. Failed terminal persistence retains fenced ownership semantics and existing retry; after both attempts fail and the owner is released, expired-lease recovery preserves durable cancellation. A cancel UPDATE that timed out before persistence is not acknowledged as cancellation.

Do not blindly impose a short role-wide idle/transaction lifetime: exportCleanupService.withDownload holds a SHARE transaction while a completed MP4 streams, and cleanup awaits storage removal inside a transaction. A short lifetime can interrupt legitimate downloads/deletions. Scoped terminal-transaction bounds and transport recovery may require a separately authorized code change if staging shows unresolved waits. Do not merely wrap SQL in Promise.race while leaving an open transaction running.

## Exact initial Northflank configuration recommendations

Recommendations only; actual account settings, available compute plans and values were not inspected.

| Setting | Initial staging value |
| --- | --- |
| Isolation | Separate Northflank staging service/project, dedicated PostgreSQL database/role and private R2 bucket/token; no production DB/storage credentials |
| Build method/context | Dockerfile `backend/Dockerfile`, context repository root `.`; use an artifact proven to include the intended local files |
| Runtime command | Image default `node server.js`; no PM2/cluster/multiple Node renderer workers |
| Compute | 2 vCPU, 2048 MiB RAM per container; choose a supported plan meeting or exceeding both |
| Replicas | 1 initially; disable autoscaling for reproducible measurements; add a second replica only for the cross-owner scenario |
| Application port | HTTP 5001, public HTTPS endpoint for the staging browser; bind is already 0.0.0.0 |
| Startup HTTP probe | `/health`, port 5001, initial delay 0 s, interval 5 s, timeout 4 s, max failures 24 (about 120 s startup budget) |
| Readiness HTTP probe | `/health`, port 5001, delay 0 s, interval 10 s, timeout 4 s, max failures 3, success threshold 1 |
| Liveness HTTP probe | `/health`, port 5001, delay 0 s, interval 30 s, timeout 4 s, max failures 3 |
| Scratch | `/tmp/jackcut`, writable by node, disk-backed. Verify capacity before test; budget at least twice total fixture source bytes plus twice estimated output bytes, and retain >=20% free space. Measure queued-job scratch too. No unsupported ephemeral-storage setting is prescribed. |
| Shared memory | Leave default 64 MB; do not move scratch there to address performance |

Set supported backend runtime variables explicitly:

```dotenv
NODE_ENV=production
PORT=5001
STORAGE_DRIVER=r2
TEMP_STORAGE_DIR=/tmp/jackcut
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe
FFMPEG_VIDEO_ENCODER=libx264
FFMPEG_THREADS=1
EXPORT_MAX_CONCURRENT_RENDERS=1
EXPORT_TIMEOUT_MS=1800000
EXPORT_STALL_TIMEOUT_MS=120000
EXPORT_LEASE_TIMEOUT_MS=30000
EXPORT_KILL_GRACE_MS=5000
EXPORT_RETENTION_HOURS=24
EXPORT_CLEANUP_ENABLED=false
EXPORT_CLEANUP_INTERVAL_MS=60000
DB_LOCK_TIMEOUT_MS=5000
DB_STATEMENT_TIMEOUT_MS=30000
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_EXPIRES_IN_DAYS=1
```

Supply new staging secrets for DATABASE_URL, JWT_SECRET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME and R2_ENDPOINT. DATABASE_URL must identify the staging database and a TLS-capable PostgreSQL endpoint. Current database code requires SSL but disables certificate verification (`rejectUnauthorized:false`); review certificate trust before production. Do not print secret values or embed them in the image.

Set frontend build-time NEXT_PUBLIC_API_URL to the actual HTTPS staging backend. Validate the Cloudflare OpenNext adapter build and browser flow separately; the prior Next build did not cover that adapter. Verify reverse-proxy hop topology before setting TRUST_PROXY; use `1` only if exactly one trusted ingress hop is established.

Queue time counts toward the 30-minute total deadline; slot waiting is exempt from the stall timer. One-slot concurrency is process-local, so two replicas can render two jobs in aggregate. Do not raise threads or slots during baseline measurement.

EXPORT_CLEANUP_INTERVAL_MS is now implemented and validated, default 60000 ms. Invalid/nonpositive/fractional/overflow values fail startup; scheduling remains opt-in and idempotent. EXPORT_CLEANUP_ENABLED controls retained-output deletion, not immediate per-render workspace cleanup.

## Safe staging procedure and acceptance gates

All following steps are future operator actions on disposable staging resources, not actions performed in this review. Record test IDs, image digest, owner instance IDs, timestamps and effective configuration first. Use generated account/project/media; do not copy production rows or keys. Retain existing data and all test evidence.

1. **Image gate.** Require a successful exact-source Linux build and build-time assertions. Verify startup logs, DB schema readiness, writable scratch, installed fonts for actual caption language/style, `/health` and authenticated requests. Run a 5-second one-image/subtitle render and decode the downloaded MP4. Verify source R2 reads, output uploads and private authorized download/range handling.
2. **Baseline 60-second story.** Use ten portrait/landscape images representative of real source resolution and compressed size, ten subtitles, fades/slides/zoom, actual positioning and timing. Capture source sizes, font choices, output settings and fixture JSON without credentials. Run three sequential exports with no competing workloads. Monitor each from preparation through upload, terminal commit and cleanup. Download and fully decode: 1920x1080, 30 fps, 1800 frames, 60 seconds for this fixture. Inspect all ten scenes/captions and animation boundaries; detect missing/black frames. Font/encoder platform differences mean Windows SSIM 1.0 is not an automatic Linux requirement. Compare a Linux reference and inspect the intended appearance.
3. **Active cancellation.** Wait for actual FFmpeg PID/progress, click once. Correlate durable cancel request, owner resolution, observation, SIGTERM result, child exit/close, terminal commit and cleanup. Confirm child PID disappears, DB status is cancelled, error/output are null, modal closes, GET polling stops and another export succeeds. Initial no-fault target: confirmation <=10 s including the 5 s escalation window. A missed target requires evidence, not a fabricated terminal state.
4. **Queued/repeated/race cancellation.** With the one slot occupied, cancel a second project job while queued; it must never spawn FFmpeg or affect the active job. Repeat backend cancellation requests: preserve the first timestamp and terminal result, with no duplicate signal/cleanup. Browser still sends one logical cancel request. Race near completion: completed remains completed if committed first; durable cancellation wins if committed first. Test cancellation during R2 upload and during transient status-request failures; polling must continue until genuine terminal confirmation and then stop.
5. **Remote-owner routing.** Temporarily use two identical replicas, maintaining the same per-replica limits. Route POST cancellation to the non-owner and verify its not_local diagnostic, owner's heartbeat observation, owned child termination and a single consistent terminal winner. Do not require sticky routing for correctness. Return to one replica after collecting evidence.
6. **Database fault gate.** On an owned fixture row only, hold a short FOR UPDATE lock in a separate transaction, record blockers and release/rollback explicitly. Repeat with a delay exceeding the proposed 5 s lock bound, including terminal persistence after durable cancellation. Require timeout/rollback diagnostics, successful retry or expired-owner recovery, no cancelled output exposure and a usable next export. Test a bounded connection interruption too. If SQL/cleanup remains pending indefinitely or terminal state cannot recover, block production and implement/test scoped deadline handling before continuing.
7. **POSIX escalation and restart.** In a disposable worker only, verify cooperative SIGTERM; then safely force the owned FFmpeg to stop responding to SIGTERM (e.g. controlled SIGSTOP after validating PID/PPID against the job's diagnostics) and verify SIGKILL after approximately 5 s and actual close. Never target an unrelated PID. Separately interrupt/restart the isolated owner, verify lease recovery and output intent recovery; do not equate backend process exit with child close. Inspect scratch orphans after abrupt death, which normal workspace cleanup cannot guarantee to remove. No blanket deletion or shared-directory sweep.
8. **Cleanup/R2 gate.** Verify cancelled/failed exports have no downloadable output, no lingering workspace for the tested job, and no abandoned multipart upload. Inspect durable cleanup_reference and its retry behavior following controlled storage failure. Run read-only candidate inspection first, then enable EXPORT_CLEANUP_ENABLED=true only in the isolated bucket/database and observe the configured sweep (default 60 s) with disposable expired fixtures. Do not shorten retention for an existing dataset. Verify slow downloads survive cleanup and complete before their protected row is eligible for deletion.
9. **Resource gate.** At 2 vCPU/2 GiB, require zero oom/oom_kill event deltas, no unexpected restarts, full completion and stable idle memory after each sequential run. Aim for peak <=80% of the limit as an initial operational headroom target, not a measured result. Increase RAM if exceeded; investigate sustained CPU throttling and long render/progress gaps. An optional 1 vCPU/1024 MiB trial is permitted only on disposable staging after the initial gates pass. Report exact Linux cgroup peak/limits before making any 1 GiB claim.

Read-only cleanup inspection inside the current image (uses no server startup or deletion):

```sh
node -e "const db=require('./config/database'); const s=require('./services/exportCleanupService').getService(); s.run({dryRun:true}).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Inspection failed');process.exitCode=1}).finally(()=>db.close())"
```

This reports DB deletion candidates; it is not a complete scratch/R2 orphan inventory. Verify the runtime environment points exclusively to staging before running it.

## Monitoring and evidence

Use Northflank CPU, memory and restart/OOM charts plus structured export_lifecycle logs. Retain logs from every replica, correlate job UUID, instance UUID, owner processPid, hashed lease and childPid. Never collect raw tokens, caption text, credentials or full FFmpeg command arguments.

On a Linux cgroup v2 container, capture the following **read-only** from the correct container cgroup before/during/after each scenario:

```sh
cat /proc/self/cgroup
cat /sys/fs/cgroup/memory.max
cat /sys/fs/cgroup/memory.current
cat /sys/fs/cgroup/memory.peak
cat /sys/fs/cgroup/memory.events
cat /sys/fs/cgroup/cpu.max
cat /sys/fs/cgroup/cpu.stat
```

Verify mount/cgroup paths first; if unavailable or v1, use platform metrics and the matching v1 counters, record that limitation. memory.peak may include startup/earlier tests: capture its baseline and use a fresh disposable container for an isolated peak measurement. Sample memory.current each second, but do not describe sampled maxima as exact OS peaks. Record CPU usage_usec, nr_periods, nr_throttled and throttled_usec deltas, wall duration and render/upload/terminal/cleanup durations. Cgroup total includes page cache and other container processes; per-process RSS peaks must not be added as simultaneous memory.

For the owner processPid and FFmpeg childPid from logs, read `/proc/<pid>/status` for Name, PPid, VmRSS, VmHWM and Threads. Check parent identity before any fault injection. Confirm `/proc/<childPid>` disappears and `ffmpeg_close` occurs, rather than relying on killAccepted. The slim image does not install procps; do not assume `ps`, `top`, Python or benchmark scripts are available. `/proc` reads and Node are available by image design, still requiring runtime confirmation.

Inspect only the tested workspace names under `/tmp/jackcut` and track disk free bytes (Node fs.statfs or available system tools), prepared-source/output bytes and post-cleanup absence. Queued jobs can prepare inputs before renderer admission, so slot count alone does not bound queued scratch consumption. Do not remove media or other jobs' directories.

Capture per-job DB status/stage/progress, cancel_requested_at, heartbeat_at, completed_at, whether output_path/cleanup_reference are set, and error nullness. Record blockers/transaction ages without SELECTing raw worker_token or connection secrets. Capture browser HAR with auth headers redacted, one cancel POST, continued confirmation GETs while processing, terminal response, modal reset and absence of polling afterward.

If the Northflank stuck modal reproduces, retain the exact request/status timeline; owner and non-owner lifecycle logs; FFmpeg exit/close and PID checks; pending phase/progress-write age; transaction wait/blocker/settings; R2 requests/cleanup intent; replica restart/OOM timeline and image identity. Only then attribute the incident to a particular phase. A processing/cancelling response alone does not identify the cause.

## Production blockers / release decision

Production remains blocked until exact-source Linux image build and staging gates establish rendering/quality, resource headroom, POSIX termination, confirmed terminal persistence, DB timeout recovery, cross-owner correctness, R2 upload/abort/cleanup and frontend Cloudflare browser behavior. No observed production root cause was newly reproduced here. Effective Northflank DB/timeouts/resources/proxy settings remain unknown.

Resolve tested-source delivery before staging: existing local changes are uncommitted, so Git HEAD is insufficient. The read-only cleanup CLI is now included; require its image build assertion to pass. Review TLS certificate validation and shutdown/drain behavior before production. Preserve the memory graph, subtitle/animation behavior and confirmed-cancellation polling.

Retain a known-good backend image and matching frontend artifact for rollback; drain active jobs first and verify lifecycle/schema compatibility. Roll back application artifacts/configuration only, preserving database tables/rows, media, object keys, additive columns/indexes and diagnostic evidence.

## Documentation consulted

- [Northflank Docker build context and deployment configuration](https://www.northflank.ai/docs/v1/application/getting-started/build-and-deploy-your-code)
- [Northflank CPU, RAM and memory-backed shared storage](https://northflank.com/docs/v1/application/scale/scale-cpu-and-memory)
- [Northflank startup, readiness and liveness probe settings](https://northflank.com/docs/v1/application/observe/configure-health-checks)
- [PostgreSQL 17 statement, lock and transaction timeouts](https://www.postgresql.org/docs/17/runtime-config-client.html)
## Implemented fixes and actual results — 10 October 2026

**Local readiness blockers addressed. Ready for controlled staging validation; production readiness remains UNVERIFIED.** All results below were executed against the changed local files on Jack. No Linux/Northflank verification or production-root-cause resolution is claimed.

### Confirmed fixes

1. Missing SQL bounds: failing regressions first observed absent PostgreSQL timeout options. All actual Sequelize/pg connections now receive validated DB_LOCK_TIMEOUT_MS (5000 default), DB_STATEMENT_TIMEOUT_MS (30000 default), 10000 ms connection establishment and 15000 ms pool acquisition bounds. Installed driver propagation was inspected and real SHOW values verified. These are per-statement/server lock limits, not a total transaction or network I/O deadline. Existing terminal serialization, cancellation precedence, retry, fencing and lease recovery were preserved. No FFmpeg/controller/frontend rendering code was changed in this task.
2. Unsupported cleanup interval: the pre-fix committed service was reproduced scheduling 60000 ms despite EXPORT_CLEANUP_INTERVAL_MS=2500. The new regression failed before the fix, then passed with validated configurable scheduling, opt-in deletion and idempotent start/stop. Retention/deletion/download semantics are unchanged.
3. CLI packaging: the existing read-only CLI is useful before enabling retention deletion. It is now narrowly allowed into the image; Dockerfile checks its existence, and packaging/read-only regressions passed. Actual local CLI execution against the new fixture database passed with zero deletion candidates. Linux packaging execution remains unverified.

### Tests performed

| Executed check | Result |
| --- | --- |
| Full backend npm test | 223/223 PASS, no failures/skips; log staging-backend-9967d4fc79ac4d6a991370d643b6147b.log |
| Full frontend node --test tests/*.test.mjs tests/*.test.cjs | 127/127 PASS, no failures/skips; log staging-frontend-ad90e2a6331d419496d8f731d3151bdf.log |
| Live PostgreSQL regressions, configured 200 ms lock / 500 ms statement budgets | Six scenarios PASS; terminal lock rejected with 55P03 in 234 ms; statement timeout 57014 in 510 ms; prior write rolled back, connection usable |
| Completion after lock release | PASS, completed/progress 100 persisted after bounded failure |
| Durable cancellation after both terminal attempts time out | PASS, processing stayed pending until expired-owner recovery; recovered cancelled with null error/output; late owner preserved terminal state |
| Cancel UPDATE times out before persistence | PASS, no false acknowledgment; retry after unlock confirmed cancelled |
| Long download callback | PASS, 650 ms callback exceeded the 500 ms statement budget without a transaction-lifetime failure |
| Real Express/PostgreSQL/FFmpeg acceptance replay | Nine scenarios PASS under Windows Job Object 1024 MiB combined commit cap and one-logical-core affinity |
| Replay cancellation / failures | Active repeated cancellation 95 ms; cross-process 721 ms; active releasing queue 558 ms; queued cancellation, native corrupt-image failure and real 1500 ms database row-lock delay PASS |
| Full 60-second output | PASS, playable 1920x1080/30 fps, 1800 frames, all 10 scene identities/subtitles, no fully black frames |
| Full-frame animation/quality comparison | PASS, all 1800 frames minimum and mean SSIM 1.0 against retained Windows historical reference; contact sheet visually inspected |
| End-of-run state | All 9 fixture jobs terminal; cancelled/failed jobs have no output; zero active jobs and zero render workspaces; owned backend ports 5001/5002 no longer listening |
| Read-only cleanup CLI | PASS against fresh fixture database only; no objects removed |
| Syntax / whitespace | Changed JS syntax checks and git diff --check PASS; existing CRLF conversion notices only |

The real database regressions are repeatable with `node backend/benchmarks/databaseTimeoutsLive.cjs`; they require local .env loopback PostgreSQL credentials and CREATE DATABASE permission, create a unique test database, and retain evidence. They do not run automatically inside the database-independent npm suite. No production URL is accepted. The first live run also passed; the second strengthened rollback assertions to prove an UPDATE preceding a timed-out statement is undone.

### Current measured resource result

| Measurement | Earlier report | Changed-runtime replay |
| --- | --- | --- |
| Windows combined peak commit | 944.74 MiB | **945.95 MiB** |
| Simultaneous sampled combined working set | 920.77 MiB | **923.29 MiB** |
| Backend process lifetime peak working set | 257.05 MiB | **268.52 MiB** |
| FFmpeg process peak working set | 757.81 MiB | **757.87 MiB** |
| FFmpeg storytelling spawn-to-close | 427.825 s | **399.866 s** |
| API request to story terminal state | 428.134 s | **399.968 s** |
| Story including full decode | 433.824 s | **405.605 s** |

Whole replay: 600.372 s wall, 553.703 s Job Object CPU, no OOM and exit 0. Timing differences are ordinary local-run variation; the SQL fix did not optimize FFmpeg. Keep initial Northflank recommendation **2 vCPU / 2048 MiB / one Node / one render slot / one FFmpeg thread**. Approximately 78 MiB of Windows committed-memory headroom is insufficient evidence for a production 1 GiB target. PostgreSQL, frontend/browser and the later visual checker were outside the Job Object; this is not Linux cgroup accounting or R2 workload measurement.

### Every file changed by this task

Pre-existing controller/lifecycle/animation/frontend-test changes were preserved; they are not new changes from this task. LOCAL_PRE_DEPLOY_TEST_REPORT.md was read and left intact as historical evidence.

| File | Exact relevant location / change |
| --- | --- |
| [.dockerignore](<D:/pull from git/JACK-CUT/.dockerignore>) | Final narrow scripts-directory allowlist for exportCleanup.js only |
| [backend/Dockerfile](<D:/pull from git/JACK-CUT/backend/Dockerfile>) | Existing build-check RUN now asserts cleanup CLI presence |
| [backend/config/database.js](<D:/pull from git/JACK-CUT/backend/config/database.js:6>) | Validated budgets, shared dialect options and pool acquire bound in both environments |
| [backend/services/exportCleanupService.js](<D:/pull from git/JACK-CUT/backend/services/exportCleanupService.js:5>) | Interval validation; timer injection for deterministic test; scheduler at line 79 |
| [backend/tests/databaseTimeouts.test.cjs](<D:/pull from git/JACK-CUT/backend/tests/databaseTimeouts.test.cjs:12>) | New timeout configuration, validation, production/development and transaction-lifetime safeguards |
| [backend/tests/exportCleanup.test.cjs](<D:/pull from git/JACK-CUT/backend/tests/exportCleanup.test.cjs:153>) | Configurable scheduler, invalid values, opt-in and idempotence regression |
| [backend/tests/exportCleanupCli.test.cjs](<D:/pull from git/JACK-CUT/backend/tests/exportCleanupCli.test.cjs:50>) | Narrow image packaging/build assertion regression |
| [backend/benchmarks/databaseTimeoutsLive.cjs](<D:/pull from git/JACK-CUT/backend/benchmarks/databaseTimeoutsLive.cjs:1>) | New isolated real PostgreSQL rollback/cancellation/recovery regressions |
| [backend/DEPLOYMENT.md](<D:/pull from git/JACK-CUT/backend/DEPLOYMENT.md:211>) | Supported budgets, cleanup interval, CLI and timeout limitations |
| [NORTHFLANK_STAGING_VALIDATION_PLAN.md](<D:/pull from git/JACK-CUT/NORTHFLANK_STAGING_VALIDATION_PLAN.md>) | Updated configuration, resolved blocker descriptions and actual evidence |

### Evidence and preservation

All paths below are under D:/pull from git/JACK-CUT/backend/benchmarks/results:

- dbbudget_1791570959224/evidence.json: final six live PostgreSQL regressions. Earlier dbbudget_1791570882475/evidence.json retained.
- predeploy_1791570920361/evidence.json and readiness-summary.json: nine replay cases, final DB status/metrics and cleanup.
- predeploy_1791570920361/backend.log and other-backend.log: native close, owner routing, terminal commit, progress and cleanup diagnostics.
- predeploy_1791570920361/cleanup-cli-readonly.json: executed CLI dry run.
- predeploy_1791570920361/visual-1791571542441/verification.json, current-contact-sheet.png, current.mp4 and ssim.log: visual/frame evidence.
- predeploy-envelope-481a78be58b04abfb9abdedde7d6818e-memory.json and sibling samples/output/error logs: cap, CPU and memory evidence.
- Backend/frontend test logs listed above.

Three newly created local databases, uniquely named fixture media and MP4s were retained. Normal cleanup removed only test-owned render workspaces. No existing project/media/export/database was reset or deleted, no production storage/database was contacted, and no database service was stopped. Existing uncommitted source files remain intact; Jack/HEAD unchanged. Generated evidence includes fixture authentication files; do not publish them or unredacted environment values.

### Remaining staging gates

- Build and run the exact Linux image; verify Debian FFmpeg/fonts, CLI packaging, POSIX SIGTERM/SIGKILL, writable disk scratch and cgroup memory/CPU/OOM counters.
- Test effective application-session SQL settings, startup DDL under the new budgets, database transport interruption and delayed commit acknowledgment. Connection/pool/server statement deadlines do not provide a complete deadline for an established network black hole or external storage await.
- Exercise private R2 upload, multipart abort, deletion intent recovery and slow downloads. No real R2 deletion or retention scheduler was enabled in these live tests; scheduling/cleanup safety has unit coverage.
- Validate Cloudflare adapter and staging browser confirmation polling. Full frontend suite passed; prior browser acceptance was not repeated in this backend-only task.
- Preserve diagnostic evidence if the original production incident reproduces; do not attribute its cause solely to the former missing timeout configuration.
- Review existing TLS certificate verification bypass and lack of parent-process drain handling. Deliver exact uncommitted source through a later authorized artifact workflow; Git HEAD builds still omit these local fixes.

No deployment was performed or authorized. All local requested checks passed; staging validation is still required before production.

## 2026-10-10 CHECK constraint staging preparation

Current actual checkout remains Jack at base 1c1c8f3b152192bcc8062b421fd3e39041cedc85 plus preserved uncommitted fixes. No remote access/change, commit/push/deployment/resource creation or branch/worktree switch. See STAGING_CHECK_CONSTRAINT_VALIDATION.md for exact Neon staging SQL preflight/execution/verification, Northflank configuration, source delivery, production backups/locking/rollback and approval boundaries.

- Migration unchanged; fresh disposable PG validation lease_schema_1791575305594: nine PASS including all row values, unrelated constraints, columns/indexes/triggers, repeat migration and bounded rollback.
- Backend 233/233 and frontend 129/129 PASS; no failures/skips.
- Fresh 60sec/10 image/10 subtitle MP4 completed, all 1800 frames decoded and visually validated (SSIM 1.0), no full black frames, no automatic cancellation. FFmpeg 420.480s; measured Windows peak committed memory 944.0508 MiB under 1024 MiB, sampled working set 921.8047 MiB.
- Combined constrained replay then FAILED with an unclassified fetch failed after successful output validation. No OOM cause proved. This remains a sequential stability investigation item; do not report the complete constrained replay PASS.
- Separate cancellation replay predeploy_1791575626161: eight PASS, active/repeated 582ms, cross-process 1068ms, queued/row-lock/native-failure and export-after-cancel verified. Focused predeploy_1791575737363: four PASS, actual 409 for cancelling job, migrated recovery and new actual MP4 on the same project. These independent runs were not resource-measured.
- One redundant test replay was aborted after correcting its skip option; only owned synthetic processes stopped, fixture data retained. No fake terminal rows.
- Offline exact-source artifact: staging-source-1791575119683/jackcut-staging-source.tar.gz (in backend/benchmarks/results), SHA256 f3f291acbbb9edd5db6f3a195c9b91cde4ea0cd3e9bb847f16b52c11784679c7; manifest SHA256 05c0f91cf92fede9a038ead746e369c73370beb951402f30214641f98680fc71. 53 files; archive extraction/source verification PASS. Includes uncommitted runtime fixes and operator migration, excludes secrets/media. Image build remains unexecuted.

Ready to seek approval for isolated staging validation; NOT ready to claim production deployment acceptance. Linux/image identity, Neon role/schema/lock behavior, R2, cgroup metrics, current deployed revision and the sequential transport failure remain unverified. Applying backend diagnostics alone does not expand the database CHECK. Remote migration/image publication/deployment/resources require explicit approval.
