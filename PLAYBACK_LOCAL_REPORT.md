# JACK-CUT local playback verification — 2026-10-16

Checkout: `D:\pull from git\JACK-CUT`, branch `Jack`. The initial checkout had no uncommitted files. Existing preview controls were preserved and connected to the coordinator. No branch switch, commit, push, deployment, production write, or saved-timeline edit was performed.

## Diagnosis and fixes

1. **Thumbnail connection contention:** the editor created video elements for all sidebar and timeline thumbnails, including offscreen clips (60 thumbnail elements in the test project). Their metadata requests competed with Program Monitor video/audio; the baseline stayed at readyState 0 and reached a buffering timeout. An independent authenticated local video range GET returned HTTP 206 / 65,536 bytes in 1,203 ms. Visibility-based loading with a shared two-request limit allowed both monitor elements to reach readyState 4 and play.
2. **Rounded endpoint deadlock:** an ended source at 9.98 seconds with a saved endpoint of 10 seconds was accepted as a normal end, but its native clock still capped timeline progress at 9.98. A regression failed before the fix. Accepted ended clocks now release the exact timeline endpoint.
3. **Impossible near-end buffer recovery:** waiting recovery could demand the already-buffered amount plus remaining duration, exceeding the source endpoint. Recovery is bounded by the remaining media, with a small range-rounding tolerance.
4. **Intentional pause counted toward buffering timeout:** resetting the waiting timer when playback intent changes prevents a long pause from immediately timing out on resume.
5. **Incomplete control wiring:** jump, frame step, loop, volume and fullscreen callbacks existed in PlaybackControls but were not supplied by PreviewMonitor. They now use the same coordinator and actual media elements. A seek range was added. Frame stepping pauses and moves 1/30 second; fullscreen expands the composed monitor, preserving text/effects.
6. Still-image readiness now participates in coordinated buffering. Failed images expose a retryable error. Buffering feedback is distinct from intentional pause. Stale play promises are held during buffering.

## Files changed and purpose

| File | Purpose |
| --- | --- |
| frontend/lib/playbackCoordinator.ts | Endpoint release, bounded buffering recovery, pause timeout reset, image readiness, loop handling, stale-play protection |
| frontend/composables/usePreviewPlayback.ts | Seek/step/loop handlers, volume and buffering UI state, floating-point timecode correction |
| frontend/composables/usePreviewMonitor.ts | Register active still-image readiness with the coordinator |
| frontend/components/editor/PreviewMonitor.tsx | Wire controls, actual volume, seek range, buffering/error feedback, composed fullscreen |
| frontend/components/editor/VideoCanvas.tsx | Fit the 16:9 canvas to both available dimensions |
| frontend/app/globals.css | Preview size container and fullscreen dimensions |
| frontend/components/editor/VideoThumbnail.tsx | Visible-only thumbnails with two concurrent loads and cleanup |
| frontend/components/editor/media-sidebar/MediaList.tsx | Use bounded thumbnail loading |
| frontend/components/editor/timeline/track/ClipMediaPreview.tsx | Use bounded thumbnail loading |
| frontend/lib/playbackTrace.ts | Decoded-frame counts and actual media volume/mute diagnostics |
| frontend/tests/playbackCoordinator.test.mjs | Seven focused regressions for endpoint, waiting recovery, loop, image loading/failure, pause timeout, empty intervals |
| frontend/app/playback-verification/page.tsx and PlaybackFixture.tsx | Development-only, separate in-memory test project using the real monitor; no saved-project API writes |
| frontend/public/playback-fixtures/* | Generated local MP4, still SVG and WAV fixtures |

Inspected Editor active-clip selection, timeline duration/clock, useTimelineSound, PlaybackControls and text/media animation code. Existing half-open active intervals and the media-owned coordinator clock were retained. No second playback clock or per-frame native seeking was introduced.

## Actual browser tests

Used the local Codex Chromium browser at localhost:3000. The frontend process command points to this checkout. Its configured API is localhost:5001; /health returned ok and the local PostgreSQL project/media records matched the UI. The local backend uses R2 for existing asset reads; no R2 writes were performed.

Existing project: Journey Through Nature — 10 Minute Film (`dd992cea-76b0-4476-aa42-f7283d421c7c`). Played from zero through 70.6 seconds and three video clips, with titles and the existing music bed. No playback rejection. Mean sampled video/audio drift was 28 ms; maximum was 251 ms around transitions. Real low audio-buffer headroom held both elements and recovered automatically when headroom returned. The 109.9 MB WAV remains subject to network throughput.

Separate fixture modes exercised: video-only, image-only, text-only, image + audio + animated text, and mixed image/video/text/audio. The image-only and text-only modes reached their 10-second ends; video-only diagnostics showed decoded frame counts advancing (162 to 169), not merely a moving playhead.

The final mixed run completed 80 seconds continuously, crossing video/image boundaries, audio removal/re-entry, and a completely empty silent gap at 27–30 seconds. It stopped at exactly 80 with looping off. Final run metrics: 502 native media samples; no coordinator seeks during the run; no media errors, playback rejections or coordinator errors; final video frame counter 300. Mean sampled video/audio drift 30.9 ms, maximum 55.6 ms. Earlier mixed run also completed 80 seconds.

| Check | Observed result |
| --- | --- |
| Pause/resume repeatedly | Video/audio pause; still/text animation transform and playhead freeze; resume advances |
| Paused seek and rapid scrubbing | Final requested 5 seconds won; both native video/audio clocks read 5 and paused |
| Playing seek and rapid scrubbing | Crossed image/text/video targets; latest requested clip resumed and progressed |
| Frame steps | Paused video sought from 2 to approximately 2.033332; previous frame reversed the step |
| Jump controls | Beginning returned 0; end returned 80 |
| Loop on | Seek to 79.8, cross end, automatic coordinator seek 0; playback intent retained |
| Loop off | End at 80; Play button restored and stale media removed |
| Mute and volume | Native audio diagnostic showed muted=true and volume=0.25; unmute restored normal state |
| Fullscreen | Still, animated text and vintage filter preserved; measured canvas 1667.33 x 937.875 (16:9); keyboard activation exited fullscreen |
| Buffering | Real remote media starvation held synchronized media and resumed automatically; image loading and timeout recovery covered by focused tests |
| Console/media requests | No new errors in final runs. Transient development compile error and stale hot-reload class instance were fixed/reloaded before final tests. Baseline stalled requests documented above |

Audio checks were automated media readiness/clock/mute/volume checks. **No audible listening was performed.**

## Automated checks and remaining limits

- `npx tsc --noEmit`: passed.
- Targeted ESLint: zero errors; three existing next/no-img-element warnings.
- Playback coordinator + media animation + text animation: **35/35 passed** (25 coordinator tests).
- Complete frontend suite: **131/157 passed**. The 26 failures are in unchanged projectLifecycle (outdated list/pagination mocks), timelineClipboard (missing EffectOption mock) and textRendering (missing mediaEffectFilter mock) harnesses. Those unrelated harnesses were not changed.
- `git diff --check`: passed.
- Final fixture metrics and full test log are saved under the task visualization directory alongside the fullscreen screenshot.
- Only local Chromium was tested. The entire 10-minute project was not played end-to-end; its first 70+ seconds, seeking, buffering and a separate 80-second mixed fixture were tested. Audible sound quality/device output and other browsers remain unverified.
- Existing-project saved timeline: 53 rows, SHA-256 before and after `71a9b7abd71235d041f852badc372eec688a6785b23e2e83a15bec86e78b88ee` — unchanged.
