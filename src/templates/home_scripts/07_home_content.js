
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

    const clipDuration = Math.max(0, getTimelineItemPlaybackDuration(activeTimelineItem));
    const startTime = getTimelineItemStartTime(activeTimelineItem);
    const totalDuration = getTotalTimelineDuration();
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

let timelineProgressAnimationFrame = null;
let timelineProgressAnimationStartTimestamp = 0;
let timelineProgressAnimationDurationMs = 0;
let timelineProgressAnimationStartFraction = 0;
let timelineProgressAnimationEndFraction = 0;
let timelineProgressCurrentFraction = 0;

function cancelTimelineProgressAnimation() {
    if (timelineProgressAnimationFrame !== null) {
        window.cancelAnimationFrame(timelineProgressAnimationFrame);
        timelineProgressAnimationFrame = null;
    }
    timelineProgressAnimationStartTimestamp = 0;
    timelineProgressAnimationDurationMs = 0;
    timelineProgressAnimationStartFraction = timelineProgressCurrentFraction;
    timelineProgressAnimationEndFraction = timelineProgressCurrentFraction;
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
        updateTimelinePlayheadIndicator(clamped, {
            visible: isTimelinePlaying || isTimelinePaused,
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

    const items = getTimelineItems();
    if (!items.length) {
        const computedStyle = window.getComputedStyle(timelineTrack);
        const paddingLeft = Number.parseFloat(computedStyle.paddingLeft) || 0;
        const paddingRight = Number.parseFloat(computedStyle.paddingRight) || 0;
        const width = Math.max(0, timelineTrack.clientWidth - paddingLeft - paddingRight);
        return { offset: paddingLeft, width };
    }

    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    const offset = firstItem.offsetLeft;
    const width = (lastItem.offsetLeft + lastItem.offsetWidth) - offset;
    return { offset, width: Math.max(0, width) };
}

function recomputeTimelinePlayheadGeometry() {
    if (!timelineTrack) {
        lastTimelinePlayheadGeometry = { offset: 0, width: 0 };
        return lastTimelinePlayheadGeometry;
    }

    const items = getTimelineItems();

    if (!items.length) {
        const computedStyle = window.getComputedStyle(timelineTrack);
        const paddingLeft = Number.parseFloat(computedStyle.paddingLeft) || 0;
        const paddingRight = Number.parseFloat(computedStyle.paddingRight) || 0;
        const width = Math.max(0, timelineTrack.clientWidth - paddingLeft - paddingRight);
        lastTimelinePlayheadGeometry = { offset: paddingLeft, width };
        return lastTimelinePlayheadGeometry;
    }

    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    const offset = firstItem.offsetLeft;
    const width = Math.max(0, (lastItem.offsetLeft + lastItem.offsetWidth) - offset);

    lastTimelinePlayheadGeometry = { offset, width };
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
        const elapsed = Math.max(0, now - timelineProgressAnimationStartTimestamp);
        const progress = timelineProgressAnimationDurationMs > 0
            ? Math.min(elapsed / timelineProgressAnimationDurationMs, 1)
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

function loadPreviewFromTimeline(timelineItem, overlayEntriesOverride = null, options = {}) {
    if (!timelineItem) {
        clearPreview();
        return;
    }

    const fileType = timelineItem.dataset.fileType || '';
    const objectURL = timelineItem.dataset.objectUrl;

    const overlayEntries = getOverlayEntriesForTimelineItem(timelineItem, overlayEntriesOverride);
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
    const { listItem, addButton, file } = entry;

    if (!listItem || !addButton) {
        return;
    }

    if (isAdded) {
        listItem.classList.add('is-added');
        addButton.disabled = true;
        addButton.innerHTML = '<span aria-hidden="true">✓</span>';
        addButton.setAttribute('aria-label', `${file.name} added to timeline`);
    } else {
        listItem.classList.remove('is-added');
        addButton.disabled = false;
        addButton.innerHTML = '<span aria-hidden="true">+</span>';
        addButton.setAttribute('aria-label', `Add ${file.name} to timeline`);
    }
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

    const listItem = document.createElement('li');
    listItem.className = 'upload-gallery__item';
    listItem.dataset.objectUrl = objectURL;

    const previewWrapper = document.createElement('div');
    previewWrapper.className = 'upload-gallery__preview';

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
        video.loop = true;
        video.playsInline = true;
        video.autoplay = true;
        previewWrapper.appendChild(video);
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
        try {
            await addToTimeline(file, objectURL);
            setStagedUploadAddedState(objectURL, true);
        } catch (error) {
            console.error('Failed to add upload to timeline.', error);
            addButton.disabled = false;
        }
    });

    actions.appendChild(addButton);

    listItem.append(previewWrapper, meta, actions);
    uploadGalleryList.appendChild(listItem);

    stagedUploadsByObjectUrl.set(objectURL, {
        file,
        listItem,
        addButton,
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
const audioWaveformResizeObservers = new WeakMap();

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
        let audioContext = null;
        try {
            audioContext = new AudioContextConstructor();
            const audioBuffer = await new Promise((resolve, reject) => {
                audioContext.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
            });
            return audioBuffer;
        } catch (error) {
            console.warn('Unable to decode audio file for waveform rendering.', error);
            return null;
        } finally {
            if (audioContext && typeof audioContext.close === 'function') {
                audioContext.close().catch(() => {});
            }
        }
    });
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
    const isAudioBuffer = typeof AudioBuffer !== 'undefined'
        && audioBuffer instanceof AudioBuffer;
    if (isAudioBuffer) {
        channelData = audioBuffer.numberOfChannels > 0
            ? audioBuffer.getChannelData(0)
            : null;
    } else if (audioBuffer?.channelData instanceof Float32Array) {
        channelData = audioBuffer.channelData;
    } else if (audioBuffer instanceof Float32Array) {
        channelData = audioBuffer;
    }

    if (!channelData) {
        return;
    }

    const totalSamples = channelData.length;
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

    if (cacheEntry.audioBuffer || cacheEntry.channelData instanceof Float32Array) {
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
        const cacheEntry = {
            imageDataUrl: null,
            durationMs,
            drawn: true,
            audioBuffer,
        };
        audioWaveformByObjectUrl.set(objectURL, cacheEntry);
        timelineItem.dataset.maxAudioDuration = String(durationMs);
        setTimelineItemDuration(timelineItem, 'audioDuration', durationMs, { markCustom: false });
        if (waveformCanvas) {
            const widthOverride = timelineItem
                ? Math.round(timelineItem.getBoundingClientRect().width)
                : null;
            drawAudioWaveform(waveformCanvas, audioBuffer, {
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

        previewAudio.play().catch((error) => {
            console.warn('Unable to start audio clip playback.', error);
        });

        activeAudioOverlayEntry = {
            item: audioEntry.item,
            start: audioEntry.start,
            end: audioEntry.end,
        };
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

    activeAudioOverlayEntry = {
        item: audioEntry.item,
        start: audioEntry.start,
        end: audioEntry.end,
    };
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
    initializeTimelineItem(timelineItem);
    updateTimelineEmptyState();

    registerTimelineItemInteractions(timelineItem, removeButton);

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
            const parentLane = targetItem.closest('.timeline-lane');
            const wasActive = targetItem === activeTimelineItem;
            const fileType = targetItem.dataset.fileType || '';
            const url = targetItem.dataset.objectUrl;
            detachAudioWaveformResizeObserver(targetItem);
            releaseTimelineCanvasCustomImage(targetItem);
            targetItem.remove();
            if (parentLane) {
                flushTimelineLaneReflow(parentLane);
            }
            if (url) {
                setStagedUploadAddedState(url, false);
                if (fileType.startsWith('image/')) {
                    releaseTimelineImage(url);
                }
                if (!stagedUploadsByObjectUrl.has(url)) {
                    URL.revokeObjectURL(url);
                }
            }
            if (fileType.startsWith('audio/')) {
                stopPreviewAudio({ resetTime: true });
            }
            if (wasActive) {
                setActiveTimelineItem(null);
                clearPreview();
            }
            cleanupEmptyTimelineLanes();
            updateTimelineEmptyState();
            updateActiveTimelineIndicators();
            renderExportSummary(getTimelineItems(), null);
            refreshImageDurationApplyAllAvailability();
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

function calculateDefaultTextTemplateTransform(textContent = DEFAULT_TEXT_TEMPLATE_LABEL) {
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

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
        return fallback;
    }

    const safeText = String(textContent || DEFAULT_TEXT_TEMPLATE_LABEL);
    const fontDescriptor = `600 ${DEFAULT_TEXT_TEMPLATE_FONT_SIZE}px Inter, 'Segoe UI', system-ui, sans-serif`;
    context.font = fontDescriptor;

    const metrics = context.measureText(safeText);
    const baseWidth = Number.isFinite(metrics.width) ? metrics.width : 0;
    const letterSpacing = DEFAULT_TEXT_TEMPLATE_FONT_SIZE * 0.04;
    const totalLetterSpacing = Math.max(0, safeText.length - 1) * letterSpacing;
    const measuredWidth = Math.max(0, baseWidth + totalLetterSpacing);

    const ascent = Number.isFinite(metrics.actualBoundingBoxAscent)
        ? metrics.actualBoundingBoxAscent
        : DEFAULT_TEXT_TEMPLATE_FONT_SIZE * 0.82;
    const descent = Number.isFinite(metrics.actualBoundingBoxDescent)
        ? metrics.actualBoundingBoxDescent
        : DEFAULT_TEXT_TEMPLATE_FONT_SIZE * 0.18;
    const measuredHeight = Math.max(0, ascent + descent);

    const totalWidthPx = measuredWidth + (DEFAULT_TEXT_TEMPLATE_HORIZONTAL_PADDING * 2);
    const totalHeightPx = measuredHeight + (DEFAULT_TEXT_TEMPLATE_VERTICAL_PADDING * 2);

    if (!Number.isFinite(totalWidthPx) || !Number.isFinite(totalHeightPx) || totalWidthPx <= 0 || totalHeightPx <= 0) {
        return fallback;
    }

    const normalizedWidth = totalWidthPx / DEFAULT_TEXT_TEMPLATE_CANVAS_WIDTH;
    const normalizedHeight = totalHeightPx / DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT;

    if (!Number.isFinite(normalizedWidth) || !Number.isFinite(normalizedHeight)
        || normalizedWidth <= 0 || normalizedHeight <= 0) {
        return fallback;
    }

    const aspectRatio = Number.isFinite(totalWidthPx / totalHeightPx)
        && totalWidthPx > 0
        && totalHeightPx > 0
        ? totalWidthPx / totalHeightPx
        : DEFAULT_TEXT_TEMPLATE_ASPECT_RATIO;

    let width = normalizedWidth;
    let height = normalizedHeight;

    if (width < DEFAULT_TEXT_TEMPLATE_MIN_WIDTH) {
        const scale = DEFAULT_TEXT_TEMPLATE_MIN_WIDTH / width;
        width = DEFAULT_TEXT_TEMPLATE_MIN_WIDTH;
        height *= scale;
    }

    const MAX_DIMENSION = 0.95;
    if (width > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / width;
        width = MAX_DIMENSION;
        height *= scale;
    }

    if (height > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / height;
        height = MAX_DIMENSION;
        width *= scale;
    }

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return fallback;
    }

    const top = (1 - height) / 2;
    const left = (1 - width) / 2;

    const resolvedAspectRatio = width > 0 && height > 0 ? width / height : aspectRatio;

    return {
        left,
        top,
        width,
        height,
        aspectRatio: resolvedAspectRatio,
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

function createDefaultTextOverlayObjectURL(textContent = DEFAULT_TEXT_TEMPLATE_LABEL) {
    const safeText = escapeSvgTextContent(textContent);
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${DEFAULT_TEXT_TEMPLATE_CANVAS_WIDTH}" height="${DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT}" viewBox="0 0 ${DEFAULT_TEXT_TEMPLATE_CANVAS_WIDTH} ${DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT}">
    <style>
        text { font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; }
    </style>
    <rect width="${DEFAULT_TEXT_TEMPLATE_CANVAS_WIDTH}" height="${DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT}" fill="rgba(15,23,42,0.0)" />
    <text x="${DEFAULT_TEXT_TEMPLATE_CANVAS_WIDTH / 2}" y="${DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT / 2}" fill="#F8FAFC" font-size="${DEFAULT_TEXT_TEMPLATE_FONT_SIZE}" font-weight="600" text-anchor="middle" dominant-baseline="middle" letter-spacing="1">
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

    const objectURL = createDefaultTextOverlayObjectURL(DEFAULT_TEXT_TEMPLATE_LABEL);

    const timelineItem = document.createElement('div');
    timelineItem.className = 'timeline-item timeline-item--text';
    timelineItem.setAttribute('role', 'listitem');
    timelineItem.tabIndex = 0;
    timelineItem.dataset.fileType = 'image/svg+xml';
    timelineItem.dataset.objectUrl = objectURL;
    timelineItem.dataset.displayName = DEFAULT_TEXT_TEMPLATE_LABEL;
    timelineItem.dataset.templateId = DEFAULT_TEXT_TEMPLATE_ID;
    timelineItem.dataset.textContent = DEFAULT_TEXT_TEMPLATE_LABEL;
    timelineItem.dataset.startOffsetMs = String(Math.max(0, Math.round(startTime)));
    const initialTransform = calculateDefaultTextTemplateTransform(DEFAULT_TEXT_TEMPLATE_LABEL);
    timelineItem.dataset.previewImageTransform = JSON.stringify(initialTransform);
    timelineItem.dataset.autoFitText = 'true';

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

    initializeTimelineItem(timelineItem);
    registerTimelineItemInteractions(timelineItem, removeButton);
    preloadTimelineImage(objectURL).catch((error) => {
        console.warn('Failed to warm text overlay image for playback.', error);
    });

    scheduleTimelineLaneReflow(overlayLane);
    scrollTimelineItemIntoView(timelineItem);
    updateTimelineEmptyState();
    updateActiveTimelineIndicators();
    renderExportSummary(getTimelineItems(), null);
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

    const overlayEntries = getOverlayEntriesForTimelineItem(timelineItem, overlayEntriesOverride);
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