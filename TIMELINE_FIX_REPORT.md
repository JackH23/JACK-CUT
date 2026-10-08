# JackCut timeline add/delete investigation

Repository: D:\pull from git\JACK-CUT. Branch: Jack. The working tree was clean before editing. No branch changes, worktrees, commits, pushes, database migrations, or user-data operations were performed.

## Architecture traced

- Editor page: frontend/app/editor/[projectId]/page.tsx uses useEditorWorkspace -> useEditorTimeline, which owns timelineReducer state and selection.
- Creation: MediaSidebar -> TextPanel click -> useAddText -> timelineService.addItem -> shared authenticated Axios client -> POST /api/timeline/items -> authMiddleware -> projectAccess -> addTimelineItem -> Sequelize TimelineItem.create. PostgreSQL model generates the UUID and stores project, track, timing, and text fields.
- X removal: Timeline -> TimelineContent -> ScrollableTracks -> TimelineTracks -> TimelineClip -> useScrollableTracks removal handler -> useEditorTimeline.handleRemoveTimelineItem -> DELETE /api/timeline/items/:id -> ownership middleware -> deleteTimelineItem -> item.destroy.
- Settings Delete now uses the same central removal handler, with the displayed item's ID.
- Selection: TimelineClip focus/pointer/click -> selectedItemId. Newly created text now selects its returned UUID. Successful deletion clears selection only if that ID is still selected.
- Text/style updates: useTextEditor; animation updates: useAnimationEditor; movement: useTimelineDrag; resizing: useTimelineResize. These call PATCH through timelineService. Movement/resize responses update existing items by ID rather than inserting entries, so a late response does not restore a deleted item.
- Refresh: useLoadTimeline GET -> backend getTimelineItems -> frontend normalization -> LOAD_ITEMS_SUCCESS.
- Axios retries only after a rejected 401 with token refresh; no generic automatic mutation retry was found. Route ownership uses the stored item's project.

## Confirmed defects and fixes

1. Settings Delete was an inert button with no handler. It now calls removal for the displayed item and prevents default/bubbling. Existing X propagation prevention remains and has regression coverage. No path from Delete/X to add-text was found; the reported apparent creation on deletion was not reproduced in a live browser.
2. Creation had no synchronous pending guard. Rapid invocations could send concurrent POSTs based on the same stale items and place titles at the same time. A ref guard now suppresses additional invocations during the request and releases on failure. A layout effect keeps the items ref current; successful creation updates that ref immediately before dispatch, covering repeated calls before the next render.
3. Text creation ignored the playhead and always appended after text clips. It now starts at the playhead, moving forward to the first slot that fits five seconds without overlapping any clip on the titles track. Existing intentional positioning, dragging, and resizing behavior is unchanged. Creation waits for a successful initial load so unloaded clips are considered.
4. Sequelize decimal start/duration values were copied into newly created frontend clips without Number conversion. String values can make startTime + duration concatenate and produce incorrect subsequent placement. Both values are now normalized to numbers, using the backend's saved ID and track.
5. ADD_ITEM_SUCCESS appended unconditionally. If a GET included an item before its POST callback dispatched, state could contain the same ID twice. Success now replaces any existing entry with that ID.
6. A late LOAD_ITEMS_SUCCESS could restore an item deleted after the GET snapshot was taken. Reducer deletion IDs now filter stale snapshots. A new project load resets local items and deletion tracking.
7. Deletion request protection existed only in ScrollableTracks, not at the shared mutation boundary. The central handler now guards each ID across callers, retains successful IDs to suppress stale callbacks, and permits retry after failure. It removes local state only after backend success; failures retain the item and use the existing visible timeline error. New clips select themselves so a title placed after an occupied slot can immediately be edited or deleted.

Strict Mode does not account for these mutation defects: add/delete are event-driven, while load effects issue GETs and ignore callbacks after cleanup. No add/delete effect or duplicated global add/delete listener was found. Strict Mode was left enabled.

## Files changed

- frontend/app/editor/[projectId]/page.tsx: passes central removal handler to settings.
- frontend/components/editor/SettingsPanel.tsx: connects Delete with event isolation.
- frontend/lib/types.ts: declares settings removal callback.
- frontend/composables/useAddText.ts: pending guard, load readiness, playhead placement, collision avoidance, current items, numeric timing, selection.
- frontend/composables/useEditorTimeline.ts: supplies creation context; central per-ID deletion guard and selection cleanup.
- frontend/reducers/timelineReducer.ts: load readiness, per-project reset, duplicate-ID prevention, stale-load deletion filtering.
- frontend/tests/timelineProject.test.mjs: extends regression coverage for creation, selection, deletion, repeated operations, failure/retry, stale loads, and Delete/X events.
- backend/tests/timelineLifecycle.test.cjs (new): controller lifecycle test using an isolated in-memory model.
- TIMELINE_FIX_REPORT.md (new): this report.

No backend production code or database structure needed modification.

## Validation results

- Timeline frontend regressions: 10/10 pass. Includes one POST for concurrent add calls, placement at playhead/after occupied intervals, backend ID/track/numeric timing, selecting new text, creation retry, duplicate-ID reconciliation, deletion retry/guard, and Delete/X propagation.
- All frontend .mjs and .cjs tests: 115 pass, 1 fail (116 total). Existing projectLifecycle.test.mjs test at line 60 fails because its mock loader does not supply @/components/projects/ProjectsHeader. The failing test and affected project UI files are unchanged from HEAD. This unrelated fixture was left alone.
- Backend suite: 169/169 pass, including five create -> move/resize PATCH -> GET -> delete -> GET cycles preserving a separate clip. Repeated deletion returns 404. This uses a mocked model, not a real database.
- TypeScript: tsc --noEmit --incremental false --project frontend/tsconfig.json passes.
- Targeted ESLint on all six changed frontend source files passes.
- git diff --check passes. Final branch remains Jack.

## Limits and remaining verification

Browser interactions against a running authenticated editor, real PostgreSQL persistence across browser refresh, and deployed end-to-end export were not executed. No deployed editor URL/session was supplied, and no existing user project data was changed for testing. Controller GET reloads and frontend stale-load reconciliation are covered with isolated mocks; these are not substitutes for real database/browser checks. Existing frontend tests for animation, preview geometry, clipboard behavior, text rendering, and export state were included in the full suite.

Network ambiguity (a server commits a POST/DELETE but its response is lost) and simultaneous creation in multiple tabs remain outside these small frontend fixes. There is no database-backed creation idempotency key; a manual retry after an ambiguous POST failure can still create another row. Existing stored duplicates were preserved. The apparent Delete-to-add behavior remains unconfirmed beyond the actual inert Delete, duplicate creation, and stale-load defects identified above.
