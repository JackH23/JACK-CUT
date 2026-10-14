# Representative export benchmark — blocked pending production evidence

No representative render has run. Completion within two hours, speedup, peak memory, FFmpeg speed, and production bottlenecks are **unknown**. The production issue is not verified fixed.

## Access and evidence

Failed job: `3a3b2e9a-b187-4cc9-b6a7-fe23d2d82eda`. Supplied project: `dd992cea-76b0-4476-aa42-f7283d421c7c`. Its production editor reports “Could not load this project” even after retry with a signed-in session. The browser instead opened `b54fad70-34ad-44eb-8f32-2f5af9cd3ed5`, which showed no project media. The user then directed another attempt at localhost. That application successfully loaded the supplied project: 53 timeline clips (20 videos, 32 text, one audio), 42 project media entries and a 10-minute timeline. All 20 referenced videos were downloaded through the signed-in page, copied into the writable workspace, hashed and probed. The audio download opened a media viewer and did not produce a completed local WAV. Exact saved timeline fields are still unavailable through the current DOM-only browser tool: no WebMCP export capability exists, and the CLI has no existing authorized session credential. Rounded DOM timeline positions are not used as render inputs. No saved project was modified.

The last-known resource configuration is in `production-profile.unverified.json`. It deliberately cannot pass the execution gate. Obtain read-only deployment/job evidence for the applied CPU/RAM limits, concurrent render load, renderer environment, immutable image digest, deployed Git revision, full FFmpeg/ffprobe versions, Node version, fonts, and actual encoder arguments. Repository Dockerfile inspection only establishes Node 24 Bookworm with apt-installed FFmpeg; unpinned base/packages do not establish the failing image build. No matching isolated execution environment is available on this Windows machine (Docker absent).

The job API does not expose its project association or immutable failure-time timeline. Confirm association from authorized deployment/job records and verify the saved timeline/assets still match that export. Simultaneous clips need original render ordering evidence: the timeline read API includes a created-at tie-breaker but export reservation orders only by start time.

## Capture without project writes

`captureProject.cjs` uses authenticated application GETs only. It downloads referenced media by authenticated content route, discards signed URLs, preserves all returned rendering fields, rereads the timeline, and hashes snapshot and assets. Destination must be new. Supply an existing authorized access token locally through `JACKCUT_BENCHMARK_ACCESS_TOKEN`, never through command arguments/chat/logs; clear it afterwards. This tool does not obtain or mint credentials. Private bundle/logs contain project content and should remain local.

```text
node backend/scripts/representative/captureProject.cjs <verified-backend-origin> <confirmed-project-id> 3a3b2e9a-b187-4cc9-b6a7-fe23d2d82eda <new-private-bundle-directory>
```

## Isolated comparable execution

Use the failing production image/runtime and an isolated worker with the **verified** production limits. Proposed last-known configuration: 2 vCPU, 4294967296 bytes RAM, swap disabled, render concurrency 1, FFMPEG_THREADS=1, EXPORT_PREPARE_CONCURRENCY=2. Keep EXPORT_TIMEOUT_MS=7200000, EXPORT_STALL_TIMEOUT_MS=300000 and EXPORT_LEASE_TIMEOUT_MS=90000. These are benchmark-process settings only; do not change production settings. Mount a copy of the preserved working tree and its Git history read-only, plus bundle read-only and a new output directory writable. Provide Git for historical source reads and the production Node dependencies. Do not start `server.js`: it can run migrations/recovery and write jobs.

For a verified production container image, the equivalent resource flags are `--cpus=2 --memory=4g --memory-swap=4g --network=none`; use the production architecture and CPU class. Run on an isolated host or verify parent cgroup limits and competing CPU/RAM load. A container on this Windows host is not automatically comparable. Reuse exact FFmpeg build, libraries, fonts and encoder configuration; do not install a newer renderer. Baseline must be the deployed commit, not an assumed local HEAD.

```text
node backend/scripts/representative/runProject.cjs --inspect
node backend/scripts/representative/runProject.cjs <bundle-directory> <verified-profile.json> <new-output-directory>
node backend/scripts/representative/compareProject.cjs <output-directory> <bundle-directory>
```

Collect `--inspect` output on both the production runtime (read-only) and isolated benchmark runtime. Fill the profile with verified evidence; do not turn verification flags on merely to bypass the gate. It checks hardware, binary build signatures, fonts, settings, revision, isolation and project provenance before rendering.

The compiler invokes the real baseline and optimized controller with identical immutable inputs and read-only local adapters. It preserves clip count/timing, geometry, effects, text, audio and animation amounts. It refuses changed shared renderer dependencies. Exact FFmpeg args, ASS and fade command files are retained for review. Sources remain in their existing branch; no checkout/reset/commit occurs.

Each variant gets the unchanged two-hour budget, including graph preparation. Reports include total offline time, per-FFmpeg render time, native peak RSS (Linux sampled fallback), cgroup memory, progress speed and average timeline/wall speed, graph length and overlay/GEQ/LUT counts. A timeout is censored, never reported as a complete baseline. If baseline times out and optimized completes, improvement is only a lower bound.

Validation checks duration/frame count/metadata, every decoded video frame through PSNR, full audio/video decode, decoded PCM hashes, and caption ASS identity. Representative clip-boundary frame indices are retained. Inspect those frames privately for visual review. If baseline times out, complete baseline output comparison remains blocked; use separately labelled identical bounded windows for correctness, never present them as full-export completion.

This measures the offline renderer, excluding storage download/upload, database finalization and slot wait. Even a validated sub-two-hour renderer does not establish application deadline completion until those stages are verified on comparable resources. `productionFixed` remains false.

## Harness validation

```text
node --test backend/scripts/representative/selftest.cjs
node backend/scripts/representative/smoke.cjs <repository-root> <new-private-smoke-directory>
```

The smoke baseline uses local pre-optimization commit `d21b5c5b505eb3f195a76066f722657601130e81` solely to verify the harness. It is a 0.6-second transparent image with fractional transform, overlapping fades at 37.5/50, caption and audible tone. Both real controller graphs rendered successfully; all 18 video frames, decoded audio and ASS matched. GET-only capture, credential/ticket exclusion, checksums/tamper detection and missing-profile refusal passed. None of these results are production performance evidence.

