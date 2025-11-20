function setActiveTimelineItem(item, options = {}) {
    const shouldFocus = Boolean(options.focus);
    const clipProgressOverride = Number.isFinite(options.clipProgress)
        ? clampProgress(options.clipProgress)
        : null;
    const isSameItem = item === activeTimelineItem;

    if (!isSameItem) {
        commitPreviewTextEditorContent({ force: true });
        persistPreviewImageTransformForActiveTimelineItem();
    }
    if (activeTimelineItem) {
        activeTimelineItem.classList.remove('active');
    }
    activeTimelineItem = item || null;
    if (activeTimelineItem) {
        activeTimelineItem.classList.add('active');
        scrollTimelineItemIntoView(activeTimelineItem);
        if (shouldFocus && typeof activeTimelineItem.focus === 'function') {
            activeTimelineItem.focus();
        }
    }
    syncAnimationControlsToTimelineItem(activeTimelineItem);
    syncAudioControlsToTimelineItem(activeTimelineItem);
    syncCanvasControlsToTimelineItem(activeTimelineItem);
    syncTextEffectsControlsToTimelineItem(activeTimelineItem);
    refreshImageDurationApplyAllAvailability();
    const nextProgress = clipProgressOverride !== null
        ? clipProgressOverride
        : (isSameItem ? getActiveClipProgress() : 0);
    renderImageKeyframeTracks(activeTimelineItem);
    setActiveClipProgress(nextProgress, {
        source: 'set-active',
        updatePreview: (clipProgressOverride !== null) || !isSameItem,
    });
    updateImageRotationControlState();
    updateActiveTimelineIndicators();
    applyCanvasSettingsToPreview(activeTimelineItem);
}

const TIMELINE_UNDO_STACK_LIMIT = 50;
const timelineUndoStack = [];
let timelineClipboardSnapshot = null;
const timelineObjectUrlUsage = new Map();
const timelineInstanceIdRegistry = new Map();
const timelineItemVolumeControls = new WeakMap();
const timelineItemEditSnapshots = new WeakMap();

function getTimelineItemVolumeControlState(timelineItem) {
    return timelineItemVolumeControls.get(timelineItem) || null;
}

function syncTimelineItemVolumeControl(timelineItem) {
    const state = getTimelineItemVolumeControlState(timelineItem);
    if (!timelineItem) {
        return;
    }
    const isAudioItem = (typeof isAudioTimelineItem === 'function')
        && isAudioTimelineItem(timelineItem);
    if (isAudioItem) {
        if (state) {
            detachTimelineItemVolumeControl(timelineItem);
        }
        return;
    }
    if (!state) {
        return;
    }
    const settings = getTimelineItemAudioSettings(timelineItem);
    const percent = clampVolumePercent(settings.volumePercent);
    state.input.value = String(percent);
    state.input.setAttribute('aria-valuenow', String(percent));
    state.input.setAttribute('aria-valuetext', formatMasterVolumeDisplay(percent));
    state.value.textContent = formatMasterVolumeDisplay(percent);
}

function attachTimelineItemVolumeControl(timelineItem) {
    if (!timelineItem || getTimelineItemVolumeControlState(timelineItem)) {
        syncTimelineItemVolumeControl(timelineItem);
        return getTimelineItemVolumeControlState(timelineItem)?.container || null;
    }

    const isVideoItem = (typeof isVideoTimelineItem === 'function')
        && isVideoTimelineItem(timelineItem);
    const isAudioItem = (typeof isAudioTimelineItem === 'function')
        && isAudioTimelineItem(timelineItem);

    if (isAudioItem) {
        detachTimelineItemVolumeControl(timelineItem);
        return null;
    }

    const supportsAudio = isVideoItem;

    if (!supportsAudio) {
        return null;
    }

    const container = document.createElement('div');
    container.className = 'timeline-item-volume';
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'Clip volume');

    const label = document.createElement('span');
    label.className = 'timeline-item-volume__label';
    label.textContent = 'Volume';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(AUDIO_VOLUME_MIN_PERCENT);
    slider.max = String(AUDIO_VOLUME_MAX_PERCENT);
    slider.step = '1';
    slider.className = 'timeline-item-volume__slider';
    slider.setAttribute('aria-label', 'Adjust clip volume');
    slider.setAttribute('aria-valuemin', String(AUDIO_VOLUME_MIN_PERCENT));
    slider.setAttribute('aria-valuemax', String(AUDIO_VOLUME_MAX_PERCENT));

    const value = document.createElement('span');
    value.className = 'timeline-item-volume__value';

    const handleVolumeChange = (event) => {
        if (!timelineItem || !event?.target) {
            return;
        }
        const percent = clampVolumePercent(event.target.value);
        slider.value = String(percent);
        if (typeof persistTimelineItemAudioSettings === 'function') {
            persistTimelineItemAudioSettings(timelineItem, { volumePercent: percent });
        }
        if (typeof activeTimelineItem !== 'undefined'
            && timelineItem === activeTimelineItem
            && masterVolumeInput
        ) {
            masterVolumeInput.value = String(percent);
            if (typeof updateMasterVolumeReadout === 'function') {
                updateMasterVolumeReadout(percent);
            }
        } else {
            syncTimelineItemVolumeControl(timelineItem);
        }
    };

    slider.addEventListener('input', handleVolumeChange);
    slider.addEventListener('change', handleVolumeChange);

    container.appendChild(label);
    container.appendChild(slider);
    container.appendChild(value);

    const referenceNode = timelineItem.querySelector('.timeline-item-remove');
    if (referenceNode) {
        timelineItem.insertBefore(container, referenceNode);
    } else {
        timelineItem.appendChild(container);
    }

    timelineItemVolumeControls.set(timelineItem, {
        container,
        input: slider,
        value,
        handler: handleVolumeChange,
    });

    syncTimelineItemVolumeControl(timelineItem);

    return container;
}

function detachTimelineItemVolumeControl(timelineItem) {
    const state = getTimelineItemVolumeControlState(timelineItem);
    if (!timelineItem || !state) {
        return;
    }

    state.input.removeEventListener('input', state.handler);
    state.input.removeEventListener('change', state.handler);

    if (state.container && state.container.parentNode === timelineItem) {
        timelineItem.removeChild(state.container);
    }

    timelineItemVolumeControls.delete(timelineItem);
}
const NON_TEXT_INPUT_TYPES = new Set([
    'button',
    'checkbox',
    'color',
    'file',
    'hidden',
    'image',
    'radio',
    'range',
    'reset',
    'submit',
]);

function isTimelineShortcutTargetEditable(target) {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    const editableAncestor = target.closest('input, textarea, [contenteditable="true"]');
    if (!editableAncestor) {
        return false;
    }

    if (editableAncestor.hasAttribute('readonly') || editableAncestor.hasAttribute('disabled')) {
        return false;
    }

    if (editableAncestor instanceof HTMLInputElement) {
        const type = (editableAncestor.type || '').toLowerCase();
        return !NON_TEXT_INPUT_TYPES.has(type);
    }

    return true;
}

function sanitizeTimelineItemClone(clone) {
    if (!(clone instanceof HTMLElement)) {
        return;
    }

    clone.classList.remove('active', 'dragging', 'is-resizing');
    delete clone.dataset.laneIndex;
    delete clone.dataset.startOffsetMs;
    delete clone.dataset.resizeHandlesAttached;
    delete clone.dataset.edgeResizeInitialized;
    delete clone.dataset.draggingInitialized;
    delete clone.dataset.resizeCursor;

    clone.querySelectorAll('.timeline-item-remove').forEach((button) => {
        if (button instanceof HTMLButtonElement) {
            button.disabled = false;
        }
    });
}

function sanitizeTimelineItemDataset(dataset) {
    if (!dataset) {
        return {};
    }

    const sanitized = { ...dataset };
    delete sanitized.laneIndex;
    delete sanitized.startOffsetMs;
    delete sanitized.resizeHandlesAttached;
    delete sanitized.edgeResizeInitialized;
    delete sanitized.draggingInitialized;
    delete sanitized.resizeCursor;
    return sanitized;
}

function generateTimelineInstanceId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    const randomPart = Math.random().toString(36).slice(2, 10);
    const timePart = Date.now().toString(36);
    return `timeline-item-${timePart}-${randomPart}`;
}

function assignTimelineInstanceId(timelineItem, options = {}) {
    if (!timelineItem || !timelineItem.dataset) {
        return null;
    }

    const existingId = timelineItem.dataset.timelineInstanceId;
    if (!options.force && existingId) {
        const owner = timelineInstanceIdRegistry.get(existingId);
        if (!owner || owner === timelineItem || !owner.isConnected) {
            timelineInstanceIdRegistry.set(existingId, timelineItem);
            return existingId;
        }
    }

    if (existingId) {
        const previousOwner = timelineInstanceIdRegistry.get(existingId);
        if (previousOwner === timelineItem) {
            timelineInstanceIdRegistry.delete(existingId);
        }
    }

    let id = generateTimelineInstanceId();
    while (timelineInstanceIdRegistry.has(id)) {
        id = generateTimelineInstanceId();
    }

    timelineItem.dataset.timelineInstanceId = id;
    timelineInstanceIdRegistry.set(id, timelineItem);
    return id;
}

function incrementTimelineObjectUrlUsage(objectURL) {
    if (!objectURL) {
        return;
    }

    const nextCount = (timelineObjectUrlUsage.get(objectURL) || 0) + 1;
    timelineObjectUrlUsage.set(objectURL, nextCount);

    if (stagedUploadsByObjectUrl.has(objectURL)) {
        setStagedUploadAddedState(objectURL, true);
    }
}

function decrementTimelineObjectUrlUsage(objectURL) {
    if (!objectURL) {
        return;
    }

    const currentCount = timelineObjectUrlUsage.get(objectURL) || 0;
    if (currentCount <= 1) {
        timelineObjectUrlUsage.delete(objectURL);
        if (stagedUploadsByObjectUrl.has(objectURL)) {
            setStagedUploadAddedState(objectURL, false);
        }
    } else {
        timelineObjectUrlUsage.set(objectURL, currentCount - 1);
    }
}

function releaseTimelineInstanceId(timelineItem) {
    if (!timelineItem || !timelineItem.dataset) {
        return;
    }

    const { timelineInstanceId: instanceId } = timelineItem.dataset;
    if (!instanceId) {
        return;
    }

    const owner = timelineInstanceIdRegistry.get(instanceId);
    if (!owner || owner === timelineItem || !owner.isConnected) {
        timelineInstanceIdRegistry.delete(instanceId);
    }
}

function refreshTimelineObjectUrlUsage() {
    timelineObjectUrlUsage.clear();
    timelineInstanceIdRegistry.clear();
    getTimelineItems().forEach((item) => {
        assignTimelineInstanceId(item);
        const objectURL = item?.dataset?.objectUrl || '';
        if (!objectURL) {
            return;
        }
        const nextCount = (timelineObjectUrlUsage.get(objectURL) || 0) + 1;
        timelineObjectUrlUsage.set(objectURL, nextCount);
        if (stagedUploadsByObjectUrl.has(objectURL)) {
            setStagedUploadAddedState(objectURL, true);
        }
    });
}

function createTimelineItemSnapshot(timelineItem) {
    if (!(timelineItem instanceof HTMLElement)) {
        return null;
    }

    assignTimelineInstanceId(timelineItem);

    const template = timelineItem.cloneNode(true);
    sanitizeTimelineItemClone(template);

    const datasetCopy = sanitizeTimelineItemDataset(timelineItem.dataset ? { ...timelineItem.dataset } : {});
    const lane = timelineItem.closest('.timeline-lane');
    const laneIndex = lane ? resolveLaneIndex(lane.dataset.laneIndex) : resolveLaneIndex(timelineItem.dataset?.laneIndex);
    const childIndex = lane ? Array.from(lane.children).indexOf(timelineItem) : -1;
    const startOffsetRaw = Number.parseInt(timelineItem.dataset?.startOffsetMs ?? '', 10);
    const startOffsetMs = Number.isFinite(startOffsetRaw) ? startOffsetRaw : 0;
    const fileType = timelineItem.dataset?.fileType || '';
    const objectUrl = timelineItem.dataset?.objectUrl || '';
    const stagedEntry = objectUrl ? stagedUploadsByObjectUrl.get(objectUrl) : null;

    return {
        template,
        dataset: datasetCopy,
        laneIndex,
        childIndex,
        startOffsetMs,
        fileType,
        objectUrl,
        duration: getTimelineItemPlaybackDuration(timelineItem),
        hasStagedUpload: Boolean(objectUrl && stagedUploadsByObjectUrl.has(objectUrl)),
        needsObjectUrlRefresh: Boolean(objectUrl) && !stagedUploadsByObjectUrl.has(objectUrl) && fileType.startsWith('image/'),
        file: stagedEntry?.file || null,
        wasActive: timelineItem === activeTimelineItem,
    };
}

function getTimelineItemByInstanceId(instanceId) {
    if (!instanceId) {
        return null;
    }

    const owner = timelineInstanceIdRegistry.get(instanceId);
    if (owner?.isConnected) {
        return owner;
    }

    return document.querySelector(`[data-timeline-instance-id="${instanceId}"]`);
}

function normalizeSnapshotDataset(dataset) {
    const entries = Object.entries(dataset || {});
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return entries;
}

function hasTimelineSnapshotChanged(before, after) {
    if (!before || !after) {
        return false;
    }

    const comparableKeys = ['laneIndex', 'childIndex', 'startOffsetMs', 'duration', 'objectUrl'];
    const changed = comparableKeys.some((key) => (before[key] ?? null) !== (after[key] ?? null));
    if (changed) {
        return true;
    }

    const previousDataset = normalizeSnapshotDataset(before.dataset);
    const nextDataset = normalizeSnapshotDataset(after.dataset);
    if (previousDataset.length !== nextDataset.length) {
        return true;
    }

    for (let index = 0; index < previousDataset.length; index += 1) {
        const [prevKey, prevValue] = previousDataset[index];
        const [nextKey, nextValue] = nextDataset[index];
        if (prevKey !== nextKey || prevValue !== nextValue) {
            return true;
        }
    }

    return false;
}

function beginTimelineItemChangeTracking(timelineItem) {
    if (!(timelineItem instanceof HTMLElement) || timelineItemEditSnapshots.has(timelineItem)) {
        return;
    }

    const snapshot = createTimelineItemSnapshot(timelineItem);
    if (snapshot) {
        timelineItemEditSnapshots.set(timelineItem, snapshot);
    }
}

function finalizeTimelineItemChangeTracking(timelineItem) {
    const previousSnapshot = timelineItemEditSnapshots.get(timelineItem);
    timelineItemEditSnapshots.delete(timelineItem);

    if (!previousSnapshot) {
        return;
    }

    const latestSnapshot = createTimelineItemSnapshot(timelineItem);
    if (!latestSnapshot || !hasTimelineSnapshotChanged(previousSnapshot, latestSnapshot)) {
        return;
    }

    const instanceId = latestSnapshot.dataset?.timelineInstanceId
        || previousSnapshot.dataset?.timelineInstanceId
        || null;

    pushTimelineUndoEntry({
        type: 'edit-item',
        undo: () => {
            const target = instanceId ? getTimelineItemByInstanceId(instanceId) : timelineItem;
            if (target && target.isConnected) {
                removeTimelineItem(target, { recordUndo: false, skipObjectUrlRelease: true });
            }
            const restored = restoreTimelineItemFromSnapshot(previousSnapshot, {
                activate: previousSnapshot.wasActive,
                focus: previousSnapshot.wasActive,
                loadPreview: previousSnapshot.wasActive,
                scrollIntoView: true,
                preserveInstanceId: true,
            });
            if (restored && instanceId) {
                restored.dataset.timelineInstanceId = instanceId;
                timelineInstanceIdRegistry.set(instanceId, restored);
            }
            return restored;
        },
    });
}

function refreshTimelineItemSnapshotResources(timelineItem, snapshot) {
    if (!timelineItem) {
        return;
    }

    const fileType = timelineItem.dataset?.fileType || snapshot?.fileType || '';
    const objectUrl = timelineItem.dataset?.objectUrl || snapshot?.objectUrl || '';

    if (fileType.startsWith('audio/')) {
        const waveformCanvas = timelineItem.querySelector('.timeline-waveform canvas');
        if (waveformCanvas) {
            const stagedEntry = objectUrl ? stagedUploadsByObjectUrl.get(objectUrl) : null;
            const file = stagedEntry?.file || snapshot?.file || null;
            if (file) {
                prepareAudioTimelineVisuals(timelineItem, file, objectUrl, waveformCanvas).catch((error) => {
                    console.warn('Failed to restore audio waveform.', error);
                });
            } else {
                const cacheEntry = objectUrl ? audioWaveformByObjectUrl.get(objectUrl) : null;
                if (cacheEntry) {
                    applyCachedWaveform(waveformCanvas, cacheEntry, { timelineItem });
                    attachAudioWaveformResizeObserver(timelineItem, waveformCanvas, objectUrl);
                }
            }
        }
    } else if (fileType.startsWith('image/svg')) {
        const snapshotDataset = snapshot?.dataset || {};
        const snapshotTransform = typeof snapshotDataset.previewImageTransform === 'string'
            ? snapshotDataset.previewImageTransform
            : '';
        const snapshotAutoFit = Object.prototype.hasOwnProperty.call(snapshotDataset, 'autoFitText')
            ? snapshotDataset.autoFitText
            : undefined;

        regenerateDefaultTextOverlayAssets(timelineItem);

        if (typeof snapshotAutoFit === 'string') {
            timelineItem.dataset.autoFitText = snapshotAutoFit;
        }

        if (snapshotTransform) {
            timelineItem.dataset.previewImageTransform = snapshotTransform;
            if (timelineItem === activeTimelineItem) {
                if (typeof tryRestorePreviewImageTransform === 'function') {
                    tryRestorePreviewImageTransform(timelineItem);
                }
                if (typeof refreshActiveOverlayLayers === 'function') {
                    refreshActiveOverlayLayers();
                }
            }
        }
    }
}

function restoreTimelineItemFromSnapshot(snapshot, options = {}) {
    if (!snapshot || !snapshot.template) {
        return null;
    }

    const targetLaneIndex = Number.isFinite(options.laneIndex)
        ? options.laneIndex
        : snapshot.laneIndex;
    const lane = ensureTimelineLane(targetLaneIndex);
    if (!lane) {
        return null;
    }

    const insertionIndexSource = Number.isFinite(options.childIndex)
        ? options.childIndex
        : snapshot.childIndex;
    const clampedIndex = Math.max(0, Math.min(insertionIndexSource, lane.children.length));
    const referenceNode = lane.children[clampedIndex] || null;

    const baseStart = Number.isFinite(options.startOffsetMs)
        ? options.startOffsetMs
        : snapshot.startOffsetMs;
    const startOffsetMs = Math.max(0, Math.round(baseStart));

    const newItem = snapshot.template.cloneNode(true);
    sanitizeTimelineItemClone(newItem);
    Object.entries(snapshot.dataset || {}).forEach(([key, value]) => {
        if (typeof value === 'string') {
            newItem.dataset[key] = value;
        }
    });

    if (options.preserveInstanceId === false) {
        delete newItem.dataset.timelineInstanceId;
    }

    assignTimelineInstanceId(newItem);

    newItem.dataset.laneIndex = lane.dataset.laneIndex || String(targetLaneIndex);
    newItem.dataset.startOffsetMs = String(startOffsetMs);

    if (snapshot.objectUrl && snapshot.needsObjectUrlRefresh) {
        delete newItem.dataset.objectUrl;
    } else if (snapshot.objectUrl) {
        newItem.dataset.objectUrl = snapshot.objectUrl;
    }

    lane.insertBefore(newItem, referenceNode);

    initializeTimelineItem(newItem);
    const removeButton = newItem.querySelector('.timeline-item-remove');
    registerTimelineItemInteractions(newItem, removeButton);
    refreshTimelineItemSnapshotResources(newItem, snapshot);

    flushTimelineLaneReflow(lane);
    scheduleTimelineLaneReflow(lane);
    updateTimelineEmptyState();
    updateActiveTimelineIndicators();
    markExportPlaybackContextDirty({ refreshSummary: true });
    refreshImageDurationApplyAllAvailability();

    const resolvedObjectUrl = newItem.dataset.objectUrl || snapshot.objectUrl || '';
    if (resolvedObjectUrl) {
        incrementTimelineObjectUrlUsage(resolvedObjectUrl);
    }

    if (options.scrollIntoView !== false) {
        scrollTimelineItemIntoView(newItem);
    }

    if (options.activate) {
        stopTimelinePlayback();
        setActiveTimelineItem(newItem, { focus: Boolean(options.focus) });
        if (options.loadPreview !== false) {
            loadPreviewFromTimeline(newItem, null, { focusTextEditor: true });
        }
    }

    return newItem;
}

function pushTimelineUndoEntry(entry) {
    if (!entry || typeof entry.undo !== 'function') {
        return;
    }
    timelineUndoStack.push(entry);
    if (timelineUndoStack.length > TIMELINE_UNDO_STACK_LIMIT) {
        timelineUndoStack.shift();
    }
}

function undoLastTimelineAction() {
    if (!timelineUndoStack.length) {
        return false;
    }

    const entry = timelineUndoStack.pop();
    try {
        const result = entry.undo();
        if (result && typeof result.then === 'function') {
            result.catch((error) => {
                console.error('Failed to undo timeline action.', error);
            });
        }
    } catch (error) {
        console.error('Failed to undo timeline action.', error);
        return false;
    }
    return true;
}

function commitActiveTextTimelineItemEdits() {
    if (!activeTimelineItem
        || typeof isDefaultTextTimelineItem !== 'function'
        || !isDefaultTextTimelineItem(activeTimelineItem)
        || typeof commitPreviewTextEditorContent !== 'function') {
        return;
    }

    if (typeof previewTextEditorState === 'object'
        && previewTextEditorState
        && previewTextEditorState.isEnabled
        && previewTextEditorState.currentItem === activeTimelineItem) {
        commitPreviewTextEditorContent({ force: true });
    }
}

function copyActiveTimelineItemToClipboard() {
    if (!activeTimelineItem || !activeTimelineItem.isConnected) {
        return false;
    }

    commitActiveTextTimelineItemEdits();

    if (typeof persistPreviewImageTransformForActiveTimelineItem === 'function') {
        persistPreviewImageTransformForActiveTimelineItem({ allowKeyframeUpdate: true });
    }

    const snapshot = createTimelineItemSnapshot(activeTimelineItem);
    if (!snapshot) {
        return false;
    }
    timelineClipboardSnapshot = snapshot;
    return true;
}

function pasteTimelineClipboard() {
    if (!timelineClipboardSnapshot) {
        return false;
    }

    const baseItem = (activeTimelineItem && activeTimelineItem.isConnected)
        ? activeTimelineItem
        : null;

    let laneIndex = timelineClipboardSnapshot.laneIndex;
    let childIndex = timelineClipboardSnapshot.childIndex;
    let startOffsetMs = timelineClipboardSnapshot.startOffsetMs;

    const isTextLayerSnapshot = Boolean(
        timelineClipboardSnapshot?.template?.classList
            && timelineClipboardSnapshot.template.classList.contains('timeline-item--text'),
    );

    if (baseItem) {
        const laneCache = (typeof getTimelineLaneEntryCache === 'function')
            ? getTimelineLaneEntryCache()
            : null;
        const baseLaneIndex = resolveLaneIndex(baseItem.dataset?.laneIndex);
        const baseLane = baseItem.closest('.timeline-lane');
        const baseChildIndex = baseLane ? Array.from(baseLane.children).indexOf(baseItem) : -1;
        const baseIsTextItem = baseItem.classList?.contains('timeline-item--text');

        if (isTextLayerSnapshot) {
            if (baseIsTextItem && baseLane) {
                laneIndex = baseLaneIndex;
                childIndex = baseChildIndex >= 0 ? baseChildIndex + 1 : baseLane.children.length;
            } else {
                laneIndex = timelineClipboardSnapshot.laneIndex;
                childIndex = timelineClipboardSnapshot.childIndex;
            }
            startOffsetMs = timelineClipboardSnapshot.startOffsetMs;
        } else {
            laneIndex = baseLaneIndex;
            if (baseLane) {
                childIndex = baseChildIndex + 1;
            }
            const baseStart = getTimelineItemStartTime(baseItem, laneCache);
            const baseDuration = getTimelineItemPlaybackDuration(baseItem);
            if (Number.isFinite(baseStart) && Number.isFinite(baseDuration)) {
                startOffsetMs = Math.max(0, Math.round(baseStart + baseDuration));
            }
        }
    } else {
        const lane = ensureTimelineLane(laneIndex);
        if (lane) {
            childIndex = lane.children.length;
        }
    }

    const newItem = restoreTimelineItemFromSnapshot(timelineClipboardSnapshot, {
        laneIndex,
        childIndex,
        startOffsetMs,
        activate: true,
        focus: true,
        loadPreview: true,
        scrollIntoView: true,
        preserveInstanceId: false,
    });

    if (!newItem) {
        return false;
    }

    pushTimelineUndoEntry({
        type: 'add-item',
        undo: () => {
            if (newItem && newItem.isConnected) {
                removeTimelineItem(newItem, { recordUndo: false });
            }
        },
    });

    return true;
}

function removeTimelineItem(timelineItem, options = {}) {
    if (!(timelineItem instanceof HTMLElement)) {
        return false;
    }

    const { recordUndo = true, skipObjectUrlRelease = false } = options;
    const snapshot = recordUndo ? createTimelineItemSnapshot(timelineItem) : null;
    const parentLane = timelineItem.closest('.timeline-lane');
    const fileType = timelineItem.dataset?.fileType || '';
    const objectUrl = timelineItem.dataset?.objectUrl || '';
    const hasStagedUpload = objectUrl && stagedUploadsByObjectUrl.has(objectUrl);
    const wasActive = timelineItem === activeTimelineItem;

    detachAudioWaveformResizeObserver(timelineItem);
    releaseTimelineInstanceId(timelineItem);
    if (typeof detachTimelineItemVolumeControl === 'function') {
        detachTimelineItemVolumeControl(timelineItem);
    }
    releaseTimelineCanvasCustomImage(timelineItem);
    timelineItem.remove();

    if (parentLane) {
        flushTimelineLaneReflow(parentLane);
        scheduleTimelineLaneReflow(parentLane);
    }

    if (objectUrl) {
        decrementTimelineObjectUrlUsage(objectUrl);
        if (fileType.startsWith('image/')) {
            releaseTimelineImage(objectUrl);
        } else if (fileType.startsWith('video/')) {
            releaseTimelineVideo(objectUrl);
        } else if (fileType.startsWith('audio/')) {
            releaseTimelineAudio(objectUrl);
        }
        if (!hasStagedUpload && !skipObjectUrlRelease) {
            try {
                URL.revokeObjectURL(objectUrl);
            } catch (error) {
                // Ignore revoke failures.
            }
        }
    }

    if (fileType.startsWith('audio/')) {
        stopPreviewAudio({ resetTime: true });
    }

    if (wasActive) {
        clearPreview();
    }

    cleanupEmptyTimelineLanes();
    updateTimelineEmptyState();
    updateActiveTimelineIndicators();
    markExportPlaybackContextDirty({ refreshSummary: true });
    refreshImageDurationApplyAllAvailability();

    if (recordUndo && snapshot) {
        pushTimelineUndoEntry({
            type: 'remove-item',
            undo: () => {
                const restored = restoreTimelineItemFromSnapshot(snapshot, {
                    activate: snapshot.wasActive,
                    focus: snapshot.wasActive,
                    loadPreview: snapshot.wasActive,
                    scrollIntoView: true,
                });
                if (restored && snapshot.wasActive) {
                    stopTimelinePlayback();
                    loadPreviewFromTimeline(restored, null, { focusTextEditor: true });
                }
            },
        });
    }

    return true;
}

const TEXT_LAYER_DUPLICATE_OFFSET_FRACTION = 0.02;

function offsetTextLayerTransform(dataset) {
    if (!dataset || typeof dataset.previewImageTransform !== 'string') {
        return;
    }

    let transform;
    try {
        transform = JSON.parse(dataset.previewImageTransform);
    } catch (error) {
        transform = null;
    }

    if (!transform || typeof transform !== 'object') {
        return;
    }

    const offset = TEXT_LAYER_DUPLICATE_OFFSET_FRACTION;

    const width = Number.isFinite(transform.width) ? transform.width : 0;
    const height = Number.isFinite(transform.height) ? transform.height : 0;
    const maxLeft = Math.max(0, 1 - Math.max(0, width));
    const maxTop = Math.max(0, 1 - Math.max(0, height));

    const originalLeft = Number.isFinite(transform.left) ? transform.left : 0;
    const originalTop = Number.isFinite(transform.top) ? transform.top : 0;

    let nextLeft = originalLeft + offset;
    let nextTop = originalTop + offset;

    if (nextLeft > maxLeft) {
        nextLeft = Math.max(0, originalLeft - offset);
    }
    if (nextTop > maxTop) {
        nextTop = Math.max(0, originalTop - offset);
    }

    const clampedLeft = Math.min(Math.max(nextLeft, 0), maxLeft);
    const clampedTop = Math.min(Math.max(nextTop, 0), maxTop);

    if (Number.isFinite(clampedLeft)) {
        transform.left = clampedLeft;
    }
    if (Number.isFinite(clampedTop)) {
        transform.top = clampedTop;
    }

    dataset.previewImageTransform = JSON.stringify(transform);
}

function duplicateActiveTextTimelineItem() {
    if (!activeTimelineItem || !activeTimelineItem.isConnected) {
        return false;
    }

    if (typeof isDefaultTextTimelineItem !== 'function'
        || !isDefaultTextTimelineItem(activeTimelineItem)) {
        return false;
    }

    commitActiveTextTimelineItemEdits();

    const snapshot = createTimelineItemSnapshot(activeTimelineItem);
    if (!snapshot) {
        return false;
    }

    const datasetCopy = snapshot.dataset ? { ...snapshot.dataset } : {};
    offsetTextLayerTransform(datasetCopy);

    const lane = activeTimelineItem.closest('.timeline-lane');
    const laneIndex = lane ? resolveLaneIndex(lane.dataset.laneIndex) : snapshot.laneIndex;
    let childIndex = snapshot.childIndex;
    if (lane) {
        const siblings = Array.from(lane.children);
        const baseIndex = siblings.indexOf(activeTimelineItem);
        childIndex = baseIndex >= 0 ? baseIndex + 1 : siblings.length;
    }

    const duplicateSnapshot = {
        ...snapshot,
        dataset: datasetCopy,
        laneIndex,
        childIndex,
    };

    const newItem = restoreTimelineItemFromSnapshot(duplicateSnapshot, {
        laneIndex,
        childIndex,
        startOffsetMs: snapshot.startOffsetMs,
        activate: true,
        focus: true,
        loadPreview: true,
        scrollIntoView: true,
        preserveInstanceId: false,
    });

    if (!newItem) {
        return false;
    }

    pushTimelineUndoEntry({
        type: 'duplicate-text-item',
        undo: () => {
            if (newItem && newItem.isConnected) {
                removeTimelineItem(newItem, { recordUndo: false });
            }
        },
    });

    return true;
}

const TIMELINE_SHORTCUT_HANDLERS = Object.freeze({
    c: () => copyActiveTimelineItemToClipboard(),
    v: () => pasteTimelineClipboard(),
    z: (event) => (event.shiftKey ? false : undoLastTimelineAction()),
    d: () => duplicateActiveTextTimelineItem(),
});

const DEFAULT_TEXT_SHORTCUT_KEYS = new Set(['c', 'v', 'z', 'd']);

function handleTimelineKeyboardShortcuts(event) {
    if (!event || event.defaultPrevented || event.repeat) {
        return;
    }

    const isModifierPressed = event.ctrlKey || event.metaKey;
    if (!isModifierPressed || event.altKey) {
        return;
    }

    const key = String(event.key || '').toLowerCase();
    if (!key) {
        return;
    }

    const handler = TIMELINE_SHORTCUT_HANDLERS[key];

    const targetNode = event.target;
    const targetIsPreviewTextEditor = Boolean(
        previewTextEditor
            && targetNode
            && typeof previewTextEditor.contains === 'function'
            && (targetNode === previewTextEditor || previewTextEditor.contains(targetNode))
    );

    const activeDefaultTextItem = typeof getActiveDefaultTextTimelineItem === 'function'
        ? getActiveDefaultTextTimelineItem()
        : null;

    let allowTextEditorShortcut = Boolean(
        handler
            && targetIsPreviewTextEditor
            && activeDefaultTextItem
            && DEFAULT_TEXT_SHORTCUT_KEYS.has(key),
    );

    let selectionWithinEditor = false;
    if (targetIsPreviewTextEditor && typeof window !== 'undefined' && typeof window.getSelection === 'function') {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
            const anchorElement = selection.anchorNode instanceof Element
                ? selection.anchorNode
                : selection.anchorNode?.parentElement;
            const focusElement = selection.focusNode instanceof Element
                ? selection.focusNode
                : selection.focusNode?.parentElement;
            selectionWithinEditor = (anchorElement && previewTextEditor.contains(anchorElement))
                || (focusElement && previewTextEditor.contains(focusElement));
        }
    }

    if (allowTextEditorShortcut && selectionWithinEditor && key !== 'c' && key !== 'v') {
        allowTextEditorShortcut = false;
    }

    if (!allowTextEditorShortcut && isTimelineShortcutTargetEditable(event.target)) {
        return;
    }

    if (typeof handler !== 'function') {
        return;
    }

    const handled = handler(event) === true;
    if (handled) {
        const allowDefaultCopy = targetIsPreviewTextEditor && key === 'c' && selectionWithinEditor;
        if (!allowDefaultCopy) {
            event.preventDefault();
        }
    }
}

function loadPreviewFromTimeline(timelineItem, overlayEntriesOverride = null, options = {}) {
    if (!timelineItem) {
        clearPreview();
        return;
    }

    const fileType = timelineItem.dataset.fileType || '';
    const objectURL = timelineItem.dataset.objectUrl;

    const laneCache = (typeof getTimelineLaneEntryCache === 'function')
        ? getTimelineLaneEntryCache()
        : null;
    const overlayEntries = getOverlayEntriesForTimelineItem(
        timelineItem,
        overlayEntriesOverride,
        laneCache,
    );
    renderPreviewOverlayLayers(timelineItem, overlayEntries);

    if (!objectURL) {
        return;
    }

    previewPlaceholder.hidden = true;
    if (previewPlaceholder) {
        previewPlaceholder.textContent = defaultPreviewPlaceholderText;
    }

    if (isTimelinePlaying) {
        stopTimelinePlayback();
    }

    if (fileType.startsWith('video/')) {
        const audioSettings = getTimelineItemAudioSettings(timelineItem);
        setPreviewMode('has-video');
        resetPreviewScroll();
        setPreviewImageVisibility(false);
        previewImage.removeAttribute('src');
        previewVideo.hidden = false;
        cancelPreviewAudioEnvelope({ restoreVolume: false });
        if (previewVideo.src !== objectURL) {
            previewVideo.pause();
            previewVideo.src = objectURL;
            previewVideo.load();
        }
        applyMasterVolumeToPreview(audioSettings.volumePercent, { mediaElement: previewVideo });
        playVideoButton.textContent = 'Play Back';
        applyImageBlurToPreview(0);
    } else if (fileType.startsWith('image/')) {
        cancelPreviewExitAnimation({ forceRestore: true });
        setPreviewMode('has-image');
        previewVideo.pause();
        previewVideo.hidden = true;
        previewVideo.removeAttribute('src');
        setPreviewImageVisibility(true);
        const imageBlurAmount = getTimelineItemImageBlur(timelineItem, 0);
        applyImageBlurToPreview(imageBlurAmount);
        void revealPreviewImageSource(objectURL, { immediate: true });
        resetPreviewScroll();
        playVideoButton.textContent = 'Play Back';
        applyActiveImageKeyframe({ deferReset: true });
    } else if (fileType.startsWith('audio/')) {
        stopPreviewAudio({ resetTime: true });
        setPreviewMode(null);
        previewVideo.pause();
        previewVideo.hidden = true;
        previewVideo.removeAttribute('src');
        if (previewPlaceholder) {
            previewPlaceholder.hidden = false;
            previewPlaceholder.textContent = 'Audio clip ready — press Play Back to hear it';
        }
        if (previewAudio && objectURL && previewAudio.src !== objectURL) {
            previewAudio.src = objectURL;
            try {
                previewAudio.load();
            } catch (error) {
                // Ignore preload errors for audio preview.
            }
        }
        playVideoButton.textContent = 'Play Back';
        applyImageBlurToPreview(0);
    }

    applyCanvasSettingsToPreview(timelineItem);
    if (typeof refreshPreviewAudioMix === 'function') {
        const mixOptions = {
            entries: overlayEntries,
            activeItem: timelineItem,
        };
        if (fileType.startsWith('audio/')) {
            mixOptions.overlayItem = timelineItem;
        }
        refreshPreviewAudioMix(mixOptions);
    }
    const shouldFocusTextEditor = Boolean(options.focusTextEditor);
    const autoFocusTextEditor = options.autoFocus;
    const placeTextCursorAtEnd = options.placeTextCursorAtEnd !== false;
    syncPreviewTextEditorState(timelineItem, {
        skipCommit: true,
        forceFocus: shouldFocusTextEditor,
        autoFocus: autoFocusTextEditor,
        placeCursorAtEnd: placeTextCursorAtEnd,
    });
}

function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB'];
    const exponent = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1,
    );
    const size = bytes / (1024 ** exponent);
    return `${size.toFixed(size >= 100 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function setStagedUploadAddedState(objectURL, isAdded) {
    if (!objectURL || !stagedUploadsByObjectUrl.has(objectURL)) {
        return;
    }

    const entry = stagedUploadsByObjectUrl.get(objectURL);
    const { listItem, addButton, file, previewController } = entry;

    if (!listItem || !addButton) {
        return;
    }

    if (isAdded) {
        listItem.classList.add('is-added');
        addButton.disabled = true;
        addButton.innerHTML = '<span aria-hidden="true">✓</span>';
        addButton.setAttribute('aria-label', `${file.name} added to timeline`);
        if (previewController && typeof previewController.setDisabled === 'function') {
            previewController.setDisabled(true);
            if (typeof previewController.pause === 'function') {
                previewController.pause();
            }
        }
    } else {
        listItem.classList.remove('is-added');
        addButton.disabled = false;
        addButton.innerHTML = '<span aria-hidden="true">+</span>';
        addButton.setAttribute('aria-label', `Add ${file.name} to timeline`);
        if (previewController && typeof previewController.setDisabled === 'function') {
            previewController.setDisabled(false);
        }
    }
}

function pauseUploadPreviewVideo(video) {
    if (!(video instanceof HTMLVideoElement)) {
        return;
    }

    try {
        video.pause();
    } catch (error) {
        // Ignore pause failures.
    }

    try {
        if (Number.isFinite(video.currentTime)) {
            video.currentTime = 0;
        }
    } catch (error) {
        // Some browsers may throw if the media is not seekable yet.
    }
}

let uploadPreviewIntersectionObserver = null;
let uploadPreviewObserverUnavailable = false;
const uploadPreviewControllersByElement = new WeakMap();
let uploadPreviewListObserver = null;

function ensureUploadPreviewIntersectionObserver() {
    if (uploadPreviewIntersectionObserver) {
        return uploadPreviewIntersectionObserver;
    }

    if (uploadPreviewObserverUnavailable) {
        return null;
    }

    if (typeof IntersectionObserver !== 'function') {
        uploadPreviewObserverUnavailable = true;
        return null;
    }

    uploadPreviewIntersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            const controller = uploadPreviewControllersByElement.get(entry.target);
            if (!controller) {
                return;
            }

            const isVisible = entry.isIntersecting && entry.intersectionRatio > 0;
            controller.setVisible(isVisible);

            if (!isVisible && typeof controller.pause === 'function') {
                controller.pause();
            }
        });
    }, {
        threshold: 0.25,
    });

    return uploadPreviewIntersectionObserver;
}

function createUploadPreviewController(listItem, video) {
    if (!(listItem instanceof HTMLElement) || !(video instanceof HTMLVideoElement)) {
        return null;
    }

    const controller = {
        listItem,
        video,
        isVisible: false,
        isDisabled: false,
        isPlaying: false,
        isHovering: false,
        hasFocus: false,
    };

    const observer = ensureUploadPreviewIntersectionObserver();

    const refreshPlayback = () => {
        const shouldPlay = controller.isVisible
            && !controller.isDisabled
            && (controller.isHovering || controller.hasFocus);

        if (shouldPlay) {
            if (controller.isPlaying) {
                return;
            }

            const playPromise = controller.video.play();
            if (playPromise && typeof playPromise.then === 'function') {
                playPromise.then(() => {
                    controller.isPlaying = true;
                }).catch(() => {
                    controller.isPlaying = false;
                });
            } else {
                controller.isPlaying = true;
            }
        } else {
            controller.pause();
        }
    };

    const handlePointerEnter = () => {
        controller.isHovering = true;
        refreshPlayback();
    };

    const handlePointerLeave = () => {
        controller.isHovering = false;
        refreshPlayback();
    };

    const handleFocusIn = () => {
        controller.hasFocus = true;
        refreshPlayback();
    };

    const handleFocusOut = (event) => {
        if (event && event.relatedTarget && controller.listItem.contains(event.relatedTarget)) {
            return;
        }
        controller.hasFocus = false;
        refreshPlayback();
    };

    const handleLoadedMetadata = () => {
        if (!controller.isHovering && !controller.hasFocus) {
            controller.pause();
        }
    };

    controller.setVisible = (visible) => {
        controller.isVisible = Boolean(visible);
        refreshPlayback();
    };

    controller.setDisabled = (disabled) => {
        controller.isDisabled = Boolean(disabled);
        refreshPlayback();
    };

    controller.pause = () => {
        pauseUploadPreviewVideo(controller.video);
        controller.isPlaying = false;
    };

    controller.cleanup = () => {
        uploadPreviewControllersByElement.delete(controller.listItem);
        if (observer) {
            try {
                observer.unobserve(controller.listItem);
            } catch (error) {
                // Ignore failures when unobserving.
            }
        }
        controller.listItem.removeEventListener('mouseenter', handlePointerEnter);
        controller.listItem.removeEventListener('mouseleave', handlePointerLeave);
        controller.listItem.removeEventListener('focusin', handleFocusIn);
        controller.listItem.removeEventListener('focusout', handleFocusOut);
        controller.video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        controller.isHovering = false;
        controller.hasFocus = false;
        controller.isVisible = false;
        controller.isDisabled = false;
        controller.pause();
    };

    listItem.addEventListener('mouseenter', handlePointerEnter);
    listItem.addEventListener('mouseleave', handlePointerLeave);
    listItem.addEventListener('focusin', handleFocusIn);
    listItem.addEventListener('focusout', handleFocusOut);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    uploadPreviewControllersByElement.set(listItem, controller);

    if (observer) {
        observer.observe(listItem);
    } else {
        controller.isVisible = true;
    }

    controller.pause();

    return controller;
}

function handleUploadGalleryItemRemoval(item) {
    if (!(item instanceof HTMLElement)) {
        return;
    }

    const controller = uploadPreviewControllersByElement.get(item);
    if (controller && typeof controller.cleanup === 'function') {
        controller.cleanup();
    }

    const objectURL = item.dataset?.objectUrl;
    if (objectURL && stagedUploadsByObjectUrl.has(objectURL)) {
        const entry = stagedUploadsByObjectUrl.get(objectURL);
        if (entry?.previewController
            && entry.previewController !== controller
            && typeof entry.previewController.cleanup === 'function') {
            entry.previewController.cleanup();
        }
        stagedUploadsByObjectUrl.delete(objectURL);
    }

    updateUploadGalleryEmptyState();
}

function ensureUploadGalleryListObserver() {
    if (uploadPreviewListObserver || !uploadGalleryList || typeof MutationObserver !== 'function') {
        return uploadPreviewListObserver;
    }

    uploadPreviewListObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.removedNodes.forEach((node) => {
                if (!(node instanceof HTMLElement)) {
                    return;
                }

                if (node.classList && node.classList.contains('upload-gallery__item')) {
                    handleUploadGalleryItemRemoval(node);
                }

                if (typeof node.querySelectorAll === 'function') {
                    node.querySelectorAll('.upload-gallery__item').forEach((child) => {
                        handleUploadGalleryItemRemoval(child);
                    });
                }
            });
        });
    });

    try {
        uploadPreviewListObserver.observe(uploadGalleryList, { childList: true });
    } catch (error) {
        // Ignore observer failures.
    }

    return uploadPreviewListObserver;
}

async function stageUpload(file) {
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    const isAudio = file.type.startsWith('audio/');

    if (!isVideo && !isImage && !isAudio) {
        alert('Unsupported file type. Please upload an image, video, or audio file.');
        return;
    }

    const objectURL = URL.createObjectURL(file);
    if (!uploadGalleryList) {
        return;
    }

    ensureUploadGalleryListObserver();

    const listItem = document.createElement('li');
    listItem.className = 'upload-gallery__item';
    listItem.dataset.objectUrl = objectURL;

    const previewWrapper = document.createElement('div');
    previewWrapper.className = 'upload-gallery__preview';

    let previewController = null;

    if (isImage) {
        const img = document.createElement('img');
        img.src = objectURL;
        img.alt = file.name;
        img.loading = 'lazy';
        try {
            img.decoding = 'async';
        } catch (error) {
            // Ignore if the browser does not support decoding hints.
        }
        previewWrapper.appendChild(img);
    } else if (isVideo) {
        const video = document.createElement('video');
        video.src = objectURL;
        video.muted = true;
        video.playsInline = true;
        previewWrapper.appendChild(video);
        previewController = createUploadPreviewController(listItem, video);
    } else if (isAudio) {
        const icon = document.createElement('span');
        icon.className = 'upload-gallery__audio-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '🎵';
        previewWrapper.appendChild(icon);
    }

    const meta = document.createElement('div');
    meta.className = 'upload-gallery__meta';

    const name = document.createElement('span');
    name.className = 'upload-gallery__name';
    name.title = file.name;
    name.textContent = file.name;

    const size = document.createElement('span');
    size.className = 'upload-gallery__size';
    size.textContent = formatFileSize(file.size);

    meta.append(name, size);

    const actions = document.createElement('div');
    actions.className = 'upload-gallery__actions';

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'upload-gallery__add';
    addButton.setAttribute('aria-label', `Add ${file.name} to timeline`);
    addButton.innerHTML = '<span aria-hidden="true">+</span>';

    addButton.addEventListener('click', async () => {
        if (addButton.disabled) {
            return;
        }

        addButton.disabled = true;
        if (previewController) {
            if (typeof previewController.setDisabled === 'function') {
                previewController.setDisabled(true);
            }
            if (typeof previewController.pause === 'function') {
                previewController.pause();
            }
        }
        try {
            await addToTimeline(file, objectURL);
            setStagedUploadAddedState(objectURL, true);
        } catch (error) {
            console.error('Failed to add upload to timeline.', error);
            addButton.disabled = false;
            if (previewController && typeof previewController.setDisabled === 'function') {
                previewController.setDisabled(false);
            }
        }
    });

    actions.appendChild(addButton);

    listItem.append(previewWrapper, meta, actions);
    uploadGalleryList.appendChild(listItem);

    stagedUploadsByObjectUrl.set(objectURL, {
        file,
        listItem,
        addButton,
        previewController,
    });
    setStagedUploadAddedState(objectURL, false);

    if (uploadGallery) {
        uploadGallery.hidden = false;
    }

    updateUploadGalleryEmptyState();
}

async function generateImageThumbnail(objectURL, maxWidth = 90, maxHeight = 60) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
            const width = Math.max(1, Math.round(img.width * scale));
            const height = Math.max(1, Math.round(img.height * scale));

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(objectURL);
                return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(objectURL);
        img.src = objectURL;
    });
}

const AUDIO_WAVEFORM_HEIGHT = 80;
const audioWaveformByObjectUrl = new Map();
let audioDecodeContextLock = Promise.resolve();
let sharedAudioDecodeContext = null;
let sharedAudioDecodeContextPromise = null;
let sharedAudioDecodeContextClosing = null;
const audioWaveformResizeObservers = new WeakMap();

async function ensureSharedAudioDecodeContext(AudioContextConstructor) {
    if (!AudioContextConstructor) {
        return null;
    }

    if (sharedAudioDecodeContextClosing) {
        await sharedAudioDecodeContextClosing;
    }

    if (sharedAudioDecodeContext && sharedAudioDecodeContext.state === 'closed') {
        sharedAudioDecodeContext = null;
        sharedAudioDecodeContextPromise = null;
    }

    if (sharedAudioDecodeContext) {
        return sharedAudioDecodeContext;
    }

    if (!sharedAudioDecodeContextPromise) {
        sharedAudioDecodeContextPromise = Promise.resolve().then(() => {
            const context = new AudioContextConstructor();
            sharedAudioDecodeContext = context;
            return context;
        }).catch((error) => {
            sharedAudioDecodeContextPromise = null;
            sharedAudioDecodeContext = null;
            throw error;
        });
    }

    return sharedAudioDecodeContextPromise;
}

function resetSharedAudioDecodeContext() {
    if (sharedAudioDecodeContextClosing) {
        return sharedAudioDecodeContextClosing;
    }

    const context = sharedAudioDecodeContext;
    sharedAudioDecodeContext = null;
    sharedAudioDecodeContextPromise = null;

    if (!context || typeof context.close !== 'function') {
        return Promise.resolve();
    }

    let closingPromise = null;
    try {
        closingPromise = Promise.resolve(context.close());
    } catch (error) {
        closingPromise = Promise.resolve();
    }

    closingPromise = closingPromise.catch(() => {}).finally(() => {
        if (sharedAudioDecodeContextClosing === closingPromise) {
            sharedAudioDecodeContextClosing = null;
        }
    });

    sharedAudioDecodeContextClosing = closingPromise;
    return closingPromise;
}

function getWaveformCssWidth(canvas, timelineItem, widthOverride) {
    if (Number.isFinite(widthOverride) && widthOverride > 0) {
        return Math.max(1, Math.round(widthOverride));
    }
    if (timelineItem instanceof HTMLElement) {
        const rect = timelineItem.getBoundingClientRect();
        if (rect.width > 0) {
            return Math.max(1, Math.round(rect.width));
        }
    }
    if (canvas) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0) {
            return Math.max(1, Math.round(rect.width));
        }
    }
    return AUDIO_WAVEFORM_HEIGHT * 4;
}

function getWaveformCssHeight(canvas, heightOverride) {
    if (Number.isFinite(heightOverride) && heightOverride > 0) {
        return Math.max(1, Math.round(heightOverride));
    }
    if (canvas) {
        const rect = canvas.getBoundingClientRect();
        if (rect.height > 0) {
            return Math.max(1, Math.round(rect.height));
        }
    }
    return AUDIO_WAVEFORM_HEIGHT;
}

function ensureAudioTimelineLane() {
    if (!timelineLaneList) {
        return null;
    }
    const lanes = getTimelineLanes();
    const existing = lanes.find((lane) => lane?.classList?.contains('timeline-lane--audio'));
    if (existing) {
        return existing;
    }
    const lane = document.createElement('div');
    lane.className = 'timeline-lane timeline-lane--audio';
    timelineLaneList.appendChild(lane);
    refreshTimelineLaneIndices();
    return lane;
}

async function decodeAudioBufferFromFile(file) {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor || !file) {
        return null;
    }

    const arrayBuffer = await file.arrayBuffer();

    return audioDecodeContextLock = audioDecodeContextLock.then(async () => {
        try {
            const audioContext = await ensureSharedAudioDecodeContext(AudioContextConstructor);

            if (!audioContext) {
                return null;
            }

            const decodeAudioData = audioContext.decodeAudioData;
            const decodeAudioDataArity = typeof decodeAudioData === 'function'
                ? decodeAudioData.length
                : 0;

            // Older implementations that require callbacks sometimes mutate the buffer
            // argument, so defensively clone only when the callback signature is detected.
            const shouldCloneArrayBufferForDecode = typeof decodeAudioData === 'function'
                && decodeAudioDataArity >= 2
                && typeof arrayBuffer.slice === 'function';

            const bufferForDecoding = shouldCloneArrayBufferForDecode
                ? arrayBuffer.slice(0)
                : arrayBuffer;

            const audioBuffer = await (decodeAudioDataArity <= 1
                ? decodeAudioData.call(audioContext, bufferForDecoding)
                : new Promise((resolve, reject) => {
                    decodeAudioData.call(audioContext, bufferForDecoding, resolve, reject);
                }));

            return audioBuffer;
        } catch (error) {
            console.warn('Unable to decode audio file for waveform rendering.', error);
            await resetSharedAudioDecodeContext();
            return null;
        }
    });
}

function buildWaveformChannelDataFromAudioBuffer(audioBuffer) {
    if (!audioBuffer) {
        return null;
    }

    let channelData = null;
    if (typeof AudioBuffer !== 'undefined' && audioBuffer instanceof AudioBuffer) {
        channelData = audioBuffer.numberOfChannels > 0
            ? audioBuffer.getChannelData(0)
            : null;
    } else if (audioBuffer instanceof Float32Array) {
        channelData = audioBuffer;
    } else if (audioBuffer?.channelData instanceof Float32Array) {
        channelData = audioBuffer.channelData;
    }

    if (!channelData) {
        return null;
    }

    const totalSamples = channelData.length;
    if (!Number.isFinite(totalSamples) || totalSamples <= 0) {
        return null;
    }

    const TARGET_BUCKETS = 4000;
    const bucketWidth = Math.max(1, Math.floor(totalSamples / TARGET_BUCKETS) || 1);
    const bucketCount = Math.ceil(totalSamples / bucketWidth);
    const buckets = new Float32Array(bucketCount * 2);

    for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
        const startIndex = bucketIndex * bucketWidth;
        const endIndex = Math.min(totalSamples, startIndex + bucketWidth);
        let min = 1;
        let max = -1;

        for (let sampleIndex = startIndex; sampleIndex < endIndex; sampleIndex += 1) {
            const sample = channelData[sampleIndex] || 0;
            if (sample < min) {
                min = sample;
            }
            if (sample > max) {
                max = sample;
            }
        }

        buckets[(bucketIndex * 2)] = min;
        buckets[(bucketIndex * 2) + 1] = max;
    }

    return {
        bucketWidth,
        buckets,
        totalSamples,
    };
}

function drawAudioWaveform(canvas, audioBuffer, options = {}) {
    if (!canvas || !audioBuffer) {
        return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return;
    }

    const { timelineItem = null, widthOverride = null, heightOverride = null } = options;

    const cssWidth = getWaveformCssWidth(canvas, timelineItem, widthOverride);
    const cssHeight = getWaveformCssHeight(canvas, heightOverride);
    const pixelRatio = Math.max(window.devicePixelRatio || 1, 1);
    const width = Math.max(1, Math.round(cssWidth * pixelRatio));
    const height = Math.max(1, Math.round(cssHeight * pixelRatio));

    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(30, 64, 175, 0.18)';
    ctx.fillRect(0, 0, width, height);

    let channelData = null;
    let totalSamples = 0;
    let bucketWidth = 1;
    let buckets = null;
    let bucketCount = 0;

    const isAudioBuffer = typeof AudioBuffer !== 'undefined'
        && audioBuffer instanceof AudioBuffer;

    if (isAudioBuffer || audioBuffer instanceof Float32Array || audioBuffer?.channelData instanceof Float32Array) {
        channelData = isAudioBuffer
            ? (audioBuffer.numberOfChannels > 0 ? audioBuffer.getChannelData(0) : null)
            : (audioBuffer instanceof Float32Array
                ? audioBuffer
                : audioBuffer.channelData);
        totalSamples = channelData?.length || 0;
    } else if (
        audioBuffer
        && typeof audioBuffer === 'object'
        && audioBuffer.buckets instanceof Float32Array
        && Number.isFinite(audioBuffer.bucketWidth)
    ) {
        buckets = audioBuffer.buckets;
        bucketWidth = Math.max(1, Math.round(audioBuffer.bucketWidth));
        bucketCount = Math.max(0, Math.floor(buckets.length / 2));
        totalSamples = Math.max(1, Math.round(audioBuffer.totalSamples || (bucketWidth * bucketCount)));
    }

    if (!Number.isFinite(totalSamples) || totalSamples <= 0) {
        return;
    }

    const samplesPerPixel = totalSamples / width;
    const centerY = height / 2;
    const amplitudeScale = centerY * 0.9;

    ctx.strokeStyle = 'rgba(96, 165, 250, 0.9)';
    ctx.lineWidth = Math.max(1, Math.round(pixelRatio));
    ctx.beginPath();

    for (let x = 0; x < width; x += 1) {
        const startIndex = Math.floor(x * samplesPerPixel);
        const endIndex = Math.min(totalSamples, Math.floor((x + 1) * samplesPerPixel));
        let min = 1;
        let max = -1;
        if (startIndex >= totalSamples) {
            min = 0;
            max = 0;
        } else if (buckets && bucketCount > 0) {
            const startBucket = Math.min(bucketCount - 1, Math.max(0, Math.floor(startIndex / bucketWidth)));
            const endBucket = Math.min(
                bucketCount - 1,
                Math.max(startBucket, Math.floor((Math.max(startIndex, endIndex - 1)) / bucketWidth)),
            );
            for (let bucketIndex = startBucket; bucketIndex <= endBucket; bucketIndex += 1) {
                const bucketMin = buckets[(bucketIndex * 2)] ?? 0;
                const bucketMax = buckets[(bucketIndex * 2) + 1] ?? 0;
                if (bucketMin < min) {
                    min = bucketMin;
                }
                if (bucketMax > max) {
                    max = bucketMax;
                }
            }
        } else if (channelData) {
            if (endIndex <= startIndex) {
                const sample = channelData[startIndex] || 0;
                min = Math.min(min, sample);
                max = Math.max(max, sample);
            } else {
                for (let i = startIndex; i < endIndex; i += 1) {
                    const sample = channelData[i] || 0;
                    if (sample < min) {
                        min = sample;
                    }
                    if (sample > max) {
                        max = sample;
                    }
                }
            }
        }
        const top = centerY - (max * amplitudeScale);
        const bottom = centerY - (min * amplitudeScale);
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
    }

    ctx.stroke();
}

function applyCachedWaveform(canvas, cacheEntry, options = {}) {
    if (!canvas || !cacheEntry) {
        return false;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return false;
    }

    if (!cacheEntry.channelData && cacheEntry.audioBuffer) {
        cacheEntry.channelData = buildWaveformChannelDataFromAudioBuffer(cacheEntry.audioBuffer);
        if (cacheEntry.channelData) {
            delete cacheEntry.audioBuffer;
        }
    }

    if (cacheEntry.audioBuffer || cacheEntry.channelData) {
        drawAudioWaveform(canvas, cacheEntry.audioBuffer || cacheEntry.channelData, options);
        return true;
    }

    if (!cacheEntry.imageDataUrl) {
        return false;
    }

    const { timelineItem = null, widthOverride = null, heightOverride = null } = options;
    const cssWidth = getWaveformCssWidth(canvas, timelineItem, widthOverride);
    const cssHeight = getWaveformCssHeight(canvas, heightOverride);
    const pixelRatio = Math.max(window.devicePixelRatio || 1, 1);
    const width = Math.max(1, Math.round(cssWidth * pixelRatio));
    const height = Math.max(1, Math.round(cssHeight * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }

    const image = new Image();
    image.onload = () => {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);
    };
    image.src = cacheEntry.imageDataUrl;
    return true;
}

function attachAudioWaveformResizeObserver(timelineItem, waveformCanvas, objectURL) {
    if (!timelineItem || !waveformCanvas || !objectURL) {
        return;
    }

    if (typeof ResizeObserver !== 'function') {
        return;
    }

    const existingEntry = audioWaveformResizeObservers.get(timelineItem);
    if (existingEntry?.observer) {
        if (existingEntry.canvas === waveformCanvas && existingEntry.objectURL === objectURL) {
            return;
        }
        existingEntry.observer.disconnect();
        if (existingEntry.rafHandle) {
            window.cancelAnimationFrame(existingEntry.rafHandle);
        }
    }

    const state = {
        observer: null,
        canvas: waveformCanvas,
        objectURL,
        lastWidth: 0,
        rafHandle: null,
    };

    const observer = new ResizeObserver((entries) => {
        entries.forEach((entry) => {
            const contentWidth = Math.max(0, Math.round(entry.contentRect?.width || 0));
            if (contentWidth <= 0 || contentWidth === state.lastWidth) {
                return;
            }
            state.lastWidth = contentWidth;
            if (state.rafHandle) {
                window.cancelAnimationFrame(state.rafHandle);
            }
            state.rafHandle = window.requestAnimationFrame(() => {
                state.rafHandle = null;
                const cacheEntry = audioWaveformByObjectUrl.get(objectURL);
                if (!cacheEntry) {
                    return;
                }
                applyCachedWaveform(waveformCanvas, cacheEntry, {
                    timelineItem,
                    widthOverride: contentWidth,
                });
            });
        });
    });

    observer.observe(timelineItem);
    state.observer = observer;
    audioWaveformResizeObservers.set(timelineItem, state);
}

function detachAudioWaveformResizeObserver(timelineItem) {
    const entry = audioWaveformResizeObservers.get(timelineItem);
    if (!entry) {
        return;
    }
    if (entry.observer) {
        entry.observer.disconnect();
    }
    if (entry.rafHandle) {
        window.cancelAnimationFrame(entry.rafHandle);
    }
    audioWaveformResizeObservers.delete(timelineItem);
}

async function prepareAudioTimelineVisuals(timelineItem, file, objectURL, waveformCanvas) {
    const existing = audioWaveformByObjectUrl.get(objectURL);
    if (existing && existing.drawn && existing.durationMs) {
        if (!existing.channelData && existing.audioBuffer) {
            existing.channelData = buildWaveformChannelDataFromAudioBuffer(existing.audioBuffer);
            delete existing.audioBuffer;
        }
        const duration = Math.max(existing.durationMs, MIN_AUDIO_DURATION);
        timelineItem.dataset.maxAudioDuration = String(duration);
        setTimelineItemDuration(timelineItem, 'audioDuration', duration, { markCustom: false });
        if (waveformCanvas) {
            const widthOverride = timelineItem
                ? Math.round(timelineItem.getBoundingClientRect().width)
                : null;
            applyCachedWaveform(waveformCanvas, existing, {
                timelineItem,
                widthOverride,
            });
            attachAudioWaveformResizeObserver(timelineItem, waveformCanvas, objectURL);
        }
        return;
    }

    const audioBuffer = await decodeAudioBufferFromFile(file);
    if (audioBuffer) {
        const durationMs = Math.max(MIN_AUDIO_DURATION, Math.round(audioBuffer.duration * 1000));
        const channelData = buildWaveformChannelDataFromAudioBuffer(audioBuffer);
        const cacheEntry = {
            imageDataUrl: null,
            durationMs,
            drawn: true,
            channelData,
        };
        if (!channelData) {
            cacheEntry.audioBuffer = audioBuffer;
        }
        audioWaveformByObjectUrl.set(objectURL, cacheEntry);
        timelineItem.dataset.maxAudioDuration = String(durationMs);
        setTimelineItemDuration(timelineItem, 'audioDuration', durationMs, { markCustom: false });
        if (waveformCanvas) {
            const widthOverride = timelineItem
                ? Math.round(timelineItem.getBoundingClientRect().width)
                : null;
            drawAudioWaveform(waveformCanvas, channelData || audioBuffer, {
                timelineItem,
                widthOverride,
            });
            try {
                cacheEntry.imageDataUrl = waveformCanvas.toDataURL('image/png');
            } catch (error) {
                cacheEntry.imageDataUrl = null;
            }
            attachAudioWaveformResizeObserver(timelineItem, waveformCanvas, objectURL);
        }
        return;
    }

    await new Promise((resolve) => {
        const audio = new Audio();
        audio.preload = 'metadata';
        audio.src = objectURL;
        audio.addEventListener('loadedmetadata', () => {
            if (Number.isFinite(audio.duration) && audio.duration > 0) {
                const durationMs = Math.max(MIN_AUDIO_DURATION, Math.round(audio.duration * 1000));
                audioWaveformByObjectUrl.set(objectURL, {
                    imageDataUrl: null,
                    durationMs,
                    drawn: false,
                });
                timelineItem.dataset.maxAudioDuration = String(durationMs);
                setTimelineItemDuration(timelineItem, 'audioDuration', durationMs, { markCustom: false });
                if (waveformCanvas) {
                    attachAudioWaveformResizeObserver(timelineItem, waveformCanvas, objectURL);
                }
            }
            resolve();
        }, { once: true });
        audio.addEventListener('error', () => resolve(), { once: true });
    });
}

const supplementalOverlayAudioPlayers = new Map();

function stopAllSupplementalOverlayAudio(options = {}) {
    const { resetTime = true } = options;
    const players = Array.from(supplementalOverlayAudioPlayers.entries());
    players.forEach(([item, state]) => {
        const element = state?.element || null;
        if (!element) {
            supplementalOverlayAudioPlayers.delete(item);
            return;
        }
        try {
            element.pause();
        } catch (error) {
            // Ignore pause errors for supplemental audio.
        }
        if (resetTime) {
            try {
                element.currentTime = 0;
            } catch (error) {
                // Ignore reset errors.
            }
        }
        cancelPreviewAudioEnvelope({ mediaElement: element, restoreVolume: false });
        if (typeof unregisterOverlayAudioElement === 'function') {
            unregisterOverlayAudioElement(item, element);
        }
        if (element !== previewAudio && element.parentElement) {
            element.parentElement.removeChild(element);
        }
        supplementalOverlayAudioPlayers.delete(item);
    });
}

function stopPreviewAudio(options = {}) {
    const { resetTime = true } = options;
    if (previewAudio) {
        try {
            previewAudio.pause();
        } catch (error) {
            // Ignore pause errors.
        }
        if (resetTime) {
            try {
                previewAudio.currentTime = 0;
            } catch (error) {
                // Ignore reset errors.
            }
        }
        cancelPreviewAudioEnvelope({ mediaElement: previewAudio, restoreVolume: false });
    }

    stopAllSupplementalOverlayAudio({ resetTime });

    if (activeAudioOverlayEntry?.syncSource) {
        clearTimelinePlaybackSyncSource(activeAudioOverlayEntry.syncSource);
    }
    if (typeof unregisterOverlayAudioElement === 'function' && activeAudioOverlayEntry?.item && previewAudio) {
        unregisterOverlayAudioElement(activeAudioOverlayEntry.item, previewAudio);
    }
    activeAudioOverlayEntry = null;

    if (typeof refreshPreviewAudioMix === 'function') {
        refreshPreviewAudioMix({ overlayItems: [] });
    }
}

function getAudioOverlayEntry(entries) {
    if (!Array.isArray(entries)) {
        return null;
    }
    return entries.find((entry) => isAudioTimelineItem(entry?.item));
}

function normalizeAudioOverlayEntry(entry) {
    if (!entry || !entry.item) {
        return null;
    }

    const startTime = Number.isFinite(entry.start)
        ? Math.max(0, Math.round(entry.start))
        : Math.max(0, getTimelineItemStartTime(entry.item));
    const rawEndTime = Number.isFinite(entry.end)
        ? Math.round(entry.end)
        : startTime + Math.max(0, getTimelineItemPlaybackDuration(entry.item));
    const safeEndTime = Math.max(startTime, rawEndTime);
    const laneIndex = typeof resolveLaneIndex === 'function'
        ? resolveLaneIndex(entry.laneIndex ?? entry.item?.dataset?.laneIndex)
        : Number(entry.laneIndex ?? entry.item?.dataset?.laneIndex ?? 0);

    return {
        item: entry.item,
        start: startTime,
        end: safeEndTime,
        laneIndex,
    };
}

function getSupplementalAudioContainer() {
    if (previewAudio?.parentElement) {
        return previewAudio.parentElement;
    }
    if (previewAudio?.ownerDocument?.body) {
        return previewAudio.ownerDocument.body;
    }
    return typeof document !== 'undefined' ? document.body : null;
}

function syncSupplementalOverlayPlayers(audioEntries, options = {}) {
    const normalizedSegmentTime = Number.isFinite(options?.normalizedSegmentTime)
        ? Math.max(0, Math.round(options.normalizedSegmentTime))
        : null;
    const mix = options?.mix || null;
    const activeItems = new Set();

    audioEntries.forEach((entry) => {
        if (!entry?.item || !isAudioTimelineItem(entry.item)) {
            return;
        }

        const clipDuration = Math.max(0, getTimelineItemPlaybackDuration(entry.item));
        const referenceTime = normalizedSegmentTime !== null ? normalizedSegmentTime : entry.start;
        const offsetMs = Math.max(
            0,
            Math.min(
                Math.round(referenceTime - entry.start),
                clipDuration || Math.max(0, entry.end - entry.start),
            ),
        );
        const objectURL = entry.item?.dataset?.objectUrl || '';
        const audioSettings = getTimelineItemAudioSettings(entry.item);
        const overlayGain = (mix?.gainsByItem instanceof Map && mix.gainsByItem.has(entry.item))
            ? mix.gainsByItem.get(entry.item)
            : null;

        let state = supplementalOverlayAudioPlayers.get(entry.item);
        if (!state) {
            const container = getSupplementalAudioContainer();
            let element = null;
            if (typeof Audio !== 'undefined') {
                element = new Audio();
            } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
                element = document.createElement('audio');
            }
            if (!element) {
                return;
            }
            element.hidden = true;
            element.setAttribute('aria-hidden', 'true');
            element.preload = 'auto';
            element.crossOrigin = 'anonymous';
            if (container) {
                container.appendChild(element);
            }
            state = {
                element,
                lastObjectUrl: '',
            };
            supplementalOverlayAudioPlayers.set(entry.item, state);
        }

        const { element } = state;
        if (!element) {
            return;
        }

        if (objectURL && element.src !== objectURL) {
            element.src = objectURL;
            try {
                element.load();
            } catch (error) {
                // Ignore load errors for supplemental audio elements.
            }
            state.lastObjectUrl = objectURL;
        }

        if (typeof registerOverlayAudioElement === 'function') {
            registerOverlayAudioElement(entry.item, element);
        }

        applyMasterVolumeToPreview(audioSettings.volumePercent, {
            mediaElement: element,
            mixGain: overlayGain,
        });

        const remainingDuration = Math.max(0, clipDuration - offsetMs);
        if (remainingDuration > 0) {
            applyPreviewAudioEnvelope(audioSettings, remainingDuration, {
                mediaElement: element,
                mixGain: overlayGain,
                clipOffsetMs: offsetMs,
                clipTotalDurationMs: clipDuration,
            });
        } else {
            cancelPreviewAudioEnvelope({ mediaElement: element, restoreVolume: false });
        }

        const desiredTime = offsetMs / 1000;
        if (Math.abs((element.currentTime || 0) - desiredTime) > 0.2) {
            try {
                element.currentTime = desiredTime;
            } catch (error) {
                // Ignore seek errors for supplemental audio.
            }
        }

        if (element.paused) {
            element.play().catch((error) => {
                console.warn('Unable to start overlay audio clip playback.', error);
            });
        }

        activeItems.add(entry.item);
    });

    const removableItems = [];
    supplementalOverlayAudioPlayers.forEach((state, item) => {
        if (!activeItems.has(item)) {
            removableItems.push(item);
        }
    });

    removableItems.forEach((item) => {
        const state = supplementalOverlayAudioPlayers.get(item);
        const element = state?.element || null;
        if (element) {
            if (typeof unregisterOverlayAudioElement === 'function') {
                unregisterOverlayAudioElement(item, element);
            }
            cancelPreviewAudioEnvelope({ mediaElement: element, restoreVolume: false });
            try {
                element.pause();
            } catch (error) {
                // Ignore pause errors when removing supplemental audio.
            }
            try {
                element.currentTime = 0;
            } catch (error) {
                // Ignore reset errors when removing supplemental audio.
            }
            if (element !== previewAudio && element.parentElement) {
                element.parentElement.removeChild(element);
            }
        }
        supplementalOverlayAudioPlayers.delete(item);
    });
}

function getTimelineAudioEntriesAtTime(timeMs) {
    if (typeof getTimelineLaneEntries !== 'function') {
        return [];
    }

    const rawTime = Number(timeMs);
    if (!Number.isFinite(rawTime)) {
        return [];
    }

    const targetTime = Math.max(0, Math.round(rawTime));
    const candidateEntries = getTimelineLaneEntries();

    if (!candidateEntries.length) {
        return [];
    }

    return candidateEntries
        .filter((entry) => entry?.item && isAudioTimelineItem(entry.item))
        .map((entry) => {
            const start = Number.isFinite(entry.start)
                ? Math.max(0, Math.round(entry.start))
                : 0;
            const end = Number.isFinite(entry.end)
                ? Math.max(0, Math.round(entry.end))
                : start;
            const laneIndex = typeof resolveLaneIndex === 'function'
                ? resolveLaneIndex(entry.laneIndex ?? entry.item?.dataset?.laneIndex)
                : Number(entry.laneIndex ?? entry.item?.dataset?.laneIndex ?? 0);
            return {
                item: entry.item,
                start,
                end: Math.max(end, start),
                laneIndex,
            };
        })
        .filter((entry) => targetTime >= entry.start && targetTime < entry.end)
        .sort((a, b) => {
            if (a.start !== b.start) {
                return a.start - b.start;
            }
            return a.laneIndex - b.laneIndex;
        });
}

function syncPreviewAudioOverlay(entries, segmentStartTimeMs) {
    const normalizedSegmentTime = Number.isFinite(segmentStartTimeMs)
        ? Math.max(0, Math.round(segmentStartTimeMs))
        : null;
    const activePlaybackItem = typeof activeTimelineItem !== 'undefined'
        ? activeTimelineItem
        : null;

    let audioEntry = normalizeAudioOverlayEntry(getAudioOverlayEntry(entries));

    if ((!audioEntry || !audioEntry.item) && activeAudioOverlayEntry?.item && normalizedSegmentTime !== null) {
        const fallbackEntry = normalizeAudioOverlayEntry(activeAudioOverlayEntry);
        if (
            fallbackEntry
            && normalizedSegmentTime >= fallbackEntry.start
            && normalizedSegmentTime < fallbackEntry.end
        ) {
            audioEntry = fallbackEntry;
        }
    }

    const overlayAudioEntries = [];
    const seenOverlayItems = new Set();

    if (audioEntry?.item) {
        overlayAudioEntries.push(audioEntry);
        seenOverlayItems.add(audioEntry.item);
    }

    entries
        .filter((entry) => entry?.item && isAudioTimelineItem(entry.item))
        .forEach((entry) => {
            const normalized = normalizeAudioOverlayEntry(entry);
            if (!normalized?.item || seenOverlayItems.has(normalized.item)) {
                return;
            }
            overlayAudioEntries.push(normalized);
            seenOverlayItems.add(normalized.item);
        });

    if (normalizedSegmentTime !== null) {
        const timelineAudioEntries = getTimelineAudioEntriesAtTime(normalizedSegmentTime);
        timelineAudioEntries.forEach((entry) => {
            const normalized = normalizeAudioOverlayEntry(entry);
            if (!normalized?.item || seenOverlayItems.has(normalized.item)) {
                return;
            }
            overlayAudioEntries.push(normalized);
            seenOverlayItems.add(normalized.item);
        });
    }

    if (!overlayAudioEntries.length) {
        if (typeof refreshPreviewAudioMix === 'function') {
            refreshPreviewAudioMix({
                entries,
                activeItem: activePlaybackItem,
                overlayItems: [],
            });
        }
        stopPreviewAudio({ resetTime: false });
        return;
    }

    if (!audioEntry || !audioEntry.item) {
        audioEntry = overlayAudioEntries[0];
    }

    const additionalEntries = overlayAudioEntries.slice(1);

    const overlayItemsForMix = overlayAudioEntries.map((entry) => entry.item).filter(Boolean);

    if (!previewAudio) {
        if (typeof refreshPreviewAudioMix === 'function') {
            refreshPreviewAudioMix({
                entries,
                activeItem: activePlaybackItem,
                overlayItems: overlayItemsForMix,
            });
        }
        syncSupplementalOverlayPlayers(additionalEntries, {
            normalizedSegmentTime,
            mix: null,
        });
        return;
    }

    const clipDuration = Math.max(0, getTimelineItemPlaybackDuration(audioEntry.item));
    const referenceTime = normalizedSegmentTime !== null ? normalizedSegmentTime : audioEntry.start;
    const offsetMs = Math.max(
        0,
        Math.min(
            Math.round(referenceTime - audioEntry.start),
            clipDuration || Math.max(0, audioEntry.end - audioEntry.start),
        ),
    );
    const objectURL = audioEntry.item?.dataset?.objectUrl || '';

    const mix = typeof refreshPreviewAudioMix === 'function'
        ? refreshPreviewAudioMix({
            entries,
            activeItem: activePlaybackItem,
            overlayItem: audioEntry.item,
            overlayItems: overlayItemsForMix,
        })
        : null;
    const overlayGain = (mix?.gainsByItem instanceof Map && mix.gainsByItem.has(audioEntry.item))
        ? mix.gainsByItem.get(audioEntry.item)
        : null;

    if (activeAudioOverlayEntry?.item && activeAudioOverlayEntry.item !== audioEntry.item
        && typeof unregisterOverlayAudioElement === 'function' && previewAudio
    ) {
        unregisterOverlayAudioElement(activeAudioOverlayEntry.item, previewAudio);
    }

    const needsRestart = !activeAudioOverlayEntry
        || activeAudioOverlayEntry.item !== audioEntry.item
        || previewAudio.src !== objectURL;

    const applyAudioSyncSource = () => {
        if (activeAudioOverlayEntry?.syncSource) {
            clearTimelinePlaybackSyncSource(activeAudioOverlayEntry.syncSource);
        }
        const syncSource = {
            priority: 20,
            getTimelineTime: () => {
                if (!previewAudio) {
                    return Number.NaN;
                }
                const mediaTime = Number(previewAudio.currentTime) || 0;
                return audioEntry.start + (mediaTime * 1000);
            },
        };
        setTimelinePlaybackSyncSource(syncSource);
        activeAudioOverlayEntry = {
            item: audioEntry.item,
            start: audioEntry.start,
            end: audioEntry.end,
            syncSource,
        };
    };

    const audioSettings = getTimelineItemAudioSettings(audioEntry.item);

    if (needsRestart) {
        if (objectURL && previewAudio.src !== objectURL) {
            previewAudio.src = objectURL;
            try {
                previewAudio.load();
            } catch (error) {
                // Ignore load errors.
            }
        }

        applyMasterVolumeToPreview(audioSettings.volumePercent, {
            mediaElement: previewAudio,
            mixGain: overlayGain,
        });
        const remainingDuration = Math.max(0, clipDuration - offsetMs);
        if (remainingDuration > 0) {
            applyPreviewAudioEnvelope(audioSettings, remainingDuration, {
                mediaElement: previewAudio,
                mixGain: overlayGain,
                clipOffsetMs: offsetMs,
                clipTotalDurationMs: clipDuration,
            });
        } else {
            cancelPreviewAudioEnvelope({ mediaElement: previewAudio, restoreVolume: false });
        }

        try {
            previewAudio.currentTime = offsetMs / 1000;
        } catch (error) {
            // Ignore seek errors.
        }

        if (typeof updateTimelinePlaybackSyncFallback === 'function') {
            updateTimelinePlaybackSyncFallback(audioEntry.start + offsetMs);
        }

        previewAudio.play().catch((error) => {
            console.warn('Unable to start audio clip playback.', error);
        });
    } else {
        try {
            const desiredTime = offsetMs / 1000;
            if (Math.abs((previewAudio.currentTime || 0) - desiredTime) > 0.2) {
                previewAudio.currentTime = desiredTime;
            }
        } catch (error) {
            // Ignore seek corrections.
        }

        if (previewAudio.paused) {
            previewAudio.play().catch(() => {});
        }

        if (typeof updateTimelinePlaybackSyncFallback === 'function') {
            updateTimelinePlaybackSyncFallback(audioEntry.start + offsetMs);
        }
    }

    if (typeof registerOverlayAudioElement === 'function' && previewAudio) {
        registerOverlayAudioElement(audioEntry.item, previewAudio);
    }

    applyAudioSyncSource();

    syncSupplementalOverlayPlayers(additionalEntries, {
        normalizedSegmentTime,
        mix,
    });
}

async function addToTimeline(file, objectURL) {
    const defaultLane = ensureTimelineLane(0);
    if (timelineEmptyState) {
        timelineEmptyState.hidden = true;
    }

    const timelineItem = document.createElement('div');
    timelineItem.className = 'timeline-item';
    timelineItem.setAttribute('role', 'listitem');
    timelineItem.tabIndex = 0;
    timelineItem.dataset.fileType = file.type;
    timelineItem.dataset.objectUrl = objectURL;
    timelineItem.dataset.displayName = file.name;

    assignTimelineInstanceId(timelineItem);

    const label = document.createElement('span');
    label.textContent = file.name;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'timeline-item-remove';
    removeButton.setAttribute('aria-label', 'Remove clip');
    removeButton.textContent = '✕';

    if (file.type.startsWith('video/')) {
        const videoThumb = document.createElement('video');
        videoThumb.src = objectURL;
        videoThumb.muted = true;
        videoThumb.loop = true;
        videoThumb.playsInline = true;
        videoThumb.autoplay = true;
        timelineItem.dataset.minVideoDuration = String(DEFAULT_VIDEO_DURATION);
        setTimelineItemDuration(
            timelineItem,
            'videoDuration',
            DEFAULT_VIDEO_DURATION,
            { markCustom: false },
        );
        videoThumb.addEventListener('loadedmetadata', () => {
            if (Number.isFinite(videoThumb.duration) && videoThumb.duration > 0) {
                const intrinsicDuration = Math.round(videoThumb.duration * 1000);
                timelineItem.dataset.minVideoDuration = String(intrinsicDuration);
                const currentDuration = Number(timelineItem.dataset.videoDuration);
                const hasCustomDuration = timelineItem.dataset.customDuration === '1';
                const nextDuration = hasCustomDuration && Number.isFinite(currentDuration)
                    && currentDuration > 0
                        ? Math.max(currentDuration, intrinsicDuration)
                        : intrinsicDuration;
                const appliedDuration = setTimelineItemDuration(
                    timelineItem,
                    'videoDuration',
                    nextDuration,
                    { markCustom: hasCustomDuration },
                );
                if (appliedDuration !== currentDuration) {
                    updateActiveTimelineIndicators();
                }
            }
        });
        timelineItem.appendChild(videoThumb);
    } else if (file.type.startsWith('image/')) {
        const imageThumb = document.createElement('img');
        imageThumb.className = 'timeline-thumbnail';
        imageThumb.src = await generateImageThumbnail(objectURL);
        imageThumb.alt = file.name;
        timelineItem.appendChild(imageThumb);
        setTimelineItemDuration(
            timelineItem,
            'imageDuration',
            IMAGE_FRAME_DURATION,
            { markCustom: false },
        );
        preloadTimelineImage(objectURL).catch((error) => {
            console.warn('Failed to warm timeline image for playback.', error);
        });
    } else if (file.type.startsWith('audio/')) {
        timelineItem.classList.add('timeline-item--audio');
        const waveformContainer = document.createElement('div');
        waveformContainer.className = 'timeline-waveform';
        const waveformCanvas = document.createElement('canvas');
        waveformContainer.appendChild(waveformCanvas);

        const waveformOverlay = document.createElement('div');
        waveformOverlay.className = 'timeline-waveform__overlay';
        label.classList.add('timeline-waveform__title');
        waveformOverlay.appendChild(label);
        waveformContainer.appendChild(waveformOverlay);
        timelineItem.appendChild(waveformContainer);
        const appliedDuration = setTimelineItemDuration(
            timelineItem,
            'audioDuration',
            MIN_AUDIO_DURATION,
            { markCustom: false },
        );
        timelineItem.dataset.maxAudioDuration = String(appliedDuration);
        prepareAudioTimelineVisuals(timelineItem, file, objectURL, waveformCanvas).catch((error) => {
            console.warn('Failed to render audio waveform.', error);
        });
    }

    if (!file.type.startsWith('audio/')) {
        timelineItem.appendChild(label);
    }
    timelineItem.appendChild(removeButton);

    let targetLane = defaultLane || ensureTimelineLane(0);
    if (file.type.startsWith('audio/')) {
        const audioLane = ensureAudioTimelineLane();
        targetLane = audioLane || targetLane;
    }
    if (targetLane) {
        timelineItem.dataset.laneIndex = targetLane.dataset.laneIndex || '0';
        targetLane.appendChild(timelineItem);
    } else {
        timelineItem.dataset.laneIndex = '0';
        timelineTrack.appendChild(timelineItem);
    }
    if (objectURL) {
        incrementTimelineObjectUrlUsage(objectURL);
    }
    initializeTimelineItem(timelineItem);
    updateTimelineEmptyState();

    markExportPlaybackContextDirty({ refreshSummary: true });

    registerTimelineItemInteractions(timelineItem, removeButton);

    pushTimelineUndoEntry({
        type: 'add-item',
        undo: () => {
            if (timelineItem && timelineItem.isConnected) {
                removeTimelineItem(timelineItem, { recordUndo: false });
            }
        },
    });

    setActiveTimelineItem(timelineItem);
    loadPreviewFromTimeline(timelineItem, null, { focusTextEditor: true });
}

function registerTimelineItemInteractions(timelineItem, removeButton) {
    if (!timelineItem) {
        return;
    }

    timelineItem.addEventListener('click', () => {
        stopTimelinePlayback();
        setActiveTimelineItem(timelineItem);
        loadPreviewFromTimeline(timelineItem, null, { focusTextEditor: true });
    });

    timelineItem.addEventListener('keydown', (event) => {
        const { key } = event;
        if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
            event.preventDefault();
            stopTimelinePlayback();
            setActiveTimelineItem(timelineItem, { focus: true });
            loadPreviewFromTimeline(timelineItem, null, { focusTextEditor: true });
            return;
        }

        if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown') {
            return;
        }

        event.preventDefault();
        const items = getTimelineItems();
        const currentIndex = items.indexOf(timelineItem);
        if (currentIndex === -1) {
            return;
        }

        let nextIndex = currentIndex;
        if (key === 'ArrowLeft' || key === 'ArrowUp') {
            nextIndex = Math.max(0, currentIndex - 1);
        } else if (key === 'ArrowRight' || key === 'ArrowDown') {
            nextIndex = Math.min(items.length - 1, currentIndex + 1);
        }

        if (nextIndex === currentIndex) {
            return;
        }

        const nextItem = items[nextIndex];
        if (!nextItem) {
            return;
        }

        stopTimelinePlayback();
        setActiveTimelineItem(nextItem, { focus: true });
        loadPreviewFromTimeline(nextItem, null, { focusTextEditor: true });
    });

    if (removeButton) {
        removeButton.addEventListener('click', (event) => {
            event.stopPropagation();
            const targetItem = removeButton.closest('.timeline-item');
            if (!targetItem) {
                return;
            }
            removeTimelineItem(targetItem);
        });
    }
}

const DEFAULT_TEXT_TEMPLATE_LABEL = '(Default Text)';
const DEFAULT_TEXT_TEMPLATE_ID = 'default-text';
const DEFAULT_TEXT_TEMPLATE_ASPECT_RATIO = 16 / 9;
const DEFAULT_TEXT_TEMPLATE_HORIZONTAL_PADDING = 32;
const DEFAULT_TEXT_TEMPLATE_VERTICAL_PADDING = 20;
const DEFAULT_TEXT_TEMPLATE_WIDTH = 0.45;
const DEFAULT_TEXT_TEMPLATE_HEIGHT = DEFAULT_TEXT_TEMPLATE_WIDTH / DEFAULT_TEXT_TEMPLATE_ASPECT_RATIO;
const DEFAULT_TEXT_TEMPLATE_CANVAS_WIDTH = 1920;
const DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT = 1080;
const DEFAULT_TEXT_TEMPLATE_FONT_SIZE = 120;
const DEFAULT_TEXT_TEMPLATE_MIN_WIDTH = 0.18;
const DEFAULT_TEXT_TEMPLATE_BASE_WIDTH_PX = DEFAULT_TEXT_TEMPLATE_CANVAS_WIDTH * DEFAULT_TEXT_TEMPLATE_WIDTH;
const DEFAULT_TEXT_TEMPLATE_BASE_HEIGHT_PX = DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT * DEFAULT_TEXT_TEMPLATE_HEIGHT;
const MAX_TEXT_TEMPLATE_DIMENSION = 0.95;

let defaultTextMeasurementContext = null;

function getDefaultTextMeasurementContext() {
    if (defaultTextMeasurementContext) {
        return defaultTextMeasurementContext;
    }
    if (typeof document === 'undefined') {
        return null;
    }
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
        return null;
    }
    defaultTextMeasurementContext = context;
    return defaultTextMeasurementContext;
}

function applyTextTransformToContent(content, transform) {
    const raw = String(content || '');
    switch ((transform || 'none').toLowerCase()) {
    case 'uppercase':
        return raw.toUpperCase();
    case 'lowercase':
        return raw.toLowerCase();
    case 'capitalize':
        return raw.replace(/\b\w/g, (char) => char.toUpperCase());
    default:
        return raw;
    }
}

function resolveTextTemplateStyle(styleOverrides = {}) {
    const base = (styleOverrides && typeof styleOverrides === 'object') ? styleOverrides : {};
    const fontFamily = base.fontFamily || (DEFAULT_TEXT_STYLE?.fontFamily || "Inter, 'Segoe UI', system-ui, sans-serif");
    const fontWeightCandidate = Number(base.fontWeight);
    const fontWeight = Number.isFinite(fontWeightCandidate)
        ? fontWeightCandidate
        : (DEFAULT_TEXT_STYLE?.fontWeight || 600);
    const fontStyleCandidate = typeof base.fontStyle === 'string'
        ? base.fontStyle.toLowerCase()
        : '';
    const fontStyle = TEXT_FONT_STYLE_OPTIONS?.has?.(fontStyleCandidate)
        ? fontStyleCandidate
        : (DEFAULT_TEXT_STYLE?.fontStyle || 'normal');
    const letterSpacingCandidate = Number(base.letterSpacingScale);
    const letterSpacingScale = Number.isFinite(letterSpacingCandidate)
        ? (typeof clampTextLetterSpacing === 'function'
            ? clampTextLetterSpacing(letterSpacingCandidate)
            : letterSpacingCandidate)
        : (DEFAULT_TEXT_STYLE?.letterSpacingScale || 0.04);
    const fontSizeCandidate = Number(base.fontSize);
    const fontSize = Number.isFinite(fontSizeCandidate)
        ? clampTextFontSize(fontSizeCandidate)
        : DEFAULT_TEXT_TEMPLATE_FONT_SIZE;
    const color = typeof normalizeTextColor === 'function'
        ? normalizeTextColor(base.color || DEFAULT_TEXT_STYLE?.color || '#F8FAFC')
        : '#F8FAFC';
    const alignCandidate = base.align;
    const align = TEXT_ALIGNMENT_OPTIONS?.has?.(alignCandidate)
        ? alignCandidate
        : (DEFAULT_TEXT_STYLE?.align || 'center');
    const transformCandidate = base.transform;
    const transform = TEXT_TRANSFORM_OPTIONS?.has?.(transformCandidate)
        ? transformCandidate
        : (DEFAULT_TEXT_STYLE?.transform || 'none');
    const decorationCandidate = typeof base.textDecoration === 'string'
        ? base.textDecoration.toLowerCase()
        : '';
    const textDecoration = TEXT_DECORATION_OPTIONS?.has?.(decorationCandidate)
        ? decorationCandidate
        : (DEFAULT_TEXT_STYLE?.textDecoration || 'none');
    const paddingInlineCandidate = Number(base.paddingInline);
    const paddingInline = Number.isFinite(paddingInlineCandidate)
        ? paddingInlineCandidate
        : DEFAULT_TEXT_TEMPLATE_HORIZONTAL_PADDING;
    const paddingBlockCandidate = Number(base.paddingBlock);
    const paddingBlock = Number.isFinite(paddingBlockCandidate)
        ? paddingBlockCandidate
        : DEFAULT_TEXT_TEMPLATE_VERTICAL_PADDING;

    return {
        fontFamily,
        fontWeight,
        fontStyle,
        letterSpacingScale,
        fontSize,
        color,
        align,
        transform,
        textDecoration,
        paddingInline,
        paddingBlock,
    };
}

function calculateDefaultTextTemplateTransform(textContent = DEFAULT_TEXT_TEMPLATE_LABEL, styleOverrides = {}) {
    const fallback = {
        left: (1 - DEFAULT_TEXT_TEMPLATE_WIDTH) / 2,
        top: (1 - DEFAULT_TEXT_TEMPLATE_HEIGHT) / 2,
        width: DEFAULT_TEXT_TEMPLATE_WIDTH,
        height: DEFAULT_TEXT_TEMPLATE_HEIGHT,
        aspectRatio: DEFAULT_TEXT_TEMPLATE_ASPECT_RATIO,
        rotation: 0,
    };

    if (typeof document === 'undefined') {
        return fallback;
    }

    const style = resolveTextTemplateStyle(styleOverrides);
    const context = getDefaultTextMeasurementContext();

    if (!context) {
        return fallback;
    }

    const measuredText = applyTextTransformToContent(textContent || DEFAULT_TEXT_TEMPLATE_LABEL, style.transform);
    const fontStyle = style.fontStyle === 'italic' ? 'italic' : 'normal';
    const fontDescriptor = `${fontStyle} ${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
    context.font = fontDescriptor;
    context.textBaseline = 'alphabetic';
    context.textAlign = 'left';

    const metrics = context.measureText(measuredText);
    const baseWidth = Number.isFinite(metrics.width) ? metrics.width : 0;
    const letterSpacing = style.fontSize * style.letterSpacingScale;
    const totalLetterSpacing = Math.max(0, measuredText.length - 1) * letterSpacing;
    const measuredWidth = Math.max(0, baseWidth + totalLetterSpacing);

    const ascent = Number.isFinite(metrics.actualBoundingBoxAscent)
        ? metrics.actualBoundingBoxAscent
        : style.fontSize * 0.82;
    const descent = Number.isFinite(metrics.actualBoundingBoxDescent)
        ? metrics.actualBoundingBoxDescent
        : style.fontSize * 0.18;
    const measuredHeight = Math.max(0, ascent + descent);

    const totalWidthPx = measuredWidth + (style.paddingInline * 2);
    const totalHeightPx = measuredHeight + (style.paddingBlock * 2);

    if (!Number.isFinite(totalWidthPx) || !Number.isFinite(totalHeightPx) || totalWidthPx <= 0 || totalHeightPx <= 0) {
        return fallback;
    }

    const fontScale = Number.isFinite(style.fontSize) && style.fontSize > 0
        ? style.fontSize / DEFAULT_TEXT_TEMPLATE_FONT_SIZE
        : 1;
    const scaledBaseWidthPx = DEFAULT_TEXT_TEMPLATE_BASE_WIDTH_PX * Math.max(fontScale, 0.1);
    const scaledBaseHeightPx = DEFAULT_TEXT_TEMPLATE_BASE_HEIGHT_PX * Math.max(fontScale, 0.1);

    const desiredWidthPx = Math.max(totalWidthPx, scaledBaseWidthPx);
    const desiredHeightPx = Math.max(totalHeightPx, scaledBaseHeightPx);

    const normalizedWidth = desiredWidthPx / DEFAULT_TEXT_TEMPLATE_CANVAS_WIDTH;
    const normalizedHeight = desiredHeightPx / DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT;

    if (!Number.isFinite(normalizedWidth) || !Number.isFinite(normalizedHeight)
        || normalizedWidth <= 0 || normalizedHeight <= 0) {
        return fallback;
    }

    const aspectRatio = desiredWidthPx > 0 && desiredHeightPx > 0
        ? desiredWidthPx / desiredHeightPx
        : DEFAULT_TEXT_TEMPLATE_ASPECT_RATIO;

    let width = normalizedWidth;
    let height = normalizedHeight;

    if (width < DEFAULT_TEXT_TEMPLATE_MIN_WIDTH) {
        const scale = DEFAULT_TEXT_TEMPLATE_MIN_WIDTH / width;
        width = DEFAULT_TEXT_TEMPLATE_MIN_WIDTH;
        height *= scale;
    }

    const maxScale = Math.min(
        width > 0 ? MAX_TEXT_TEMPLATE_DIMENSION / width : 1,
        height > 0 ? MAX_TEXT_TEMPLATE_DIMENSION / height : 1,
        1,
    );
    if (maxScale < 1) {
        width *= maxScale;
        height *= maxScale;
    }

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return fallback;
    }

    const top = (1 - height) / 2;
    const left = (1 - width) / 2;

    const resolvedAspectRatio = width > 0 && height > 0 ? width / height : aspectRatio;

    const round = (value) => Math.round(value * 10000) / 10000;

    return {
        left: round(left),
        top: round(top),
        width: round(width),
        height: round(height),
        aspectRatio: round(resolvedAspectRatio),
        rotation: 0,
    };
}


if (typeof window !== 'undefined') {
    window.DEFAULT_TEXT_TEMPLATE_LABEL = DEFAULT_TEXT_TEMPLATE_LABEL;
    window.DEFAULT_TEXT_TEMPLATE_ID = DEFAULT_TEXT_TEMPLATE_ID;
    window.DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT = DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT;
    window.DEFAULT_TEXT_TEMPLATE_FONT_SIZE = DEFAULT_TEXT_TEMPLATE_FONT_SIZE;
    window.DEFAULT_TEXT_TEMPLATE_HORIZONTAL_PADDING = DEFAULT_TEXT_TEMPLATE_HORIZONTAL_PADDING;
    window.DEFAULT_TEXT_TEMPLATE_VERTICAL_PADDING = DEFAULT_TEXT_TEMPLATE_VERTICAL_PADDING;
    window.calculateDefaultTextTemplateTransform = calculateDefaultTextTemplateTransform;
    window.createDefaultTextOverlayObjectURL = createDefaultTextOverlayObjectURL;
}

function escapeSvgTextContent(content) {
    return String(content || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function createDefaultTextOverlayObjectURL(textContent = DEFAULT_TEXT_TEMPLATE_LABEL, styleOverrides = {}) {
    const style = resolveTextTemplateStyle(styleOverrides);
    const transformedText = applyTextTransformToContent(textContent, style.transform);
    const safeText = escapeSvgTextContent(transformedText);
    const sanitizedFontFamily = style.fontFamily.replace(/"/g, '\\"');
    const anchor = style.align === 'left'
        ? 'start'
        : (style.align === 'right' ? 'end' : 'middle');
    let xPosition = DEFAULT_TEXT_TEMPLATE_CANVAS_WIDTH / 2;
    if (style.align === 'left') {
        xPosition = style.paddingInline;
    } else if (style.align === 'right') {
        xPosition = DEFAULT_TEXT_TEMPLATE_CANVAS_WIDTH - style.paddingInline;
    }
    const letterSpacingScale = typeof clampTextLetterSpacing === 'function'
        ? clampTextLetterSpacing(style.letterSpacingScale)
        : style.letterSpacingScale;
    const letterSpacingPx = style.fontSize * letterSpacingScale;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${DEFAULT_TEXT_TEMPLATE_CANVAS_WIDTH}" height="${DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT}" viewBox="0 0 ${DEFAULT_TEXT_TEMPLATE_CANVAS_WIDTH} ${DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT}">
    <style>
        text { font-family: ${sanitizedFontFamily}; font-weight: ${style.fontWeight}; font-style: ${style.fontStyle}; text-decoration: ${style.textDecoration}; }
    </style>
    <rect width="${DEFAULT_TEXT_TEMPLATE_CANVAS_WIDTH}" height="${DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT}" fill="rgba(15,23,42,0.0)" />
    <text x="${xPosition}" y="${DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT / 2}" fill="${style.color}" font-size="${style.fontSize}" font-weight="${style.fontWeight}" font-style="${style.fontStyle}" text-decoration="${style.textDecoration}" text-anchor="${anchor}" dominant-baseline="middle" letter-spacing="${letterSpacingPx}">
        ${safeText}
    </text>
</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    return URL.createObjectURL(blob);
}

async function addDefaultTextOverlayToTimeline() {
    if (!activeTimelineItem) {
        return null;
    }

    const fileType = activeTimelineItem.dataset.fileType || '';
    if (!fileType.startsWith('image/') && !fileType.startsWith('video/')) {
        return null;
    }

    if (activeTimelineItem.dataset.templateId) {
        return null;
    }

    stopTimelinePlayback(true, false);

    const activeLaneIndex = resolveLaneIndex(activeTimelineItem.dataset.laneIndex);
    let overlayLane = null;
    if (activeLaneIndex <= 0) {
        overlayLane = insertTimelineLaneAt(0);
    } else {
        overlayLane = ensureTimelineLane(activeLaneIndex - 1);
    }
    if (!overlayLane) {
        overlayLane = ensureTimelineLane(0);
    }

    const startTime = getTimelineItemStartTime(activeTimelineItem);
    const baseDuration = Math.max(0, getTimelineItemPlaybackDuration(activeTimelineItem));
    const overlayDuration = baseDuration > 0 ? baseDuration : IMAGE_FRAME_DURATION;

    const timelineItem = document.createElement('div');
    timelineItem.className = 'timeline-item timeline-item--text';
    timelineItem.setAttribute('role', 'listitem');
    timelineItem.tabIndex = 0;
    timelineItem.dataset.fileType = 'image/svg+xml';
    timelineItem.dataset.displayName = DEFAULT_TEXT_TEMPLATE_LABEL;
    timelineItem.dataset.templateId = DEFAULT_TEXT_TEMPLATE_ID;
    timelineItem.dataset.textContent = DEFAULT_TEXT_TEMPLATE_LABEL;
    timelineItem.dataset.startOffsetMs = String(Math.max(0, Math.round(startTime)));
    initializeDefaultTextStyleForTimelineItem(timelineItem);
    const initialStyle = getTimelineTextStyle ? getTimelineTextStyle(timelineItem) : null;
    const objectURL = createDefaultTextOverlayObjectURL(DEFAULT_TEXT_TEMPLATE_LABEL, initialStyle || undefined);
    timelineItem.dataset.objectUrl = objectURL;
    const initialTransform = calculateDefaultTextTemplateTransform(
        DEFAULT_TEXT_TEMPLATE_LABEL,
        initialStyle || undefined,
    );
    timelineItem.dataset.previewImageTransform = JSON.stringify(initialTransform);
    timelineItem.dataset.autoFitText = 'true';

    assignTimelineInstanceId(timelineItem);

    const label = document.createElement('span');
    label.textContent = DEFAULT_TEXT_TEMPLATE_LABEL;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'timeline-item-remove';
    removeButton.setAttribute('aria-label', 'Remove text overlay');
    removeButton.textContent = '✕';

    try {
        const thumbnail = document.createElement('img');
        thumbnail.className = 'timeline-thumbnail timeline-thumbnail--text';
        thumbnail.src = await generateImageThumbnail(objectURL);
        thumbnail.alt = DEFAULT_TEXT_TEMPLATE_LABEL;
        timelineItem.appendChild(thumbnail);
    } catch (error) {
        console.warn('Unable to generate thumbnail for text overlay.', error);
    }

    timelineItem.appendChild(label);
    timelineItem.appendChild(removeButton);

    setTimelineItemDuration(
        timelineItem,
        'imageDuration',
        overlayDuration,
        { markCustom: false },
    );

    overlayLane.appendChild(timelineItem);
    timelineItem.dataset.laneIndex = overlayLane.dataset.laneIndex || '0';

    if (objectURL) {
        incrementTimelineObjectUrlUsage(objectURL);
    }

    initializeTimelineItem(timelineItem);
    registerTimelineItemInteractions(timelineItem, removeButton);
    preloadTimelineImage(objectURL).catch((error) => {
        console.warn('Failed to warm text overlay image for playback.', error);
    });

    pushTimelineUndoEntry({
        type: 'add-item',
        undo: () => {
            if (timelineItem && timelineItem.isConnected) {
                removeTimelineItem(timelineItem, { recordUndo: false });
            }
        },
    });

    scheduleTimelineLaneReflow(overlayLane);
    scrollTimelineItemIntoView(timelineItem);
    updateTimelineEmptyState();
    updateActiveTimelineIndicators();
    markExportPlaybackContextDirty({ refreshSummary: true });
    refreshImageDurationApplyAllAvailability();
    loadPreviewFromTimeline(activeTimelineItem);

    return timelineItem;
}

if (textTemplateCard) {
    let isActivatingTextTemplate = false;
    const activateTextTemplate = async () => {
        if (isActivatingTextTemplate) {
            return;
        }
        isActivatingTextTemplate = true;
        textTemplateCard.setAttribute('aria-pressed', 'true');
        try {
            await addDefaultTextOverlayToTimeline();
        } finally {
            textTemplateCard.setAttribute('aria-pressed', 'false');
            isActivatingTextTemplate = false;
        }
    };

    textTemplateCard.addEventListener('click', () => {
        activateTextTemplate().catch((error) => {
            console.error('Failed to apply text template.', error);
        });
    });

    textTemplateCard.addEventListener('keydown', (event) => {
        const { key } = event;
        if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar') {
            return;
        }
        event.preventDefault();
        activateTextTemplate().catch((error) => {
            console.error('Failed to apply text template.', error);
        });
    });
}

document.addEventListener('keydown', handleTimelineKeyboardShortcuts);

refreshTimelineObjectUrlUsage();

uploadInput.addEventListener('change', async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
        if (uploadMetaStatus) {
            uploadMetaStatus.textContent = 'No clips added yet';
        }
        if (uploadMetaHint) {
            uploadMetaHint.textContent = 'Tip: drop multiple files to keep your story flowing.';
        }
        return;
    }

    if (uploadMetaStatus) {
        const clipLabel = files.length === 1 ? 'clip' : 'clips';
        uploadMetaStatus.textContent = `${files.length} ${clipLabel} staged`;
    }

    if (uploadMetaHint) {
        const latestFile = files[files.length - 1];
        if (latestFile?.name) {
            const truncatedName = latestFile.name.length > 42
                ? `${latestFile.name.slice(0, 39)}…`
                : latestFile.name;
            uploadMetaHint.textContent = files.length === 1
                ? `Tap + to add ${truncatedName} to the timeline.`
                : `${truncatedName} and ${files.length - 1} more ready — use + to add.`;
        }
    }

    for (const file of files) {
        // eslint-disable-next-line no-await-in-loop
        await stageUpload(file);
    }

    uploadInput.value = '';
});

if (uploadButton) {
    uploadButton.addEventListener('click', () => uploadInput.click());
}

async function playTimelineItem(
    timelineItem,
    segmentDurationMs = null,
    overlayEntriesOverride = null,
    options = {},
) {
    const fileType = timelineItem.dataset.fileType || '';
    const objectURL = timelineItem.dataset.objectUrl;
    const playbackWindow = Number.isFinite(segmentDurationMs)
        ? Math.max(0, Math.round(segmentDurationMs))
        : null;
    const audioSettings = getTimelineItemAudioSettings(timelineItem);
    const startOffsetMs = Number.isFinite(options?.startOffsetMs)
        ? Math.max(0, Math.round(options.startOffsetMs))
        : 0;

    setActiveTimelineItem(timelineItem);

    const laneCache = (typeof getTimelineLaneEntryCache === 'function')
        ? getTimelineLaneEntryCache()
        : null;
    const overlayEntries = getOverlayEntriesForTimelineItem(
        timelineItem,
        overlayEntriesOverride,
        laneCache,
    );
    renderPreviewOverlayLayers(timelineItem, overlayEntries);
    applyCanvasSettingsToPreview(timelineItem);

    if (!objectURL) {
        return;
    }

    cancelPreviewAudioEnvelope({ restoreVolume: false });

    if (fileType.startsWith('video/')) {
        setPreviewMode('has-video');
        resetPreviewScroll();
        setPreviewImageVisibility(false);
        previewImage.removeAttribute('src');
        previewVideo.hidden = true;
        previewVideo.classList.add('is-buffering');
        if (previewArea) {
            previewArea.classList.add('is-buffering');
        }
        const placeholderState = previewPlaceholder
            ? { hidden: previewPlaceholder.hidden, text: previewPlaceholder.textContent }
            : null;
        if (previewPlaceholder) {
            previewPlaceholder.hidden = false;
            previewPlaceholder.textContent = 'Preparing video preview…';
        }
        applyMasterVolumeToPreview(audioSettings.volumePercent, { mediaElement: previewVideo });
        if (typeof refreshPreviewAudioMix === 'function') {
            refreshPreviewAudioMix({
                entries: overlayEntries,
                activeItem: timelineItem,
            });
        }
        preloadTimelineVideo(objectURL).catch(() => {});

        await new Promise((resolve) => {
            let resolved = false;
            let timeoutId = 0;
            let onEnded = null;
            let onError = null;
            const abortController = new AbortController();
            let playbackStarted = false;

            const clearBufferingState = () => {
                previewVideo.classList.remove('is-buffering');
                if (previewArea) {
                    previewArea.classList.remove('is-buffering');
                }
            };

            const restorePlaceholder = () => {
                if (!previewPlaceholder) {
                    return;
                }
                if (placeholderState && typeof placeholderState.text === 'string') {
                    previewPlaceholder.textContent = placeholderState.text;
                } else if (defaultPreviewPlaceholderText) {
                    previewPlaceholder.textContent = defaultPreviewPlaceholderText;
                }
                previewPlaceholder.hidden = true;
            };

            const cleanup = () => {
                if (onEnded) {
                    previewVideo.removeEventListener('ended', onEnded);
                }
                if (onError) {
                    previewVideo.removeEventListener('error', onError);
                }
                if (!abortController.signal.aborted) {
                    abortController.abort();
                }
                clearBufferingState();
                restorePlaceholder();
                cancelPreviewAudioEnvelope({ restoreVolume: true });
            };

            let playbackSyncSource = null;
            const clipTimelineStart = Math.max(
                0,
                Math.round(Number(getTimelineItemStartTime(timelineItem, laneCache)) || 0),
            );

            const finalize = () => {
                if (resolved) {
                    return;
                }
                resolved = true;
                window.clearTimeout(timeoutId);
                cleanup();
                previewVideo.pause();
                previewVideo.loop = false;
                if (!isTimelinePaused) {
                    previewVideo.currentTime = 0;
                }
                if (timelinePlaybackAbort === abortPlayback) {
                    timelinePlaybackAbort = null;
                }
                if (playbackSyncSource) {
                    clearTimelinePlaybackSyncSource(playbackSyncSource);
                    playbackSyncSource = null;
                }
                resolve();
            };

            const ensureVideoDuration = () => {
                const intrinsic = Number.isFinite(previewVideo.duration)
                    && previewVideo.duration > 0
                    ? Math.round(previewVideo.duration * 1000)
                    : 0;
                if (intrinsic > 0) {
                    timelineItem.dataset.minVideoDuration = String(intrinsic);
                }
                const minimum = getTimelineItemMinimumDuration(timelineItem);
                const currentDuration = Number(timelineItem.dataset.videoDuration);
                const nextDuration = Number.isFinite(currentDuration) && currentDuration > 0
                    ? Math.max(currentDuration, minimum)
                    : minimum;
                const limitedDuration = playbackWindow === null
                    ? nextDuration
                    : Math.min(nextDuration, playbackWindow);
                const effectiveDuration = Math.max(
                    0,
                    Number.isFinite(limitedDuration) ? Math.round(limitedDuration) : 0,
                );
                if (nextDuration !== currentDuration) {
                    setTimelineItemDuration(timelineItem, 'videoDuration', nextDuration);
                    updateActiveTimelineIndicators();
                } else {
                    updateTimelineItemDurationBadge(timelineItem, nextDuration);
                }
                return {
                    intrinsicDuration: intrinsic,
                    targetDuration: nextDuration,
                    effectiveDuration,
                };
            };

            const beginPlayback = async () => {
                if (playbackStarted) {
                    return;
                }
                playbackStarted = true;

                if (!isTimelinePlaying) {
                    finalize();
                    return;
                }

                const { intrinsicDuration, targetDuration, effectiveDuration } = ensureVideoDuration();
                const maximumSeekDuration = intrinsicDuration > 0
                    ? intrinsicDuration
                    : targetDuration;
                const safeStartOffset = Math.min(
                    startOffsetMs,
                    Math.max(0, maximumSeekDuration),
                );
                const startOffsetSeconds = safeStartOffset / 1000;
                const shouldLoop = intrinsicDuration > 0
                    && effectiveDuration > intrinsicDuration + 50;
                previewVideo.loop = shouldLoop;
                window.clearTimeout(timeoutId);
                if (effectiveDuration > 0) {
                    timeoutId = window.setTimeout(() => {
                        finalize();
                    }, effectiveDuration);
                } else if (playbackWindow === 0) {
                    finalize();
                    return;
                }

                previewVideo.muted = false;
                let mixGain = clampVolume(audioSettings.volumePercent / 100);
                if (typeof refreshPreviewAudioMix === 'function') {
                    const mix = refreshPreviewAudioMix({ activeItem: timelineItem });
                    if (mix?.gainsByItem instanceof Map && mix.gainsByItem.has(timelineItem)) {
                        mixGain = clampVolume(mix.gainsByItem.get(timelineItem));
                    }
                }
                const previewState = getMediaEnvelopeState(previewVideo);
                if (previewState) {
                    previewState.baseVolume = mixGain;
                }
                if (audioSettings.fadeInMs > 0 && mixGain > 0) {
                    previewVideo.volume = 0;
                } else {
                    previewVideo.volume = mixGain;
                }

                try {
                    await waitForMediaReady(previewVideo, { signal: abortController.signal });
                } catch (error) {
                    if (abortController.signal.aborted) {
                        return;
                    }
                    console.warn('Preview video was unable to buffer before playback.', error);
                    finalize();
                    return;
                }

                clearBufferingState();
                restorePlaceholder();
                previewVideo.hidden = false;

                const seekToStartOffset = () => new Promise((resolveSeek) => {
                    if (safeStartOffset <= 0) {
                        previewVideo.currentTime = 0;
                        resolveSeek();
                        return;
                    }

                    let settled = false;
                    const cleanupSeek = () => {
                        if (settled) {
                            return;
                        }
                        settled = true;
                        previewVideo.removeEventListener('seeked', handleSeeked);
                        previewVideo.removeEventListener('error', handleError);
                        if (abortController) {
                            abortController.signal.removeEventListener('abort', handleAbort);
                        }
                        resolveSeek();
                    };
                    const handleSeeked = () => {
                        cleanupSeek();
                    };
                    const handleError = () => {
                        cleanupSeek();
                    };
                    const handleAbort = () => {
                        cleanupSeek();
                    };

                    previewVideo.addEventListener('seeked', handleSeeked);
                    previewVideo.addEventListener('error', handleError);
                    if (abortController) {
                        abortController.signal.addEventListener('abort', handleAbort);
                    }

                    try {
                        previewVideo.currentTime = startOffsetSeconds;
                        if (previewVideo.readyState >= 2
                            && Math.abs(previewVideo.currentTime - startOffsetSeconds) < 0.05
                        ) {
                            cleanupSeek();
                        }
                    } catch (error) {
                        cleanupSeek();
                    }
                });

                await seekToStartOffset();

                await ensurePreviewFrameSettled({ signal: abortController.signal });

                if (typeof updateTimelinePlaybackSyncFallback === 'function') {
                    updateTimelinePlaybackSyncFallback(resumeTimelineTime);
                }

                try {
                    const playPromise = previewVideo.play();
                    if (playPromise && typeof playPromise.then === 'function') {
                        await playPromise;
                    }
                    applyPreviewAudioEnvelope(audioSettings, effectiveDuration, {
                        mixGain,
                        clipOffsetMs: safeStartOffset,
                        clipTotalDurationMs: targetDuration,
                    });
                    if (isTimelinePlaying) {
                        if (playbackSyncSource) {
                            clearTimelinePlaybackSyncSource(playbackSyncSource);
                        }
                        const syncSource = {
                            priority: 10,
                            getTimelineTime: () => {
                                if (!previewVideo) {
                                    return Number.NaN;
                                }
                                const mediaTimeSeconds = Number(previewVideo.currentTime) || 0;
                                const mediaTimeMs = Math.max(0, Math.round(mediaTimeSeconds * 1000));
                                return clipTimelineStart + mediaTimeMs;
                            },
                        };
                        playbackSyncSource = syncSource;
                        setTimelinePlaybackSyncSource(syncSource);
                    }
                } catch (error) {
                    if (abortController.signal.aborted) {
                        return;
                    }
                    console.warn('Preview video failed to start playback.', error);
                    finalize();
                }
            };

            const abortPlayback = () => {
                finalize();
            };

            timelinePlaybackAbort = abortPlayback;

            onEnded = () => {
                if (!previewVideo.loop) {
                    finalize();
                }
            };

            onError = () => {
                finalize();
            };

            previewVideo.addEventListener('ended', onEnded);
            previewVideo.addEventListener('error', onError);

            const startPlayback = () => {
                if (resolved) {
                    return;
                }
                void beginPlayback();
            };

            if (previewVideo.src !== objectURL) {
                previewVideo.pause();
                previewVideo.src = objectURL;
                previewVideo.load();
                startPlayback();
            } else if (previewVideo.readyState >= 2) {
                startPlayback();
            } else {
                previewVideo.load();
                startPlayback();
            }
        });
    } else if (fileType.startsWith('audio/')) {
        cancelPreviewExitAnimation({ forceRestore: true });
        setPreviewMode(null);
        previewVideo.pause();
        previewVideo.hidden = true;
        previewVideo.removeAttribute('src');
        if (previewPlaceholder) {
            previewPlaceholder.hidden = false;
            previewPlaceholder.textContent = 'Audio clip ready — press Play Back to hear it';
        }

        preloadTimelineAudio(objectURL).catch(() => {});

        const clipDuration = Math.max(0, getTimelineItemPlaybackDuration(timelineItem));
        const remainingClipDuration = Math.max(0, clipDuration - startOffsetMs);
        const playbackWindowMs = Number.isFinite(playbackWindow)
            ? Math.max(0, Math.round(playbackWindow))
            : null;
        const effectiveDuration = playbackWindowMs === null
            ? remainingClipDuration
            : Math.min(remainingClipDuration, playbackWindowMs);
        const baseSegmentStart = Math.max(
            0,
            Math.round(Number(getTimelineItemStartTime(timelineItem, laneCache)) || 0),
        );
        const segmentStartTime = baseSegmentStart + startOffsetMs;

        syncPreviewAudioOverlay(overlayEntries, segmentStartTime);
        playVideoButton.textContent = 'Play Back';
        applyImageBlurToPreview(0);
        await waitForGapDuration(effectiveDuration);
    } else if (fileType.startsWith('image/')) {
        const rawClipDuration = Number(timelineItem.dataset.imageDuration);
        const clipDuration = Number.isFinite(rawClipDuration) && rawClipDuration > 0
            ? Math.round(rawClipDuration)
            : IMAGE_FRAME_DURATION;
        const playbackWindowMs = Number.isFinite(playbackWindow)
            ? Math.max(0, Math.round(playbackWindow))
            : null;
        const effectiveDuration = playbackWindowMs === null
            ? clipDuration
            : Math.min(clipDuration, playbackWindowMs);
        const safeEffectiveDuration = Math.max(0, effectiveDuration);
        const initialElapsed = Math.min(startOffsetMs, clipDuration);
        const totalElapsed = initialElapsed + safeEffectiveDuration;
        const clipPlaysToEnd = clipDuration === 0 || totalElapsed >= clipDuration;
        const animationClipDuration = clipDuration > 0 ? clipDuration : safeEffectiveDuration;
        const skipEntranceAnimation = startOffsetMs > 0;
        const initialProgress = clipDuration > 0
            ? clampProgress(initialElapsed / clipDuration)
            : 0;
        const animationSettings = getTimelineItemAnimationSettings(timelineItem);
        const entranceConfigOverride = getPreviewImageEntranceConfig({
            clipDurationMs: animationClipDuration,
            settingsOverride: animationSettings,
        });
        const exitConfig = getPreviewImageExitConfig({
            clipDurationMs: animationClipDuration,
            settingsOverride: animationSettings,
        });
        const exitWindow = exitConfig
            ? Math.min(animationClipDuration, Math.max(0, exitConfig.totalDuration))
            : 0;
        setPreviewMode('has-image');
        previewVideo.pause();
        previewVideo.hidden = true;
        previewVideo.removeAttribute('src');
        setPreviewImageVisibility(true);
        previewPlaceholder.hidden = true;
        const imageBlurAmount = getTimelineItemImageBlur(timelineItem, initialProgress);
        applyImageBlurToPreview(imageBlurAmount);
        await revealPreviewImageSource(objectURL, {
            clipDurationMs: animationClipDuration,
            entranceConfigOverride,
            immediate: skipEntranceAnimation,
        });
        resetPreviewScroll();
        setActiveClipProgress(initialProgress, { source: 'image-playback' });

        await new Promise((resolve) => {
            let resolved = false;
            const clipTimelineStart = Math.max(
                0,
                Math.round(Number(getTimelineItemStartTime(timelineItem, laneCache)) || 0),
            );
            const resumeClipElapsed = initialElapsed;
            const resumeTimelineTime = clipTimelineStart + resumeClipElapsed;
            const playbackStartTimestamp = performance.now();
            if (typeof updateTimelinePlaybackSyncFallback === 'function') {
                updateTimelinePlaybackSyncFallback(resumeTimelineTime);
            }
            let animationFrameId = 0;
            let exitAnimationRequested = false;
            let exitAnimationStarted = false;
            let exitAnimationCompleteResolve = null;
            const exitAnimationCompletePromise = exitConfig
                ? new Promise((promiseResolve) => {
                    exitAnimationCompleteResolve = promiseResolve;
                })
                : Promise.resolve();

            const markExitAnimationComplete = () => {
                if (exitAnimationCompleteResolve) {
                    exitAnimationCompleteResolve();
                    exitAnimationCompleteResolve = null;
                }
            };

            const stopAnimation = () => {
                if (animationFrameId) {
                    window.cancelAnimationFrame(animationFrameId);
                    animationFrameId = 0;
                }
            };

            const startExitAnimation = (options = {}) => {
                if (!exitConfig) {
                    return false;
                }

                const force = options.force === true;
                if (!force && exitAnimationRequested) {
                    return exitAnimationStarted;
                }

                exitAnimationRequested = true;

                const didAnimate = runPreviewImageExitAnimation({
                    restoreOnComplete: false,
                    onComplete: () => {
                        markExitAnimationComplete();
                    },
                }, exitConfig);

                if (didAnimate) {
                    exitAnimationStarted = true;
                    const cleanup = previewExitAnimationState?.cleanup;
                    if (typeof cleanup === 'function') {
                        previewExitAnimationState.cleanup = (...cleanupArgs) => {
                            try {
                                cleanup(...cleanupArgs);
                            } finally {
                                markExitAnimationComplete();
                            }
                        };
                    }
                } else {
                    markExitAnimationComplete();
                    exitAnimationRequested = false;
                }

                return didAnimate;
            };

            const exitStartTime = exitConfig
                ? Math.max(0, clipDuration - exitWindow)
                : Number.POSITIVE_INFINITY;

            const step = () => {
                if (resolved || !isTimelinePlaying) {
                    return;
                }

                const now = performance.now();
                const wallElapsed = Math.max(0, now - playbackStartTimestamp);
                const fallbackTimelineTime = resumeTimelineTime + wallElapsed;
                const syncedTimelineTime = typeof getTimelinePlaybackSyncedElapsed === 'function'
                    ? getTimelinePlaybackSyncedElapsed(fallbackTimelineTime, now)
                    : fallbackTimelineTime;
                const clipElapsed = Math.max(
                    0,
                    Math.min(clipDuration, syncedTimelineTime - clipTimelineStart),
                );
                const elapsedSinceResume = Math.max(0, clipElapsed - resumeClipElapsed);
                const playbackProgress = clipDuration > 0
                    ? clampProgress(clipElapsed / clipDuration)
                    : 0;

                setActiveClipProgress(playbackProgress, { source: 'image-playback' });

                if (exitConfig && !exitAnimationRequested) {
                    const shouldStartExit = clipPlaysToEnd
                        && (safeEffectiveDuration === 0 || clipElapsed >= exitStartTime);
                    if (shouldStartExit) {
                        startExitAnimation();
                    }
                }

                if (elapsedSinceResume < safeEffectiveDuration && isTimelinePlaying) {
                    animationFrameId = window.requestAnimationFrame(step);
                }
            };

            animationFrameId = window.requestAnimationFrame(step);

            if (exitConfig && clipPlaysToEnd && safeEffectiveDuration === 0) {
                // When there is no playback window remaining we previously forced
                // the exit animation to run which removed the current frame before
                // the next clip had a chance to render. That caused a brief flash
                // at clip boundaries. Instead, skip triggering the exit animation
                // and resolve the completion promise immediately so the existing
                // frame stays visible until the next clip is ready.
                markExitAnimationComplete();
            }

            let timeoutId = 0;

            const finalize = async () => {
                if (resolved) {
                    return;
                }
                resolved = true;
                window.clearTimeout(timeoutId);
                stopAnimation();

                if (!exitAnimationRequested || !exitConfig || !exitAnimationStarted) {
                    markExitAnimationComplete();
                }

                try {
                    await exitAnimationCompletePromise;
                } catch (error) {
                    // Ignore exit animation timing errors during playback finalization.
                }

                const finalElapsed = Math.min(
                    clipDuration,
                    initialElapsed + safeEffectiveDuration,
                );
                const finalProgress = clipDuration > 0
                    ? clampProgress(finalElapsed / clipDuration)
                    : 1;
                setActiveClipProgress(finalProgress, { source: 'image-playback-end', updatePreview: false });
                if (timelinePlaybackAbort === abortPlayback) {
                    timelinePlaybackAbort = null;
                }
                resolve();
            };

            timeoutId = window.setTimeout(() => {
                if (resolved) {
                    return;
                }
                if (clipPlaysToEnd) {
                    startExitAnimation({ force: true });
                }
                finalize();
            }, Math.max(0, Math.round(safeEffectiveDuration)));

            const abortPlayback = () => {
                if (resolved) {
                    return;
                }
                cancelPreviewExitAnimation({ forceRestore: true });
                finalize();
            };

            timelinePlaybackAbort = abortPlayback;
        });
    }
}

function waitForGapDuration(durationMs) {
    return new Promise((resolve) => {
        const safeDuration = Math.max(0, Math.round(Number(durationMs) || 0));
        if (safeDuration <= 0) {
            resolve();
            return;
        }

        let resolved = false;
        const timeoutId = window.setTimeout(() => {
            if (resolved) {
                return;
            }
            resolved = true;
            if (timelinePlaybackAbort === abortGapPlayback) {
                timelinePlaybackAbort = null;
            }
            resolve();
        }, safeDuration);

        const abortGapPlayback = () => {
            if (resolved) {
                return;
            }
            resolved = true;
            window.clearTimeout(timeoutId);
            timelinePlaybackAbort = null;
            resolve();
        };

        timelinePlaybackAbort = abortGapPlayback;
    });
}

async function playTimelineSequence(startIndex = 0, resumeOptions = null, playbackContext = null) {
    const timelineItems = Array.isArray(playbackContext?.timelineItems)
        ? playbackContext.timelineItems
        : getTimelineItems();
    if (!timelineItems.length) {
        alert('Upload an image or video to build your timeline.');
        return false;
    }

    const playbackState = playbackContext?.playbackState || getTimelinePlaybackSegments();
    const laneCache = playbackState?.laneCache || null;
    const segments = Array.isArray(playbackState?.segments)
        ? playbackState.segments
        : [];
    const totalDuration = Number.isFinite(playbackState?.totalDuration)
        ? playbackState.totalDuration
        : 0;
    if (!segments.length || totalDuration <= 0) {
        alert('Upload an image or video to build your timeline.');
        return false;
    }

    const resumeTimeMs = Number.isFinite(resumeOptions?.timeMs)
        ? Math.max(0, Math.round(resumeOptions.timeMs))
        : null;

    const boundedIndex = Math.min(
        Math.max(0, startIndex),
        Math.max(timelineItems.length - 1, 0),
    );
    const initialItem = timelineItems[boundedIndex] || null;
    let initialSegmentIndex = 0;
    if (resumeTimeMs !== null) {
        const resumeSegmentIndex = segments.findIndex(
            (segment) => resumeTimeMs >= segment.start && resumeTimeMs < segment.end,
        );
        if (resumeSegmentIndex >= 0) {
            initialSegmentIndex = resumeSegmentIndex;
        } else if (resumeTimeMs >= totalDuration) {
            initialSegmentIndex = segments.length ? segments.length - 1 : 0;
        }
    } else if (initialItem) {
        const foundSegmentIndex = segments.findIndex(
            (segment) => segment.item === initialItem,
        );
        if (foundSegmentIndex >= 0) {
            initialSegmentIndex = foundSegmentIndex;
        }
    }
    const startSegment = segments[initialSegmentIndex] || null;
    const startElapsed = resumeTimeMs !== null
        ? Math.min(resumeTimeMs, totalDuration)
        : (startSegment ? startSegment.start : 0);

    isTimelinePaused = false;
    timelinePauseState = null;
    isTimelinePlaying = true;
    playVideoButton.textContent = 'Pause playback';
    updateKeyframeControlsState();
    resetTimelineProgressLine(getTimelineFractionForTime(startElapsed, laneCache));
    updatePlaybackTimeDisplay(startElapsed, totalDuration);
    startPlaybackClock(startElapsed, totalDuration);

    let completedNaturally = true;
    let pendingResumeTime = resumeTimeMs;

    try {
        for (let index = initialSegmentIndex; index < segments.length; index += 1) {
            if (!isTimelinePlaying) {
                completedNaturally = false;
                break;
            }
            const segment = segments[index];
            const { item, start, end, duration } = segment;
            if (duration <= 0) {
                continue;
            }
            if (pendingResumeTime !== null && pendingResumeTime >= end) {
                continue;
            }
            const nextSegment = segments[index + 1];
            if (nextSegment?.item) {
                const nextUrl = nextSegment.item.dataset?.objectUrl;
                const nextType = nextSegment.item.dataset?.fileType || '';
                if (nextUrl && nextType.startsWith('image/')) {
                    preloadTimelineImage(nextUrl).catch(() => {});
                }
            }
            let segmentStartTime = start;
            
            if (pendingResumeTime !== null) {
                if (pendingResumeTime <= start) {
                    segmentStartTime = start;
                    
                } else if (pendingResumeTime < end) {
                    segmentStartTime = pendingResumeTime;
                    
                } else {
                    continue;
                }
            }

            let segmentStartOffset = 0;
            if (item) {
                const clipStartTime = Math.max(
                    0,
                    Math.round(Number(getTimelineItemStartTime(item, laneCache)) || 0),
                );
                const clipDuration = Math.max(
                    0,
                    Math.round(Number(getTimelineItemPlaybackDuration(item)) || 0),
                );
                const offsetFromClipStart = Number.isFinite(segmentStartTime)
                    ? Math.round(segmentStartTime - clipStartTime)
                    : 0;
                segmentStartOffset = Math.max(0, offsetFromClipStart);
                if (clipDuration > 0) {
                    segmentStartOffset = Math.min(segmentStartOffset, clipDuration);
                }
            }
            
            syncPreviewAudioOverlay(segment.items || [], segmentStartTime);
            if (typeof updateTimelinePlaybackSyncFallback === 'function') {
                updateTimelinePlaybackSyncFallback(segmentStartTime);
            }
            const startFraction = getTimelineFractionForTime(segmentStartTime, laneCache);
            const endFraction = getTimelineFractionForTime(end, laneCache);
            const remainingDuration = pendingResumeTime !== null
                ? Math.max(0, Math.round(end - segmentStartTime))
                : duration;
            animateTimelineProgress(startFraction, endFraction, remainingDuration);
            if (item) {
                // eslint-disable-next-line no-await-in-loop
                await playTimelineItem(item, remainingDuration, segment.items || null, {
                    startOffsetMs: segmentStartOffset,
                });
            } else {
                // eslint-disable-next-line no-await-in-loop
                await waitForGapDuration(remainingDuration);
            }
            pendingResumeTime = null;
        }
    } finally {
        const preservePause = isTimelinePaused;
        stopTimelinePlayback(!preservePause, !preservePause, { preservePauseState: preservePause });
        if (completedNaturally && !isTimelinePaused) {
            resetTimelineProgressLine(totalDuration > 0 ? 1 : 0);
            updatePlaybackTimeDisplay(totalDuration, totalDuration);
        } else if (!isTimelinePaused) {
            updateActiveTimelineIndicators();
        }
    }

    if (typeof renderExportSummary === 'function') {
        renderExportSummary(timelineItems, completedNaturally, playbackState);
    }

    return completedNaturally;
}

function pauseTimelinePlayback() {
    if (!isTimelinePlaying || isTimelinePaused) {
        return;
    }

    const { segments, totalDuration } = getTimelinePlaybackSegments();
    if (!segments.length || totalDuration <= 0) {
        return;
    }

    const timelineItems = getTimelineItems();
    const clampedTime = Math.max(
        0,
        Math.min(Number(playbackDisplayCurrentMs) || 0, totalDuration),
    );

    const segmentIndex = segments.findIndex(
        (segment) => clampedTime >= segment.start && clampedTime < segment.end,
    );
    const activeIndex = activeTimelineItem ? timelineItems.indexOf(activeTimelineItem) : -1;
    const fallbackIndex = segmentIndex >= 0 && segments[segmentIndex].item
        ? timelineItems.indexOf(segments[segmentIndex].item)
        : -1;
    const resumeItemIndex = activeIndex >= 0
        ? activeIndex
        : (fallbackIndex >= 0 ? fallbackIndex : 0);

    const pauseState = {
        resumeItemIndex,
        resumeTimeMs: clampedTime,
    };

    isTimelinePaused = true;
    timelinePauseState = pauseState;

    stopTimelinePlayback(false, false, { preservePauseState: true });

    const pausedFraction = totalDuration > 0
        ? clampProgress(clampedTime / totalDuration)
        : 0;
    applyTimelineProgressGeometry();
    setTimelineProgressVisuals(pausedFraction, { forceGeometryUpdate: true });
    updatePlaybackTimeDisplay(clampedTime, totalDuration);
    playVideoButton.textContent = 'Resume playback';
}

function resumeTimelinePlayback() {
    if (!isTimelinePaused || !timelinePauseState) {
        return;
    }

    const timelineItems = getTimelineItems();
    if (!timelineItems.length) {
        isTimelinePaused = false;
        timelinePauseState = null;
        playVideoButton.textContent = 'Play Back';
        return;
    }

    const { resumeItemIndex, resumeTimeMs } = timelinePauseState;
    const { totalDuration } = getTimelinePlaybackSegments();
    const clampedResumeTime = Math.max(
        0,
        Math.min(Number(resumeTimeMs) || 0, totalDuration),
    );

    if (clampedResumeTime >= totalDuration) {
        isTimelinePaused = false;
        timelinePauseState = null;
        resetTimelineProgressLine(totalDuration > 0 ? 1 : 0);
        updatePlaybackTimeDisplay(totalDuration, totalDuration);
        playVideoButton.textContent = 'Play Back';
        return;
    }

    const boundedIndex = Math.min(
        Math.max(0, Number(resumeItemIndex) || 0),
        Math.max(timelineItems.length - 1, 0),
    );

    isTimelinePaused = false;
    timelinePauseState = null;

    playTimelineSequence(boundedIndex, { timeMs: clampedResumeTime }).catch((error) => {
        console.error('Timeline playback failed.', error);
    });
}

if (exportButton) {
    exportButton.addEventListener('click', () => {
        const timelineItems = getTimelineItems();
        if (!timelineItems.length) {
            alert('Upload an image or video to build your timeline.');
            return;
        }

        if (isTimelinePlaying) {
            stopTimelinePlayback();
        }

        const originalLabel = exportButton.textContent;
        exportButton.disabled = true;
        exportButton.textContent = 'Preparing export…';

        try {
            const exportContext = prepareExportPlaybackContext(timelineItems);
            renderExportSummary(
                exportContext.timelineItems,
                null,
                exportContext.playbackState,
            );
        } finally {
            exportButton.disabled = false;
            exportButton.textContent = originalLabel || 'Export video';
        }

        openExportDialog();
    });
}

let exportAbortController = null;

function abortActiveExport(reason = null) {
    if (!exportAbortController) {
        return;
    }

    const { signal } = exportAbortController;
    if (signal.aborted) {
        return;
    }

    const abortReason = reason
        || new DOMException('Export aborted by user.', 'AbortError');
    try {
        exportAbortController.abort(abortReason);
    } catch (error) {
        // Ignore abort errors caused by invalid controller state.
    }
}

function getAbortSignal(options) {
    if (!options) {
        return null;
    }

    if (typeof AbortSignal !== 'undefined' && options instanceof AbortSignal) {
        return options;
    }

    if (typeof options === 'object' && options !== null) {
        const { signal } = options;
        if (typeof AbortSignal !== 'undefined' && signal instanceof AbortSignal) {
            return signal;
        }
    }

    return null;
}

if (cancelExportButton) {
    cancelExportButton.addEventListener('click', () => {
        if (isExportingTimeline) {
            if (exportDialogStatus) {
                exportDialogStatus.dataset.state = 'progress';
                exportDialogStatus.textContent = 'Cancelling export…';
            }
            abortActiveExport(new DOMException('Export cancelled by user.', 'AbortError'));
            return;
        }
        closeExportDialog();
        resetExportPlaybackContext();
    });
}

let sharedExportAudioContext = null;
let sharedExportAudioSources = new WeakMap();
let pendingExportPlaybackContext = null;

function stabilizeAudioTrack(track) {
    if (!track) {
        return;
    }

    track.enabled = true;

    if (typeof track.applyConstraints === 'function') {
        const stabilityConstraints = {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
        };
        track.applyConstraints(stabilityConstraints).catch(() => {});
    }
}

function createSilentAudioKeepAlive(audioContext, destinationNode) {
    if (!audioContext || !destinationNode) {
        return null;
    }

    try {
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0;

        let sourceNode = null;
        if (typeof audioContext.createConstantSource === 'function') {
            sourceNode = audioContext.createConstantSource();
            sourceNode.offset.value = 0;
        } else if (typeof audioContext.createOscillator === 'function') {
            sourceNode = audioContext.createOscillator();
            sourceNode.frequency.value = 0;
        }

        if (!sourceNode) {
            return null;
        }

        sourceNode.connect(gainNode);
        gainNode.connect(destinationNode);

        if (typeof sourceNode.start === 'function') {
            sourceNode.start();
        }

        return {
            stop: () => {
                try {
                    if (typeof sourceNode.stop === 'function') {
                        sourceNode.stop();
                    }
                } catch (stopError) {
                    // Ignore stop errors when tearing down the keep-alive node.
                }
                try {
                    gainNode.disconnect();
                } catch (disconnectError) {
                    // Ignore disconnect errors when tearing down the keep-alive node.
                }
            },
        };
    } catch (error) {
        return null;
    }
}

function waitForDuration(durationMs, options = {}) {
    const safeDuration = Math.max(0, Math.round(Number(durationMs) || 0));
    if (safeDuration <= 0) {
        return Promise.resolve();
    }

    const signal = getAbortSignal(options);

    return new Promise((resolve) => {
        if (signal?.aborted) {
            resolve();
            return;
        }

        let timeoutId = 0;
        const finalize = () => {
            if (timeoutId) {
                window.clearTimeout(timeoutId);
                timeoutId = 0;
            }
            if (signal) {
                signal.removeEventListener('abort', handleAbort);
            }
            resolve();
        };
        const handleAbort = () => {
            finalize();
        };

        timeoutId = window.setTimeout(finalize, safeDuration);

        if (signal) {
            signal.addEventListener('abort', handleAbort, { once: true });
        }
    });
}

function waitForPreviewImageReady(timeoutMs = 1200) {
    if (!previewImage || previewImage.hidden) {
        return Promise.resolve();
    }

    if (previewImage.complete && previewImage.naturalWidth > 0) {
        return Promise.resolve();
    }

    const safeTimeout = Math.max(0, Math.round(Number(timeoutMs) || 0));

    return new Promise((resolve) => {
        let settled = false;
        let safeTimeoutHandle = 0;

        const finalize = () => {
            if (settled) {
                return;
            }
            settled = true;
            if (safeTimeoutHandle) {
                window.clearTimeout(safeTimeoutHandle);
            }
            previewImage.removeEventListener('load', finalize);
            previewImage.removeEventListener('error', finalize);
            resolve();
        };

        previewImage.addEventListener('load', finalize, { once: true });
        previewImage.addEventListener('error', finalize, { once: true });
        if (safeTimeout > 0) {
            safeTimeoutHandle = window.setTimeout(finalize, safeTimeout);
        }

        if (previewImage.complete && previewImage.naturalWidth > 0) {
            finalize();
        }
    });
}

function seekMediaElementTo(mediaElement, timeSeconds, options = {}) {
    if (!mediaElement || !Number.isFinite(timeSeconds)) {
        return Promise.resolve();
    }

    const timeoutMs = Math.max(0, Math.round(Number(options.timeoutMs) || 0));
    const signal = getAbortSignal(options);

    return new Promise((resolve) => {
        if (signal?.aborted) {
            resolve();
            return;
        }

        let settled = false;
        let timeoutId = 0;

        const cleanup = () => {
            mediaElement.removeEventListener('seeked', handleSeeked);
            mediaElement.removeEventListener('error', handleError);
            mediaElement.removeEventListener('loadeddata', handleLoadedData);
            if (timeoutId) {
                window.clearTimeout(timeoutId);
            }
            if (signal) {
                signal.removeEventListener('abort', handleAbort);
            }
        };

        const finalize = () => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            resolve();
        };

        const handleSeeked = () => {
            finalize();
        };

        const handleError = () => {
            finalize();
        };

        const handleLoadedData = () => {
            finalize();
        };

        const handleAbort = () => {
            finalize();
        };

        mediaElement.addEventListener('seeked', handleSeeked);
        mediaElement.addEventListener('error', handleError);
        mediaElement.addEventListener('loadeddata', handleLoadedData);

        if (timeoutMs > 0) {
            timeoutId = window.setTimeout(finalize, timeoutMs);
        }

        if (signal) {
            signal.addEventListener('abort', handleAbort, { once: true });
        }

        try {
            mediaElement.currentTime = timeSeconds;
            if (Math.abs((mediaElement.currentTime || 0) - timeSeconds) < 0.01) {
                finalize();
            }
        } catch (error) {
            finalize();
        }
    });
}

async function primeExportStartFrame(playbackContext, options = {}) {
    const signal = getAbortSignal(options);
    const playbackState = playbackContext?.playbackState || getTimelinePlaybackSegments();
    const segments = Array.isArray(playbackState?.segments) ? playbackState.segments : [];
    const frameRate = Math.max(1, Math.min(60, Math.round(options.frameRate) || 30));

    seekTimelineToFraction(0);

    if (signal?.aborted) {
        return;
    }

    const firstPlayableSegment = segments.find((segment) => segment && Number(segment.duration) > 0)
        || segments[0]
        || null;

    const activeItem = firstPlayableSegment?.item || activeTimelineItem || null;

    if (!activeItem) {
        await waitForNextFrame({ signal });
        return;
    }

    const fileType = activeItem.dataset.fileType || '';
    const laneCache = playbackState?.laneCache || null;
    const clipStartTime = Number.isFinite(firstPlayableSegment?.start)
        ? getTimelineItemStartTime(activeItem, laneCache)
        : 0;
    const segmentStart = Number.isFinite(firstPlayableSegment?.start)
        ? firstPlayableSegment.start
        : (clipStartTime || 0);
    const startOffsetMs = Math.max(0, Math.round(segmentStart - (clipStartTime || 0)));

    if (fileType.startsWith('video/')) {
        const objectUrl = activeItem.dataset.objectUrl || '';
        const targetTimeSeconds = startOffsetMs / 1000;
        const placeholderSnapshot = previewPlaceholder
            ? { hidden: previewPlaceholder.hidden, text: previewPlaceholder.textContent }
            : null;
        let bufferingActive = false;
        const enterBuffering = (message) => {
            bufferingActive = true;
            previewVideo.classList.add('is-buffering');
            previewVideo.hidden = true;
            if (previewArea) {
                previewArea.classList.add('is-buffering');
            }
            if (previewPlaceholder) {
                previewPlaceholder.hidden = false;
                previewPlaceholder.textContent = message;
            }
        };
        const exitBuffering = (options = {}) => {
            if (!bufferingActive) {
                return;
            }
            bufferingActive = false;
            previewVideo.classList.remove('is-buffering');
            if (previewArea) {
                previewArea.classList.remove('is-buffering');
            }
            if (previewPlaceholder) {
                if (options.keepPlaceholderHidden) {
                    previewPlaceholder.hidden = true;
                } else if (placeholderSnapshot) {
                    previewPlaceholder.hidden = placeholderSnapshot.hidden;
                } else {
                    previewPlaceholder.hidden = true;
                }
                if (placeholderSnapshot && typeof placeholderSnapshot.text === 'string') {
                    previewPlaceholder.textContent = placeholderSnapshot.text;
                } else if (!previewPlaceholder.hidden && defaultPreviewPlaceholderText) {
                    previewPlaceholder.textContent = defaultPreviewPlaceholderText;
                }
            }
        };

        enterBuffering('Preparing export preview…');
        previewVideo.pause();

        if (objectUrl) {
            try {
                await preloadTimelineVideo(objectUrl);
            } catch (warmupError) {
                if (!signal?.aborted) {
                    console.warn('First clip video could not buffer before export.', warmupError);
                }
            }
            if (signal?.aborted) {
                exitBuffering();
                return;
            }
            if (previewVideo.src !== objectUrl) {
                try {
                    previewVideo.src = objectUrl;
                    previewVideo.load();
                } catch (setSourceError) {
                    console.warn('Unable to prime export preview video source.', setSourceError);
                }
            }
        }

        try {
            await waitForMediaReady(previewVideo, { signal });
            if (signal?.aborted) {
                exitBuffering();
                return;
            }
        } catch (error) {
            exitBuffering();
            if (signal?.aborted) {
                return;
            }
            console.warn('First clip video could not buffer before export.', error);
        }

        await seekMediaElementTo(previewVideo, targetTimeSeconds, { timeoutMs: 900, signal });
        if (signal?.aborted) {
            exitBuffering();
            return;
        }

        previewVideo.pause();
        previewVideo.hidden = false;
        exitBuffering({ keepPlaceholderHidden: true });
        await ensurePreviewFrameSettled({
            signal,
            frameCount: Math.max(2, Math.round(frameRate / 24)),
        });
    } else if (fileType.startsWith('image/')) {
        await waitForPreviewImageReady(1500);
        if (signal?.aborted) {
            return;
        }
        applyActiveImageKeyframe({ reason: 'export-pre-roll' });
        applyActiveImageBlurKeyframe({ reason: 'export-pre-roll' });
    } else {
        refreshActiveOverlayLayers();
        const objectUrl = activeItem.dataset.objectUrl || '';
        if (objectUrl) {
            try {
                await preloadTimelineAudio(objectUrl);
            } catch (error) {
                if (!signal?.aborted) {
                    console.warn('First clip audio could not buffer before export.', error);
                }
            }
        }
    }

    const warmupFrames = Math.max(1, Math.min(4, Math.round(frameRate / 24)));
    for (let index = 0; index < warmupFrames; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        await waitForNextFrame({ signal });
        if (signal?.aborted) {
            return;
        }
    }
}

async function runExportPreRoll(preRollMs, frameRate, options = {}) {
    const signal = getAbortSignal(options);
    const safePreRoll = Math.max(0, Math.round(Number(preRollMs) || 0));
    const warmupFrames = Math.max(2, Math.round((Math.max(1, frameRate) / 1000) * Math.max(safePreRoll, 16)));
    const delayPromise = waitForDuration(safePreRoll, { signal });
    for (let index = 0; index < warmupFrames; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        await waitForNextFrame({ signal });
        if (signal?.aborted) {
            break;
        }
    }
    await delayPromise;
}

const EXPORT_PRE_ROLL_MS = 80;

function ensurePreviewFrameSettled(options = {}) {
    const frameCount = Math.max(1, Math.round(Number(options?.frameCount) || 2));
    const signal = getAbortSignal(options);

    let sequence = Promise.resolve();
    for (let index = 0; index < frameCount; index += 1) {
        sequence = sequence.then(() => waitForNextFrame({ signal }));
    }

    return sequence;
}

function waitForNextFrame(options = null) {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
        return Promise.resolve();
    }

    const signal = getAbortSignal(options);

    return new Promise((resolve) => {
        if (signal?.aborted) {
            resolve();
            return;
        }

        let rafId = 0;
        const finalize = () => {
            if (signal) {
                signal.removeEventListener('abort', handleAbort);
            }
            if (rafId) {
                window.cancelAnimationFrame(rafId);
            }
            resolve();
        };

        const handleAbort = () => {
            finalize();
        };

        rafId = window.requestAnimationFrame(() => {
            if (signal) {
                signal.removeEventListener('abort', handleAbort);
            }
            resolve();
        });

        if (signal) {
            signal.addEventListener('abort', handleAbort, { once: true });
        }
    });
}

function waitForMediaStreamTracks(stream, options = {}) {
    if (!stream || typeof window === 'undefined') {
        return Promise.resolve();
    }

    const { kind = 'audio', timeoutMs = 1500 } = options || {};
    const signal = getAbortSignal(options);
    let tracks = [];
    if (kind === 'audio') {
        tracks = stream.getAudioTracks();
    } else if (kind === 'video') {
        tracks = stream.getVideoTracks();
    } else {
        tracks = stream.getTracks();
    }

    if (!tracks.length) {
        return Promise.resolve();
    }

    const waiters = tracks.map((track) => new Promise((resolve) => {
        if (signal?.aborted) {
            resolve();
            return;
        }

        let settled = false;
        let timeoutId = 0;
        const finalize = () => {
            if (settled) {
                return;
            }
            settled = true;
            track.removeEventListener('unmute', handleUnmute);
            track.removeEventListener('ended', handleEnded);
            if (signal) {
                signal.removeEventListener('abort', handleAbort);
            }
            if (timeoutId) {
                window.clearTimeout(timeoutId);
            }
            resolve();
        };
        const handleUnmute = () => {
            if (track.readyState === 'live') {
                finalize();
            }
        };
        const handleEnded = () => {
            finalize();
        };
        const handleAbort = () => {
            finalize();
        };

        if (track.readyState === 'live') {
            finalize();
            return;
        }

        track.addEventListener('unmute', handleUnmute);
        track.addEventListener('ended', handleEnded);

        if (timeoutMs > 0) {
            timeoutId = window.setTimeout(finalize, timeoutMs);
        }

        if (signal) {
            signal.addEventListener('abort', handleAbort, { once: true });
        }
    }));

    return Promise.all(waiters).then(() => waitForNextFrame({ signal }));
}

function withTimeout(promise, timeoutMs, fallbackError = new Error('Operation timed out.')) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return promise;
    }

    return new Promise((resolve, reject) => {
        let settled = false;
        const timerId = window.setTimeout(() => {
            if (settled) {
                return;
            }
            settled = true;
            reject(fallbackError);
        }, Math.max(0, Math.round(timeoutMs)));

        promise.then((value) => {
            if (settled) {
                return;
            }
            settled = true;
            window.clearTimeout(timerId);
            resolve(value);
        }).catch((error) => {
            if (settled) {
                return;
            }
            settled = true;
            window.clearTimeout(timerId);
            reject(error);
        });
    });
}

function collectTimelineExportMedia(timelineItems) {
    const items = Array.isArray(timelineItems) ? timelineItems : [];
    const descriptors = [];
    const seen = new Set();

    items.forEach((item) => {
        if (!item || !item.dataset) {
            return;
        }
        const objectUrl = item.dataset.objectUrl || '';
        if (!objectUrl || seen.has(objectUrl)) {
            return;
        }
        seen.add(objectUrl);
        descriptors.push({
            objectUrl,
            fileType: item.dataset.fileType || '',
            element: item,
        });
    });

    return descriptors;
}

async function warmupExportPlaybackContext(playbackContext, options = {}) {
    const { timeoutMs = 4500 } = options || {};
    const signal = getAbortSignal(options);
    if (!playbackContext) {
        return { total: 0, succeeded: 0, failed: 0 };
    }

    const descriptors = Array.isArray(playbackContext.mediaDescriptors)
        ? playbackContext.mediaDescriptors
        : collectTimelineExportMedia(playbackContext.timelineItems);

    if (!playbackContext.mediaDescriptors) {
        playbackContext.mediaDescriptors = descriptors;
    }

    if (!descriptors.length) {
        const emptySummary = { total: 0, succeeded: 0, failed: 0 };
        playbackContext.warmupSummary = emptySummary;
        return emptySummary;
    }

    const runDescriptor = async (descriptor) => {
        const { objectUrl, fileType } = descriptor;
        if (!objectUrl) {
            return { ok: true, descriptor };
        }

        if (signal?.aborted) {
            const abortReason = signal.reason || new DOMException('Export warmup aborted.', 'AbortError');
            return { ok: false, descriptor, error: abortReason };
        }

        let basePromise = Promise.resolve();
        if (fileType.startsWith('image/')) {
            basePromise = preloadTimelineImage(objectUrl);
        } else if (fileType.startsWith('video/')) {
            basePromise = preloadTimelineVideo(objectUrl);
        } else if (fileType.startsWith('audio/')) {
            basePromise = preloadTimelineAudio(objectUrl);
        }

        return withTimeout(
            basePromise,
            timeoutMs,
            new Error('Timed out while preparing media for export.'),
        ).then(() => ({ ok: true, descriptor }))
            .catch((error) => ({ ok: false, descriptor, error }));
    };

    const maxConcurrentPreloads = 4;
    const workerCount = Math.min(maxConcurrentPreloads, descriptors.length);
    const results = new Array(descriptors.length);
    let nextIndex = 0;

    const workers = [];
    const getNextIndex = () => {
        if (nextIndex >= descriptors.length) {
            return null;
        }
        const currentIndex = nextIndex;
        nextIndex += 1;
        return currentIndex;
    };

    for (let i = 0; i < workerCount; i += 1) {
        workers.push((async () => {
            while (true) {
                const currentIndex = getNextIndex();
                if (currentIndex === null) {
                    return;
                }

                if (signal?.aborted) {
                    return;
                }

                const descriptor = descriptors[currentIndex];
                results[currentIndex] = await runDescriptor(descriptor);

                if (signal?.aborted) {
                    return;
                }
            }
        })());
    }

    await Promise.all(workers);
    const succeeded = results.filter((result) => result.ok).length;
    const failed = results.length - succeeded;
    const summary = { total: results.length, succeeded, failed };
    if (failed > 0) {
        summary.failures = results.filter((result) => !result.ok);
    }

    playbackContext.warmupSummary = summary;
    return summary;
}

function estimateVideoBitrate(resolution, frameRate) {
    const width = Math.max(1, Math.round(resolution?.width || 0));
    const height = Math.max(1, Math.round(resolution?.height || 0));
    const effectiveFrameRate = Math.max(1, Math.min(60, Math.round(frameRate) || 30));
    const pixelsPerSecond = width * height * effectiveFrameRate;
    if (!Number.isFinite(pixelsPerSecond) || pixelsPerSecond <= 0) {
        return 3_000_000;
    }

    const baseBitrate = Math.round(pixelsPerSecond * 0.07);
    const ceiling = (width >= 1920 || height >= 1080) ? 18_000_000 : 12_000_000;
    return Math.max(2_500_000, Math.min(ceiling, baseBitrate));
}

function estimateAudioBitrate(resolution) {
    const width = Math.max(1, Math.round(resolution?.width || 0));
    const height = Math.max(1, Math.round(resolution?.height || 0));
    const pixelCount = width * height;
    if (pixelCount >= 1920 * 1080) {
        return 256_000;
    }
    if (pixelCount >= 1280 * 720) {
        return 224_000;
    }
    return 160_000;
}

function deriveAudioContentType(videoMimeType) {
    if (typeof videoMimeType !== 'string') {
        return '';
    }
    if (videoMimeType.startsWith('video/mp4')) {
        return 'audio/mp4';
    }
    if (videoMimeType.startsWith('video/webm')) {
        return 'audio/webm';
    }
    if (videoMimeType.startsWith('video/')) {
        return `audio/${videoMimeType.slice('video/'.length)}`;
    }
    return videoMimeType;
}

async function resolveExportEncodingConfig(exportFormat, resolution, options = {}) {
    const frameRate = Math.max(1, Math.min(60, Math.round(options.frameRate) || 30));
    const config = {
        mimeType: exportFormat?.mimeType || 'video/webm',
        frameRate,
        videoBitsPerSecond: estimateVideoBitrate(resolution, frameRate),
        audioBitsPerSecond: estimateAudioBitrate(resolution),
        timesliceMs: null,
    };

    const mediaCapabilities = typeof navigator !== 'undefined'
        ? navigator.mediaCapabilities
        : null;
    if (!mediaCapabilities || typeof mediaCapabilities.encodingInfo !== 'function') {
        return config;
    }

    try {
        const encodingQuery = {
            type: 'record',
            video: {
                contentType: config.mimeType,
                width: Math.max(1, Math.round(resolution?.width || 0)),
                height: Math.max(1, Math.round(resolution?.height || 0)),
                bitrate: config.videoBitsPerSecond,
                framerate: frameRate,
            },
        };
        const audioContentType = deriveAudioContentType(config.mimeType);
        if (audioContentType) {
            encodingQuery.audio = {
                contentType: audioContentType,
                bitrate: config.audioBitsPerSecond,
                samplerate: 48000,
                channels: 2,
            };
        }

        const info = await mediaCapabilities.encodingInfo(encodingQuery);
        if (info?.supported) {
            if (info.powerEfficient === false) {
                config.videoBitsPerSecond = Math.min(
                    Math.round(config.videoBitsPerSecond * 1.15),
                    24_000_000,
                );
            } else if (info.powerEfficient === true) {
                config.videoBitsPerSecond = Math.max(
                    Math.round(config.videoBitsPerSecond * 0.9),
                    3_000_000,
                );
            }

            if (info.smooth === false) {
                config.timesliceMs = 500;
            }
        }
    } catch (error) {
        // Ignore capability detection errors and fall back to defaults.
    }

    return config;
}

function prepareExportPlaybackContext(existingItems = null) {
    const timelineItems = Array.isArray(existingItems)
        ? existingItems
        : getTimelineItems();
    const playbackState = getTimelinePlaybackSegments();
    const mutationVersion = (typeof getTimelinePlaybackMutationVersion === 'function')
        ? getTimelinePlaybackMutationVersion()
        : 0;
    const mediaDescriptors = collectTimelineExportMedia(timelineItems);
    pendingExportPlaybackContext = {
        timelineItems,
        playbackState,
        version: mutationVersion,
        mediaDescriptors,
        warmupSummary: null,
        encodingConfig: null,
    };
    return pendingExportPlaybackContext;
}

function resetExportPlaybackContext() {
    pendingExportPlaybackContext = null;
}

function getOrCreateSharedExportAudioContext() {
    if (sharedExportAudioContext && sharedExportAudioContext.state === 'closed') {
        sharedExportAudioContext = null;
        sharedExportAudioSources = new WeakMap();
    }

    if (!sharedExportAudioContext) {
        const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextConstructor) {
            return null;
        }

        try {
            sharedExportAudioContext = new AudioContextConstructor();
        } catch (error) {
            return null;
        }
    }

    return sharedExportAudioContext;
}

function getOrCreateExportAudioSourceNode(element, audioContext) {
    if (!element || !audioContext) {
        return null;
    }

    let sourceNode = sharedExportAudioSources.get(element);
    if (sourceNode) {
        return sourceNode;
    }

    try {
        sourceNode = audioContext.createMediaElementSource(element);
        sourceNode.connect(audioContext.destination);
        sharedExportAudioSources.set(element, sourceNode);
        return sourceNode;
    } catch (error) {
        return null;
    }
}

function attachPreviewAudioToStream(mediaElements, combinedStream) {
    const elements = Array.isArray(mediaElements)
        ? mediaElements.filter(Boolean)
        : [mediaElements].filter(Boolean);
    if (!elements.length || !combinedStream) {
        return {
            audioContext: null,
            success: false,
            error: new Error('Missing media elements or combined stream.'),
            cleanup: () => {},
        };
    }

    let lastError = null;

    let previewDestination = null;
    if (typeof getOrCreatePreviewAudioDestination === 'function') {
        previewDestination = getOrCreatePreviewAudioDestination();
    }

    if (previewDestination?.stream) {
        let previewKeepAlive = null;
        if (previewDestination.context) {
            previewKeepAlive = createSilentAudioKeepAlive(
                previewDestination.context,
                previewDestination,
            );
        }
        const primePreviewAudioGraph = () => {
            if (typeof ensureMediaElementGainNode !== 'function') {
                return;
            }
            elements.forEach((element) => {
                try {
                    ensureMediaElementGainNode(element);
                } catch (error) {
                    // Ignore failures when priming the preview audio graph.
                }
            });
        };

        primePreviewAudioGraph();

        let previewTracks = previewDestination.stream
            .getAudioTracks()
            .filter((track) => track && track.readyState !== 'ended');

        if (!previewTracks.length) {
            primePreviewAudioGraph();
            previewTracks = previewDestination.stream
                .getAudioTracks()
                .filter((track) => track && track.readyState !== 'ended');
        }
        
        const attachments = previewTracks
            .map((track) => {
                if (!track) {
                    return null;
                }
                const cloned = typeof track.clone === 'function' ? track.clone() : track;
                return cloned
                    ? {
                        original: track,
                        attached: cloned,
                        isClone: cloned !== track,
                    }
                    : null;
            })
            .filter(Boolean);

        if (attachments.length) {
            const previewContext = previewDestination.context
                || (typeof getOrCreatePreviewAudioContext === 'function'
                    ? getOrCreatePreviewAudioContext()
                    : null);
            if (previewContext && previewContext.state === 'suspended') {
                previewContext.resume().catch(() => {});
            }
            attachments.forEach(({ attached }) => {
                stabilizeAudioTrack(attached);
                combinedStream.addTrack(attached);
            });
            return {
                audioContext: previewContext,
                success: true,
                error: null,
                cleanup: () => {
                    attachments.forEach(({ attached, isClone }) => {
                        try {
                            if (typeof combinedStream.removeTrack === 'function') {
                                combinedStream.removeTrack(attached);
                            }
                        } catch (removeError) {
                            // Ignore removal errors during cleanup.
                        }
                        if (isClone && typeof attached.stop === 'function') {
                            attached.stop();
                        }
                    });
                    if (previewKeepAlive && typeof previewKeepAlive.stop === 'function') {
                        previewKeepAlive.stop();
                    }
                },
            };
        }

        if (previewKeepAlive && typeof previewKeepAlive.stop === 'function') {
            previewKeepAlive.stop();
        }
    }

    const directTracks = [];
    let missingDirectCapture = false;
    const pendingTracks = [];
    elements.forEach((element) => {
        if (typeof element?.captureStream === 'function') {
            try {
                const audioStream = element.captureStream();
                if (audioStream) {
                    const tracks = audioStream.getAudioTracks();
                    if (tracks.length) {
                        tracks.forEach((track) => {
                            pendingTracks.push(track);
                            directTracks.push(track);
                        });
                    } else {
                        missingDirectCapture = true;
                    }
                } else {
                    missingDirectCapture = true;
                }
            } catch (error) {
                lastError = error;
                missingDirectCapture = true;
            }
        } else {
            missingDirectCapture = true;
        }
    });
    const canUseDirectCapture = directTracks.length
        && !missingDirectCapture
        && elements.length === 1;
    // Prefer AudioContext mixing whenever more than one element contributes audio
    // to avoid drift between independently captured MediaStream tracks.
    if (canUseDirectCapture) {
        pendingTracks.forEach((track) => {
            stabilizeAudioTrack(track);
            combinedStream.addTrack(track);
        });
        return {
            audioContext: null,
            success: true,
            error: null,
            cleanup: () => {},
        };
    }

    pendingTracks.forEach((track) => {
        try {
            track.stop();
        } catch (error) {
            // Ignore track stop errors when falling back to AudioContext.
        }
    });

    const audioContext = getOrCreateSharedExportAudioContext();
    if (!audioContext) {
        return {
            audioContext: null,
            success: false,
            error: lastError || new Error('AudioContext is not supported in this browser.'),
            cleanup: () => {},
        };
    }

    if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
    }

    const destination = audioContext.createMediaStreamDestination();
    const keepAlive = createSilentAudioKeepAlive(audioContext, destination);
    const connectedSourceNodes = [];
    let hasSource = false;
    elements.forEach((element) => {
        try {
            const sourceNode = getOrCreateExportAudioSourceNode(element, audioContext);
            if (!sourceNode) {
                return;
            }
            sourceNode.connect(destination);
            connectedSourceNodes.push({ node: sourceNode, destination });
            hasSource = true;
        } catch (error) {
            lastError = error;
        }
    });

    const cleanupConnections = () => {
        connectedSourceNodes.forEach(({ node, destination: dest }) => {
            try {
                node.disconnect(dest);
            } catch (disconnectError) {
                // Ignore disconnection errors when cleaning up export routing.
            }
        });
        try {
            destination.stream.getAudioTracks().forEach((track) => {
                if (typeof track.stop === 'function') {
                    track.stop();
                }
            });
        } catch (error) {
            // Ignore destination cleanup errors.
        }
    };

    if (!hasSource) {
        cleanupConnections();
        return {
            audioContext: null,
            success: false,
            error: lastError || new Error('Unable to create audio sources for export.'),
            cleanup: () => {},
        };
    }

    const audioTracks = destination.stream.getAudioTracks();
    audioTracks.forEach((track) => {
        stabilizeAudioTrack(track);
        combinedStream.addTrack(track);
    });
    if (!audioTracks.length) {
        cleanupConnections();
        if (keepAlive && typeof keepAlive.stop === 'function') {
            keepAlive.stop();
        }
        return {
            audioContext: null,
            success: false,
            error: lastError || new Error('No audio tracks available from preview video.'),
            cleanup: () => {},
        };
    }

    return {
        audioContext,
        success: true,
        error: null,
        cleanup: () => {
            cleanupConnections();
            if (keepAlive && typeof keepAlive.stop === 'function') {
                keepAlive.stop();
            }
        },
    };
}

async function handleConfirmExport() {
    if (isExportingTimeline) {
        return;
    }

    const mutationVersion = (typeof getTimelinePlaybackMutationVersion === 'function')
        ? getTimelinePlaybackMutationVersion()
        : null;
    const pendingContextVersion = Number.isFinite(pendingExportPlaybackContext?.version)
        ? pendingExportPlaybackContext.version
        : null;
    let playbackContext = pendingExportPlaybackContext;
    if (!playbackContext || (mutationVersion !== null && mutationVersion !== pendingContextVersion)) {
        playbackContext = prepareExportPlaybackContext();
    }
    const timelineItems = Array.isArray(playbackContext?.timelineItems)
        ? playbackContext.timelineItems
        : getTimelineItems();
    if (!timelineItems.length) {
        alert('Upload an image or video to build your timeline.');
        return;
    }

    const playbackState = playbackContext?.playbackState || getTimelinePlaybackSegments();
    if (!playbackContext?.playbackState) {
        playbackContext.playbackState = playbackState;
    }
    const playbackSegments = Array.isArray(playbackState?.segments)
        ? playbackState.segments
        : [];
    const playbackDuration = Number.isFinite(playbackState?.totalDuration)
        ? playbackState.totalDuration
        : 0;
    if (!playbackSegments.length || playbackDuration <= 0) {
        alert('Upload an image or video to build your timeline.');
        return;
    }

    if (!window.MediaRecorder) {
        alert('Export is not supported in this browser.');
        return;
    }

    const exportFormat = getSupportedExportFormat();
    if (!exportFormat) {
        alert('Export is not supported by this browser. Try using a browser with MediaRecorder support for MP4 or WebM.');
        return;
    }

    if (!exportMirrorContext) {
        alert('Unable to start export because the rendering context is unavailable.');
        return;
    }

    const resolution = getExportResolution(
        previewAspectSelect?.value,
        DEFAULT_EXPORT_QUALITY,
    );

    if (!resolution) {
        alert('Unable to determine export resolution.');
        return;
    }

    isExportingTimeline = true;
    confirmExportButton.disabled = true;
    const originalLabel = confirmExportButton.textContent;
    confirmExportButton.textContent = 'Exporting…';
    if (exportDialogStatus) {
        exportDialogStatus.dataset.state = 'progress';
        exportDialogStatus.textContent = 'Preparing media for export…';
    }

    stopTimelinePlayback();

    if (exportAbortController?.signal && !exportAbortController.signal.aborted) {
        abortActiveExport(new DOMException('Cancelling previous export.', 'AbortError'));
    }

    const abortController = new AbortController();
    exportAbortController = abortController;
    const { signal } = abortController;
    const abortCleanups = [];

    const registerAbortHandler = (handler) => {
        if (typeof handler !== 'function') {
            return () => {};
        }

        const wrapped = () => {
            try {
                handler();
            } catch (error) {
                // Ignore abort handler errors.
            }
        };

        if (signal.aborted) {
            wrapped();
            return () => {};
        }

        signal.addEventListener('abort', wrapped);
        return () => {
            signal.removeEventListener('abort', wrapped);
        };
    };

    const throwIfAborted = () => {
        if (signal.aborted) {
            throw signal.reason || new DOMException('Export aborted.', 'AbortError');
        }
    };

    abortCleanups.push(registerAbortHandler(() => {
        stopTimelinePlayback(false, true);
    }));

    let encodingConfig = playbackContext?.encodingConfig || null;
    let warmupSummary = null;
    try {
        warmupSummary = await warmupExportPlaybackContext(playbackContext, { timeoutMs: 4500, signal });
        throwIfAborted();
        if (warmupSummary?.failed > 0) {
            console.warn('Some media items could not be prepared before export.', warmupSummary.failures);
        } else if (warmupSummary?.total) {
            console.info(`Prepared ${warmupSummary.succeeded}/${warmupSummary.total} media items for export.`);
        }
    } catch (warmupError) {
        if (signal.aborted) {
            throw warmupError;
        }
        console.warn('Export warmup encountered an error.', warmupError);
    }

    throwIfAborted();

    try {
        encodingConfig = await resolveExportEncodingConfig(exportFormat, resolution, {
            frameRate: encodingConfig?.frameRate || 30,
        });
    } catch (encodingError) {
        console.warn('Falling back to default export encoding configuration.', encodingError);
        encodingConfig = {
            mimeType: exportFormat.mimeType,
            frameRate: 30,
            videoBitsPerSecond: 6_000_000,
            audioBitsPerSecond: 192_000,
            timesliceMs: null,
        };
    }

    throwIfAborted();

    playbackContext.encodingConfig = encodingConfig;

    const captureFrameRate = Math.max(1, Math.min(60, Math.round(encodingConfig.frameRate) || 30));
    const readinessTimeout = captureFrameRate > 30 ? 1200 : 1500;

    await primeExportStartFrame(playbackContext, { frameRate: captureFrameRate, signal });
    throwIfAborted();

    if (exportDialogStatus) {
        exportDialogStatus.dataset.state = 'progress';
        exportDialogStatus.innerHTML = `
            <span class="visually-hidden" role="status">Exporting timeline preview to ${exportFormat.label}…</span>
            <div class="export-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuetext="Exporting timeline preview" aria-live="off">
                <div class="export-progress__bar"></div>
            </div>
        `.trim();
    }

    let stopMirroring = () => {};
    let recorder = null;
    let combinedStream = null;
    const recordedChunks = [];
    let exportAudioContext = null;
    let audioAttachmentCleanup = null;
    let recordingPromise = null;

    try {
        stopMirroring = startPreviewMirroring(resolution.width, resolution.height, {
            frameRate: captureFrameRate,
        });
        abortCleanups.push(registerAbortHandler(() => {
            stopMirroring();
        }));
        throwIfAborted();

        await runExportPreRoll(EXPORT_PRE_ROLL_MS, captureFrameRate, { signal });
        throwIfAborted();
        if (typeof exportMirrorCanvas.captureStream !== 'function') {
            throw new Error('Canvas captureStream is not supported in this browser.');
        }
        const canvasStream = exportMirrorCanvas.captureStream(captureFrameRate);
        if (!canvasStream) {
            throw new Error('Unable to access canvas capture stream.');
        }
        combinedStream = new MediaStream();
        abortCleanups.push(registerAbortHandler(() => {
            if (combinedStream) {
                combinedStream.getTracks().forEach((track) => {
                    try {
                        track.stop();
                    } catch (trackError) {
                        // Ignore track stop errors triggered during abort.
                    }
                });
            }
        }));
        canvasStream.getVideoTracks().forEach((track) => {
            combinedStream.addTrack(track);
            if (typeof track.applyConstraints === 'function') {
                track.applyConstraints({ frameRate: captureFrameRate }).catch(() => {});
            }
        });

        const overlayElements = typeof getActiveOverlayAudioElements === 'function'
            ? getActiveOverlayAudioElements()
            : [];
        const audioElementCandidates = [previewVideo]
            .concat(overlayElements.length ? overlayElements : [previewAudio].filter(Boolean));
        const uniqueAudioElements = Array.from(new Set(audioElementCandidates.filter(Boolean)));
        const audioAttachment = attachPreviewAudioToStream(uniqueAudioElements, combinedStream);
        exportAudioContext = audioAttachment.audioContext;
        if (typeof audioAttachment.cleanup === 'function') {
            audioAttachmentCleanup = audioAttachment.cleanup;
        }
        if (!audioAttachment.success) {
            console.warn('Unable to capture audio from preview video.', audioAttachment.error);
        }
        abortCleanups.push(registerAbortHandler(() => {
            if (typeof audioAttachmentCleanup === 'function') {
                try {
                    audioAttachmentCleanup();
                } catch (cleanupError) {
                    // Ignore cleanup errors triggered during abort.
                }
            }
        }));

        throwIfAborted();

        await waitForMediaStreamTracks(combinedStream, { kind: 'audio', timeoutMs: readinessTimeout, signal });
        throwIfAborted();
        await waitForMediaStreamTracks(combinedStream, { kind: 'video', timeoutMs: readinessTimeout, signal });
        throwIfAborted();

        const recorderOptions = { mimeType: exportFormat.mimeType };
        if (Number.isFinite(encodingConfig.videoBitsPerSecond)) {
            recorderOptions.videoBitsPerSecond = encodingConfig.videoBitsPerSecond;
        }
        if (Number.isFinite(encodingConfig.audioBitsPerSecond)) {
            recorderOptions.audioBitsPerSecond = encodingConfig.audioBitsPerSecond;
        }

        recorder = new MediaRecorder(combinedStream, recorderOptions);
        abortCleanups.push(registerAbortHandler(() => {
            if (recorder && recorder.state !== 'inactive') {
                try {
                    recorder.stop();
                } catch (stopError) {
                    // Ignore recorder stop errors triggered during abort.
                }
            }
        }));

        const recorderStarted = new Promise((resolve) => {
            recorder.addEventListener('start', () => {
                resolve();
            }, { once: true });
        });

        recordingPromise = new Promise((resolve, reject) => {
            recorder.addEventListener('dataavailable', (event) => {
                if (event.data && event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            });
            recorder.addEventListener('stop', () => {
                resolve(new Blob(recordedChunks, { type: exportFormat.mimeType }));
            }, { once: true });
            recorder.addEventListener('error', (event) => {
                reject(event.error || new Error('Recording error.'));
            }, { once: true });
        });

        const timesliceMs = Number.isFinite(encodingConfig.timesliceMs)
            && encodingConfig.timesliceMs > 0
            ? Math.max(0, Math.round(encodingConfig.timesliceMs))
            : null;
        if (timesliceMs) {
            recorder.start(timesliceMs);
        } else {
            recorder.start();
        }
        await recorderStarted;
        throwIfAborted();
        await waitForNextFrame({ signal });
        throwIfAborted();
        const playbackCompleted = await playTimelineSequence(0, null, playbackContext);
        if (recorder.state !== 'inactive') {
            recorder.stop();
        }

        const exportBlob = await recordingPromise;
        recordedChunks.length = 0;

        throwIfAborted();

        if (!playbackCompleted) {
            if (signal.aborted) {
                throw signal.reason || new DOMException('Export aborted.', 'AbortError');
            }
            throw new Error('Timeline playback was interrupted before completion.');
        }

        const downloadUrl = URL.createObjectURL(exportBlob);
        const tempAnchor = document.createElement('a');
        tempAnchor.href = downloadUrl;
        tempAnchor.download = `timeline-export.${exportFormat.fileExtension}`;
        document.body.appendChild(tempAnchor);
        tempAnchor.click();
        document.body.removeChild(tempAnchor);
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);

        if (exportDialogStatus) {
            exportDialogStatus.textContent = `Export complete! Your ${exportFormat.fileExtension.toUpperCase()} download should begin shortly.`;
            exportDialogStatus.dataset.state = 'ready';
        }

        closeExportDialog();
    } catch (error) {
        const aborted = error?.name === 'AbortError' || signal.aborted;
        if (aborted) {
            console.info('Export cancelled.', error);
            if (exportDialogStatus) {
                exportDialogStatus.textContent = 'Export cancelled.';
                exportDialogStatus.dataset.state = 'idle';
            }
            closeExportDialog();
        } else {
            console.error('Failed to export timeline preview.', error);
            alert(`Export failed: ${error?.message || error}`);
            if (exportDialogStatus) {
                exportDialogStatus.textContent = 'Export failed. Please try again.';
                exportDialogStatus.dataset.state = 'warning';
            }
        }
    } finally {
        resetExportPlaybackContext();
        if (typeof audioAttachmentCleanup === 'function') {
            try {
                audioAttachmentCleanup();
            } catch (error) {
                // Ignore cleanup errors.
            }
        }
        if (recorder && recorder.state !== 'inactive') {
            try {
                recorder.stop();
            } catch (error) {
                // Ignore
            }
        }
        if (combinedStream) {
            combinedStream.getTracks().forEach((track) => track.stop());
        }
        recorder = null;
        combinedStream = null;
        exportAudioContext = null;
        stopMirroring();
        confirmExportButton.disabled = false;
        confirmExportButton.textContent = originalLabel || 'Confirm export';
        isExportingTimeline = false;
        abortCleanups.forEach((cleanup) => {
            if (typeof cleanup === 'function') {
                try {
                    cleanup();
                } catch (cleanupError) {
                    // Ignore abort cleanup errors.
                }
            }
        });
        if (exportAbortController === abortController) {
            exportAbortController = null;
        }
    }
}

if (confirmExportButton) {
    confirmExportButton.addEventListener('click', () => {
        handleConfirmExport();
    });
}

if (exportDialog) {
    exportDialog.addEventListener('click', (event) => {
        if (event.target === exportDialog) {
            closeExportDialog();
            resetExportPlaybackContext();
        }
    });
}

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
        return;
    }

    if (isPreviewFullscreen) {
        event.preventDefault();
        setPreviewFullscreenState(false, { restoreFocus: previewFullscreenToggle || true });
        return;
    }

    if (isExportDialogOpen()) {
        event.preventDefault();
        closeExportDialog();
        resetExportPlaybackContext();
    }
});

playVideoButton.addEventListener('click', () => {
    if (isTimelinePlaying) {
        pauseTimelinePlayback();
        return;
    }

    if (isTimelinePaused && timelinePauseState) {
        resumeTimelinePlayback();
        return;
    }

    const timelineItems = getTimelineItems();
    if (!timelineItems.length) {
        alert('Upload an image or video to build your timeline.');
        return;
    }

    const playbackState = getTimelinePlaybackSegments();
    const { totalDuration } = playbackState;
    const progressSource = (typeof getTimelineProgressFraction === 'function')
        ? getTimelineProgressFraction()
        : clampProgress(timelineProgressCurrentFraction || 0);
    const startTimeMs = totalDuration > 0
        ? Math.min(
            Math.max(Math.round(progressSource * totalDuration), 0),
            Math.max(totalDuration - 1, 0),
        )
        : 0;
    const resumeOptions = totalDuration > 0 ? { timeMs: startTimeMs } : null;

    const startIndex = activeTimelineItem ? timelineItems.indexOf(activeTimelineItem) : 0;
    playTimelineSequence(startIndex >= 0 ? startIndex : 0, resumeOptions).catch((error) => {
        console.error('Timeline playback failed.', error);
    });
});

previewVideo.addEventListener('ended', () => {
    if (isTimelinePlaying) {
        return;
    }
    playVideoButton.textContent = 'Play Back';
    previewVideo.currentTime = 0;
});
