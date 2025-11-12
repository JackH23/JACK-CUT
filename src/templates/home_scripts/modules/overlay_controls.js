function beginOverlayPointerInteraction(event, timelineItem, layer) {
    if (!event || !timelineItem || !layer) {
        return false;
    }

    if (!isImageTimelineItem(timelineItem)) {
        return false;
    }

    const entry = getActiveOverlayEntryForTimelineItem(timelineItem);
    if (!entry || !entry.frame) {
        return false;
    }

    const handleElement = event.target?.closest?.('.preview-resize-handle') || null;
    const mode = handleElement ? 'resize' : 'drag';

    const pointerId = event.pointerId;
    if (overlayPointerState.pointerId !== null && overlayPointerState.pointerId !== pointerId) {
        return false;
    }

    const captureTarget = handleElement || layer;
    if (typeof captureTarget?.setPointerCapture === 'function') {
        captureTarget.setPointerCapture(pointerId);
    }

    const aspectRatio = entry.frame.width > 0 && entry.frame.height > 0
        ? entry.frame.width / entry.frame.height
        : 1;

    const pointerScale = typeof getPreviewViewportPointerScale === 'function'
        ? getPreviewViewportPointerScale()
        : { scaleX: 1, scaleY: 1 };
    const scaleX = Number.isFinite(pointerScale?.scaleX) && pointerScale.scaleX > 0
        ? pointerScale.scaleX
        : 1;
    const scaleY = Number.isFinite(pointerScale?.scaleY) && pointerScale.scaleY > 0
        ? pointerScale.scaleY
        : 1;

    overlayPointerState.pointerId = pointerId;
    overlayPointerState.timelineItem = timelineItem;
    overlayPointerState.mode = mode;
    overlayPointerState.handle = handleElement?.dataset?.handle || 'se';
    overlayPointerState.origin = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        left: entry.frame.left,
        top: entry.frame.top,
        width: entry.frame.width,
        height: entry.frame.height,
        aspectRatio,
        oppositeX: entry.frame.left + entry.frame.width,
        oppositeY: entry.frame.top + entry.frame.height,
        rotation: Number.isFinite(entry.frame.rotation) ? entry.frame.rotation : 0,
        scaleX,
        scaleY,
    };
    overlayPointerState.layer = layer;
    overlayPointerState.captureTarget = captureTarget || null;
    overlayPointerState.lastTransform = {
        left: entry.frame.left,
        top: entry.frame.top,
        width: entry.frame.width,
        height: entry.frame.height,
        rotation: Number.isFinite(entry.frame.rotation) ? entry.frame.rotation : 0,
        aspectRatio,
    };

    layer.classList.remove('is-dragging', 'is-resizing');
    if (mode === 'resize') {
        layer.classList.add('is-resizing');
    } else {
        layer.classList.add('is-dragging');
    }

    setPreviewGuidesVisible(true);
    updatePreviewGuides(
        entry.frame,
        evaluatePreviewImageAlignment(entry.frame, getPreviewViewportSize()),
    );

    return true;
}

function finishOverlayPointerInteraction(commit = true) {
    const { pointerId, layer, timelineItem, lastTransform, captureTarget } = overlayPointerState;

    if (pointerId !== null) {
        if (typeof captureTarget?.hasPointerCapture === 'function'
            && captureTarget.hasPointerCapture(pointerId)) {
            captureTarget.releasePointerCapture(pointerId);
        }
        if (typeof layer?.hasPointerCapture === 'function'
            && layer.hasPointerCapture(pointerId)) {
            layer.releasePointerCapture(pointerId);
        }
    }

    if (layer) {
        layer.classList.remove('is-dragging', 'is-resizing');
    }

    overlayPointerState.pointerId = null;
    overlayPointerState.timelineItem = null;
    overlayPointerState.mode = null;
    overlayPointerState.handle = null;
    overlayPointerState.origin = null;
    overlayPointerState.layer = null;
    overlayPointerState.captureTarget = null;

    if (commit && timelineItem && lastTransform) {
        const transformToPersist = {
            left: lastTransform.left,
            top: lastTransform.top,
            width: lastTransform.width,
            height: lastTransform.height,
            rotation: Number.isFinite(lastTransform.rotation) ? lastTransform.rotation : 0,
        };
        storeOverlayTransformOnTimelineItem(timelineItem, transformToPersist, { skipKeyframes: false });
        refreshActiveOverlayLayers();
    }

    overlayPointerState.lastTransform = null;
    schedulePreviewGuidesHide();
}

function cancelOverlayPointerInteraction() {
    finishOverlayPointerInteraction(false);
}

function onOverlayPointerMove(event) {
    if (overlayPointerState.pointerId === null || event.pointerId !== overlayPointerState.pointerId) {
        return;
    }

    const { timelineItem, origin, handle, mode, layer } = overlayPointerState;
    if (!timelineItem || !origin) {
        cancelOverlayPointerInteraction();
        return;
    }

    const entry = getActiveOverlayEntryForTimelineItem(timelineItem);
    if (!entry) {
        cancelOverlayPointerInteraction();
        return;
    }

    const scaleX = Number.isFinite(origin.scaleX) && origin.scaleX > 0 ? origin.scaleX : 1;
    const scaleY = Number.isFinite(origin.scaleY) && origin.scaleY > 0 ? origin.scaleY : 1;
    const deltaX = (event.clientX - origin.pointerX) * scaleX;
    const deltaY = (event.clientY - origin.pointerY) * scaleY;

    let nextTransform;
    if (mode === 'resize') {
        nextTransform = calculatePreviewImageResize(handle || 'se', deltaX, deltaY, origin);
    } else {
        nextTransform = {
            left: origin.left + deltaX,
            top: origin.top + deltaY,
            width: origin.width,
            height: origin.height,
            aspectRatio: origin.aspectRatio > 0 ? origin.aspectRatio : 1,
        };
    }

    const resolvedAspectRatio = Number.isFinite(nextTransform?.aspectRatio)
        && nextTransform.aspectRatio > 0
        ? nextTransform.aspectRatio
        : (nextTransform.width > 0 && nextTransform.height > 0
            ? nextTransform.width / nextTransform.height
            : (origin.aspectRatio > 0 ? origin.aspectRatio : 1));

    const workingTransform = {
        left: nextTransform.left,
        top: nextTransform.top,
        width: nextTransform.width,
        height: nextTransform.height,
        rotation: Number.isFinite(origin.rotation) ? origin.rotation : 0,
        aspectRatio: resolvedAspectRatio,
    };

    const snapResult = snapPreviewImageTransform(workingTransform, { mode, handle, origin });
    const snapped = snapResult?.transform
        ? {
            left: snapResult.transform.left,
            top: snapResult.transform.top,
            width: snapResult.transform.width,
            height: snapResult.transform.height,
            rotation: Number.isFinite(snapResult.transform.rotation)
                ? snapResult.transform.rotation
                : workingTransform.rotation,
            aspectRatio: Number.isFinite(snapResult.transform.aspectRatio)
                && snapResult.transform.aspectRatio > 0
                ? snapResult.transform.aspectRatio
                : workingTransform.aspectRatio,
        }
        : workingTransform;

    overlayPointerState.lastTransform = snapped;

    applyOverlayLayerTransform(entry, snapped);
    storeOverlayTransformOnTimelineItem(timelineItem, snapped, { skipKeyframes: true });

    if (layer) {
        layer.classList.toggle('is-dragging', mode === 'drag');
        layer.classList.toggle('is-resizing', mode === 'resize');
    }

    const alignment = snapResult?.alignment
        || evaluatePreviewImageAlignment(snapped, getPreviewViewportSize());
    setPreviewGuidesVisible(true);
    updatePreviewGuides(snapped, alignment);

    event.preventDefault();
    event.stopPropagation();
}

function onOverlayPointerUp(event) {
    if (overlayPointerState.pointerId === null || event.pointerId !== overlayPointerState.pointerId) {
        return;
    }

    finishOverlayPointerInteraction(true);
}

function onOverlayPointerCancel(event) {
    if (overlayPointerState.pointerId === null || event.pointerId !== overlayPointerState.pointerId) {
        return;
    }

    cancelOverlayPointerInteraction();
}

function onPreviewOverlayPointerDown(event) {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') {
        return;
    }

    const layer = target.closest('.preview-overlay-layer');
    if (!layer) {
        return;
    }

    const timelineItem = overlayLayerToTimelineItem.get(layer);
    if (!timelineItem || !timelineItem.isConnected) {
        return;
    }

    const shouldFocusTextEditor = typeof isDefaultTextTimelineItem === 'function'
        && isDefaultTextTimelineItem(timelineItem);
    const previewOptions = shouldFocusTextEditor
        ? { focusTextEditor: true, placeTextCursorAtEnd: false }
        : { focusTextEditor: false };

    event.preventDefault();
    event.stopPropagation();

    const wasActive = activeTimelineItem === timelineItem;

    stopTimelinePlayback();
    setActiveTimelineItem(timelineItem);

    if (!wasActive || shouldFocusTextEditor) {
        loadPreviewFromTimeline(timelineItem, null, previewOptions);
    }

    const isPrimaryPointer = (event.button === undefined)
        || (event.button === 0)
        || (event.button === -1);

    if (!isPrimaryPointer || event.isPrimary === false) {
        return;
    }

    if (!isImageTimelineItem(timelineItem)) {
        return;
    }

    beginOverlayPointerInteraction(event, timelineItem, layer);
}

function refreshActiveOverlayLayers() {
    if (!activeTimelineItem) {
        if (previewImage) {
            previewImage.style.removeProperty('mix-blend-mode');
        }
        clearPreviewOverlayLayers();
        return;
    }
    const laneCache = (typeof getTimelineLaneEntryCache === 'function')
        ? getTimelineLaneEntryCache()
        : null;
    const entries = getOverlayEntriesForTimelineItem(activeTimelineItem, null, laneCache);
    renderPreviewOverlayLayers(activeTimelineItem, {
        entries,
        laneCache,
        descriptors: activeOverlayDescriptorCache,
    });
}

function getOverlayEntriesForTimelineItem(
    timelineItem,
    entriesOverride = null,
    laneCacheOverride = null,
) {
    if (!timelineItem) {
        return [];
    }

    const hasOverrideEntries = Array.isArray(entriesOverride) && entriesOverride.length > 0;
    const laneCache = hasOverrideEntries
        ? resolveTimelineLaneEntryCache(entriesOverride)
        : resolveTimelineLaneEntryCache(laneCacheOverride);
    const candidateEntries = laneCache.entries;

    if (!candidateEntries.length) {
        return [];
    }

    const start = getTimelineItemStartTime(timelineItem, laneCache);
    const duration = Math.max(0, getTimelineItemPlaybackDuration(timelineItem));
    const end = start + duration;
    const safeEnd = end > start ? end : start + 1;

    return candidateEntries
        .filter((entry) => entry && entry.item)
        .filter((entry) => entry.end > start && entry.start < safeEnd)
        .sort((a, b) => {
            const aIndex = resolveLaneIndex(a.laneIndex ?? a.item?.dataset?.laneIndex);
            const bIndex = resolveLaneIndex(b.laneIndex ?? b.item?.dataset?.laneIndex);
            return aIndex - bIndex;
        });
}


if (previewImage) {
    previewImage.addEventListener('load', () => {
        resetPreviewScroll();
        schedulePreviewViewportSizeUpdate();
        if (!previewImage.hidden) {
            resetPreviewImageFrameToFit();
        }
    });
}

if (previewVideo) {
    previewVideo.addEventListener('loadeddata', () => {
        schedulePreviewViewportSizeUpdate();
    });
}

if (previewImageFrame) {
    previewImageFrame.addEventListener('pointerdown', onPreviewImagePointerDown);
}

if (previewTextEditor) {
    updatePreviewTextEditorPlaceholderState(previewTextEditor.textContent || '');
    previewTextEditor.addEventListener('input', onPreviewTextEditorInput);
    previewTextEditor.addEventListener('focus', onPreviewTextEditorFocus);
    previewTextEditor.addEventListener('blur', onPreviewTextEditorBlur);
    previewTextEditor.addEventListener('keydown', onPreviewTextEditorKeyDown);
    previewTextEditor.addEventListener('paste', onPreviewTextEditorPaste);
}

if (textEffectFontSelect) {
    textEffectFontSelect.addEventListener('change', (event) => {
        applyTimelineTextStyleUpdates({ fontKey: event.target.value });
    });
}

if (textEffectSizeInput) {
    textEffectSizeInput.addEventListener('input', (event) => {
        const nextSize = clampTextFontSize(event.target.value);
        if (textEffectSizeValue) {
            textEffectSizeValue.textContent = `${Math.round(nextSize)} px`;
        }
        applyTimelineTextStyleUpdates({ fontSize: nextSize });
    });
}

if (textEffectColorInput) {
    textEffectColorInput.addEventListener('input', (event) => {
        applyTimelineTextStyleUpdates({ color: event.target.value });
    });
}

if (textEffectLetterSpacingInput) {
    textEffectLetterSpacingInput.addEventListener('input', (event) => {
        const nextSpacing = clampTextLetterSpacing(event.target.value);
        if (textEffectLetterSpacingValue) {
            textEffectLetterSpacingValue.textContent = formatLetterSpacingReadout(nextSpacing);
        }
        applyTimelineTextStyleUpdates({ letterSpacingScale: nextSpacing });
    });
}

if (textEffectTransformSelect) {
    textEffectTransformSelect.addEventListener('change', (event) => {
        applyTimelineTextStyleUpdates({ transform: event.target.value });
    });
}

if (textEffectAlignmentButtons.length) {
    textEffectAlignmentButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const targetAlign = button.dataset.textAlign;
            applyTimelineTextStyleUpdates({ align: targetAlign });
        });
        button.addEventListener('keydown', (event) => {
            const { key } = event;
            if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar') {
                return;
            }
            event.preventDefault();
            const targetAlign = button.dataset.textAlign;
            applyTimelineTextStyleUpdates({ align: targetAlign });
        });
    });
}

if (textStyleToolbarButtons.length) {
    textStyleToolbarButtons.forEach((button) => {
        const styleKey = button.dataset.textStyle;
        if (!styleKey) {
            return;
        }
        const handleToggle = () => {
            toggleActiveTextStyle(styleKey);
        };
        button.addEventListener('click', handleToggle);
        button.addEventListener('keydown', (event) => {
            const { key } = event;
            if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar') {
                return;
            }
            event.preventDefault();
            handleToggle();
        });
    });
}

syncTextEffectsControlsToTimelineItem(activeTimelineItem || null);

if (previewOverlayStack) {
    previewOverlayStack.addEventListener('pointerdown', onPreviewOverlayPointerDown);
}

if (window && typeof window.addEventListener === 'function') {
    window.addEventListener('pointermove', onPreviewImagePointerMove, { passive: false });
    window.addEventListener('pointerup', onPreviewImagePointerUp, { passive: true });
    window.addEventListener('pointercancel', onPreviewImagePointerCancel, { passive: true });
    window.addEventListener('pointermove', onOverlayPointerMove, { passive: false });
    window.addEventListener('pointerup', onOverlayPointerUp, { passive: true });
    window.addEventListener('pointercancel', onOverlayPointerCancel, { passive: true });
}

if (timelineZoomInput) {
    timelineZoomInput.min = String(TIMELINE_DURATION_PER_PIXEL_MIN);
    timelineZoomInput.max = String(TIMELINE_DURATION_PER_PIXEL_MAX);
    timelineZoomInput.step = String(TIMELINE_ZOOM_BUTTON_STEP);
    timelineZoomInput.addEventListener('input', () => {
        const rawValue = Number(timelineZoomInput.value);
        setTimelineDurationPerPixel(rawValue);
    });
}

if (timelineZoomButtons.length) {
    timelineZoomButtons.forEach((button) => {
        button.addEventListener('click', (event) => {
            const direction = button.dataset.timelineZoom;
            if (!direction) {
                return;
            }
            const multiplier = event.shiftKey ? 4 : 1;
            const delta = direction === 'in'
                ? -TIMELINE_ZOOM_BUTTON_STEP * multiplier
                : TIMELINE_ZOOM_BUTTON_STEP * multiplier;
            setTimelineDurationPerPixel(getTimelineDurationPerPixel() + delta);
        });
    });
}

if (timelineMagnetToggleButton) {
    timelineMagnetToggleButton.addEventListener('click', () => {
        toggleMainTrackMagnet();
    });
    setMainTrackMagnetEnabled(isMainTrackMagnetEnabled);
}

if (previewFullscreenToggle) {
    previewFullscreenToggle.addEventListener('click', () => {
        togglePreviewFullscreen();
    });
}

if (previewArea) {
    previewArea.addEventListener('dblclick', (event) => {
        if (event.defaultPrevented) {
            return;
        }
        togglePreviewFullscreen();
    });
}

function setPreviewAspect(aspectValue) {
    if (!previewArea) {
        return;
    }

    const normalized = aspectValue === '9:16' ? '9 / 16' : '16 / 9';
    currentPreviewAspectRatio = parseAspectRatio(aspectValue);
    previewArea.style.setProperty('--preview-aspect-ratio', normalized);
    if (previewViewport) {
        previewViewport.style.setProperty('--preview-aspect-ratio', normalized);
    }
    schedulePreviewViewportSizeUpdate();
    queuePreviewImageFrameReset();
    if (isExportDialogOpen()) {
        renderExportSummary(getTimelineItems(), null);
    }
    updatePreviewAspectLabel();
}

if (previewAspectSelect) {
    previewAspectSelect.addEventListener('change', (event) => {
        setPreviewAspect(event.target.value);
    });
    setPreviewAspect(previewAspectSelect.value);
    updatePreviewAspectLabel();
} else {
    setPreviewAspect('16:9');
    updatePreviewAspectLabel();
}

updateTimelineZoomDisplay();

if (addKeyframeButton) {
    addKeyframeButton.addEventListener('click', () => {
        if (!isImageTimelineItem(activeTimelineItem)) {
            showKeyframeStatus('Select an image clip to add keyframes.');
            return;
        }
        if (!previewImageTransform) {
            queuePreviewImageFrameReset();
            return;
        }
        createActiveTimelineKeyframe();
    });
}

if (imageBlurAddKeyframeButton) {
    imageBlurAddKeyframeButton.addEventListener('click', () => {
        if (!isImageTimelineItem(activeTimelineItem)) {
            showImageBlurKeyframeStatus('Select an image clip to add keyframes.');
            return;
        }
        if (!imageBlurInput || imageBlurInput.disabled || imageBlurControls?.hidden) {
            showImageBlurKeyframeStatus('Enable image blur to add keyframes.');
            return;
        }
        createActiveImageBlurKeyframe();
    });
}

if (imageRotationInput) {
    imageRotationInput.addEventListener('input', (event) => {
        if (!isImageTimelineItem(activeTimelineItem) || !previewImageTransform) {
            updateImageRotationControlState();
            return;
        }
        const nextRotation = clampRotation(event.target.value);
        previewImageTransform.rotation = nextRotation;
        applyPreviewImageTransform();
        persistPreviewImageTransformForActiveTimelineItem({ allowKeyframeUpdate: true });
    });
}

if (keyframeTrack) {
    keyframeTrack.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 && event.pointerType !== 'touch') {
            return;
        }
        if (keyframeTrack.hasAttribute('data-disabled')
            || !isImageTimelineItem(activeTimelineItem)
            || isTimelinePlaying
        ) {
            return;
        }
        if (event.target && typeof event.target.closest === 'function') {
            const marker = event.target.closest('.keyframe-marker');
            if (marker) {
                return;
            }
        }
        const metrics = getKeyframeTrackMetrics(keyframeTrack);
        if (!metrics) {
            return;
        }
        const progress = getKeyframeTrackProgressFromClientX(
            event.clientX,
            keyframeTrack,
            metrics,
        );
        if (progress === null) {
            return;
        }
        event.preventDefault();
        beginKeyframeTrackScrub(progress, event);
    });

    keyframeTrack.addEventListener('keydown', (event) => {
        if (keyframeTrack.hasAttribute('data-disabled')
            || !isImageTimelineItem(activeTimelineItem)
            || isTimelinePlaying
        ) {
            return;
        }

        if ((event.key === 'Delete' || event.key === 'Backspace')
            && !event.altKey
            && !event.metaKey
            && !event.ctrlKey
        ) {
            const didDelete = deleteActiveTimelineKeyframe();
            if (didDelete) {
                event.preventDefault();
            }
            return;
        }

        const { key } = event;
        let handled = false;
        let nextProgress = getActiveClipProgress();

        if (key === 'ArrowLeft' || key === 'ArrowDown') {
            const step = event.shiftKey ? KEYFRAME_TRACK_KEY_LARGE_STEP : KEYFRAME_TRACK_KEY_STEP;
            nextProgress = clampProgress(nextProgress - step);
            handled = true;
        } else if (key === 'ArrowRight' || key === 'ArrowUp') {
            const step = event.shiftKey ? KEYFRAME_TRACK_KEY_LARGE_STEP : KEYFRAME_TRACK_KEY_STEP;
            nextProgress = clampProgress(nextProgress + step);
            handled = true;
        } else if (key === 'Home') {
            nextProgress = 0;
            handled = true;
        } else if (key === 'End') {
            nextProgress = 1;
            handled = true;
        } else if (key === 'PageUp') {
            nextProgress = clampProgress(nextProgress + KEYFRAME_TRACK_KEY_LARGE_STEP);
            handled = true;
        } else if (key === 'PageDown') {
            nextProgress = clampProgress(nextProgress - KEYFRAME_TRACK_KEY_LARGE_STEP);
            handled = true;
        }

        if (!handled) {
            return;
        }

        event.preventDefault();
        setActiveClipProgress(nextProgress, { source: 'keyframe-track-key', syncTimeline: true });
    });
}

if (imageBlurKeyframeTrack) {
    imageBlurKeyframeTrack.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 && event.pointerType !== 'touch') {
            return;
        }

        if (imageBlurKeyframeTrack.hasAttribute('data-disabled')
            || !isImageTimelineItem(activeTimelineItem)
            || isTimelinePlaying
        ) {
            return;
        }

        if (event.target && typeof event.target.closest === 'function') {
            const marker = event.target.closest('.keyframe-marker');
            if (marker) {
                return;
            }
        }

        const metrics = getKeyframeTrackMetrics(imageBlurKeyframeTrack);
        if (!metrics) {
            return;
        }

        const progress = getKeyframeTrackProgressFromClientX(
            event.clientX,
            imageBlurKeyframeTrack,
            metrics,
        );
        if (progress === null) {
            return;
        }

        event.preventDefault();
        beginImageBlurKeyframeTrackScrub(progress, event, metrics);
    });

    imageBlurKeyframeTrack.addEventListener('keydown', (event) => {
        if (imageBlurKeyframeTrack.hasAttribute('data-disabled')
            || !isImageTimelineItem(activeTimelineItem)
            || isTimelinePlaying
        ) {
            return;
        }

        if ((event.key === 'Delete' || event.key === 'Backspace')
            && !event.altKey
            && !event.metaKey
            && !event.ctrlKey
        ) {
            const didDelete = deleteActiveImageBlurKeyframe();
            if (didDelete) {
                event.preventDefault();
            }
            return;
        }

        const { key } = event;
        let handled = false;
        let nextProgress = getActiveClipProgress();

        if (key === 'ArrowLeft' || key === 'ArrowDown') {
            const step = event.shiftKey ? KEYFRAME_TRACK_KEY_LARGE_STEP : KEYFRAME_TRACK_KEY_STEP;
            nextProgress = clampProgress(nextProgress - step);
            handled = true;
        } else if (key === 'ArrowRight' || key === 'ArrowUp') {
            const step = event.shiftKey ? KEYFRAME_TRACK_KEY_LARGE_STEP : KEYFRAME_TRACK_KEY_STEP;
            nextProgress = clampProgress(nextProgress + step);
            handled = true;
        } else if (key === 'Home') {
            nextProgress = 0;
            handled = true;
        } else if (key === 'End') {
            nextProgress = 1;
            handled = true;
        } else if (key === 'PageUp') {
            nextProgress = clampProgress(nextProgress + KEYFRAME_TRACK_KEY_LARGE_STEP);
            handled = true;
        } else if (key === 'PageDown') {
            nextProgress = clampProgress(nextProgress - KEYFRAME_TRACK_KEY_LARGE_STEP);
            handled = true;
        }

        if (!handled) {
            return;
        }

        event.preventDefault();
        setActiveClipProgress(nextProgress, { source: 'image-blur-keyframe-track-key', syncTimeline: true });
    });
}

function clampProgress(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    if (numeric <= 0) {
        return 0;
    }
    if (numeric >= 1) {
        return 1;
    }
    return numeric;
}

function clampRotation(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.min(MAX_ROTATION_DEGREES, Math.max(MIN_ROTATION_DEGREES, numeric));
}

function normalizeRotationRange(value) {
    let normalized = Number(value);
    if (!Number.isFinite(normalized)) {
        return 0;
    }

    while (normalized > MAX_ROTATION_DEGREES) {
        normalized -= 360;
    }

    while (normalized < MIN_ROTATION_DEGREES) {
        normalized += 360;
    }

    return clampRotation(normalized);
}

function interpolateRotationDegrees(start, end, ratio) {
    const ratioValue = Number(ratio);
    const t = Number.isFinite(ratioValue) ? clampProgress(ratioValue) : 0;
    const startRotation = clampRotation(start);
    const endRotation = clampRotation(end);

    let delta = endRotation - startRotation;
    if (delta > 180) {
        delta -= 360;
    } else if (delta < -180) {
        delta += 360;
    }

    const value = startRotation + (delta * t);
    return normalizeRotationRange(value);
}

function normalizePreviewImageTransform(transform, viewportSize) {
    if (!transform || !viewportSize) {
        return null;
    }

    const viewportWidth = Math.max(0, Number(viewportSize.width) || 0);
    const viewportHeight = Math.max(0, Number(viewportSize.height) || 0);

    if (viewportWidth <= 0 || viewportHeight <= 0) {
        return null;
    }

    const normalized = {
        left: transform.left / viewportWidth,
        top: transform.top / viewportHeight,
        width: transform.width / viewportWidth,
        height: transform.height / viewportHeight,
        aspectRatio: transform.aspectRatio && transform.aspectRatio > 0
            ? transform.aspectRatio
            : ((transform.width > 0 && transform.height > 0)
                ? transform.width / transform.height
                : 1),
        rotation: clampRotation(transform.rotation),
    };

    const values = [
        normalized.left,
        normalized.top,
        normalized.width,
        normalized.height,
        normalized.aspectRatio,
        normalized.rotation,
    ];

    if (!values.every((value) => Number.isFinite(value))) {
        return null;
    }

    return normalized;
}

function denormalizePreviewImageTransform(normalized, viewportSize) {
    if (!normalized || !viewportSize) {
        return null;
    }

    const viewportWidth = Math.max(0, Number(viewportSize.width) || 0);
    const viewportHeight = Math.max(0, Number(viewportSize.height) || 0);

    if (viewportWidth <= 0 || viewportHeight <= 0) {
        return null;
    }

    const width = normalized.width * viewportWidth;
    const height = normalized.height * viewportHeight;
    const left = normalized.left * viewportWidth;
    const top = normalized.top * viewportHeight;
    const aspectRatio = normalized.aspectRatio && normalized.aspectRatio > 0
        ? normalized.aspectRatio
        : ((width > 0 && height > 0) ? width / height : 1);
    const rotation = clampRotation(normalized.rotation);

    const values = [left, top, width, height, aspectRatio, rotation];
    if (!values.every((value) => Number.isFinite(value))) {
        return null;
    }

    return {
        left,
        top,
        width,
        height,
        aspectRatio,
        rotation,
    };
}

function sanitizeNormalizedKeyframeTransform(transform) {
    if (!transform) {
        return null;
    }

    const width = Number(transform.width);
    const height = Number(transform.height);

    const normalized = {
        left: Number(transform.left),
        top: Number(transform.top),
        width: Number.isFinite(width) ? width : 0,
        height: Number.isFinite(height) ? height : 0,
        aspectRatio: transform.aspectRatio && transform.aspectRatio > 0
            ? Number(transform.aspectRatio)
            : ((Number.isFinite(width) && Number.isFinite(height) && height !== 0)
                ? width / height
                : 1),
        rotation: clampRotation(transform.rotation),
    };

    const values = [
        normalized.left,
        normalized.top,
        normalized.width,
        normalized.height,
        normalized.aspectRatio,
        normalized.rotation,
    ];

    if (!values.every((value) => Number.isFinite(value))) {
        return null;
    }

    return normalized;
}

function sanitizeKeyframeEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    const progress = clampProgress(Number(entry.progress));
    if (!Number.isFinite(progress)) {
        return null;
    }

    const transformSource = entry.transform && typeof entry.transform === 'object'
        ? entry.transform
        : entry;
    const transform = sanitizeNormalizedKeyframeTransform(transformSource);

    if (!transform) {
        return null;
    }

    return {
        progress,
        transform,
    };
}

function isVideoTimelineItem(timelineItem) {
    if (!timelineItem || !timelineItem.dataset) {
        return false;
    }
    const fileType = timelineItem.dataset.fileType || '';
    return fileType.startsWith('video/');
}

function isImageTimelineItem(timelineItem) {
    if (!timelineItem || !timelineItem.dataset) {
        return false;
    }
    const fileType = timelineItem.dataset.fileType || '';
    return fileType.startsWith('image/');
}

function isAudioTimelineItem(timelineItem) {
    if (!timelineItem || !timelineItem.dataset) {
        return false;
    }
    const fileType = timelineItem.dataset.fileType || '';
    return fileType.startsWith('audio/');
}

function getTimelineItemImageKeyframes(timelineItem) {
    if (!isImageTimelineItem(timelineItem)) {
        return [];
    }

    const raw = timelineItem.dataset.imageKeyframes || '';
    if (!raw) {
        return [];
    }

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        const sanitized = parsed
            .map(sanitizeKeyframeEntry)
            .filter(Boolean)
            .sort((a, b) => a.progress - b.progress);
        return sanitized;
    } catch (error) {
        console.warn('Unable to parse stored image keyframes.', error);
        return [];
    }
}

function storeTimelineImageKeyframes(timelineItem, keyframes) {
    if (!isImageTimelineItem(timelineItem)) {
        return;
    }

    const sanitized = (Array.isArray(keyframes) ? keyframes : [])
        .map(sanitizeKeyframeEntry)
        .filter(Boolean)
        .sort((a, b) => a.progress - b.progress);

    if (sanitized.length) {
        timelineItem.dataset.imageKeyframes = JSON.stringify(sanitized);
    } else {
        delete timelineItem.dataset.imageKeyframes;
    }
}

const imageBlurKeyframeCache = new WeakMap();

function getCachedImageBlurKeyframes(timelineItem) {
    if (!timelineItem || !imageBlurKeyframeCache.has(timelineItem)) {
        return null;
    }
    return imageBlurKeyframeCache.get(timelineItem) || [];
}

function setImageBlurKeyframeCache(timelineItem, keyframes) {
    if (!timelineItem) {
        return;
    }

    if (Array.isArray(keyframes)) {
        imageBlurKeyframeCache.set(timelineItem, keyframes);
    } else {
        imageBlurKeyframeCache.delete(timelineItem);
    }
}

function sanitizeImageBlurKeyframeEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }

    const progress = clampProgress(Number(entry.progress));
    const blur = clampImageBlur(entry.blur, { snapToInteger: false });

    if (!Number.isFinite(progress) || !Number.isFinite(blur)) {
        return null;
    }

    return { progress, blur };
}

function normalizeImageBlurKeyframes(keyframes) {
    return (Array.isArray(keyframes) ? keyframes : [])
        .map(sanitizeImageBlurKeyframeEntry)
        .filter(Boolean)
        .sort((a, b) => a.progress - b.progress);
}

function evaluateImageBlurKeyframes(keyframes, progress = 0) {
    if (!Array.isArray(keyframes) || !keyframes.length) {
        return DEFAULT_IMAGE_BLUR;
    }

    const safeProgress = clampProgress(Number(progress) || 0);
    const sorted = normalizeImageBlurKeyframes(keyframes);

    if (!sorted.length) {
        return DEFAULT_IMAGE_BLUR;
    }

    if (sorted.length === 1) {
        return clampImageBlur(sorted[0].blur, { snapToInteger: false });
    }

    const first = sorted[0];
    if (safeProgress <= first.progress + KEYFRAME_PROGRESS_TOLERANCE) {
        return clampImageBlur(first.blur, { snapToInteger: false });
    }

    for (let index = 1; index < sorted.length; index += 1) {
        const current = sorted[index];
        if (!current) {
            continue;
        }

        if (safeProgress <= current.progress + KEYFRAME_PROGRESS_TOLERANCE) {
            const previous = sorted[index - 1];
            if (!previous) {
                return clampImageBlur(current.blur, { snapToInteger: false });
            }

            const span = current.progress - previous.progress;
            if (Math.abs(span) <= KEYFRAME_PROGRESS_TOLERANCE) {
                return clampImageBlur(current.blur, { snapToInteger: false });
            }

            const ratio = (safeProgress - previous.progress) / span;
            const easedRatio = easeKeyframeProgress(ratio);
            const interpolated = previous.blur
                + ((current.blur - previous.blur) * easedRatio);
            return clampImageBlur(interpolated, { snapToInteger: false });
        }
    }

    const last = sorted[sorted.length - 1];
    return clampImageBlur(last.blur, { snapToInteger: false });
}

function getTimelineItemImageBlurKeyframes(timelineItem) {
    if (!isImageTimelineItem(timelineItem)) {
        return [];
    }

    const cached = getCachedImageBlurKeyframes(timelineItem);
    if (cached !== null) {
        return cached;
    }

    const raw = timelineItem?.dataset?.imageBlurKeyframes || '';
    if (!raw) {
        setImageBlurKeyframeCache(timelineItem, []);
        return [];
    }

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        const normalized = normalizeImageBlurKeyframes(parsed);
        setImageBlurKeyframeCache(timelineItem, normalized);
        return normalized;
    } catch (error) {
        console.warn('Unable to parse stored image blur keyframes.', error);
        setImageBlurKeyframeCache(timelineItem, []);
        return [];
    }
}

function storeTimelineItemImageBlurKeyframes(timelineItem, keyframes) {
    if (!isImageTimelineItem(timelineItem) || !timelineItem?.dataset) {
        return;
    }

    const sanitized = normalizeImageBlurKeyframes(keyframes);

    if (sanitized.length) {
        try {
            timelineItem.dataset.imageBlurKeyframes = JSON.stringify(sanitized);
        } catch (error) {
            console.warn('Unable to serialize image blur keyframes.', error);
        }

        const baseline = evaluateImageBlurKeyframes(sanitized, 0);
        if (baseline <= IMAGE_BLUR_MIN) {
            delete timelineItem.dataset.imageBlur;
        } else {
            timelineItem.dataset.imageBlur = String(clampImageBlur(baseline, { snapToInteger: false }));
        }
        setImageBlurKeyframeCache(timelineItem, sanitized);
    } else {
        delete timelineItem.dataset.imageBlurKeyframes;
        setImageBlurKeyframeCache(timelineItem, []);
    }
}

function upsertTimelineItemImageBlurKeyframe(keyframes, progress, blur) {
    const safeProgress = clampProgress(Number(progress));
    const safeBlur = clampImageBlur(blur, { snapToInteger: false });
    const next = Array.isArray(keyframes)
        ? keyframes.map(sanitizeImageBlurKeyframeEntry).filter(Boolean)
        : [];
    const existingIndex = next.findIndex((entry) => Math.abs(entry.progress - safeProgress)
        <= KEYFRAME_PROGRESS_TOLERANCE);
    const entry = { progress: safeProgress, blur: safeBlur };

    if (existingIndex >= 0) {
        next[existingIndex] = entry;
    } else {
        next.push(entry);
    }

    next.sort((a, b) => a.progress - b.progress);
    return next;
}

function upsertTimelineImageKeyframe(keyframes, progress, normalizedTransform) {
    const safeProgress = clampProgress(Number(progress));
    const transform = sanitizeNormalizedKeyframeTransform(normalizedTransform);

    if (!transform) {
        return Array.isArray(keyframes) ? [...keyframes] : [];
    }

    const next = Array.isArray(keyframes) ? [...keyframes] : [];
    const existingIndex = next.findIndex((entry) => Math.abs(entry.progress - safeProgress) <= KEYFRAME_PROGRESS_TOLERANCE);
    const entry = {
        progress: safeProgress,
        transform,
    };

    if (existingIndex >= 0) {
        next[existingIndex] = entry;
    } else {
        next.push(entry);
    }

    next.sort((a, b) => a.progress - b.progress);
    return next;
}

function easeKeyframeProgress(value) {
    const clamped = clampProgress(Number(value) || 0);

    if (clamped <= 0 || clamped >= 1) {
        return clamped;
    }

    if (clamped < 0.5) {
        return 4 * clamped * clamped * clamped;
    }

    const inverted = (-2 * clamped) + 2;
    return 1 - ((inverted * inverted * inverted) / 2);
}

function interpolateNormalizedTransforms(startTransform, endTransform, t) {
    const numericRatio = Number(t);
    const ratio = Number.isFinite(numericRatio) ? clampProgress(numericRatio) : 0;
    const easedRatio = easeKeyframeProgress(ratio);
    const lerp = (start, end) => start + ((end - start) * easedRatio);

    const start = sanitizeNormalizedKeyframeTransform(startTransform);
    const end = sanitizeNormalizedKeyframeTransform(endTransform);

    if (!start || !end) {
        return start || end || null;
    }

    return {
        left: lerp(start.left, end.left),
        top: lerp(start.top, end.top),
        width: lerp(start.width, end.width),
        height: lerp(start.height, end.height),
        aspectRatio: lerp(start.aspectRatio, end.aspectRatio),
        rotation: interpolateRotationDegrees(start.rotation, end.rotation, easedRatio),
    };
}

function getTimelineItemKeyframeTransformAtProgress(timelineItem, progress) {
    const keyframes = getTimelineItemImageKeyframes(timelineItem);
    if (!keyframes.length) {
        return null;
    }

    const safeProgress = clampProgress(progress);

    if (keyframes.length === 1) {
        return keyframes[0].transform;
    }

    for (let index = 0; index < keyframes.length; index += 1) {
        const current = keyframes[index];
        if (!current) {
            continue;
        }

        if (safeProgress <= current.progress + KEYFRAME_PROGRESS_TOLERANCE) {
            if (index === 0) {
                return current.transform;
            }

            const previous = keyframes[index - 1];
            if (!previous) {
                return current.transform;
            }

            const span = current.progress - previous.progress;
            if (Math.abs(span) <= KEYFRAME_PROGRESS_TOLERANCE) {
                return current.transform;
            }

            const localT = (safeProgress - previous.progress) / span;
            return interpolateNormalizedTransforms(previous.transform, current.transform, localT);
        }
    }

    return keyframes[keyframes.length - 1].transform;
}

function applyNormalizedPreviewImageTransform(normalized, options = {}) {
    if (!normalized) {
        return false;
    }

    const viewportSize = options.viewportSize || getPreviewViewportSize();
    const denormalized = denormalizePreviewImageTransform(normalized, viewportSize);

    if (!denormalized) {
        return false;
    }

    previewImageTransform = denormalized;
    const normalizedViewportWidth = Math.max(0, Number(viewportSize.width) || 0);
    const normalizedViewportHeight = Math.max(0, Number(viewportSize.height) || 0);
    lastPreviewViewportSize = {
        width: normalizedViewportWidth,
        height: normalizedViewportHeight,
    };
    if (normalizedViewportWidth > 0 && normalizedViewportHeight > 0) {
        lastNonZeroPreviewViewportSize = {
            width: normalizedViewportWidth,
            height: normalizedViewportHeight,
        };
    }
    applyPreviewImageTransform();
    return true;
}

function getActiveClipProgress() {
    if (!Number.isFinite(activeClipProgress)) {
        return 0;
    }
    return clampProgress(activeClipProgress);
}

function updateKeyframeTrackPlayhead(progress = activeClipProgress) {
    if (!keyframeTrack) {
        return;
    }
    const clamped = clampProgress(Number(progress) || 0);
    keyframeTrack.style.setProperty('--keyframe-playhead', String(clamped));
}

function updateActiveKeyframeMarker(progress = activeClipProgress) {
    if (!keyframeTrack) {
        return;
    }
    const clamped = clampProgress(Number(progress) || 0);
    const markers = Array.from(keyframeTrack.querySelectorAll('.keyframe-marker'));
    markers.forEach((marker) => {
        const markerProgress = Number(marker.dataset.progress);
        const isActive = Number.isFinite(markerProgress)
            && Math.abs(markerProgress - clamped) <= KEYFRAME_PROGRESS_TOLERANCE * 2;
        marker.classList.toggle('is-active', isActive);
    });
}

function showKeyframeStatus(message) {
    if (!keyframeStatus) {
        return;
    }
    if (keyframeStatusTimeout) {
        window.clearTimeout(keyframeStatusTimeout);
        keyframeStatusTimeout = null;
    }
    keyframeStatus.textContent = message || '';
    if (message) {
        keyframeStatusTimeout = window.setTimeout(() => {
            keyframeStatus.textContent = '';
            keyframeStatusTimeout = null;
        }, KEYFRAME_STATUS_TIMEOUT_MS);
    }
}
function updateKeyframeControlsState() {
    if (addKeyframeButton) {
        addKeyframeButton.disabled = !isImageTimelineItem(activeTimelineItem) || isTimelinePlaying;
    }
    if (imageBlurAddKeyframeButton) {
        const blurControlsHidden = imageBlurControls?.hidden;
        const blurInputDisabled = imageBlurInput?.disabled;
        const shouldDisableBlurButton = !isImageTimelineItem(activeTimelineItem)
            || isTimelinePlaying
            || blurControlsHidden
            || blurInputDisabled;
        imageBlurAddKeyframeButton.disabled = Boolean(shouldDisableBlurButton);
    }
    if (keyframeTrack) {
        const shouldDisableTrack = !isImageTimelineItem(activeTimelineItem) || isTimelinePlaying;
        if (shouldDisableTrack) {
            cancelKeyframeTrackScrub();
            keyframeTrack.setAttribute('data-disabled', 'true');
            keyframeTrack.setAttribute('aria-disabled', 'true');
            keyframeTrack.tabIndex = -1;
        } else {
            keyframeTrack.removeAttribute('data-disabled');
            keyframeTrack.removeAttribute('aria-disabled');
            keyframeTrack.tabIndex = 0;
        }
    }
    if (imageBlurKeyframeTrack) {
        const blurControlsHidden = imageBlurControls?.hidden;
        const blurInputDisabled = imageBlurInput?.disabled;
        const shouldDisableBlurTrack = !isImageTimelineItem(activeTimelineItem)
            || isTimelinePlaying
            || blurControlsHidden
            || blurInputDisabled;
        if (shouldDisableBlurTrack) {
            cancelImageBlurKeyframeTrackScrub();
            imageBlurKeyframeTrack.setAttribute('data-disabled', 'true');
            imageBlurKeyframeTrack.setAttribute('aria-disabled', 'true');
            imageBlurKeyframeTrack.tabIndex = -1;
        } else {
            imageBlurKeyframeTrack.removeAttribute('data-disabled');
            imageBlurKeyframeTrack.removeAttribute('aria-disabled');
            imageBlurKeyframeTrack.tabIndex = 0;
        }
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

function resetKeyframeTrackPointerState() {
    keyframeTrackPointerState.pointerId = null;
    keyframeTrackPointerState.startProgress = 0;
    keyframeTrackPointerState.lastProgress = null;
    keyframeTrackPointerState.didScrub = false;
}

function cancelKeyframeTrackScrub() {
    const pointerId = keyframeTrackPointerState.pointerId;

    if (keyframeTrack) {
        if (pointerId !== null
            && typeof keyframeTrack.releasePointerCapture === 'function'
        ) {
            try {
                if (typeof keyframeTrack.hasPointerCapture !== 'function'
                    || keyframeTrack.hasPointerCapture(pointerId)
                ) {
                    keyframeTrack.releasePointerCapture(pointerId);
                }
            } catch (error) {
                // Ignore release errors (element may have been detached).
            }
        }
        keyframeTrack.removeAttribute('data-scrubbing');
    }

    resetKeyframeTrackPointerState();
}

function resetImageBlurKeyframePointerState() {
    imageBlurKeyframePointerState.pointerId = null;
    imageBlurKeyframePointerState.marker = null;
    imageBlurKeyframePointerState.timelineItem = null;
    imageBlurKeyframePointerState.keyframes = null;
    imageBlurKeyframePointerState.entry = null;
    imageBlurKeyframePointerState.startProgress = 0;
    imageBlurKeyframePointerState.pointerOffsetProgress = 0;
    imageBlurKeyframePointerState.didMove = false;
}

function resetImageBlurTrackPointerState() {
    imageBlurTrackPointerState.pointerId = null;
    imageBlurTrackPointerState.startProgress = 0;
    imageBlurTrackPointerState.lastProgress = null;
    imageBlurTrackPointerState.didScrub = false;
}

function cancelImageBlurKeyframeTrackScrub() {
    const pointerId = imageBlurTrackPointerState.pointerId;

    if (imageBlurKeyframeTrack) {
        if (pointerId !== null
            && typeof imageBlurKeyframeTrack.releasePointerCapture === 'function'
        ) {
            try {
                if (typeof imageBlurKeyframeTrack.hasPointerCapture !== 'function'
                    || imageBlurKeyframeTrack.hasPointerCapture(pointerId)
                ) {
                    imageBlurKeyframeTrack.releasePointerCapture(pointerId);
                }
            } catch (error) {
                // Ignore release errors (element may have been detached).
            }
        }
        imageBlurKeyframeTrack.removeAttribute('data-scrubbing');
    }

    resetImageBlurTrackPointerState();
}

function cloneImageBlurKeyframeEntry(entry) {
    const sanitized = sanitizeImageBlurKeyframeEntry(entry);
    if (!sanitized) {
        return null;
    }
    return { progress: sanitized.progress, blur: sanitized.blur };
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
            renderImageKeyframeTracks(timelineItem);
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

function handleImageBlurKeyframeMarkerPointerDown(event, keyframeEntry) {
    if (imageBlurKeyframePointerState.pointerId !== null) {
        return;
    }

    if (event.button !== 0 && event.pointerType !== 'touch') {
        return;
    }

    if (!imageBlurKeyframeTrack
        || imageBlurKeyframeTrack.hasAttribute('data-disabled')
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

    const sourceKeyframes = getTimelineItemImageBlurKeyframes(activeTimelineItem);

    if (!sourceKeyframes.length) {
        return;
    }

    const clonedKeyframes = sourceKeyframes
        .map(cloneImageBlurKeyframeEntry)
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

    imageBlurKeyframePointerState.pointerId = event.pointerId;
    imageBlurKeyframePointerState.marker = marker;
    imageBlurKeyframePointerState.timelineItem = activeTimelineItem;
    imageBlurKeyframePointerState.keyframes = clonedKeyframes;
    imageBlurKeyframePointerState.entry = entry;
    imageBlurKeyframePointerState.startProgress = entry.progress;

    const pointerProgress = getKeyframeTrackProgressFromClientX(
        event.clientX,
        imageBlurKeyframeTrack,
    );
    const pointerOffsetProgress = Number.isFinite(pointerProgress)
        ? clampProgress(pointerProgress) - entry.progress
        : 0;
    imageBlurKeyframePointerState.pointerOffsetProgress = Number.isFinite(pointerOffsetProgress)
        ? pointerOffsetProgress
        : 0;
    imageBlurKeyframePointerState.didMove = false;

    if (typeof marker.setPointerCapture === 'function') {
        try {
            marker.setPointerCapture(event.pointerId);
        } catch (error) {
            // Ignore inability to capture the pointer.
        }
    }

    marker.setAttribute('data-dragging', 'true');
    marker.addEventListener('pointermove', handleImageBlurKeyframeMarkerPointerMove);
    marker.addEventListener('pointerup', handleImageBlurKeyframeMarkerPointerUp);
    marker.addEventListener('pointercancel', handleImageBlurKeyframeMarkerPointerUp);
}

function handleImageBlurKeyframeMarkerPointerMove(event) {
    if (imageBlurKeyframePointerState.pointerId === null
        || event.pointerId !== imageBlurKeyframePointerState.pointerId
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
    } = imageBlurKeyframePointerState;

    if (!marker || !timelineItem || !keyframes || !entry) {
        return;
    }

    const pointerProgress = getKeyframeTrackProgressFromClientX(
        event.clientX,
        imageBlurKeyframeTrack,
    );

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
    imageBlurKeyframePointerState.didMove = imageBlurKeyframePointerState.didMove
        || Math.abs(clamped - startProgress) >= KEYFRAME_DRAG_EPSILON;

    if (timelineItem.dataset) {
        try {
            timelineItem.dataset.imageBlurKeyframes = JSON.stringify(keyframes);
        } catch (error) {
            console.warn('Unable to serialize dragged blur keyframes.', error);
        }
        if (typeof setImageBlurKeyframeCache === 'function') {
            setImageBlurKeyframeCache(timelineItem, keyframes);
        }
    }

    marker.dataset.progress = String(clamped);
    marker.style.setProperty('--keyframe-progress', String(clamped));
    marker.setAttribute('aria-label', `Blur keyframe at ${Math.round(clamped * 100)}%`);

    if (timelineItem === activeTimelineItem) {
        setActiveClipProgress(clamped, { source: 'image-blur-keyframe-marker-drag', syncTimeline: true });
    }
}

function handleImageBlurKeyframeMarkerPointerUp(event) {
    if (imageBlurKeyframePointerState.pointerId === null
        || event.pointerId !== imageBlurKeyframePointerState.pointerId
    ) {
        return;
    }

    const timelineItem = imageBlurKeyframePointerState.timelineItem;
    const keyframes = imageBlurKeyframePointerState.keyframes;
    const entry = imageBlurKeyframePointerState.entry;
    const startProgress = imageBlurKeyframePointerState.startProgress;
    const didMove = imageBlurKeyframePointerState.didMove;

    cancelImageBlurKeyframePointerDrag();

    if (!timelineItem) {
        return;
    }

    const finalProgress = clampProgress(Number.isFinite(entry?.progress)
        ? entry.progress
        : startProgress);
    const moved = didMove || Math.abs(finalProgress - startProgress) >= KEYFRAME_DRAG_EPSILON;

    if (moved && keyframes) {
        storeTimelineItemImageBlurKeyframes(timelineItem, keyframes);
    }

    if (timelineItem === activeTimelineItem) {
        if (moved) {
            renderImageBlurKeyframeTrack(timelineItem);
        }

        if (Number.isFinite(finalProgress)) {
            setActiveClipProgress(finalProgress, {
                source: moved ? 'image-blur-keyframe-marker-drag-end' : 'image-blur-keyframe-marker',
                syncTimeline: true,
            });
        }

        if (moved && Number.isFinite(finalProgress)) {
            showImageBlurKeyframeStatus(`Keyframe moved to ${Math.round(finalProgress * 100)}%`);
        }
    }
}

function cancelImageBlurKeyframePointerDrag() {
    const marker = imageBlurKeyframePointerState.marker;
    const pointerId = imageBlurKeyframePointerState.pointerId;

    if (marker) {
        marker.removeEventListener('pointermove', handleImageBlurKeyframeMarkerPointerMove);
        marker.removeEventListener('pointerup', handleImageBlurKeyframeMarkerPointerUp);
        marker.removeEventListener('pointercancel', handleImageBlurKeyframeMarkerPointerUp);
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

    resetImageBlurKeyframePointerState();
}

function getKeyframeTrackMetrics(trackElement) {
    if (!trackElement) {
        return null;
    }

    const rect = trackElement.getBoundingClientRect();

    if (!rect || rect.width <= 0) {
        return null;
    }

    let paddingLeft = 0;
    let paddingRight = 0;

    if (window.getComputedStyle) {
        const computed = window.getComputedStyle(trackElement);
        paddingLeft = Number.parseFloat(computed.paddingLeft) || 0;
        paddingRight = Number.parseFloat(computed.paddingRight) || 0;
    }

    const effectiveWidth = rect.width - paddingLeft - paddingRight;

    if (effectiveWidth <= 0) {
        return null;
    }

    return {
        rect,
        paddingLeft,
        paddingRight,
        effectiveWidth,
    };
}

function getKeyframeTrackProgressFromClientX(clientX, trackElement = keyframeTrack, metricsOverride = null) {
    const metrics = metricsOverride || getKeyframeTrackMetrics(trackElement);
    if (!metrics) {
        return null;
    }

    const rawOffset = clientX - metrics.rect.left - metrics.paddingLeft;
    const clampedOffset = Math.min(Math.max(rawOffset, 0), metrics.effectiveWidth);
    const progress = metrics.effectiveWidth > 0 ? clampedOffset / metrics.effectiveWidth : 0;
    return clampProgress(progress);
}

function applyKeyframeTrackScrub(progress, options = {}) {
    if (!keyframeTrack) {
        return null;
    }

    const numeric = Number(progress);
    if (!Number.isFinite(numeric)) {
        return null;
    }

    if (!isImageTimelineItem(activeTimelineItem)) {
        return null;
    }

    const clamped = clampProgress(numeric);
    const previous = keyframeTrackPointerState.lastProgress;

    if (options.skipDuplicate && Number.isFinite(previous)
        && Math.abs(previous - clamped) <= KEYFRAME_DRAG_UPDATE_EPSILON
    ) {
        return previous;
    }

    keyframeTrackPointerState.lastProgress = clamped;
    setActiveClipProgress(clamped, {
        source: options.source || 'keyframe-track',
        syncTimeline: options.syncTimeline !== false,
    });
    return clamped;
}

function beginKeyframeTrackScrub(progress, event) {
    if (!keyframeTrack) {
        return;
    }

    const numeric = Number(progress);
    if (!Number.isFinite(numeric)) {
        return;
    }

    if (!isImageTimelineItem(activeTimelineItem)) {
        return;
    }

    if (keyframeTrackPointerState.pointerId !== null) {
        cancelKeyframeTrackScrub();
    }

    resetKeyframeTrackPointerState();

    const pointerId = Number.isFinite(event?.pointerId) ? event.pointerId : null;
    keyframeTrackPointerState.pointerId = pointerId;

    if (pointerId !== null
        && typeof keyframeTrack.setPointerCapture === 'function'
    ) {
        try {
            keyframeTrack.setPointerCapture(pointerId);
        } catch (error) {
            // Ignore inability to capture the pointer.
        }
    }

    keyframeTrack.setAttribute('data-scrubbing', 'true');

    if (typeof keyframeTrack.focus === 'function') {
        try {
            keyframeTrack.focus({ preventScroll: true });
        } catch (error) {
            keyframeTrack.focus();
        }
    }

    const applied = applyKeyframeTrackScrub(numeric, {
        source: 'keyframe-track',
        skipDuplicate: false,
    });

    if (Number.isFinite(applied)) {
        keyframeTrackPointerState.startProgress = applied;
    } else {
        const activeProgress = getActiveClipProgress();
        keyframeTrackPointerState.startProgress = Number.isFinite(activeProgress)
            ? clampProgress(activeProgress)
            : 0;
    }
}

function handleKeyframeTrackPointerMove(event) {
    if (keyframeTrackPointerState.pointerId === null
        || event.pointerId !== keyframeTrackPointerState.pointerId
        || !keyframeTrack
    ) {
        return;
    }

    const metrics = getKeyframeTrackMetrics(keyframeTrack);
    if (!metrics) {
        return;
    }

    const progress = getKeyframeTrackProgressFromClientX(
        event.clientX,
        keyframeTrack,
        metrics,
    );

    if (progress === null) {
        return;
    }

    event.preventDefault();

    const applied = applyKeyframeTrackScrub(progress, {
        source: 'keyframe-track-drag',
        skipDuplicate: true,
    });

    if (Number.isFinite(applied)) {
        const moved = Math.abs(applied - keyframeTrackPointerState.startProgress)
            >= KEYFRAME_DRAG_EPSILON;
        keyframeTrackPointerState.didScrub = keyframeTrackPointerState.didScrub || moved;
    }
}

function finalizeKeyframeTrackScrub(event) {
    if (keyframeTrackPointerState.pointerId === null
        || event.pointerId !== keyframeTrackPointerState.pointerId
    ) {
        return;
    }

    event.preventDefault();

    const finalProgress = Number.isFinite(keyframeTrackPointerState.lastProgress)
        ? keyframeTrackPointerState.lastProgress
        : getActiveClipProgress();
    const didScrub = keyframeTrackPointerState.didScrub;

    if (Number.isFinite(finalProgress) && didScrub) {
        applyKeyframeTrackScrub(finalProgress, {
            source: 'keyframe-track-drag-end',
            skipDuplicate: false,
        });
    }

    cancelKeyframeTrackScrub();
}

function snapProgressToImageBlurKeyframes(progress, trackElement, metricsOverride = null) {
    const value = Number(progress);
    if (!Number.isFinite(value)) {
        return clampProgress(0);
    }

    if (!trackElement || !isImageTimelineItem(activeTimelineItem)) {
        return clampProgress(value);
    }

    const keyframes = getTimelineItemImageBlurKeyframes(activeTimelineItem);
    if (!Array.isArray(keyframes) || !keyframes.length) {
        return clampProgress(value);
    }

    const metrics = metricsOverride || getKeyframeTrackMetrics(trackElement);
    if (!metrics) {
        return clampProgress(value);
    }

    const thresholdPx = Math.max(0, Number(IMAGE_BLUR_TRACK_SNAP_THRESHOLD_PX) || 0);
    let snappedProgress = value;
    let smallestDistance = Number.POSITIVE_INFINITY;

    keyframes.forEach((entry) => {
        const keyframeProgress = Number(entry?.progress);
        if (!Number.isFinite(keyframeProgress)) {
            return;
        }
        const distancePx = Math.abs(keyframeProgress - value) * metrics.effectiveWidth;
        if (distancePx <= thresholdPx && distancePx < smallestDistance) {
            smallestDistance = distancePx;
            snappedProgress = keyframeProgress;
        }
    });

    return clampProgress(snappedProgress);
}

function applyImageBlurTrackScrub(progress, options = {}) {
    if (!imageBlurKeyframeTrack) {
        return null;
    }

    const numeric = Number(progress);
    if (!Number.isFinite(numeric)) {
        return null;
    }

    if (!isImageTimelineItem(activeTimelineItem)) {
        return null;
    }

    const metrics = options.metrics || null;
    const snapped = snapProgressToImageBlurKeyframes(numeric, imageBlurKeyframeTrack, metrics);
    const clamped = clampProgress(Number.isFinite(snapped) ? snapped : numeric);
    const previous = imageBlurTrackPointerState.lastProgress;

    if (options.skipDuplicate && Number.isFinite(previous)
        && Math.abs(previous - clamped) <= KEYFRAME_DRAG_UPDATE_EPSILON
    ) {
        return previous;
    }

    imageBlurTrackPointerState.lastProgress = clamped;
    setActiveClipProgress(clamped, {
        source: options.source || 'image-blur-keyframe-track',
        syncTimeline: true,
    });
    return clamped;
}

function beginImageBlurKeyframeTrackScrub(progress, event, metrics = null) {
    if (!imageBlurKeyframeTrack) {
        return;
    }

    const numeric = Number(progress);
    if (!Number.isFinite(numeric)) {
        return;
    }

    if (!isImageTimelineItem(activeTimelineItem)) {
        return;
    }

    if (imageBlurTrackPointerState.pointerId !== null) {
        cancelImageBlurKeyframeTrackScrub();
    }

    resetImageBlurTrackPointerState();

    const pointerId = Number.isFinite(event?.pointerId) ? event.pointerId : null;
    imageBlurTrackPointerState.pointerId = pointerId;

    if (pointerId !== null
        && typeof imageBlurKeyframeTrack.setPointerCapture === 'function'
    ) {
        try {
            imageBlurKeyframeTrack.setPointerCapture(pointerId);
        } catch (error) {
            // Ignore inability to capture the pointer.
        }
    }

    imageBlurKeyframeTrack.setAttribute('data-scrubbing', 'true');

    if (typeof imageBlurKeyframeTrack.focus === 'function') {
        try {
            imageBlurKeyframeTrack.focus({ preventScroll: true });
        } catch (error) {
            imageBlurKeyframeTrack.focus();
        }
    }

    const applied = applyImageBlurTrackScrub(numeric, {
        source: 'image-blur-keyframe-track',
        metrics,
        skipDuplicate: false,
    });

    if (Number.isFinite(applied)) {
        imageBlurTrackPointerState.startProgress = applied;
    } else {
        const activeProgress = getActiveClipProgress();
        imageBlurTrackPointerState.startProgress = Number.isFinite(activeProgress)
            ? clampProgress(activeProgress)
            : 0;
    }
}

function handleImageBlurKeyframeTrackPointerMove(event) {
    if (imageBlurTrackPointerState.pointerId === null
        || event.pointerId !== imageBlurTrackPointerState.pointerId
        || !imageBlurKeyframeTrack
    ) {
        return;
    }

    const metrics = getKeyframeTrackMetrics(imageBlurKeyframeTrack);
    if (!metrics) {
        return;
    }

    const progress = getKeyframeTrackProgressFromClientX(
        event.clientX,
        imageBlurKeyframeTrack,
        metrics,
    );

    if (progress === null) {
        return;
    }

    event.preventDefault();

    const applied = applyImageBlurTrackScrub(progress, {
        source: 'image-blur-keyframe-track-drag',
        metrics,
        skipDuplicate: true,
    });

    if (Number.isFinite(applied)) {
        const moved = Math.abs(applied - imageBlurTrackPointerState.startProgress)
            >= KEYFRAME_DRAG_EPSILON;
        imageBlurTrackPointerState.didScrub = imageBlurTrackPointerState.didScrub || moved;
    }
}

function finalizeImageBlurKeyframeTrackScrub(event) {
    if (imageBlurTrackPointerState.pointerId === null
        || event.pointerId !== imageBlurTrackPointerState.pointerId
    ) {
        return;
    }

    event.preventDefault();

    const finalProgress = Number.isFinite(imageBlurTrackPointerState.lastProgress)
        ? imageBlurTrackPointerState.lastProgress
        : getActiveClipProgress();
    const didScrub = imageBlurTrackPointerState.didScrub;

    if (Number.isFinite(finalProgress) && didScrub) {
        applyImageBlurTrackScrub(finalProgress, {
            source: 'image-blur-keyframe-track-drag-end',
            skipDuplicate: false,
        });
    }

    cancelImageBlurKeyframeTrackScrub();
}

if (keyframeTrack) {
    keyframeTrack.addEventListener('pointermove', handleKeyframeTrackPointerMove);
    keyframeTrack.addEventListener('pointerup', finalizeKeyframeTrackScrub);
    keyframeTrack.addEventListener('pointercancel', finalizeKeyframeTrackScrub);
}

if (imageBlurKeyframeTrack) {
    imageBlurKeyframeTrack.addEventListener('pointermove', handleImageBlurKeyframeTrackPointerMove);
    imageBlurKeyframeTrack.addEventListener('pointerup', finalizeImageBlurKeyframeTrackScrub);
    imageBlurKeyframeTrack.addEventListener('pointercancel', finalizeImageBlurKeyframeTrackScrub);
}

function renderKeyframeTrack(timelineItem) {
    if (!keyframeTrack) {
        return;
    }

    if (keyframeMarkerPointerState.pointerId !== null) {
        cancelKeyframeMarkerPointerDrag();
    }

    if (keyframeTrackPointerState.pointerId !== null) {
        cancelKeyframeTrackScrub();
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

function updateImageBlurKeyframeTrackPlayhead(progress = activeClipProgress) {
    if (!imageBlurKeyframeTrack) {
        return;
    }
    const clamped = clampProgress(Number(progress) || 0);
    imageBlurKeyframeTrack.style.setProperty('--keyframe-playhead', String(clamped));
}

function updateActiveImageBlurKeyframeMarker(progress = activeClipProgress) {
    if (!imageBlurKeyframeTrack) {
        return;
    }
    const clamped = clampProgress(Number(progress) || 0);
    const markers = Array.from(imageBlurKeyframeTrack.querySelectorAll('.keyframe-marker'));
    markers.forEach((marker) => {
        const markerProgress = Number(marker.dataset.progress);
        const isActive = Number.isFinite(markerProgress)
            && Math.abs(markerProgress - clamped) <= KEYFRAME_PROGRESS_TOLERANCE * 2;
        marker.classList.toggle('is-active', isActive);
    });
}

function showImageBlurKeyframeStatus(message) {
    if (!imageBlurKeyframeStatus) {
        return;
    }
    if (imageBlurKeyframeStatusTimeout) {
        window.clearTimeout(imageBlurKeyframeStatusTimeout);
        imageBlurKeyframeStatusTimeout = null;
    }
    imageBlurKeyframeStatus.textContent = message || '';
    if (message) {
        imageBlurKeyframeStatusTimeout = window.setTimeout(() => {
            imageBlurKeyframeStatus.textContent = '';
            imageBlurKeyframeStatusTimeout = null;
        }, IMAGE_BLUR_KEYFRAME_STATUS_TIMEOUT_MS);
    }
}

function renderImageBlurKeyframeTrack(timelineItem) {
    if (!imageBlurKeyframeTrack) {
        return;
    }

    if (imageBlurKeyframePointerState.pointerId !== null) {
        cancelImageBlurKeyframePointerDrag();
    }

    if (imageBlurTrackPointerState.pointerId !== null) {
        cancelImageBlurKeyframeTrackScrub();
    }

    imageBlurKeyframeTrack.innerHTML = '';
    updateImageBlurKeyframeTrackPlayhead();
    updateKeyframeControlsState();

    if (!timelineItem || !isImageTimelineItem(timelineItem) || imageBlurControls?.hidden) {
        imageBlurKeyframeTrack.setAttribute('data-empty', 'true');
        const message = document.createElement('span');
        message.className = 'keyframe-track__empty';
        message.textContent = 'Select an image clip to add keyframes.';
        imageBlurKeyframeTrack.appendChild(message);
        updateActiveImageBlurKeyframeMarker(0);
        return;
    }

    const keyframes = getTimelineItemImageBlurKeyframes(timelineItem);
    if (!keyframes.length) {
        imageBlurKeyframeTrack.setAttribute('data-empty', 'true');
        const message = document.createElement('span');
        message.className = 'keyframe-track__empty';
        message.textContent = 'No keyframes yet.';
        imageBlurKeyframeTrack.appendChild(message);
        updateActiveImageBlurKeyframeMarker();
        return;
    }

    imageBlurKeyframeTrack.removeAttribute('data-empty');

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
        marker.setAttribute('aria-label', `Blur keyframe at ${Math.round(keyframe.progress * 100)}%`);
        marker.addEventListener('pointerdown', (event) => {
            handleImageBlurKeyframeMarkerPointerDown(event, keyframe);
        });
        marker.addEventListener('click', () => {
            if (isTimelinePlaying) {
                return;
            }
            setActiveClipProgress(keyframe.progress, {
                source: 'image-blur-keyframe-marker',
                syncTimeline: true,
            });
        });
        imageBlurKeyframeTrack.appendChild(marker);
    });

    updateActiveImageBlurKeyframeMarker();
}

function renderImageKeyframeTracks(timelineItem) {
    renderKeyframeTrack(timelineItem);
    renderImageBlurKeyframeTrack(timelineItem);
}

function createActiveImageBlurKeyframe(progressOverride = null) {
    if (!activeTimelineItem
        || !isImageTimelineItem(activeTimelineItem)
        || !imageBlurInput
        || imageBlurInput.disabled
        || imageBlurControls?.hidden
    ) {
        return;
    }

    const blurValue = clampImageBlur(imageBlurInput.value);
    imageBlurInput.value = String(blurValue);
    updateImageBlurReadout(blurValue, {
        disabled: imageBlurInput.disabled || imageBlurControls?.hidden,
    });

    const existing = getTimelineItemImageBlurKeyframes(activeTimelineItem);
    const targetProgress = Number.isFinite(progressOverride)
        ? clampProgress(progressOverride)
        : getActiveClipProgress();

    const hadExisting = existing.some((entry) => Math.abs(entry.progress - targetProgress)
        <= KEYFRAME_PROGRESS_TOLERANCE);
    const nextKeyframes = upsertTimelineItemImageBlurKeyframe(existing, targetProgress, blurValue);
    storeTimelineItemImageBlurKeyframes(activeTimelineItem, nextKeyframes);
    renderImageBlurKeyframeTrack(activeTimelineItem);
    updateImageBlurKeyframeTrackPlayhead(targetProgress);
    updateActiveImageBlurKeyframeMarker(targetProgress);

    const percent = Math.round(targetProgress * 100);
    showImageBlurKeyframeStatus(hadExisting
        ? `Keyframe updated at ${percent}%`
        : `Keyframe added at ${percent}%`);

    applyActiveImageBlurKeyframe({ reason: 'image-blur-keyframe-create' });
}

function deleteActiveImageBlurKeyframe(progressOverride = null) {
    if (!activeTimelineItem || !isImageTimelineItem(activeTimelineItem)) {
        return false;
    }

    const keyframes = getTimelineItemImageBlurKeyframes(activeTimelineItem);
    if (!keyframes.length) {
        showImageBlurKeyframeStatus('No keyframes to delete.');
        return false;
    }

    const targetProgress = Number.isFinite(progressOverride)
        ? clampProgress(progressOverride)
        : getActiveClipProgress();

    const targetIndex = keyframes.findIndex((entry) => Math.abs(entry.progress - targetProgress)
        <= KEYFRAME_PROGRESS_TOLERANCE * 2);

    if (targetIndex === -1) {
        showImageBlurKeyframeStatus('No keyframe at the current position to delete.');
        return false;
    }

    const removedEntry = keyframes[targetIndex];
    const remainingKeyframes = keyframes.filter((_, index) => index !== targetIndex);

    storeTimelineItemImageBlurKeyframes(activeTimelineItem, remainingKeyframes);
    renderImageBlurKeyframeTrack(activeTimelineItem);
    applyActiveImageBlurKeyframe({ reason: 'image-blur-keyframe-delete' });

    const percent = Math.round(((removedEntry && removedEntry.progress) || targetProgress) * 100);
    showImageBlurKeyframeStatus(`Keyframe removed at ${percent}%`);
    return true;
}

function applyActiveImageBlurKeyframe(options = {}) {
    if (!isImageTimelineItem(activeTimelineItem)) {
        applyImageBlurToPreview(0);
        return;
    }

    const progress = getActiveClipProgress();
    const blurValue = getTimelineItemImageBlur(activeTimelineItem, progress);
    const previewBlur = clampImageBlur(blurValue, { snapToInteger: false });
    applyImageBlurToPreview(previewBlur);

    if (imageBlurInput) {
        const sliderValue = clampImageBlur(previewBlur);
        imageBlurInput.value = String(sliderValue);
        const isDisabled = imageBlurInput.disabled || imageBlurControls?.hidden;
        updateImageBlurReadout(previewBlur, { disabled: isDisabled });
    }

    updateImageBlurKeyframeTrackPlayhead(progress);
    updateActiveImageBlurKeyframeMarker(progress);
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
    applyActiveImageBlurKeyframe({ reason: options.reason || options.source || null });
}

function setActiveClipProgress(progress, options = {}) {
    updateKeyframeControlsState();
    if (!isImageTimelineItem(activeTimelineItem)) {
        activeClipProgress = 0;
        updateKeyframeTrackPlayhead(0);
        updateActiveKeyframeMarker(0);
        updateImageBlurKeyframeTrackPlayhead(0);
        updateActiveImageBlurKeyframeMarker(0);
        cancelKeyframeTrackScrub();
        cancelImageBlurKeyframeTrackScrub();
        updateImageRotationControlState();
        applyImageBlurToPreview(0);
        refreshActiveOverlayLayers();
        return;
    }

    const clamped = clampProgress(Number.isFinite(progress) ? progress : 0);
    activeClipProgress = clamped;
    updateKeyframeTrackPlayhead(clamped);
    updateActiveKeyframeMarker(clamped);
    updateImageBlurKeyframeTrackPlayhead(clamped);
    updateActiveImageBlurKeyframeMarker(clamped);

    if (options.syncTimeline) {
        setTimelineProgressForActiveClip(clamped);
    }

    if (options.updatePreview !== false && !previewImagePointerState.pointerId) {
        applyActiveImageKeyframe({ reason: options.source || null });
    } else {
        updateImageRotationControlState();
        applyActiveImageBlurKeyframe({ reason: options.source || null });
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
    renderImageKeyframeTracks(activeTimelineItem);
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
renderImageKeyframeTracks(activeTimelineItem);
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
    applyImageBlurToPreview(0);
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
const timelineItemVolumeControls = new WeakMap();

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

    const { recordUndo = true } = options;
    const snapshot = recordUndo ? createTimelineItemSnapshot(timelineItem) : null;
    const parentLane = timelineItem.closest('.timeline-lane');
    const fileType = timelineItem.dataset?.fileType || '';
    const objectUrl = timelineItem.dataset?.objectUrl || '';
    const hasStagedUpload = objectUrl && stagedUploadsByObjectUrl.has(objectUrl);
    const wasActive = timelineItem === activeTimelineItem;

    detachAudioWaveformResizeObserver(timelineItem);
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

