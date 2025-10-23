
function updateKeyframeControlsState() {
    if (addKeyframeButton) {
        addKeyframeButton.disabled = !isImageTimelineItem(activeTimelineItem) || isTimelinePlaying;
    }
    if (!keyframeTrack) {
        return;
    }
    const shouldDisableTrack = !isImageTimelineItem(activeTimelineItem) || isTimelinePlaying;
    if (shouldDisableTrack) {
        keyframeTrack.setAttribute('data-disabled', 'true');
        keyframeTrack.setAttribute('aria-disabled', 'true');
        keyframeTrack.tabIndex = -1;
    } else {
        keyframeTrack.removeAttribute('data-disabled');
        keyframeTrack.removeAttribute('aria-disabled');
        keyframeTrack.tabIndex = 0;
    }
}

function resetKeyframeMarkerPointerState() {
    keyframeMarkerPointerState.pointerId = null;
    keyframeMarkerPointerState.marker = null;
    keyframeMarkerPointerState.timelineItem = null;
    keyframeMarkerPointerState.keyframes = null;
    keyframeMarkerPointerState.entry = null;
    keyframeMarkerPointerState.startProgress = 0;
    keyframeMarkerPointerState.pointerOffsetProgress = 0;
    keyframeMarkerPointerState.didMove = false;
}

function cloneKeyframeEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    const transform = sanitizeNormalizedKeyframeTransform(entry.transform);

    if (!transform) {
        return null;
    }

    return {
        progress: clampProgress(Number(entry.progress)),
        transform,
    };
}

function handleKeyframeMarkerPointerDown(event, keyframeEntry) {
    if (keyframeMarkerPointerState.pointerId !== null) {
        return;
    }

    if (event.button !== 0 && event.pointerType !== 'touch') {
        return;
    }

    if (!keyframeTrack
        || keyframeTrack.hasAttribute('data-disabled')
        || isTimelinePlaying
        || !isImageTimelineItem(activeTimelineItem)
        || !activeTimelineItem
    ) {
        return;
    }

    const marker = event.currentTarget;

    if (!(marker instanceof HTMLElement)) {
        return;
    }

    const sourceKeyframes = getTimelineItemImageKeyframes(activeTimelineItem);

    if (!sourceKeyframes.length) {
        return;
    }

    const clonedKeyframes = sourceKeyframes
        .map(cloneKeyframeEntry)
        .filter(Boolean);

    if (!clonedKeyframes.length) {
        return;
    }

    const targetProgress = clampProgress(Number(keyframeEntry?.progress));
    const entryIndex = clonedKeyframes.findIndex((entry) => Math.abs(entry.progress - targetProgress)
        <= KEYFRAME_PROGRESS_TOLERANCE * 2);

    if (entryIndex < 0) {
        return;
    }

    const entry = clonedKeyframes[entryIndex];

    keyframeMarkerPointerState.pointerId = event.pointerId;
    keyframeMarkerPointerState.marker = marker;
    keyframeMarkerPointerState.timelineItem = activeTimelineItem;
    keyframeMarkerPointerState.keyframes = clonedKeyframes;
    keyframeMarkerPointerState.entry = entry;
    keyframeMarkerPointerState.startProgress = entry.progress;
    const pointerProgress = getKeyframeTrackProgressFromClientX(event.clientX);
    const pointerOffsetProgress = Number.isFinite(pointerProgress)
        ? clampProgress(pointerProgress) - entry.progress
        : 0;
    keyframeMarkerPointerState.pointerOffsetProgress = Number.isFinite(pointerOffsetProgress)
        ? pointerOffsetProgress
        : 0;
    keyframeMarkerPointerState.didMove = false;

    if (typeof marker.setPointerCapture === 'function') {
        try {
            marker.setPointerCapture(event.pointerId);
        } catch (error) {
            // Ignore inability to capture the pointer.
        }
    }

    if (typeof marker.setAttribute === 'function') {
        marker.setAttribute('data-dragging', 'true');
    }

    marker.addEventListener('pointermove', handleKeyframeMarkerPointerMove);
    marker.addEventListener('pointerup', handleKeyframeMarkerPointerUp);
    marker.addEventListener('pointercancel', handleKeyframeMarkerPointerUp);
}

function handleKeyframeMarkerPointerMove(event) {
    if (keyframeMarkerPointerState.pointerId === null
        || event.pointerId !== keyframeMarkerPointerState.pointerId
    ) {
        return;
    }

    const {
        marker,
        timelineItem,
        keyframes,
        entry,
        startProgress,
        pointerOffsetProgress,
    } = keyframeMarkerPointerState;

    if (!marker || !timelineItem || !keyframes || !entry) {
        return;
    }

    const pointerProgress = getKeyframeTrackProgressFromClientX(event.clientX);

    if (pointerProgress === null) {
        return;
    }

    const offset = Number.isFinite(pointerOffsetProgress) ? pointerOffsetProgress : 0;
    const nextProgress = pointerProgress - offset;

    if (!Number.isFinite(nextProgress)) {
        return;
    }

    const clamped = clampProgress(nextProgress);
    const delta = Math.abs(clamped - entry.progress);

    if (delta <= KEYFRAME_DRAG_UPDATE_EPSILON) {
        return;
    }

    event.preventDefault();

    entry.progress = clamped;
    keyframes.sort((a, b) => a.progress - b.progress);
    keyframeMarkerPointerState.didMove = keyframeMarkerPointerState.didMove
        || Math.abs(clamped - startProgress) >= KEYFRAME_DRAG_EPSILON;

    if (timelineItem.dataset) {
        try {
            timelineItem.dataset.imageKeyframes = JSON.stringify(keyframes);
        } catch (error) {
            console.warn('Unable to serialize dragged keyframes.', error);
        }
    }

    marker.dataset.progress = String(clamped);
    marker.style.setProperty('--keyframe-progress', String(clamped));
    marker.setAttribute('aria-label', `Keyframe at ${Math.round(clamped * 100)}%`);

    if (timelineItem === activeTimelineItem) {
        setActiveClipProgress(clamped, { source: 'keyframe-marker-drag', syncTimeline: true });
    }
}

function handleKeyframeMarkerPointerUp(event) {
    if (keyframeMarkerPointerState.pointerId === null
        || event.pointerId !== keyframeMarkerPointerState.pointerId
    ) {
        return;
    }

    const timelineItem = keyframeMarkerPointerState.timelineItem;
    const keyframes = keyframeMarkerPointerState.keyframes;
    const entry = keyframeMarkerPointerState.entry;
    const startProgress = keyframeMarkerPointerState.startProgress;
    const didMove = keyframeMarkerPointerState.didMove;

    cancelKeyframeMarkerPointerDrag();

    if (!timelineItem) {
        return;
    }

    const finalProgress = clampProgress(Number.isFinite(entry?.progress)
        ? entry.progress
        : startProgress);
    const moved = didMove || Math.abs(finalProgress - startProgress) >= KEYFRAME_DRAG_EPSILON;

    if (moved && keyframes) {
        storeTimelineImageKeyframes(timelineItem, keyframes);
    }

    if (timelineItem === activeTimelineItem) {
        if (moved) {
            renderKeyframeTrack(timelineItem);
        }

        if (Number.isFinite(finalProgress)) {
            setActiveClipProgress(finalProgress, {
                source: moved ? 'keyframe-marker-drag-end' : 'keyframe-marker',
                syncTimeline: true,
            });
        }

        if (moved && Number.isFinite(finalProgress)) {
            showKeyframeStatus(`Keyframe moved to ${Math.round(finalProgress * 100)}%`);
        }
    }
}

function cancelKeyframeMarkerPointerDrag() {
    const marker = keyframeMarkerPointerState.marker;
    const pointerId = keyframeMarkerPointerState.pointerId;

    if (marker) {
        marker.removeEventListener('pointermove', handleKeyframeMarkerPointerMove);
        marker.removeEventListener('pointerup', handleKeyframeMarkerPointerUp);
        marker.removeEventListener('pointercancel', handleKeyframeMarkerPointerUp);
        if (typeof marker.removeAttribute === 'function') {
            marker.removeAttribute('data-dragging');
        }

        if (pointerId !== null
            && typeof marker.releasePointerCapture === 'function'
        ) {
            try {
                if (typeof marker.hasPointerCapture !== 'function'
                    || marker.hasPointerCapture(pointerId)
                ) {
                    marker.releasePointerCapture(pointerId);
                }
            } catch (error) {
                // Ignore release errors (element may have been detached).
            }
        }
    }

    resetKeyframeMarkerPointerState();
}

function getKeyframeTrackProgressFromClientX(clientX) {
    if (!keyframeTrack) {
        return null;
    }

    const rect = keyframeTrack.getBoundingClientRect();

    if (!rect || rect.width <= 0) {
        return null;
    }

    let paddingLeft = 0;
    let paddingRight = 0;

    if (window.getComputedStyle) {
        const computed = window.getComputedStyle(keyframeTrack);
        paddingLeft = Number.parseFloat(computed.paddingLeft) || 0;
        paddingRight = Number.parseFloat(computed.paddingRight) || 0;
    }

    const effectiveWidth = rect.width - paddingLeft - paddingRight;

    if (effectiveWidth <= 0) {
        return null;
    }

    const rawOffset = clientX - rect.left - paddingLeft;
    const clampedOffset = Math.min(Math.max(rawOffset, 0), effectiveWidth);
    const progress = effectiveWidth > 0 ? clampedOffset / effectiveWidth : 0;
    return clampProgress(progress);
}

function renderKeyframeTrack(timelineItem) {
    if (!keyframeTrack) {
        return;
    }

    if (keyframeMarkerPointerState.pointerId !== null) {
        cancelKeyframeMarkerPointerDrag();
    }

    keyframeTrack.innerHTML = '';
    updateKeyframeTrackPlayhead();
    updateKeyframeControlsState();

    if (!timelineItem || !isImageTimelineItem(timelineItem)) {
        keyframeTrack.setAttribute('data-empty', 'true');
        const message = document.createElement('span');
        message.className = 'keyframe-track__empty';
        message.textContent = 'Select an image clip to add keyframes.';
        keyframeTrack.appendChild(message);
        updateActiveKeyframeMarker(0);
        return;
    }

    const keyframes = getTimelineItemImageKeyframes(timelineItem);
    if (!keyframes.length) {
        keyframeTrack.setAttribute('data-empty', 'true');
        const message = document.createElement('span');
        message.className = 'keyframe-track__empty';
        message.textContent = 'No keyframes yet.';
        keyframeTrack.appendChild(message);
        updateActiveKeyframeMarker();
        return;
    }

    keyframeTrack.removeAttribute('data-empty');

    keyframes.forEach((keyframe) => {
        if (!keyframe) {
            return;
        }
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'keyframe-marker';
        marker.setAttribute('role', 'listitem');
        marker.dataset.progress = String(keyframe.progress);
        marker.style.setProperty('--keyframe-progress', String(keyframe.progress));
        marker.setAttribute('aria-label', `Keyframe at ${Math.round(keyframe.progress * 100)}%`);
        marker.addEventListener('pointerdown', (event) => {
            handleKeyframeMarkerPointerDown(event, keyframe);
        });
        marker.addEventListener('click', () => {
            if (isTimelinePlaying) {
                return;
            }
            setActiveClipProgress(keyframe.progress, {
                source: 'keyframe-marker',
                syncTimeline: true,
            });
        });
        keyframeTrack.appendChild(marker);
    });

    updateActiveKeyframeMarker();
}

function updateImageRotationControlState() {
    if (!imageRotationInput || !imageRotationValue) {
        return;
    }

    const isActiveImage = isImageTimelineItem(activeTimelineItem) && previewImageTransform;
    const rotation = isActiveImage ? clampRotation(previewImageTransform.rotation) : 0;

    imageRotationInput.disabled = !isImageTimelineItem(activeTimelineItem);
    imageRotationInput.value = String(Math.round(rotation));
    imageRotationValue.textContent = `${Math.round(rotation)}°`;
}

function setTimelineProgressForActiveClip(progress) {
    if (!activeTimelineItem) {
        return;
    }

    const laneCache = (typeof getTimelineLaneEntryCache === 'function')
        ? getTimelineLaneEntryCache()
        : null;
    const clipDuration = Math.max(0, getTimelineItemPlaybackDuration(activeTimelineItem));
    const startTime = getTimelineItemStartTime(activeTimelineItem, laneCache);
    const totalDuration = getTotalTimelineDuration(laneCache);
    const targetTime = startTime + (clipDuration * clampProgress(progress));
    const fraction = totalDuration > 0 ? clampProgress(targetTime / totalDuration) : 0;

    resetTimelineProgressLine(fraction);
    updatePlaybackTimeDisplay(targetTime, totalDuration);
    renderExportSummary(getTimelineItems(), null);
    refreshActiveOverlayLayers();
}

function applyActiveImageKeyframe(options = {}) {
    if (!isImageTimelineItem(activeTimelineItem)) {
        updateImageRotationControlState();
        return;
    }

    const progress = getActiveClipProgress();
    const keyframeTransform = getTimelineItemKeyframeTransformAtProgress(activeTimelineItem, progress);

    if (keyframeTransform) {
        const applied = applyNormalizedPreviewImageTransform(keyframeTransform);
        if (!applied) {
            pendingPreviewImageTransform = keyframeTransform;
            schedulePreviewViewportSizeUpdate();
        } else {
            pendingPreviewImageTransform = null;
        }
    } else {
        const stored = getStoredPreviewImageTransform(activeTimelineItem);
        if (stored) {
            if (!applyStoredPreviewImageTransform(stored)) {
                pendingPreviewImageTransform = stored;
                schedulePreviewViewportSizeUpdate();
            } else {
                pendingPreviewImageTransform = null;
            }
        } else if (!options.deferReset) {
            queuePreviewImageFrameReset();
        }
    }

    updateActiveKeyframeMarker(progress);
}

function setActiveClipProgress(progress, options = {}) {
    updateKeyframeControlsState();
    if (!isImageTimelineItem(activeTimelineItem)) {
        activeClipProgress = 0;
        updateKeyframeTrackPlayhead(0);
        updateActiveKeyframeMarker(0);
        updateImageRotationControlState();
        refreshActiveOverlayLayers();
        return;
    }

    const clamped = clampProgress(Number.isFinite(progress) ? progress : 0);
    activeClipProgress = clamped;
    updateKeyframeTrackPlayhead(clamped);
    updateActiveKeyframeMarker(clamped);

    if (options.syncTimeline) {
        setTimelineProgressForActiveClip(clamped);
    }

    if (options.updatePreview !== false && !previewImagePointerState.pointerId) {
        applyActiveImageKeyframe({ reason: options.source || null });
    } else {
        updateImageRotationControlState();
    }

    refreshActiveOverlayLayers();
}

function createActiveTimelineKeyframe(progressOverride = null) {
    if (!activeTimelineItem || !isImageTimelineItem(activeTimelineItem) || !previewImageTransform) {
        return;
    }

    const viewportSize = getPreviewViewportSize();
    const normalized = normalizePreviewImageTransform(previewImageTransform, viewportSize);

    if (!normalized) {
        return;
    }

    const existing = getTimelineItemImageKeyframes(activeTimelineItem);
    const targetProgress = Number.isFinite(progressOverride)
        ? clampProgress(progressOverride)
        : getActiveClipProgress();

    const hasExisting = existing.some((entry) => Math.abs(entry.progress - targetProgress) <= KEYFRAME_PROGRESS_TOLERANCE);

    persistPreviewImageTransformForActiveTimelineItem({
        forceKeyframe: true,
        progressOverride: targetProgress,
    });

    setActiveClipProgress(targetProgress, { source: 'keyframe-create', syncTimeline: false, updatePreview: false });
    updateActiveKeyframeMarker(targetProgress);

    const percent = Math.round(targetProgress * 100);
    showKeyframeStatus(hasExisting
        ? `Keyframe updated at ${percent}%`
        : `Keyframe added at ${percent}%`);
}

function deleteActiveTimelineKeyframe(progressOverride = null) {
    if (!activeTimelineItem || !isImageTimelineItem(activeTimelineItem)) {
        return false;
    }

    const keyframes = getTimelineItemImageKeyframes(activeTimelineItem);
    if (!keyframes.length) {
        showKeyframeStatus('No keyframes to delete.');
        return false;
    }

    const targetProgress = Number.isFinite(progressOverride)
        ? clampProgress(progressOverride)
        : getActiveClipProgress();

    const targetIndex = keyframes.findIndex((entry) => Math.abs(entry.progress - targetProgress)
        <= KEYFRAME_PROGRESS_TOLERANCE * 2);

    if (targetIndex === -1) {
        showKeyframeStatus('No keyframe at the current position to delete.');
        return false;
    }

    const removedEntry = keyframes[targetIndex];
    const remainingKeyframes = keyframes.filter((_, index) => index !== targetIndex);

    storeTimelineImageKeyframes(activeTimelineItem, remainingKeyframes);
    renderKeyframeTrack(activeTimelineItem);
    applyActiveImageKeyframe({ reason: 'keyframe-delete' });

    const percent = Math.round(((removedEntry && removedEntry.progress) || targetProgress) * 100);
    showKeyframeStatus(`Keyframe removed at ${percent}%`);

    return true;
}

let lastTimelinePlayheadGeometry = { offset: 0, width: 0 };

function getTimelineTrackPadding() {
    if (!timelineTrack || typeof window === 'undefined' || !window.getComputedStyle) {
        return { left: 0, right: 0 };
    }

    const computed = window.getComputedStyle(timelineTrack);
    const left = Number.parseFloat(computed.paddingLeft) || 0;
    const right = Number.parseFloat(computed.paddingRight) || 0;
    return { left, right };
}

function getTimelineLanePadding() {
    const lanes = getTimelineLanes();
    if (!lanes.length || typeof window === 'undefined' || !window.getComputedStyle) {
        return { left: 0, right: 0 };
    }

    const computed = window.getComputedStyle(lanes[0]);
    const left = Number.parseFloat(computed.paddingLeft) || 0;
    const right = Number.parseFloat(computed.paddingRight) || 0;
    return { left, right };
}

// Derive the pixel geometry for the timeline based on the zero-based duration span.
// This keeps the visual playhead aligned with fractional playback values regardless of zoom.
function computeTimelineDurationGeometry() {
    if (!timelineTrack) {
        return null;
    }

    const perPixel = getTimelineDurationPerPixel();
    if (!Number.isFinite(perPixel) || perPixel <= 0) {
        return null;
    }

    const { left: trackPaddingLeft } = getTimelineTrackPadding();
    const { left: lanePaddingLeft } = getTimelineLanePadding();
    const offset = trackPaddingLeft + lanePaddingLeft;

    let computedWidthPx = 0;

    if (typeof getTimelineLaneLayout === 'function' && typeof durationToWidth === 'function') {
        const lanes = getTimelineLanes();
        lanes.forEach((lane, laneIndex) => {
            const layout = getTimelineLaneLayout(lane, laneIndex);
            if (!layout.length) {
                return;
            }

            let cursorPx = 0;

            layout.forEach((entry) => {
                if (!entry) {
                    return;
                }

                const gapMs = Number(entry.leadingGap) || 0;
                if (gapMs !== 0) {
                    const gapPx = Math.round(gapMs / perPixel);
                    if (Number.isFinite(gapPx)) {
                        cursorPx = Math.max(0, cursorPx + gapPx);
                    }
                }

                const clipWidthPx = durationToWidth(entry.duration);
                cursorPx += clipWidthPx;
                computedWidthPx = Math.max(computedWidthPx, cursorPx);
            });
        });
    }

    if (computedWidthPx > 0) {
        return { offset, width: computedWidthPx };
    }

    const entries = getTimelineLaneEntries();
    if (!entries.length) {
        return null;
    }

    let timelineDurationMs = 0;
    let hasValidEntry = false;

    entries.forEach((entry) => {
        if (!entry) {
            return;
        }

        const start = Number.isFinite(entry.start)
            ? Math.max(0, Number(entry.start) || 0)
            : null;
        const end = Number.isFinite(entry.end)
            ? Math.max(0, Number(entry.end) || 0)
            : null;

        if (start === null || end === null || end < start) {
            return;
        }

        timelineDurationMs = Math.max(timelineDurationMs, end);
        hasValidEntry = true;
    });

    if (!hasValidEntry) {
        return null;
    }

    if (timelineDurationMs <= 0) {
        return { offset, width: 0 };
    }

    const width = Math.max(1, Math.round(timelineDurationMs / perPixel));

    return { offset, width };
}

let timelineProgressAnimationFrame = null;
let timelineProgressAnimationStartTimestamp = 0;
let timelineProgressAnimationDurationMs = 0;
let timelineProgressAnimationStartFraction = 0;
let timelineProgressAnimationEndFraction = 0;
let timelineProgressAnimationStartTimeMs = 0;
let timelineProgressAnimationEndTimeMs = 0;
let timelineProgressCurrentFraction = 0;
let timelinePlayheadManualVisible = false;
const timelinePlayheadDragState = {
    pointerId: null,
    lastFraction: null,
};

function getTimelineProgressFraction() {
    return clampProgress(timelineProgressCurrentFraction);
}

function cancelTimelineProgressAnimation() {
    if (timelineProgressAnimationFrame !== null) {
        window.cancelAnimationFrame(timelineProgressAnimationFrame);
        timelineProgressAnimationFrame = null;
    }
    timelineProgressAnimationStartTimestamp = 0;
    timelineProgressAnimationDurationMs = 0;
    timelineProgressAnimationStartFraction = timelineProgressCurrentFraction;
    timelineProgressAnimationEndFraction = timelineProgressCurrentFraction;
    timelineProgressAnimationStartTimeMs = 0;
    timelineProgressAnimationEndTimeMs = 0;
}

function hasTimelineItems() {
    return Boolean(timelineTrack && timelineTrack.querySelector('.timeline-item'));
}

function shouldShowTimelinePlayhead() {
    if (!hasTimelineItems()) {
        return false;
    }
    return isTimelinePlaying || isTimelinePaused || timelinePlayheadManualVisible;
}

function setTimelineProgressVisuals(fraction, options = {}) {
    const {
        updateInput = true,
        updatePlayhead = true,
        forceGeometryUpdate = false,
    } = options;

    const clamped = clampProgress(Number.isFinite(fraction) ? fraction : 0);
    timelineProgressCurrentFraction = clamped;

    if (timelineProgressLine) {
        timelineProgressLine.dataset.progress = String(clamped);
        timelineProgressLine.style.transition = 'none';
        timelineProgressLine.style.transform = `scaleX(${clamped})`;
    }

    if (updateInput) {
        updateTimelineProgressInput(clamped);
    }

    if (updatePlayhead) {
        if (!timelinePlayheadManualVisible && hasTimelineItems()) {
            timelinePlayheadManualVisible = true;
        }
        updateTimelinePlayheadIndicator(clamped, {
            visible: shouldShowTimelinePlayhead(),
            forceGeometryUpdate,
        });
    }
}

function updateTimelineProgressInput(fraction) {
    if (!timelineProgressInput) {
        return;
    }
    timelineProgressInput.value = String(Math.round(clampProgress(fraction) * 100));
}

function getTimelineProgressGeometry() {
    if (!timelineTrack) {
        return { offset: 0, width: 0 };
    }

    const geometry = computeTimelineDurationGeometry();
    if (geometry) {
        return geometry;
    }

    const { left: paddingLeft, right: paddingRight } = getTimelineTrackPadding();
    const width = Math.max(0, timelineTrack.clientWidth - paddingLeft - paddingRight);
    return { offset: paddingLeft, width };
}

function recomputeTimelinePlayheadGeometry() {
    if (!timelineTrack) {
        lastTimelinePlayheadGeometry = { offset: 0, width: 0 };
        return lastTimelinePlayheadGeometry;
    }

    const geometry = computeTimelineDurationGeometry();
    if (geometry) {
        lastTimelinePlayheadGeometry = geometry;
        return lastTimelinePlayheadGeometry;
    }

    const { left: paddingLeft, right: paddingRight } = getTimelineTrackPadding();
    const width = Math.max(0, timelineTrack.clientWidth - paddingLeft - paddingRight);
    lastTimelinePlayheadGeometry = { offset: paddingLeft, width };
    return lastTimelinePlayheadGeometry;
}

function hideTimelinePlayheadIndicator() {
    if (!timelinePlayheadLine) {
        return;
    }
    timelinePlayheadLine.classList.remove('is-visible');
    timelinePlayheadLine.style.transition = 'none';
    timelinePlayheadLine.style.transform = 'translateX(-9999px)';
    timelinePlayheadLine.removeAttribute('data-position');
    timelinePlayheadLine.setAttribute('aria-hidden', 'true');
}

function updateTimelinePlayheadIndicator(fraction, options = {}) {
    if (!timelinePlayheadLine || !timelineTrack) {
        return;
    }

    const { visible = true, forceGeometryUpdate = false } = options;

    if (!visible) {
        hideTimelinePlayheadIndicator();
        return;
    }

    if (forceGeometryUpdate) {
        recomputeTimelinePlayheadGeometry();
    }

    const { offset, width } = lastTimelinePlayheadGeometry;
    if (!Number.isFinite(width) || width <= 0) {
        hideTimelinePlayheadIndicator();
        return;
    }

    const numericFraction = Number(fraction);
    if (!Number.isFinite(numericFraction)) {
        hideTimelinePlayheadIndicator();
        return;
    }

    const clamped = Math.min(Math.max(numericFraction, 0), 1);
    const position = offset + (width * clamped);

    timelinePlayheadLine.style.transition = 'none';
    timelinePlayheadLine.style.transform = `translateX(${Math.round(position)}px)`;
    timelinePlayheadLine.dataset.position = String(clamped);
    timelinePlayheadLine.classList.add('is-visible');
    timelinePlayheadLine.setAttribute('aria-hidden', 'false');
}

function ensureTimelinePlayheadVisibility(targetFraction, options = {}) {
    if (!timelineTrack) {
        return;
    }

    const { immediate = false } = options;

    const adjustScroll = () => {
        const { offset, width } = lastTimelinePlayheadGeometry;
        if (!Number.isFinite(width) || width <= 0) {
            return;
        }

        const clamped = clampProgress(Number.isFinite(targetFraction) ? targetFraction : getTimelineProgressFraction());
        const targetPosition = offset + (width * clamped);
        const { left: paddingLeft, right: paddingRight } = getTimelineTrackPadding();
        const marginStart = Math.max(0, Math.min(32, paddingLeft || 0));
        const marginEnd = Math.max(0, Math.min(32, paddingRight || 0));
        const visibleStart = timelineTrack.scrollLeft + marginStart;
        const visibleEnd = timelineTrack.scrollLeft + Math.max(0, timelineTrack.clientWidth - marginEnd);

        if (targetPosition < visibleStart) {
            const nextScroll = Math.max(0, targetPosition - marginStart);
            timelineTrack.scrollLeft = nextScroll;
        } else if (targetPosition > visibleEnd) {
            const availableWidth = Math.max(0, timelineTrack.clientWidth - marginEnd);
            const desiredScroll = targetPosition - availableWidth;
            const maxScroll = Math.max(0, timelineTrack.scrollWidth - timelineTrack.clientWidth);
            const nextScroll = Math.min(Math.max(0, desiredScroll), maxScroll);
            timelineTrack.scrollLeft = nextScroll;
        }
    };

    if (immediate) {
        adjustScroll();
    } else {
        window.requestAnimationFrame(adjustScroll);
    }
}

function applyTimelineProgressGeometry() {
    if (!timelineProgressLine || !timelineTrack) {
        return 0;
    }

    const { offset, width } = getTimelineProgressGeometry();
    timelineProgressLine.style.setProperty('--timeline-progress-offset', `${offset}px`);
    timelineProgressLine.style.setProperty('--timeline-progress-span', `${width}px`);
    recomputeTimelinePlayheadGeometry();
    return width;
}

function scheduleTimelineIndicatorUpdate() {
    if (timelineIndicatorResizeFrame !== null) {
        return;
    }
    timelineIndicatorResizeFrame = window.requestAnimationFrame(() => {
        timelineIndicatorResizeFrame = null;
        updateActiveTimelineIndicators();
    });
}

function resetTimelineProgressLine(fraction = 0) {
    cancelTimelineProgressAnimation();
    if (!hasTimelineItems()) {
        timelinePlayheadManualVisible = false;
    } else if (!timelinePlayheadManualVisible) {
        timelinePlayheadManualVisible = true;
    }
    if (!timelineProgressLine) {
        const clamped = clampProgress(Number.isFinite(fraction) ? fraction : 0);
        timelineProgressCurrentFraction = clamped;
        updateTimelineProgressInput(clamped);
        hideTimelinePlayheadIndicator();
        return;
    }
    const width = applyTimelineProgressGeometry();
    const clamped = width > 0 ? clampProgress(fraction) : 0;
    setTimelineProgressVisuals(clamped, { forceGeometryUpdate: true });
}

function animateTimelineProgress(startFraction, endFraction, durationMs) {
    cancelTimelineProgressAnimation();
    if (!timelineProgressLine) {
        const end = clampProgress(endFraction);
        timelineProgressCurrentFraction = end;
        updateTimelineProgressInput(end);
        hideTimelinePlayheadIndicator();
        return;
    }

    const width = applyTimelineProgressGeometry();
    const hasSpan = width > 0;
    const start = hasSpan ? clampProgress(startFraction) : 0;
    const end = hasSpan ? clampProgress(endFraction) : 0;
    const duration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;

    setTimelineProgressVisuals(start, { forceGeometryUpdate: true });

    if (!hasSpan) {
        setTimelineProgressVisuals(end);
        return;
    }

    timelineProgressAnimationStartFraction = start;
    timelineProgressAnimationEndFraction = end;
    timelineProgressAnimationDurationMs = duration;
    timelineProgressAnimationStartTimestamp = performance.now();

    const totalDuration = Math.max(
        0,
        Number(playbackClockTotalDuration)
            || Number(playbackDisplayTotalMs)
            || 0,
    );
    const inferredStartTime = Number.isFinite(totalDuration) && totalDuration > 0
        ? start * totalDuration
        : 0;
    const inferredEndTime = Number.isFinite(totalDuration) && totalDuration > 0
        ? end * totalDuration
        : inferredStartTime + duration;
    const fallbackSpan = duration > 0
        ? duration
        : Math.max(inferredEndTime - inferredStartTime, 0);

    timelineProgressAnimationStartTimeMs = Math.max(0, inferredStartTime);
    timelineProgressAnimationEndTimeMs = Math.max(
        timelineProgressAnimationStartTimeMs,
        Number.isFinite(inferredEndTime)
            ? inferredEndTime
            : timelineProgressAnimationStartTimeMs + fallbackSpan,
    );

    if (!isTimelinePlaying || duration <= 0) {
        setTimelineProgressVisuals(end);
        return;
    }

    const tick = () => {
        if (!isTimelinePlaying) {
            timelineProgressAnimationFrame = null;
            return;
        }

        const now = performance.now();
        const fallbackElapsed = timelineProgressAnimationStartTimeMs
            + Math.max(0, now - timelineProgressAnimationStartTimestamp);
        const syncedElapsed = getTimelinePlaybackSyncedElapsed(fallbackElapsed, now);
        const segmentDuration = Math.max(
            timelineProgressAnimationEndTimeMs - timelineProgressAnimationStartTimeMs,
            0,
        );
        const clampedElapsed = Math.min(
            timelineProgressAnimationEndTimeMs,
            Math.max(timelineProgressAnimationStartTimeMs, syncedElapsed),
        );
        const progress = segmentDuration > 0
            ? Math.min(Math.max(
                (clampedElapsed - timelineProgressAnimationStartTimeMs) / segmentDuration,
                0,
            ), 1)
            : 1;
        const range = timelineProgressAnimationEndFraction - timelineProgressAnimationStartFraction;
        const nextFraction = timelineProgressAnimationStartFraction + (range * progress);

        setTimelineProgressVisuals(nextFraction);

        if (progress < 1) {
            timelineProgressAnimationFrame = window.requestAnimationFrame(tick);
        } else {
            timelineProgressAnimationFrame = null;
            setTimelineProgressVisuals(timelineProgressAnimationEndFraction);
        }
    };

    timelineProgressAnimationFrame = window.requestAnimationFrame(tick);
}

if (timelineTrack) {
    timelineTrack.addEventListener('scroll', () => {
        recomputeTimelinePlayheadGeometry();
        if (!timelinePlayheadLine || !timelinePlayheadLine.classList.contains('is-visible')) {
            return;
        }
        const stored = Number.parseFloat(timelinePlayheadLine.dataset && timelinePlayheadLine.dataset.position);
        if (Number.isFinite(stored)) {
            updateTimelinePlayheadIndicator(stored, { visible: true });
        }
    });
}

function shouldSeekTimelineFromTrackEvent(event) {
    const target = event?.target;
    if (!(target instanceof Element)) {
        return true;
    }

    if (target.closest('.timeline-item')) {
        return false;
    }

    if (target.closest('.timeline-playhead-line')) {
        return false;
    }

    return true;
}

function handleTimelineTrackClick(event) {
    if (!timelineTrack || event.defaultPrevented) {
        return;
    }

    if (event.button !== undefined && event.button !== 0) {
        return;
    }

    if (!shouldSeekTimelineFromTrackEvent(event)) {
        return;
    }

    const fraction = computeTimelineFractionFromClientX(event.clientX);

    if (!Number.isFinite(fraction)) {
        return;
    }

    if (isTimelinePlaying) {
        stopTimelinePlayback(false, false);
    }

    applyManualTimelineSeek(fraction, { commit: true });
}

if (timelineTrack) {
    timelineTrack.addEventListener('click', handleTimelineTrackClick);
}

function computeTimelineFractionFromClientX(clientX) {
    if (!timelineTrack || !Number.isFinite(clientX)) {
        return getTimelineProgressFraction();
    }

    const rect = timelineTrack.getBoundingClientRect();
    recomputeTimelinePlayheadGeometry();
    const { offset, width } = lastTimelinePlayheadGeometry;

    if (!Number.isFinite(width) || width <= 0) {
        return 0;
    }

    const trackX = (clientX - rect.left) + timelineTrack.scrollLeft;
    const relative = (trackX - offset) / width;
    return clampProgress(relative);
}

function updateTimelinePauseStateFromTime(targetTimeMs, playbackState = null) {
    if (!isTimelinePaused) {
        timelinePauseState = null;
        return;
    }

    const state = playbackState || getTimelinePlaybackSegments();
    const { segments, totalDuration } = state;

    if (!segments.length || totalDuration <= 0) {
        timelinePauseState = null;
        return;
    }

    const timelineItems = getTimelineItems();
    if (!timelineItems.length) {
        timelinePauseState = null;
        return;
    }

    const safeUpperBound = Math.max(totalDuration - 1, 0);
    const clampedTime = Math.min(
        Math.max(Math.round(Number(targetTimeMs) || 0), 0),
        safeUpperBound,
    );

    const matchingSegment = segments.find((segment, index) => {
        const isLast = index === segments.length - 1;
        return clampedTime >= segment.start && (clampedTime < segment.end || isLast);
    }) || null;

    let resumeItemIndex = activeTimelineItem
        ? timelineItems.indexOf(activeTimelineItem)
        : -1;

    if (matchingSegment && matchingSegment.item) {
        const segmentIndex = timelineItems.indexOf(matchingSegment.item);
        if (segmentIndex >= 0) {
            resumeItemIndex = segmentIndex;
        }
    }

    if (resumeItemIndex < 0) {
        resumeItemIndex = 0;
    }

    timelinePauseState = {
        resumeItemIndex,
        resumeTimeMs: clampedTime,
    };
}

function applyManualTimelineSeek(fraction, options = {}) {
    const { commit = false, playbackState = null } = options;

    const clamped = clampProgress(Number.isFinite(fraction) ? fraction : 0);
    timelinePlayheadManualVisible = true;
    cancelTimelineProgressAnimation();

    const state = playbackState || getTimelinePlaybackSegments();
    const { totalDuration } = state;
    const safeTotal = Math.max(0, Math.round(Number(totalDuration) || 0));
    const safeTarget = safeTotal > 0
        ? Math.min(Math.max(Math.round(clamped * safeTotal), 0), Math.max(safeTotal - 1, 0))
        : 0;

    setTimelineProgressVisuals(clamped, { forceGeometryUpdate: true });
    ensureTimelinePlayheadVisibility(clamped, { immediate: true });
    updatePlaybackTimeDisplay(safeTarget, safeTotal);
    timelinePlayheadDragState.lastFraction = clamped;

    if (commit) {
        seekTimelineToFraction(clamped);
        updateTimelinePauseStateFromTime(safeTarget, state);
        ensureTimelinePlayheadVisibility(clamped);
    }
}

function handleTimelinePlayheadPointerDown(event) {
    if (!timelinePlayheadLine || !timelineTrack) {
        return;
    }
    if (event.button !== undefined && event.button !== 0) {
        return;
    }

    event.preventDefault();
    timelinePlayheadDragState.pointerId = event.pointerId;

    if (timelinePlayheadLine.setPointerCapture) {
        try {
            timelinePlayheadLine.setPointerCapture(event.pointerId);
        } catch (error) {
            // Ignore pointer capture errors.
        }
    }

    if (isTimelinePlaying) {
        stopTimelinePlayback(false, false);
    }

    const fraction = computeTimelineFractionFromClientX(event.clientX);
    applyManualTimelineSeek(fraction, { commit: false });
}

function handleTimelinePlayheadPointerMove(event) {
    if (timelinePlayheadDragState.pointerId !== event.pointerId) {
        return;
    }

    event.preventDefault();
    const fraction = computeTimelineFractionFromClientX(event.clientX);
    applyManualTimelineSeek(fraction, { commit: false });
}

function finalizeTimelinePlayheadDrag(event) {
    if (timelinePlayheadDragState.pointerId !== event.pointerId) {
        return;
    }

    if (timelinePlayheadLine.releasePointerCapture) {
        try {
            timelinePlayheadLine.releasePointerCapture(event.pointerId);
        } catch (error) {
            // Ignore release errors.
        }
    }

    event.preventDefault();
    const fraction = timelinePlayheadDragState.lastFraction !== null
        ? timelinePlayheadDragState.lastFraction
        : getTimelineProgressFraction();
    const state = getTimelinePlaybackSegments();
    applyManualTimelineSeek(fraction, { commit: true, playbackState: state });

    timelinePlayheadDragState.pointerId = null;
    timelinePlayheadDragState.lastFraction = null;
}

if (timelinePlayheadLine) {
    timelinePlayheadLine.addEventListener('pointerdown', handleTimelinePlayheadPointerDown);
    timelinePlayheadLine.addEventListener('pointermove', handleTimelinePlayheadPointerMove);
    timelinePlayheadLine.addEventListener('pointerup', finalizeTimelinePlayheadDrag);
    timelinePlayheadLine.addEventListener('pointercancel', finalizeTimelinePlayheadDrag);
}

function getTimelineItemPlaybackDuration(timelineItem) {
    const fileType = timelineItem.dataset.fileType || '';
    if (fileType.startsWith('image/')) {
        const duration = Number(timelineItem.dataset.imageDuration);
        if (Number.isFinite(duration) && duration > 0) {
            return duration;
        }
        return IMAGE_FRAME_DURATION;
    }
    if (fileType.startsWith('video/')) {
        const duration = Number(timelineItem.dataset.videoDuration);
        if (Number.isFinite(duration) && duration > 0) {
            return duration;
        }
    }
    if (fileType.startsWith('audio/')) {
        const duration = Number(timelineItem.dataset.audioDuration);
        if (Number.isFinite(duration) && duration > 0) {
            return duration;
        }
        return MIN_AUDIO_DURATION;
    }
    return 0;
}

resetTimelineProgressLine();
updateActiveTimelineIndicators();
renderKeyframeTrack(activeTimelineItem);
updateImageRotationControlState();
refreshImageDurationApplyAllAvailability();

function stopTimelinePlayback(resetButton = true, resetProgress = true, options = {}) {
    const preservePauseState = options && options.preservePauseState === true;
    const abort = timelinePlaybackAbort;
    timelinePlaybackAbort = null;

    if (typeof abort === 'function') {
        abort();
    }

    isTimelinePlaying = false;
    cancelTimelineProgressAnimation();
    if (!preservePauseState) {
        isTimelinePaused = false;
        timelinePauseState = null;
    }

    cancelPreviewExitAnimation({ forceRestore: true });
    cancelPreviewAudioEnvelope({ restoreVolume: true });
    stopPreviewAudio({ resetTime: resetProgress });
    pausePreviewCanvasVideo();

    clearTimelinePlaybackSyncSource();

    stopPlaybackClock(resetProgress);
    updateKeyframeControlsState();

    if (resetProgress) {
        resetTimelineProgressLine();
    }

    if (!previewVideo.paused) {
        previewVideo.pause();
    }

    if (resetProgress) {
        previewVideo.currentTime = 0;
    }

    if (resetButton) {
        playVideoButton.textContent = 'Play Back';
    }

    refreshActiveOverlayLayers();
}

function clearPreview() {
    stopTimelinePlayback();
    previewVideo.pause();
    previewVideo.hidden = true;
    previewVideo.removeAttribute('src');
    previewVideo.load();
    cancelPreviewAudioEnvelope({ restoreVolume: true });
    stopPreviewAudio({ resetTime: true });
    setPreviewImageVisibility(false);
    previewImage.removeAttribute('src');
    previewImage.classList.remove('is-visible');
    previewPlaceholder.hidden = false;
    playVideoButton.textContent = 'Play Back';
    setPreviewMode(null);
    resetPreviewScroll();
    if (previewImage) {
        previewImage.style.removeProperty('mix-blend-mode');
    }
    clearPreviewCanvasBackdrop();
    clearPreviewOverlayLayers();
    commitPreviewTextEditorContent({ force: true });
    syncPreviewTextEditorState(null, { skipCommit: true });
    setActiveTimelineItem(null);
}

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
    renderKeyframeTrack(activeTimelineItem);
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

    if (!options.force && timelineItem.dataset.timelineInstanceId) {
        return timelineItem.dataset.timelineInstanceId;
    }

    const id = generateTimelineInstanceId();
    timelineItem.dataset.timelineInstanceId = id;
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

function refreshTimelineObjectUrlUsage() {
    timelineObjectUrlUsage.clear();
    getTimelineItems().forEach((item) => {
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
        regenerateDefaultTextOverlayAssets(timelineItem);
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

    const { recordUndo = true } = options;
    const snapshot = recordUndo ? createTimelineItemSnapshot(timelineItem) : null;
    const parentLane = timelineItem.closest('.timeline-lane');
    const fileType = timelineItem.dataset?.fileType || '';
    const objectUrl = timelineItem.dataset?.objectUrl || '';
    const hasStagedUpload = objectUrl && stagedUploadsByObjectUrl.has(objectUrl);
    const wasActive = timelineItem === activeTimelineItem;

    detachAudioWaveformResizeObserver(timelineItem);
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
        }
        if (!hasStagedUpload) {
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
    } else if (fileType.startsWith('image/')) {
        cancelPreviewExitAnimation({ forceRestore: true });
        setPreviewMode('has-image');
        previewVideo.pause();
        previewVideo.hidden = true;
        previewVideo.removeAttribute('src');
        setPreviewImageVisibility(true);
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
    }

    applyCanvasSettingsToPreview(timelineItem);
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

let activeAudioOverlayEntry = null;

function stopPreviewAudio(options = {}) {
    if (!previewAudio) {
        return;
    }
    const { resetTime = true } = options;
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
    if (activeAudioOverlayEntry?.syncSource) {
        clearTimelinePlaybackSyncSource(activeAudioOverlayEntry.syncSource);
    }
    activeAudioOverlayEntry = null;
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

    return {
        item: entry.item,
        start: startTime,
        end: safeEndTime,
    };
}

function getTimelineAudioEntryAtTime(timeMs) {
    if (typeof getTimelineLaneEntries !== 'function') {
        return null;
    }

    const rawTime = Number(timeMs);
    if (!Number.isFinite(rawTime)) {
        return null;
    }

    const targetTime = Math.max(0, Math.round(rawTime));
    const candidateEntries = getTimelineLaneEntries();

    if (!candidateEntries.length) {
        return null;
    }

    const audioCandidates = candidateEntries
        .filter((entry) => entry?.item && isAudioTimelineItem(entry.item))
        .map((entry) => {
            const start = Number.isFinite(entry.start)
                ? Math.max(0, Math.round(entry.start))
                : 0;
            const end = Number.isFinite(entry.end)
                ? Math.max(0, Math.round(entry.end))
                : start;
            const laneIndex = resolveLaneIndex(entry.laneIndex ?? entry.item?.dataset?.laneIndex);
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

    if (!audioCandidates.length) {
        return null;
    }

    const primary = audioCandidates[0];
    return {
        item: primary.item,
        start: primary.start,
        end: primary.end,
    };
}

function syncPreviewAudioOverlay(entries, segmentStartTimeMs) {
    const normalizedSegmentTime = Number.isFinite(segmentStartTimeMs)
        ? Math.max(0, Math.round(segmentStartTimeMs))
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

    if ((!audioEntry || !audioEntry.item) && normalizedSegmentTime !== null) {
        const timelineAudioEntry = getTimelineAudioEntryAtTime(normalizedSegmentTime);
        if (timelineAudioEntry) {
            audioEntry = normalizeAudioOverlayEntry(timelineAudioEntry);
        }
    }

    if (!audioEntry || !previewAudio) {
        stopPreviewAudio({ resetTime: false });
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

    if (needsRestart) {
        if (objectURL && previewAudio.src !== objectURL) {
            previewAudio.src = objectURL;
            try {
                previewAudio.load();
            } catch (error) {
                // Ignore load errors.
            }
        }

        const audioSettings = getTimelineItemAudioSettings(audioEntry.item);
        applyMasterVolumeToPreview(audioSettings.volumePercent, { mediaElement: previewAudio });
        const remainingDuration = Math.max(0, clipDuration - offsetMs);
        if (remainingDuration > 0) {
            applyPreviewAudioEnvelope(audioSettings, remainingDuration, { mediaElement: previewAudio });
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

        applyAudioSyncSource();
        return;
    }

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

    applyAudioSyncSource();
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

    timelineItem.appendChild(label);
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
        previewVideo.hidden = false;
        previewPlaceholder.hidden = true;
        applyMasterVolumeToPreview(audioSettings.volumePercent, { mediaElement: previewVideo });

        await new Promise((resolve) => {
            let resolved = false;
            let timeoutId = 0;
            let onEnded = null;
            let onError = null;
            const abortController = new AbortController();
            let playbackStarted = false;

            const cleanup = () => {