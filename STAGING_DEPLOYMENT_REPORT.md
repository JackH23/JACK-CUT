# JACK-CUT staging deployment report

Date: 10 October 2026. Status: **BLOCKED — no staging deployment performed.**

The user authorized isolated staging preparation/deployment/testing, with separate approval required before committing, pushing, creating billable resources or affecting existing infrastructure. The user also instructed stopping when required integrations or permissions are unavailable. This attempt stopped at the integration gate.

## Verified during this attempt

- Actual local repository: D:/pull from git/JACK-CUT.
- Current branch: Jack.
- Local HEAD: 557af0c4d72d63eb80d4d08ba48d0f9665106e39.
- Origin: https://github.com/JackH23/JACK-CUT.git.
- Existing modified/untracked files remain intact; no staging/reset/commit/push/branch switch occurred.
- LOCAL_PRE_DEPLOY_TEST_REPORT.md and NORTHFLANK_STAGING_VALIDATION_PLAN.md were consulted. The latter records the cancellation diagnostics/fixes, pooled PostgreSQL lock/statement budgets, configurable cleanup interval and narrowly packaged read-only CLI.
- GitHub connector successfully retrieved JackH23/JACK-CUT metadata, with pull/push/admin permissions. Permission availability is not approval to push.
- Enabled tool inventory contains no Northflank or general Cloudflare account/deployment/R2 integration. Plugin discovery for Northflank/Cloudflare returned no matches. This describes the current session; it is not a claim that those providers have no integrations elsewhere.
- No installed docker, podman, northflank, nf, wrangler or gh executable was found on PATH. No authenticated provider API path was established or used.

## Deployment identity

| Item | Result |
| --- | --- |
| Deployed commit | None |
| Image revision/digest | None; image not built |
| Staging backend URL | None |
| Northflank service/database | Not created or inspected |
| Staging R2 bucket/credentials | Not created or inspected |
| Deployment status | Blocked before resource creation/build/deployment |
| Exact-source artifact verification | Not executed; local HEAD excludes existing uncommitted fixes |

## Tests and measurements

No test suite, build or staging scenario was executed during this attempt: the user's stop condition applied after discovering unavailable deployment integrations. Do not interpret historical local results as new staging results.

| Requested staging test | Status |
| --- | --- |
| Health/authentication | NOT RUN |
| Five-second MP4 export | NOT RUN |
| Sixty-second storytelling MP4 export | NOT RUN |
| Active/queued/repeated cancellation | NOT RUN |
| Export after cancellation | NOT RUN |
| PostgreSQL timeout/recovery | NOT RUN |
| R2 upload/download/cleanup | NOT RUN |
| FFmpeg exit/close/process termination | NOT RUN |
| CPU/RAM/OOM metrics | NOT MEASURED |
| FFprobe and actual MP4 decoding | NOT RUN on staging |
| Linux Docker build/runtime | NOT RUN |
| Cloudflare adapter build/staging browser | NOT RUN |

Staging FFmpeg duration: **unmeasured**. Staging peak memory: **unmeasured**. Staging cancellation result: **unverified**.

Historical evidence only: the prior local readiness report records 223/223 backend and 127/127 frontend tests, six live local PostgreSQL fault cases and nine constrained Windows export/cancellation scenarios passing. Its latest Windows run recorded 945.95 MiB peak combined committed memory, 399.866 seconds FFmpeg rendering, active cancellation 95 ms and cross-process cancellation 721 ms; all 1800 frames matched the retained reference. These were not rerun here and do not establish Linux/Northflank/R2 behavior.

## Proposed delivery and staging configuration — not applied

Once required authenticated provider access is available, first rerun source/test/build checks and prepare a reviewed source manifest/diff that excludes .env files, fixture credentials, media, exports and generated logs. A dedicated staging branch such as codex/jackcut-staging-validation is a possible delivery route; no branch was created. Show the exact proposed changes and obtain explicit commit/push approval before delivering the source. Do not push the current local snapshot blindly, overwrite Jack/main, or trigger an existing production service's branch automation. Review build triggers before any authorized push.

Alternatively, a later approved exact-source image publication can avoid changing the current branch. No image was prepared or published in this attempt. Git HEAD alone is not the tested working-tree identity.

Require separately approved creation of a new staging service and PostgreSQL database, plus a distinct private R2 bucket and credentials. Recommended service resources remain 2 vCPU, 2048 MiB RAM, one replica, one Node process, one FFmpeg thread and one render slot. Use backend/Dockerfile with repository root build context and the probes/scenarios documented in NORTHFLANK_STAGING_VALIDATION_PLAN.md. No existing production service, database, bucket or credential may be reused or modified.

Environment names only; no values or secrets are recorded here:

- NODE_ENV, PORT, STORAGE_DRIVER, TEMP_STORAGE_DIR
- DATABASE_URL, DB_LOCK_TIMEOUT_MS, DB_STATEMENT_TIMEOUT_MS
- JWT_SECRET, JWT_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_IN_DAYS
- R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT
- FFMPEG_PATH, FFPROBE_PATH, FFMPEG_VIDEO_ENCODER, FFMPEG_THREADS
- EXPORT_MAX_CONCURRENT_RENDERS, EXPORT_TIMEOUT_MS, EXPORT_STALL_TIMEOUT_MS, EXPORT_LEASE_TIMEOUT_MS, EXPORT_KILL_GRACE_MS
- EXPORT_RETENTION_HOURS, EXPORT_CLEANUP_ENABLED, EXPORT_CLEANUP_INTERVAL_MS
- TRUST_PROXY (only after verifying ingress topology)
- NEXT_PUBLIC_API_URL (frontend build-time staging endpoint)

## Remaining blockers

1. Authenticated, callable Northflank staging-management/build/logs/metrics/container access is unavailable in this session.
2. Authenticated Cloudflare access for isolated R2 resources/credentials and staging frontend validation is unavailable in this session.
3. Exact-source delivery is pending review and explicit commit/push or image-publication approval. Existing local fixes are uncommitted.
4. Billable resource creation approval must reference concrete resources/cost information after provider access is established; none was requested or assumed here.
5. Linux rendering/cgroup measurements, POSIX cancellation, effective SQL bounds/network-failure recovery, R2 multipart/cleanup and Cloudflare browser behavior remain untested on staging.
6. Existing TLS certificate verification bypass and lack of parent-process draining remain review items before production.

## Rollback

No remote changes occurred, so no infrastructure rollback is required. Preserve the current local files and evidence. For a later staging deployment, record the exact image digest/source manifest and previous staging revision; drain owned active jobs before reverting compatible application artifacts/configuration. Preserve database rows, additive schema and R2 objects. Resource deletion is not a rollback step and requires separate authorization. Production remains untouched.

The only file created by this attempt is STAGING_DEPLOYMENT_REPORT.md. No credentials were exposed, no billable resources created, and no deployment or production data operation performed.