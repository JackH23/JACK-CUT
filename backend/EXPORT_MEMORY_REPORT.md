# Export memory investigation — 2026-10-09

## Scope and result

Changes were made in `D:\pull from git\JACK-CUT`, on the existing `Jack` branch. No commit, push, deployment, database migration, application database connection, production resource change or existing-data deletion was performed. The test fixtures are newly generated synthetic media, not a copy of the user's private project.

The optimized 60-second storytelling export completed with all animations enabled inside a **1,024 MiB Windows Job Object allocation cap**, with Node and its FFmpeg child restricted to one logical CPU. Peak combined committed allocation was **849,170,432 bytes / 809.8 MiB**, elapsed time **413.269 seconds**, aggregate CPU time **372.906 seconds**. The controller recorded completed status and 100% progress.

This proves the local representative render fits that measured allocation cap. It does **not** prove the whole Northflank Linux container fits 1 GB. The harness mocks database and storage; cgroup accounting, page cache, real transfer buffers, deployed FFmpeg version, fonts, source complexity and API traffic differ. Docker/WSL were unavailable here. Linux staging verification remains required.

## Confirmed bottlenecks and changes

1. **Repeated source decoding and scaling:** ten `-loop 1` image inputs repeatedly decoded large PNGs, then split into static and animated branches. Images now enter as a single decoded frame at 30 fps. Each branch scales once, then `loop=loop=-1:size=1:start=0` repeats one prepared frame, bounded by clip duration. GEQ runs after the loop so animation time continues to advance. Video decoding and source trims remain unchanged.
2. **Unbounded FFmpeg threading:** original graph used automatic decoder, complex-filter and encoder thread counts. These can retain multiple decoded/intermediate/reference frames. Each input decoder, both filter thread settings and output encoder now use `FFMPEG_THREADS=1` by default (maximum 8 when explicitly configured). The before/after experiment measures the combined changes; it does not isolate each filter's individual allocation.
3. **Large full-chroma alpha frames and overlay chain:** each 1920×1080 `yuva444p` frame carries roughly 7.9 MiB of plane data before padding/allocator overhead. Ten animated inputs have static/animated branches, GEQ buffers and serial overlay intermediates. Full-canvas affine GEQ remains necessary for existing unclipped slides/zooms and fractional positioning. Keeping `yuva444p` and `overlay:format=auto` preserves chroma and odd/fractional coordinates; an early 4:2:0 conversion was rejected. Final MP4 remains yuv420p. GEQ still evaluates only existing animation windows; ASS still renders once after composition. Unchanging image scale/pad work now happens once per branch rather than every frame.
4. **Concurrent exports multiply memory:** a backend-process-wide cancellable FIFO defaults to one active FFmpeg child (`EXPORT_MAX_CONCURRENT_RENDERS=1`). A slot is released only after child close, or a pre-spawn failure. Queued jobs retain heartbeat and cancellation; their total deadline still applies, while no-work stall detection excludes the wait. Multiple Node processes/instances have separate budgets.
5. **Remaining pipeline costs:** source materialization is already bounded to three concurrent downloads by default; files are streamed to a workspace. ASS text is small in this fixture. R2 upload occurs after rendering with bounded multipart buffers. Neither source-transfer nor live upload overhead is included in this mocked-storage measurement; it must be included in production sizing.

The animation expressions, base transforms, ASS generation, clip positioning/timing, 1920×1080/30fps output, libx264 medium preset and CRF 23 remain unchanged. Animations were not disabled.

## Benchmark method

Baseline source revision: `173534c4789186b5ec83a097a835385fe33f6774`. Native FFmpeg version is recorded in each command manifest. Windows Node 24.21 and FFmpeg 9.0.2 were used. Host had 32 GB RAM and 12 logical CPUs; both timed controller runs use affinity to one CPU. Run order is sequential. Source assets were generated before timing.

The real controller builds the graph, launches native FFmpeg, parses progress, handles cancellation/watchdogs and finishes the export. Only models/storage are replaced with in-memory test doubles; no application database is opened. Ten distinct PNGs (landscape 2560×1440 and portrait 1440×2560) appear sequentially for six seconds each. Ten unique ASS captions have fade-in/out; images exercise zoom, slide and fade presets, in/out duration one second, amount 65, with several scaled/offset placements. Audio is AAC silence. Each complete output contains 1,800 frames.

`measureMemory.ps1` queries the Windows Job Object's exact aggregate peak committed allocation, covering Node plus child FFmpeg. It applies `JOB_OBJECT_LIMIT_JOB_MEMORY` when a limit is requested. CPU time is aggregate job user+kernel time. Parent working-set/private fields in JSON refer to **Node alone** in controller mode and must not be mistaken for total FFmpeg memory. Peak commit is not Linux RSS/cgroup memory. Durations include small controller setup/mock publication costs, and are single-run measurements rather than statistical performance guarantees.

The earlier exploratory FFmpeg-only baseline completed with 1,692,229,632 bytes (1,613.8 MiB) peak allocation. Its 478.9-second wall time included an overlapping preliminary trial and is excluded from the fair timed comparison. The preliminary optimized trial was intentionally stopped and is not a successful final result.

## Reproduce

From the backend directory with Node, FFmpeg, ffprobe and PowerShell 7 installed:

```powershell
New-Item -ItemType Directory -Force benchmarks/results | Out-Null
git show 173534c4789186b5ec83a097a835385fe33f6774:backend/controllers/exportController.js | Set-Content benchmarks/results/baseline-controller.js
git show 173534c4789186b5ec83a097a835385fe33f6774:backend/utils/clipAnimationFilter.js | Set-Content benchmarks/results/baseline-animation.js
node benchmarks/storytellingFixture.cjs baseline 60
node benchmarks/storytellingFixture.cjs optimized 60
pwsh -NoProfile -File benchmarks/measureMemory.ps1 -Mode baseline -OneCore -Controller
pwsh -NoProfile -File benchmarks/measureMemory.ps1 -Mode optimized -LimitMB 1024 -OneCore -Controller
node benchmarks/verifyStorytelling.cjs
node benchmarks/storytellingFixture.cjs optimized-cancel 60
pwsh -NoProfile -File benchmarks/measureMemory.ps1 -Mode optimized-cancel -LimitMB 1024 -OneCore -Controller
```

Do not run the timed exports concurrently. The commands create files only in ignored `benchmarks/results/`. Baseline-prefixed modes use the frozen source; other modes use the current controller. `-cancel` modes request actual controller cancellation 2.5 seconds after native spawn. For cancellation after encoding begins, capture and measure `optimized-cancel-render`; it requests cancellation one second after a positive native frame count. For a capped original-graph failure test, capture `baseline-limit` then profile that mode with `-LimitMB 1024`; this preserves the completed baseline output.

## Final before/after measurements

| Run (Node + native FFmpeg, one logical CPU) | Allocation cap | Peak combined commit | Elapsed time | Aggregate CPU | Result |
| --- | --- | --- | --- | --- | --- |
| Original graph, clean sequential baseline | None | 1,752,317,952 bytes / 1,671.1 MiB | 450.805 s | 414.797 s | Completed |
| Original graph, capped reproduction | 1,024 MiB | 1,084,297,216 bytes / 1,034.1 MiB | 16.959 s | 15.781 s | Failed: Cannot allocate memory |
| Optimized graph, capped full export | 1,024 MiB | 849,170,432 bytes / 809.8 MiB | 413.269 s | 372.906 s | Completed |

Peak combined allocation decreased **51.5%**; elapsed time decreased **8.3%**. The capped baseline peak slightly exceeded the configured allocation threshold in Windows accounting before failure; this is not Linux cgroup OOM behavior. Node is assigned to its Job Object immediately after process creation, not launched suspended. The optimized full-run peak remains below the requested limit.

## Verification results

- **200 backend tests passed**, zero failures/skips, including real FFmpeg image/video/audio combinations, lifecycle cancellation, independent watchdog escalation, queue cancellation and total deadline behavior.
- Both complete MP4s decode successfully: 1920×1080, 30 fps, exactly 1,800 frames, 60 seconds, H.264 plus AAC. No fully black frames were detected. All ten distinct images and all ten caption pixel regions passed independent scene checks. The optimized contact sheet was visually inspected.
- Every decoded frame was compared against the original export. **Mean and minimum frame SSIM are both 1.0**, including zoom/slide/fade windows and subtitle transitions. There are no decoded-image differences in this representative fixture, despite changed processing order and thread settings.
- Optimized full-controller progress recorded advancing rendering percentages followed by **100%, completed**. The capped original graph recorded **failed** with the existing out-of-memory diagnostic rather than completing incorrectly.
- Startup cancellation of the full optimized graph returned **cancelled**, no error, after child closure; the entire harness completed in **3.174 seconds** (cancellation scheduled 2.5 seconds after spawn).
- A separate full-graph cancellation after encoded frames appeared advanced progress from 0% to 3%, then became **cancelled** with no published output reference. Child shutdown took **36 ms** after the cancellation request. This harness ran 31.066 seconds inside the 1,024 MiB cap and peaked at 811,970,560 bytes (774.4 MiB).
- Database and storage interactions use mocks; no live project records, media or databases were modified. Live PostgreSQL/R2 integration and browser progress display are not established by this benchmark.

Evidence is saved under ignored `backend/benchmarks/results/`: baseline/optimized command manifests and ASS files, controller memory/state JSON, native progress/stderr logs, complete MP4s, contact sheets, `verification.json` and per-frame `ssim.log`. Generated results are deliberately excluded from Git.

## Files changed

- `backend/controllers/exportController.js`: single-frame scaled image loops, decoder/filter/encoder thread limits and renderer admission/release.
- `backend/services/renderSlots.js`: process-wide cancellable renderer FIFO.
- `backend/services/exportLifecycle.js`: queued-wait stall exemption with total deadline retained.
- `backend/tests/renderSlots.test.cjs`: admission, cancellation and idempotent release coverage.
- `backend/tests/exportLifecycle.test.cjs`: queued-wait versus total-deadline regression.
- `backend/tests/exportMediaGeometry.test.cjs`: cached still-image branch, geometry, animation timestamps and thread regression.
- `backend/benchmarks/storytellingFixture.cjs`: deterministic synthetic media and real-controller integration harness.
- `backend/benchmarks/measureMemory.ps1`: one-CPU/aggregate hard-allocation-limit profiler.
- `backend/benchmarks/verifyStorytelling.cjs`: frame decoding, scene/subtitle checks, black-frame detection, contact sheets and every-frame SSIM.
- `backend/.gitignore`: exclude generated benchmark artifacts.
- `backend/DEPLOYMENT.md`: renderer configuration and resource guidance.
- `backend/EXPORT_MEMORY_REPORT.md`: this report.

## Resource recommendation and staging decision

Start Northflank staging at **2 vCPU / 2 GiB RAM**, `FFMPEG_THREADS=1`, `EXPORT_MAX_CONCURRENT_RENDERS=1`, one Node renderer process per container. RAM provides headroom beyond the measured ~810 MiB allocation for runtime, transfers and service traffic. Two CPUs provide scheduling headroom; two-CPU render performance has not been benchmarked and no speedup is promised. Larger sources, more clips, longer/overlapping animations or simultaneous worker processes require additional measurements.

The patch is suitable for **staging validation**, not an assertion of production acceptance at 1 GB. In staging, use the actual FFmpeg build/fonts and real 60-second project; monitor total cgroup memory peak and OOM events at the intended hard memory/CPU limit, verify playback, all clips/captions and animated transitions, progress, cancel during render/upload and queued cancellation. Include representative API traffic and R2 transfer phases. A lower resource tier should be selected only after that complete-container test passes with operating headroom. Production Northflank and Cloudflare were not changed.
