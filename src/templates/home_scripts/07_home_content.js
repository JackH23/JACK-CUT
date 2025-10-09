const activeAudioPlaybackSessions = new Map();

function getTimelineNow() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }
    return Date.now();
}

function requestTimelineFrame(callback) {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        return window.requestAnimationFrame(callback);
    }
    return setTimeout(callback, 16);
}

function cancelTimelineFrame(handle) {
    if (!handle) {
        return;
    }
    if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(handle);
    } else {
        clearTimeout(handle);
    }
}

function cancelTimelineAudioEnvelope(session, options = {}) {
    if (!session) {
        return;
    }

    const { restoreVolume = false } = options;

    if (session.fadeInFrameId) {
        cancelTimelineFrame(session.fadeInFrameId);
        session.fadeInFrameId = 0;
    }

    if (session.fadeOutFrameId) {
        cancelTimelineFrame(session.fadeOutFrameId);
        session.fadeOutFrameId = 0;
    }

    if (session.fadeOutTimeoutId) {
        clearTimeout(session.fadeOutTimeoutId);
        session.fadeOutTimeoutId = 0;
    }

    if (restoreVolume && session.element) {
        const base = Number.isFinite(session.baseVolume)
            ? clampVolume(session.baseVolume)
            : clampVolume(session.element.volume);
        session.element.volume = base;
    }
}

function applyTimelineAudioEnvelope(session, envelope = {}) {
    if (!session || !session.element) {
        return;
    }

    cancelTimelineAudioEnvelope(session, { restoreVolume: false });

    const element = session.element;
    const baseVolume = clampVolume(envelope.baseVolume);
    const fadeInMs = Math.max(0, Math.round(Number(envelope.fadeInMs) || 0));
    const fadeOutMs = Math.max(0, Math.round(Number(envelope.fadeOutMs) || 0));
    const clipOffsetMs = Math.max(0, Math.round(Number(envelope.clipOffsetMs) || 0));
    const clipDurationMs = Math.max(0, Math.round(Number(envelope.clipDurationMs) || 0));
    const clipRemainingMs = Math.max(0, Math.round(Number(envelope.clipRemainingMs) || 0));

    session.baseVolume = baseVolume;

    if (baseVolume <= 0) {
        element.volume = 0;
        return;
    }

    const applyVolume = (value) => {
        element.volume = clampVolume(value);
    };

    if (fadeInMs > 0 && clipOffsetMs < fadeInMs) {
        const initialProgress = clampProgress(clipOffsetMs / Math.max(fadeInMs, 1));
        applyVolume(baseVolume * initialProgress);
        const fadeInStart = getTimelineNow();
        const startOffset = clipOffsetMs;
        const stepFadeIn = () => {
            const elapsed = getTimelineNow() - fadeInStart;
            const progress = clampProgress((startOffset + elapsed) / Math.max(fadeInMs, 1));
            applyVolume(baseVolume * progress);
            if (progress < 1) {
                session.fadeInFrameId = requestTimelineFrame(stepFadeIn);
            }
        };
        session.fadeInFrameId = requestTimelineFrame(stepFadeIn);
    } else {
        applyVolume(baseVolume);
    }

    if (fadeOutMs <= 0 || clipDurationMs <= 0 || clipRemainingMs <= 0) {
        return;
    }

    const fadeOutStartMs = Math.max(clipDurationMs - fadeOutMs, 0);
    const currentOffset = Math.min(clipOffsetMs, clipDurationMs);
    const offsetIntoFade = Math.max(0, currentOffset - fadeOutStartMs);

    if (offsetIntoFade >= fadeOutMs) {
        applyVolume(0);
        return;
    }

    const beginFadeOut = (initialOffsetIntoFade) => {
        const boundedOffset = Math.min(Math.max(initialOffsetIntoFade, 0), fadeOutMs);
        const initialProgress = fadeOutMs > 0 ? boundedOffset / fadeOutMs : 1;
        const startingVolume = clampVolume(baseVolume * (1 - initialProgress));
        applyVolume(startingVolume);
        if (startingVolume <= 0) {
            return;
        }
        const fadeOutStart = getTimelineNow();
        const offsetSeed = boundedOffset;
        const stepFadeOut = () => {
            const elapsed = getTimelineNow() - fadeOutStart;
            const progress = clampProgress((offsetSeed + elapsed) / Math.max(fadeOutMs, 1));
            const nextVolume = clampVolume(baseVolume * (1 - progress));
            applyVolume(nextVolume);
            if (progress < 1) {
                session.fadeOutFrameId = requestTimelineFrame(stepFadeOut);
            }
        };
        session.fadeOutFrameId = requestTimelineFrame(stepFadeOut);
    };

    if (offsetIntoFade > 0) {
        beginFadeOut(offsetIntoFade);
        return;
    }

    const delay = Math.max(0, fadeOutStartMs - currentOffset);
    if (delay <= 0) {
        beginFadeOut(0);
        return;
    }

    const boundedDelay = Math.min(delay, clipRemainingMs);
    session.fadeOutTimeoutId = setTimeout(() => {
        session.fadeOutTimeoutId = 0;
        beginFadeOut(0);
    }, boundedDelay);
}

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

function applyTimelineProgressGeometry() {
    if (!timelineProgressLine || !timelineTrack) {
        return 0;
    }

    const { offset, width } = getTimelineProgressGeometry();
    timelineProgressLine.style.setProperty('--timeline-progress-offset', `${offset}px`);
    timelineProgressLine.style.setProperty('--timeline-progress-span', `${width}px`);
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
    if (!timelineProgressLine) {
        updateTimelineProgressInput(0);
        return;
    }
    const width = applyTimelineProgressGeometry();
    const clamped = width > 0 ? clampProgress(fraction) : 0;
    timelineProgressLine.dataset.progress = String(clamped);
    timelineProgressLine.style.transition = 'none';
    timelineProgressLine.style.transform = `scaleX(${clamped})`;
    updateTimelineProgressInput(clamped);
}

function animateTimelineProgress(startFraction, endFraction, durationMs) {
    if (!timelineProgressLine) {
        updateTimelineProgressInput(endFraction);
        return;
    }
    const width = applyTimelineProgressGeometry();
    const hasSpan = width > 0;
    const start = hasSpan ? clampProgress(startFraction) : 0;
    const end = hasSpan ? clampProgress(endFraction) : 0;
    timelineProgressLine.dataset.progress = String(end);
    timelineProgressLine.style.transition = 'none';
    timelineProgressLine.style.transform = `scaleX(${start})`;
    void timelineProgressLine.offsetWidth;
    if (durationMs > 0 && hasSpan) {
        timelineProgressLine.style.transition = `transform ${durationMs}ms linear`;
    } else {
        timelineProgressLine.style.transition = 'none';
    }
    timelineProgressLine.style.transform = `scaleX(${end})`;
    updateTimelineProgressInput(end);
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
    if (!preservePauseState) {
        isTimelinePaused = false;
        timelinePauseState = null;
    }

    cancelPreviewExitAnimation({ forceRestore: true });
    cancelPreviewAudioEnvelope({ restoreVolume: true });
    stopAllTimelineAudio({ resetPosition: resetProgress });
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
    setPreviewImageVisibility(false);
    previewImage.removeAttribute('src');
    previewImage.classList.remove('is-visible');
    previewPlaceholder.hidden = false;
    if (previewPlaceholder && previewPlaceholderDefaultText) {
        previewPlaceholder.textContent = previewPlaceholderDefaultText;
    }
    playVideoButton.textContent = 'Play Back';
    setPreviewMode(null);
    resetPreviewScroll();
    if (previewImage) {
        previewImage.style.removeProperty('mix-blend-mode');
    }
    clearPreviewCanvasBackdrop();
    clearPreviewOverlayLayers();
    setActiveTimelineItem(null);
}

function setActiveTimelineItem(item, options = {}) {
    const shouldFocus = Boolean(options.focus);
    const clipProgressOverride = Number.isFinite(options.clipProgress)
        ? clampProgress(options.clipProgress)
        : null;
    const isSameItem = item === activeTimelineItem;

    if (!isSameItem) {
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

function loadPreviewFromTimeline(timelineItem, overlayEntriesOverride = null) {
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
        applyMasterVolumeToPreview(audioSettings.volumePercent);
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
        cancelPreviewExitAnimation({ forceRestore: true });
        setPreviewMode('has-audio');
        previewVideo.pause();
        previewVideo.hidden = true;
        previewVideo.removeAttribute('src');
        setPreviewImageVisibility(false);
        resetPreviewScroll();
        playVideoButton.textContent = 'Play Back';
        if (previewPlaceholder) {
            const clipName = timelineItem.dataset.displayName || 'Audio clip';
            previewPlaceholder.textContent = `Audio • ${clipName}`;
            previewPlaceholder.hidden = false;
        }
    }

    applyCanvasSettingsToPreview(timelineItem);
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
        const audioPreview = document.createElement('div');
        audioPreview.className = 'upload-gallery__audio';
        audioPreview.textContent = '🎵';
        previewWrapper.appendChild(audioPreview);
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
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    const isAudio = file.type.startsWith('audio/');

    const label = document.createElement('span');
    label.textContent = file.name;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'timeline-item-remove';
    removeButton.setAttribute('aria-label', 'Remove clip');
    removeButton.textContent = '✕';

    if (isVideo) {
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
    } else if (isImage) {
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
    } else if (isAudio) {
        timelineItem.classList.add('timeline-item--audio');
        const audioThumb = document.createElement('div');
        audioThumb.className = 'timeline-audio-thumbnail';
        const audioIcon = document.createElement('span');
        audioIcon.setAttribute('aria-hidden', 'true');
        audioIcon.textContent = '🎵';
        audioThumb.appendChild(audioIcon);
        timelineItem.appendChild(audioThumb);

        const audioElement = document.createElement('audio');
        audioElement.src = objectURL;
        audioElement.preload = 'auto';
        audioElement.loop = false;
        audioElement.muted = false;

        timelineItem.dataset.audioDuration = '0';
        setTimelineItemDuration(
            timelineItem,
            'audioDuration',
            0,
            { skipAnimationSync: true },
        );

        const metadataReady = new Promise((resolve) => {
            if (Number.isFinite(audioElement.duration) && audioElement.duration > 0) {
                resolve();
                return;
            }
            const handleLoaded = () => {
                audioElement.removeEventListener('loadedmetadata', handleLoaded);
                audioElement.removeEventListener('error', handleError);
                resolve();
            };
            const handleError = () => {
                audioElement.removeEventListener('loadedmetadata', handleLoaded);
                audioElement.removeEventListener('error', handleError);
                resolve();
            };
            audioElement.addEventListener('loadedmetadata', handleLoaded, { once: true });
            audioElement.addEventListener('error', handleError, { once: true });
        }).then(() => {
            if (!timelineItem.isConnected) {
                return audioElement;
            }
            const intrinsicDuration = Number.isFinite(audioElement.duration)
                && audioElement.duration > 0
                ? Math.round(audioElement.duration * 1000)
                : 0;
            const safeDuration = Math.max(intrinsicDuration, 0);
            timelineItem.dataset.audioDuration = String(safeDuration);
            setTimelineItemDuration(
                timelineItem,
                'audioDuration',
                safeDuration,
                { skipAnimationSync: true },
            );
            updateActiveTimelineIndicators();
            renderExportSummary(getTimelineItems(), null);
            return audioElement;
        });
        registerTimelineAudioElement(timelineItem, audioElement, metadataReady);
    }

    timelineItem.appendChild(label);
    timelineItem.appendChild(removeButton);

    const targetLane = defaultLane || ensureTimelineLane(0);
    if (targetLane) {
        timelineItem.dataset.laneIndex = targetLane.dataset.laneIndex || '0';
        targetLane.appendChild(timelineItem);
    } else {
        timelineItem.dataset.laneIndex = '0';
        timelineTrack.appendChild(timelineItem);
    }
    initializeTimelineItem(timelineItem);
    updateTimelineEmptyState();

    timelineItem.addEventListener('click', () => {
        stopTimelinePlayback();
        setActiveTimelineItem(timelineItem);
        loadPreviewFromTimeline(timelineItem);
    });

    timelineItem.addEventListener('keydown', (event) => {
        const { key } = event;
        if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
            event.preventDefault();
            stopTimelinePlayback();
            setActiveTimelineItem(timelineItem, { focus: true });
            loadPreviewFromTimeline(timelineItem);
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
        loadPreviewFromTimeline(nextItem);
    });

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
        releaseTimelineCanvasCustomImage(targetItem);
        if (fileType.startsWith('audio/')) {
            stopTimelineAudioForItem(targetItem, { resetPosition: true });
            unregisterTimelineAudioElement(targetItem);
        }
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

    setActiveTimelineItem(timelineItem);
    loadPreviewFromTimeline(timelineItem);
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

function stopTimelineAudioForItem(timelineItem, options = {}) {
    if (!timelineItem) {
        return;
    }
    const { resetPosition = false } = options;
    const session = activeAudioPlaybackSessions.get(timelineItem);
    if (session) {
        const { element, timeoutId } = session;
        if (timeoutId) {
            window.clearTimeout(timeoutId);
        }
        cancelTimelineAudioEnvelope(session, { restoreVolume: true });
        if (element) {
            element.pause();
            if (resetPosition) {
                try {
                    element.currentTime = 0;
                } catch (error) {
                    // Ignore inability to reset the playhead.
                }
            }
        }
        activeAudioPlaybackSessions.delete(timelineItem);
    } else if (resetPosition) {
        const element = getTimelineAudioElement(timelineItem);
        if (element) {
            try {
                element.currentTime = 0;
            } catch (error) {
                // Ignore inability to reset the playhead.
            }
        }
    }
}

function stopAllTimelineAudio(options = {}) {
    const { resetPosition = false } = options;
    Array.from(activeAudioPlaybackSessions.keys()).forEach((item) => {
        stopTimelineAudioForItem(item, { resetPosition });
    });
    if (resetPosition) {
        registeredTimelineAudioItems.forEach((item) => {
            const element = getTimelineAudioElement(item);
            if (!element) {
                return;
            }
            try {
                element.pause();
                element.currentTime = 0;
            } catch (error) {
                // Ignore inability to reset the playhead.
            }
        });
    }
}

async function syncTimelineAudioForSegment(segmentStartTime, segmentItems = []) {
    const audioEntries = Array.isArray(segmentItems)
        ? segmentItems.filter((entry) => entry?.item && isAudioTimelineItem(entry.item))
        : [];

    if (!audioEntries.length) {
        activeAudioPlaybackSessions.forEach((session, item) => {
            stopTimelineAudioForItem(item, { resetPosition: false });
        });
        return;
    }

    const activeItems = new Set();

    for (const entry of audioEntries) {
        const timelineItem = entry.item;
        if (!timelineItem) {
            // eslint-disable-next-line no-continue
            continue;
        }
        activeItems.add(timelineItem);
        const audioElement = getTimelineAudioElement(timelineItem);
        if (!audioElement) {
            // eslint-disable-next-line no-continue
            continue;
        }
        const readyPromise = getTimelineAudioReadyPromise(timelineItem);
        if (readyPromise) {
            try {
                await readyPromise;
            } catch (error) {
                // eslint-disable-next-line no-continue
                continue;
            }
        }

        const clipDuration = Math.max(0, getTimelineItemPlaybackDuration(timelineItem));
        const clipStart = Number.isFinite(entry.start)
            ? entry.start
            : getTimelineItemStartTime(timelineItem);
        const clipEnd = Number.isFinite(entry.end)
            ? entry.end
            : clipStart + clipDuration;
        const offsetMs = Math.max(0, segmentStartTime - clipStart);
        const targetSeconds = offsetMs / 1000;

        let session = activeAudioPlaybackSessions.get(timelineItem);
        if (!session) {
            session = {
                element: audioElement,
                timeoutId: 0,
                fadeInFrameId: 0,
                fadeOutFrameId: 0,
                fadeOutTimeoutId: 0,
                baseVolume: 0,
            };
            activeAudioPlaybackSessions.set(timelineItem, session);
        } else {
            session.element = audioElement;
            if (session.timeoutId) {
                window.clearTimeout(session.timeoutId);
                session.timeoutId = 0;
            }
        }

        const audioSettings = getTimelineItemAudioSettings(timelineItem);
        const baseVolume = clampVolume(audioSettings.volumePercent / 100);
        audioElement.muted = baseVolume <= 0;

        const currentTime = Number(audioElement.currentTime) || 0;
        if (!Number.isFinite(currentTime) || Math.abs(currentTime - targetSeconds) > 0.05) {
            try {
                audioElement.currentTime = targetSeconds;
            } catch (error) {
                // Ignore inability to seek within the audio element.
            }
        }

        const clipRemainingMs = Math.max(0, clipEnd - segmentStartTime);
        const clipDurationMs = Math.max(0, clipEnd - clipStart);
        applyTimelineAudioEnvelope(session, {
            baseVolume,
            fadeInMs: audioSettings.fadeInMs,
            fadeOutMs: audioSettings.fadeOutMs,
            clipOffsetMs: offsetMs,
            clipDurationMs,
            clipRemainingMs,
        });

        const playPromise = audioElement.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch((error) => {
                console.warn('Audio playback failed.', error);
            });
        }

        if (clipRemainingMs > 0) {
            session.timeoutId = window.setTimeout(() => {
                stopTimelineAudioForItem(timelineItem, { resetPosition: false });
            }, clipRemainingMs + 30);
        }
    }

    activeAudioPlaybackSessions.forEach((session, item) => {
        if (!activeItems.has(item)) {
            stopTimelineAudioForItem(item, { resetPosition: false });
        }
    });
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
        applyMasterVolumeToPreview(audioSettings.volumePercent);

        await new Promise((resolve) => {
            let resolved = false;
            let timeoutId = 0;
            let onEnded = null;
            let onError = null;
            const abortController = new AbortController();
            let playbackStarted = false;

            const cleanup = () => {