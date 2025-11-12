function openExportDialog() {
    if (!exportDialog) {
        return;
    }
    exportDialog.hidden = false;
    exportDialog.removeAttribute('hidden');
    exportDialog.setAttribute('aria-hidden', 'false');
}

function closeExportDialog() {
    if (!exportDialog) {
        return;
    }
    exportDialog.hidden = true;
    exportDialog.setAttribute('hidden', '');
    exportDialog.setAttribute('aria-hidden', 'true');
}

function isExportDialogOpen() {
    return Boolean(exportDialog && !exportDialog.hasAttribute('hidden'));
}

function normalizeTimelinePlaybackSyncSource(source) {
    if (!source || typeof source.getTimelineTime !== 'function') {
        return null;
    }
    const normalized = {
        getTimelineTime: source.getTimelineTime,
        cleanup: typeof source.cleanup === 'function' ? source.cleanup : null,
        priority: Number.isFinite(source.priority) ? source.priority : 0,
        ref: source.ref || source,
    };
    return normalized;
}

function getTimelinePlaybackSyncSourceTime(source) {
    if (!source || typeof source.getTimelineTime !== 'function') {
        return Number.NaN;
    }
    try {
        return Number(source.getTimelineTime());
    } catch (error) {
        return Number.NaN;
    }
}

function refreshTimelinePlaybackSyncFallbackFromSource(source) {
    const timelineTime = getTimelinePlaybackSyncSourceTime(source);
    if (Number.isFinite(timelineTime)) {
        updateTimelinePlaybackSyncFallback(timelineTime);
    }
}

function setTimelinePlaybackSyncSource(source) {
    const normalized = normalizeTimelinePlaybackSyncSource(source);
    if (!normalized) {
        if (source === null) {
            clearTimelinePlaybackSyncSource();
        }
        return timelinePlaybackSyncSource;
    }

    if (timelinePlaybackSyncSource && timelinePlaybackSyncSource.ref === normalized.ref) {
        timelinePlaybackSyncSource = normalized;
        refreshTimelinePlaybackSyncFallbackFromSource(timelinePlaybackSyncSource);
        return timelinePlaybackSyncSource;
    }

    if (timelinePlaybackSyncSource && timelinePlaybackSyncSource.priority > normalized.priority) {
        refreshTimelinePlaybackSyncFallbackFromSource(timelinePlaybackSyncSource);
        return timelinePlaybackSyncSource;
    }

    if (timelinePlaybackSyncSource && typeof timelinePlaybackSyncSource.cleanup === 'function') {
        try {
            timelinePlaybackSyncSource.cleanup();
        } catch (error) {
            // Ignore cleanup failures.
        }
    }

    timelinePlaybackSyncSource = normalized;
    refreshTimelinePlaybackSyncFallbackFromSource(timelinePlaybackSyncSource);
    return timelinePlaybackSyncSource;
}

function clearTimelinePlaybackSyncSource(source) {
    if (!timelinePlaybackSyncSource) {
        return;
    }
    if (source && timelinePlaybackSyncSource.ref !== source && timelinePlaybackSyncSource !== source) {
        return;
    }
    const current = timelinePlaybackSyncSource;
    timelinePlaybackSyncSource = null;
    refreshTimelinePlaybackSyncFallbackFromSource(current);
    if (current && typeof current.cleanup === 'function') {
        try {
            current.cleanup();
        } catch (error) {
            // Ignore cleanup failures.
        }
    }
}

function getTimelinePlaybackSyncSource() {
    return timelinePlaybackSyncSource;
}

function updateTimelinePlaybackSyncFallback(baseElapsed) {
    timelinePlaybackSyncFallback.baseElapsed = Math.max(0, Number(baseElapsed) || 0);
    timelinePlaybackSyncFallback.startTimestamp = performance.now();
}

function getTimelinePlaybackSyncedElapsed(defaultElapsed, nowTimestamp) {
    const now = Number.isFinite(nowTimestamp) ? nowTimestamp : performance.now();
    const fallbackElapsed = timelinePlaybackSyncFallback.baseElapsed
        + Math.max(0, now - timelinePlaybackSyncFallback.startTimestamp);
    let candidate = Number.isFinite(defaultElapsed)
        ? Math.max(fallbackElapsed, Number(defaultElapsed))
        : fallbackElapsed;

    if (timelinePlaybackSyncSource && typeof timelinePlaybackSyncSource.getTimelineTime === 'function') {
        try {
            const synced = timelinePlaybackSyncSource.getTimelineTime();
            if (Number.isFinite(synced)) {
                candidate = synced;
            }
        } catch (error) {
            // Ignore sync source errors and fall back to the computed candidate.
        }
    }

    return Math.max(0, candidate);
}

function startPlaybackClock(startElapsed, totalDuration) {
    playbackClockBaseElapsed = Math.max(0, Number(startElapsed) || 0);
    playbackClockTotalDuration = Math.max(0, Number(totalDuration) || 0);
    playbackClockStartTimestamp = performance.now();

    updateTimelinePlaybackSyncFallback(playbackClockBaseElapsed);

    if (playbackClockAnimationFrame) {
        window.cancelAnimationFrame(playbackClockAnimationFrame);
    }

    const tick = () => {
        if (!isTimelinePlaying) {
            return;
        }
        const now = performance.now();
        const fallbackElapsed = playbackClockBaseElapsed + Math.max(0, now - playbackClockStartTimestamp);
        const syncedElapsed = getTimelinePlaybackSyncedElapsed(fallbackElapsed, now);
        const elapsed = Math.min(playbackClockTotalDuration, syncedElapsed);
        updatePlaybackTimeDisplay(elapsed, playbackClockTotalDuration);
        playbackClockAnimationFrame = window.requestAnimationFrame(tick);
    };

    tick();
}

function stopPlaybackClock(resetDisplay = true) {
    if (playbackClockAnimationFrame) {
        window.cancelAnimationFrame(playbackClockAnimationFrame);
        playbackClockAnimationFrame = null;
    }

    if (resetDisplay) {
        updateActiveTimelineIndicators();
    }
}

function clampTimelineDurationPerPixel(value) {
    if (!Number.isFinite(value)) {
        return TIMELINE_DURATION_PER_PIXEL_DEFAULT;
    }
    return Math.min(
        TIMELINE_DURATION_PER_PIXEL_MAX,
        Math.max(TIMELINE_DURATION_PER_PIXEL_MIN, Math.round(value)),
    );
}

function getTimelineDurationPerPixel() {
    return timelineDurationPerPixel;
}

function formatTimelineZoomLabel(factor) {
    if (!Number.isFinite(factor) || factor <= 0) {
        return '1.0×';
    }
    if (factor >= 10) {
        return `${Math.round(factor)}×`;
    }
    if (factor >= 1) {
        return `${factor.toFixed(1).replace(/\.0$/, '')}×`;
    }
    return `${factor.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}×`;
}

function updateTimelineZoomDisplay() {
    const perPixel = getTimelineDurationPerPixel();
    const zoomFactor = TIMELINE_DURATION_PER_PIXEL_DEFAULT / perPixel;
    const formattedLabel = formatTimelineZoomLabel(zoomFactor);

    if (timelineZoomInput) {
        timelineZoomInput.value = String(perPixel);
        timelineZoomInput.setAttribute('aria-valuenow', String(perPixel));
        timelineZoomInput.setAttribute('aria-valuetext', `${formattedLabel.replace('×', '')} zoom`);
        timelineZoomInput.setAttribute('title', `${perPixel} ms per pixel`);
    }

    if (timelineZoomValue) {
        timelineZoomValue.textContent = formattedLabel;
    }

    if (timelineTrack) {
        timelineTrack.dataset.zoomFactor = zoomFactor.toFixed(2);
    }
}

function applyTimelineZoom(options = {}) {
    if (!timelineTrack) {
        updateTimelineZoomDisplay();
        return;
    }

    const { preserveScroll = true } = options;
    const previousScroll = preserveScroll ? timelineTrack.scrollLeft : 0;
    const items = getTimelineItems();
    const currentProgressFraction = typeof getTimelineProgressFraction === 'function'
        ? getTimelineProgressFraction()
        : 0;

    items.forEach((item) => {
        const duration = getTimelineItemPlaybackDuration(item);
        applyTimelineItemDurationStyles(item, duration);
    });

    reflowAllTimelineLanes();

    if (preserveScroll) {
        timelineTrack.scrollLeft = previousScroll;
    }

    updateTimelineZoomDisplay();
    updateActiveTimelineIndicators();

    if (typeof applyTimelineProgressGeometry === 'function') {
        applyTimelineProgressGeometry();
    }

    if (typeof setTimelineProgressVisuals === 'function') {
        setTimelineProgressVisuals(currentProgressFraction, { forceGeometryUpdate: true });
    }

    if (typeof getTimelinePlaybackSegments === 'function') {
        const { totalDuration } = getTimelinePlaybackSegments();
        if (typeof updatePlaybackTimeDisplay === 'function') {
            const elapsed = Math.round(totalDuration * currentProgressFraction);
            updatePlaybackTimeDisplay(elapsed, totalDuration);
        }
    }
}

function setTimelineDurationPerPixel(value, options = {}) {
    const clamped = clampTimelineDurationPerPixel(value);
    if (clamped === timelineDurationPerPixel) {
        updateTimelineZoomDisplay();
        return timelineDurationPerPixel;
    }

    timelineDurationPerPixel = clamped;
    applyTimelineZoom({ preserveScroll: options.preserveScroll !== false });
    return timelineDurationPerPixel;
}

function setPreviewFullscreenState(enable, options = {}) {
    if (!previewCard) {
        return false;
    }

    const target = Boolean(enable);
    if (target === isPreviewFullscreen) {
        return isPreviewFullscreen;
    }

    isPreviewFullscreen = target;
    previewCard.classList.toggle('preview-card--fullscreen', target);
    if (document.body) {
        document.body.classList.toggle('preview-fullscreen-active', target);
    }

    if (previewFullscreenToggle) {
        previewFullscreenToggle.setAttribute('aria-pressed', String(target));
        previewFullscreenToggle.setAttribute(
            'aria-label',
            target ? 'Exit fullscreen preview' : 'Enter fullscreen preview',
        );
    }

    if (target && options.scrollIntoView !== false) {
        previewCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    if (!target && previewCard && options.restoreFocus) {
        const focusTarget = options.restoreFocus === true
            ? previewFullscreenToggle || previewCard
            : options.restoreFocus;
        if (focusTarget && typeof focusTarget.focus === 'function') {
            focusTarget.focus({ preventScroll: true });
        }
    }

    updateActiveTimelineIndicators();
    return isPreviewFullscreen;
}

function togglePreviewFullscreen() {
    return setPreviewFullscreenState(!isPreviewFullscreen);
}

function durationToWidth(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return MIN_TIMELINE_ITEM_WIDTH;
    }
    const perPixel = getTimelineDurationPerPixel();
    return Math.max(MIN_TIMELINE_ITEM_WIDTH, Math.round(durationMs / perPixel));
}

function widthToDuration(widthPx) {
    if (!Number.isFinite(widthPx) || widthPx <= 0) {
        return MIN_IMAGE_DURATION;
    }
    const perPixel = getTimelineDurationPerPixel();
    return Math.max(MIN_IMAGE_DURATION, Math.round(widthPx * perPixel));
}

function applyTimelineItemDurationStyles(timelineItem, durationMs) {
    const width = durationToWidth(durationMs);
    timelineItem.style.width = `${width}px`;
    timelineItem.style.flexBasis = `${width}px`;
}

function parseTimelineItemOffsetMs(timelineItem) {
    if (!timelineItem?.dataset) {
        return null;
    }
    const raw = Number(timelineItem.dataset.startOffsetMs);
    if (!Number.isFinite(raw) || raw < 0) {
        return null;
    }
    return raw;
}

function applyTimelineItemLeadingGapStyles(timelineItem, gapMs) {
    if (!timelineItem) {
        return;
    }
    const perPixel = getTimelineDurationPerPixel();
    const gapValue = Number(gapMs) || 0;
    const gapPx = Math.round(gapValue / perPixel);
    if (gapPx !== 0) {
        timelineItem.style.marginLeft = `${gapPx}px`;
    } else if (timelineItem.style.marginLeft) {
        timelineItem.style.marginLeft = '';
    }
}

function getTimelineSnapThresholdMs() {
    const perPixel = getTimelineDurationPerPixel();
    if (!Number.isFinite(perPixel) || perPixel <= 0) {
        return 0;
    }
    const thresholdPx = Math.max(0, TIMELINE_SNAP_THRESHOLD_PX);
    return perPixel * thresholdPx;
}

let timelineSnapLineLabel = null;
let timelineSnapLineCaps = { top: null, bottom: null };

function ensureTimelineSnapLineDecorations() {
    if (!timelineSnapLine) {
        timelineSnapLineLabel = null;
        timelineSnapLineCaps = { top: null, bottom: null };
        return;
    }

    if (!timelineSnapLineCaps.top || !timelineSnapLineCaps.top.isConnected) {
        const topCap = document.createElement('span');
        topCap.className = 'timeline-snap-line__cap timeline-snap-line__cap--top';
        topCap.setAttribute('aria-hidden', 'true');
        timelineSnapLine.insertBefore(topCap, timelineSnapLine.firstChild || null);
        timelineSnapLineCaps.top = topCap;
    }

    if (!timelineSnapLineCaps.bottom || !timelineSnapLineCaps.bottom.isConnected) {
        const bottomCap = document.createElement('span');
        bottomCap.className = 'timeline-snap-line__cap timeline-snap-line__cap--bottom';
        bottomCap.setAttribute('aria-hidden', 'true');
        timelineSnapLine.appendChild(bottomCap);
        timelineSnapLineCaps.bottom = bottomCap;
    }

    if (!timelineSnapLineLabel || !timelineSnapLineLabel.isConnected) {
        timelineSnapLineLabel = document.createElement('span');
        timelineSnapLineLabel.className = 'timeline-snap-line__label';
        timelineSnapLineLabel.setAttribute('aria-hidden', 'true');
        timelineSnapLine.appendChild(timelineSnapLineLabel);
    }
}

function formatTimelineSnapLabel(state, laneIndex = null) {
    if (!state) {
        return '';
    }

    const edgeName = state.edge === 'end' ? 'End' : 'Start';
    let targetName = 'Marker';

    switch (state.targetType) {
        case 'clip-start':
            targetName = 'Clip start';
            break;
        case 'clip-end':
            targetName = 'Clip end';
            break;
        case 'playhead':
            targetName = 'Playhead';
            break;
        default:
            targetName = 'Marker';
            break;
    }

    if (state.targetType === 'playhead') {
        return `${edgeName} ↔ Playhead`;
    }

    const numericLaneIndex = Number.isFinite(laneIndex) ? laneIndex : null;
    const laneSuffix = Number.isFinite(numericLaneIndex)
        ? ` (Layer ${numericLaneIndex + 1})`
        : '';

    return `${edgeName} ↔ ${targetName}${laneSuffix}`;
}

function getTimelineSnapTargets(excludeItem = null) {
    const entries = getTimelineLaneEntries();
    const targets = [];
    const excludeSet = excludeItem ? new Set([excludeItem]) : null;

    entries.forEach((entry) => {
        if (excludeSet && excludeSet.has(entry.item)) {
            return;
        }
        if (Number.isFinite(entry.start)) {
            targets.push({
                timeMs: entry.start,
                type: 'clip-start',
                laneIndex: entry.laneIndex,
                item: entry.item,
            });
        }
        if (Number.isFinite(entry.end)) {
            targets.push({
                timeMs: entry.end,
                type: 'clip-end',
                laneIndex: entry.laneIndex,
                item: entry.item,
            });
        }
    });

    if (Number.isFinite(playbackDisplayCurrentMs)) {
        targets.push({
            timeMs: playbackDisplayCurrentMs,
            type: 'playhead',
            laneIndex: null,
            item: null,
        });
    }

    return targets;
}

function resolveTimelineSnapForMovement({ desiredStartMs, clipDuration, excludeItem = null }) {
    const safeStart = Number.isFinite(desiredStartMs) ? Math.max(0, desiredStartMs) : 0;
    const safeDuration = Number.isFinite(clipDuration) ? Math.max(0, clipDuration) : 0;
    const desiredEnd = safeStart + safeDuration;
    const thresholdMs = getTimelineSnapThresholdMs();

    if (thresholdMs <= 0) {
        return null;
    }

    const targets = getTimelineSnapTargets(excludeItem);
    let bestMatch = null;

    targets.forEach((target) => {
        if (!Number.isFinite(target.timeMs)) {
            return;
        }

        const targetTime = Math.max(0, target.timeMs);
        const startDelta = Math.abs(targetTime - safeStart);

        if (startDelta <= thresholdMs && (!bestMatch || startDelta < bestMatch.delta)) {
            bestMatch = {
                delta: startDelta,
                edge: 'start',
                targetTimeMs: targetTime,
                targetType: target.type,
                laneIndex: target.laneIndex,
                targetItem: target.item || null,
            };
        }

        if (safeDuration > 0) {
            const candidateStart = Math.round(targetTime - safeDuration);
            if (candidateStart < 0) {
                return;
            }
            const endDelta = Math.abs(targetTime - desiredEnd);
            if (endDelta <= thresholdMs && (!bestMatch || endDelta < bestMatch.delta)) {
                bestMatch = {
                    delta: endDelta,
                    edge: 'end',
                    targetTimeMs: targetTime,
                    targetType: target.type,
                    laneIndex: target.laneIndex,
                    targetItem: target.item || null,
                };
            }
        }
    });

    if (!bestMatch) {
        return null;
    }

    const roundedTarget = Math.max(0, Math.round(bestMatch.targetTimeMs));
    const appliedStart = bestMatch.edge === 'end'
        ? Math.max(0, Math.round(roundedTarget - safeDuration))
        : roundedTarget;
    const appliedEnd = bestMatch.edge === 'end'
        ? roundedTarget
        : Math.max(appliedStart, Math.round(appliedStart + safeDuration));

    return {
        startMs: appliedStart,
        endMs: appliedEnd,
        targetTimeMs: roundedTarget,
        targetType: bestMatch.targetType,
        edge: bestMatch.edge,
        laneIndex: bestMatch.laneIndex,
        targetItem: bestMatch.targetItem || null,
    };
}

function resolveTimelineSnapForResize({
    timelineItem,
    startMs,
    desiredDuration,
    edge = 'end',
    excludeItem = null,
}) {
    if (!timelineItem) {
        return null;
    }

    const safeStart = Number.isFinite(startMs) ? Math.max(0, startMs) : 0;
    const safeDuration = Number.isFinite(desiredDuration) ? Math.max(0, desiredDuration) : 0;
    const thresholdMs = getTimelineSnapThresholdMs();

    if (thresholdMs <= 0) {
        return null;
    }

    const targets = getTimelineSnapTargets(excludeItem || timelineItem);
    const minimumDuration = getTimelineItemMinimumDuration(timelineItem);

    if (edge === 'end') {
        const desiredEnd = safeStart + safeDuration;
        let best = null;

        targets.forEach((target) => {
            if (!Number.isFinite(target.timeMs)) {
                return;
            }
            const targetTime = Math.max(0, target.timeMs);
            if (targetTime < safeStart + minimumDuration) {
                return;
            }
            const delta = Math.abs(targetTime - desiredEnd);
            if (delta <= thresholdMs && (!best || delta < best.delta)) {
                const durationMs = Math.max(minimumDuration, Math.round(targetTime - safeStart));
                best = {
                    delta,
                    durationMs,
                    targetTimeMs: Math.round(targetTime),
                    targetType: target.type,
                    laneIndex: target.laneIndex,
                    targetItem: target.item || null,
                };
            }
        });

        if (best) {
            return {
                durationMs: best.durationMs,
                targetTimeMs: best.targetTimeMs,
                targetType: best.targetType,
                edge: 'end',
                laneIndex: best.laneIndex,
                targetItem: best.targetItem || null,
            };
        }
    }

    if (edge === 'start') {
        const desiredStart = safeStart;
        let best = null;

        targets.forEach((target) => {
            if (!Number.isFinite(target.timeMs)) {
                return;
            }
            const targetTime = Math.max(0, target.timeMs);
            const delta = Math.abs(targetTime - desiredStart);
            if (delta <= thresholdMs && (!best || delta < best.delta)) {
                const alignedStart = Math.max(0, Math.round(targetTime));
                const alignedEnd = Math.max(alignedStart + minimumDuration, Math.round(alignedStart + safeDuration));
                best = {
                    delta,
                    startMs: alignedStart,
                    durationMs: Math.max(minimumDuration, alignedEnd - alignedStart),
                    targetTimeMs: Math.round(targetTime),
                    targetType: target.type,
                    laneIndex: target.laneIndex,
                    targetItem: target.item || null,
                };
            }
        });

        if (best) {
            return {
                startMs: best.startMs,
                durationMs: best.durationMs,
                targetTimeMs: best.targetTimeMs,
                targetType: best.targetType,
                edge: 'start',
                laneIndex: best.laneIndex,
                targetItem: best.targetItem || null,
            };
        }
    }

    return null;
}

function setTimelineSnapLineState(state) {
    if (!timelineSnapLine || !timelineTrack) {
        activeTimelineSnapState = null;
        return;
    }

    if (!state) {
        if (activeTimelineSnapState) {
            if (activeTimelineSnapState.laneElement && activeTimelineSnapState.laneElement.isConnected) {
                activeTimelineSnapState.laneElement.classList.remove('timeline-lane--snap-target');
            }
            activeTimelineSnapState = null;
            timelineSnapLine.classList.remove('is-visible');
            timelineSnapLine.style.transform = 'translateX(-9999px)';
            timelineSnapLine.style.removeProperty('top');
            timelineSnapLine.style.removeProperty('height');
            timelineSnapLine.removeAttribute('data-edge');
            timelineSnapLine.removeAttribute('data-source');
            if (timelineSnapLineLabel) {
                timelineSnapLineLabel.textContent = '';
                timelineSnapLineLabel.classList.remove('has-text');
            }
        }
        return;
    }

    ensureTimelineSnapLineDecorations();

    const perPixel = getTimelineDurationPerPixel();
    if (!Number.isFinite(perPixel) || perPixel <= 0) {
        setTimelineSnapLineState(null);
        return;
    }

    const laneCandidates = getTimelineLanes();
    const parseLaneIndex = (value) => {
        if (value === null || value === undefined || value === '') {
            return null;
        }
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
    };

    const targetLaneIndex = parseLaneIndex(state.laneIndex);
    const explicitLane = state.lane && state.lane.isConnected ? state.lane : null;
    const explicitLaneIndex = explicitLane ? parseLaneIndex(explicitLane.dataset?.laneIndex) : null;
    const targetItem = state.targetItem && state.targetItem.isConnected ? state.targetItem : null;
    const targetItemLane = targetItem ? targetItem.closest('.timeline-lane') : null;
    const connectedTargetItemLane = targetItemLane && targetItemLane.isConnected
        ? targetItemLane
        : null;

    let resolvedLane = null;

    if (connectedTargetItemLane) {
        resolvedLane = connectedTargetItemLane;
    }

    if (explicitLane) {
        const explicitMatchesTarget = !Number.isFinite(targetLaneIndex)
            || (Number.isFinite(explicitLaneIndex) && explicitLaneIndex === targetLaneIndex);
        if (explicitMatchesTarget) {
            resolvedLane = explicitLane;
        }
    }

    if (!resolvedLane && Number.isFinite(targetLaneIndex)) {
        resolvedLane = laneCandidates.find((candidate) => {
            const candidateIndex = parseLaneIndex(candidate?.dataset?.laneIndex);
            return Number.isFinite(candidateIndex) && candidateIndex === targetLaneIndex;
        }) || null;

        if (!resolvedLane && targetLaneIndex >= 0 && targetLaneIndex < laneCandidates.length) {
            resolvedLane = laneCandidates[targetLaneIndex] || null;
        }
    }

    if (!resolvedLane) {
        resolvedLane = explicitLane || laneCandidates[0] || null;
    }

    if (!resolvedLane) {
        if (activeTimelineSnapState?.laneElement && activeTimelineSnapState.laneElement.isConnected) {
            activeTimelineSnapState.laneElement.classList.remove('timeline-lane--snap-target');
        }
        setTimelineSnapLineState(null);
        return;
    }

    const trackRect = timelineTrack.getBoundingClientRect();
    const laneRect = resolvedLane.getBoundingClientRect();
    const laneStyles = window.getComputedStyle(resolvedLane);
    const paddingLeft = Number.parseFloat(laneStyles.paddingLeft) || 0;
    const targetTime = Number.isFinite(state.targetTimeMs)
        ? Math.max(0, state.targetTimeMs)
        : 0;
    const offset = (laneRect.left - trackRect.left) + paddingLeft + (targetTime / perPixel);
    const appliedLeft = Math.round(offset);
    const laneTop = Math.round(laneRect.top - trackRect.top);
    const laneHeight = Math.max(0, Math.round(laneRect.height));
    const previousState = activeTimelineSnapState;

    const resolvedLaneIndex = parseLaneIndex(resolvedLane?.dataset?.laneIndex);
    const labelLaneIndex = Number.isFinite(targetLaneIndex) ? targetLaneIndex : resolvedLaneIndex;
    const label = formatTimelineSnapLabel(state, labelLaneIndex);

    if (previousState && previousState.laneElement && previousState.laneElement !== resolvedLane) {
        if (previousState.laneElement.isConnected) {
            previousState.laneElement.classList.remove('timeline-lane--snap-target');
        }
    }

    if (previousState
        && previousState.targetTimeMs === targetTime
        && previousState.edge === (state.edge || '')
        && previousState.appliedLeft === appliedLeft
        && previousState.laneTop === laneTop
        && previousState.laneHeight === laneHeight
        && previousState.label === label
        && previousState.laneElement === resolvedLane) {
        return;
    }

    timelineSnapLine.style.transform = `translateX(${appliedLeft}px)`;
    timelineSnapLine.style.top = `${laneTop}px`;
    timelineSnapLine.style.height = `${laneHeight}px`;
    timelineSnapLine.classList.add('is-visible');

    if (state.edge) {
        timelineSnapLine.dataset.edge = state.edge;
    } else {
        timelineSnapLine.removeAttribute('data-edge');
    }

    if (state.targetType) {
        timelineSnapLine.dataset.source = state.targetType;
    } else {
        timelineSnapLine.removeAttribute('data-source');
    }

    if (timelineSnapLineLabel) {
        timelineSnapLineLabel.textContent = label;
        timelineSnapLineLabel.classList.toggle('has-text', Boolean(label));
    }

    if (resolvedLane && resolvedLane.isConnected) {
        resolvedLane.classList.add('timeline-lane--snap-target');
    }

    activeTimelineSnapState = {
        targetTimeMs: targetTime,
        edge: state.edge || '',
        appliedLeft,
        laneTop,
        laneHeight,
        label,
        laneElement: resolvedLane,
    };
}

function isMagnetEnabledForLaneIndex(laneIndex, lane = null, laneItems = null) {
    if (!isMainTrackMagnetEnabled) {
        return false;
    }
    const resolvedIndex = Number.isFinite(laneIndex) ? laneIndex : 0;
    const laneElement = lane && typeof lane === 'object' && 'classList' in lane
        ? lane
        : getTimelineLanes()[resolvedIndex] || null;

    if (laneElement?.classList?.contains('timeline-lane--audio')) {
        return false;
    }

    const items = Array.isArray(laneItems)
        ? laneItems
        : laneElement
            ? Array.from(laneElement.querySelectorAll('.timeline-item'))
            : [];

    const detectVideo = typeof isVideoTimelineItem === 'function'
        ? isVideoTimelineItem
        : ((item) => (item?.dataset?.fileType || '').startsWith('video/'));

    const detectImage = typeof isImageTimelineItem === 'function'
        ? isImageTimelineItem
        : ((item) => (item?.dataset?.fileType || '').startsWith('image/'));

    const hasVisualItems = items.some((item) => detectVideo(item) || detectImage(item));

    if (hasVisualItems) {
        return true;
    }

    return resolvedIndex === 0;
}

function getTimelineLaneLayout(lane, fallbackIndex = 0) {
    if (!lane) {
        return [];
    }

    const laneIndex = Number.isFinite(Number(lane?.dataset?.laneIndex))
        ? Number(lane.dataset.laneIndex)
        : fallbackIndex;

    const laneItems = Array.from(lane.querySelectorAll('.timeline-item'));

    const magnetActive = isMagnetEnabledForLaneIndex(laneIndex, lane, laneItems);

    if (!laneItems.length) {
        return [];
    }

    const orderedItems = laneItems
        .map((item, order) => ({
            item,
            order,
            laneIndex,
            preferredStart: parseTimelineItemOffsetMs(item),
            duration: Math.max(0, getTimelineItemPlaybackDuration(item)),
        }))
        .sort((a, b) => {
            const aStart = Number.isFinite(a.preferredStart)
                ? a.preferredStart
                : Number.POSITIVE_INFINITY;
            const bStart = Number.isFinite(b.preferredStart)
                ? b.preferredStart
                : Number.POSITIVE_INFINITY;
            if (aStart !== bStart) {
                return aStart - bStart;
            }
            return a.order - b.order;
        });

    let cursor = 0;

    return orderedItems.map((entry) => {
        const preferredStart = Number.isFinite(entry.preferredStart)
            ? Math.max(0, Math.round(entry.preferredStart))
            : null;
        const clampedCursor = Math.max(0, Math.round(cursor));
        const baseStart = preferredStart === null
            ? clampedCursor
            : magnetActive
                ? clampedCursor
                : Math.max(preferredStart, clampedCursor);
        const start = Math.max(0, baseStart);
        const end = start + entry.duration;
        const leadingGap = start - cursor;
        cursor = Math.max(cursor, end);
        return {
            item: entry.item,
            laneIndex: entry.laneIndex,
            start,
            end,
            duration: entry.duration,
            leadingGap,
        };
    });
}

function reflowTimelineLane(lane) {
    if (!lane) {
        return;
    }

    invalidateTimelineLaneEntriesCache();

    const fallbackIndex = Number.isFinite(Number(lane?.dataset?.laneIndex))
        ? Number(lane.dataset.laneIndex)
        : getTimelineLanes().indexOf(lane);

    const layout = getTimelineLaneLayout(lane, fallbackIndex);
    if (!layout.length) {
        return;
    }

    layout.forEach((entry, index) => {
        const { item, start, leadingGap } = entry;
        const sanitizedStart = Math.max(0, Math.round(start));
        item.dataset.startOffsetMs = String(sanitizedStart);
        item.dataset.laneIndex = lane.dataset.laneIndex || '0';
        applyTimelineItemLeadingGapStyles(item, leadingGap);
        const currentChild = lane.children[index] || null;
        if (currentChild !== item) {
            lane.insertBefore(item, currentChild);
        }
    });
}

function reflowAllTimelineLanes() {
    flushAllTimelineLaneReflows();
    getTimelineLanes().forEach((lane) => {
        reflowTimelineLane(lane);
    });
}

function setMainTrackMagnetEnabled(enable) {
    const next = Boolean(enable);
    const previous = isMainTrackMagnetEnabled;
    isMainTrackMagnetEnabled = next;

    if (timelineMagnetToggleButton) {
        timelineMagnetToggleButton.classList.toggle('is-active', next);
        timelineMagnetToggleButton.setAttribute('aria-pressed', String(next));
        const label = next ? 'Disable main track magnet' : 'Enable main track magnet';
        timelineMagnetToggleButton.setAttribute('aria-label', label);
        timelineMagnetToggleButton.title = label;
    }

    if (next === previous) {
        return isMainTrackMagnetEnabled;
    }

    const lanes = getTimelineLanes();
    const mainLane = lanes.length > 0 ? lanes[0] : null;
    if (mainLane) {
        reflowTimelineLane(mainLane);
    }

    updateActiveTimelineIndicators();
    return isMainTrackMagnetEnabled;
}

function toggleMainTrackMagnet() {
    return setMainTrackMagnetEnabled(!isMainTrackMagnetEnabled);
}

function ensureTimelineItemDurationBadge(timelineItem) {
    if (!timelineItem) {
        return null;
    }
    let badge = timelineItem.querySelector('.timeline-item-duration');
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'timeline-item-duration';
        badge.setAttribute('aria-hidden', 'true');
        timelineItem.appendChild(badge);
    }
    return badge;
}

function formatDurationBadgeLabel(durationMs) {
    const safeMs = Math.max(0, Math.round(Number(durationMs) || 0));
    if (safeMs >= 3600000) {
        let hours = Math.floor(safeMs / 3600000);
        let minutes = Math.round((safeMs % 3600000) / 60000);
        if (minutes === 60) {
            hours += 1;
            minutes = 0;
        }
        return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    }
    if (safeMs >= 60000) {
        const minutes = Math.floor(safeMs / 60000);
        let seconds = Math.round((safeMs % 60000) / 1000);
        if (seconds === 60) {
            return `${minutes + 1}m 00s`;
        }
        return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
    }
    if (safeMs >= 1000) {
        const seconds = safeMs / 1000;
        const decimals = seconds >= 10 ? 0 : 1;
        return `${seconds.toFixed(decimals)}s`;
    }
    return `${safeMs}ms`;
}

function updateTimelineItemDurationBadge(timelineItem, durationMs) {
    const badge = ensureTimelineItemDurationBadge(timelineItem);
    if (!badge) {
        return;
    }
    const safeMs = Math.max(0, Math.round(Number(durationMs) || 0));
    badge.dataset.duration = String(safeMs);
    badge.textContent = formatDurationBadgeLabel(safeMs);
}

function setTimelineItemDuration(timelineItem, durationKey, durationMs, options = {}) {
    if (!timelineItem || !durationKey) {
        return 0;
    }

    const { skipAnimationSync = false } = options;
    const previousDuration = Math.round(Number(timelineItem.dataset[durationKey]) || 0);
    const minimum = getTimelineItemMinimumDuration(timelineItem);
    const desired = Math.round(Number(durationMs) || 0);
    const applied = Math.max(minimum, desired);

    timelineItem.dataset[durationKey] = String(applied);

    if (Object.prototype.hasOwnProperty.call(options, 'markCustom')) {
        if (options.markCustom) {
            timelineItem.dataset.customDuration = '1';
        } else {
            delete timelineItem.dataset.customDuration;
        }
    }

    applyTimelineItemDurationStyles(timelineItem, applied);
    updateTimelineItemDurationBadge(timelineItem, applied);

    if (!skipAnimationSync) {
        synchronizeImageAnimationDurations(timelineItem, {
            source: 'clip',
            durationKey,
            appliedDuration: applied,
        });
    }

    const parentLane = timelineItem.closest('.timeline-lane');
    if (parentLane) {
        scheduleTimelineLaneReflow(parentLane);
    }

    if (applied !== previousDuration && timelineItem.isConnected) {
        markExportPlaybackContextDirty({ refreshSummary: true });
    }

    return applied;
}

function getTimelineItems() {
    return Array.from(timelineTrack.querySelectorAll('.timeline-item'));
}

let timelineLaneEntriesCache = null;

function invalidateTimelineLaneEntriesCache() {
    timelineLaneEntriesCache = null;
}

function createTimelineLaneEntryCache(entriesInput, { cloneEntries = true } = {}) {
    const entriesSource = Array.isArray(entriesInput) ? entriesInput : [];
    const entries = cloneEntries
        ? entriesSource.map((entry) => ({
            item: entry?.item || null,
            laneIndex: Number.isFinite(entry?.laneIndex) ? Number(entry.laneIndex) : 0,
            start: Number.isFinite(entry?.start) ? Number(entry.start) : 0,
            end: Number.isFinite(entry?.end) ? Number(entry.end) : 0,
            duration: Number.isFinite(entry?.duration) ? Number(entry.duration) : undefined,
            leadingGap: Number.isFinite(entry?.leadingGap) ? Number(entry.leadingGap) : undefined,
        }))
        : entriesSource;

    const byLaneIndex = new Map();
    const byItem = new Map();
    let totalDuration = 0;

    entries.forEach((entry) => {
        if (!entry) {
            return;
        }

        const laneIndex = Number.isFinite(entry.laneIndex) ? Number(entry.laneIndex) : 0;
        entry.laneIndex = laneIndex;

        const start = Number.isFinite(entry.start) ? Number(entry.start) : 0;
        const end = Number.isFinite(entry.end) ? Number(entry.end) : 0;
        entry.start = start;
        entry.end = end;

        if (!Number.isFinite(entry.duration)) {
            const computedDuration = end - start;
            entry.duration = Number.isFinite(computedDuration) ? computedDuration : undefined;
        }

        totalDuration = Number.isFinite(end) ? Math.max(totalDuration, end) : totalDuration;

        if (!byLaneIndex.has(laneIndex)) {
            byLaneIndex.set(laneIndex, []);
        }
        byLaneIndex.get(laneIndex).push(entry);

        if (entry.item) {
            byItem.set(entry.item, entry);
        }
    });

    return {
        entries,
        byLaneIndex,
        byItem,
        totalDuration,
    };
}

function buildTimelineLaneEntryCache() {
    const lanes = getTimelineLanes();
    const entries = [];

    lanes.forEach((lane, index) => {
        const layout = getTimelineLaneLayout(lane, index);
        layout.forEach((entry) => {
            entries.push({
                item: entry?.item || null,
                laneIndex: Number.isFinite(entry?.laneIndex) ? entry.laneIndex : index,
                start: Number.isFinite(entry?.start) ? Number(entry.start) : 0,
                end: Number.isFinite(entry?.end) ? Number(entry.end) : 0,
                duration: Number.isFinite(entry?.duration) ? Number(entry.duration) : undefined,
                leadingGap: Number.isFinite(entry?.leadingGap) ? Number(entry.leadingGap) : undefined,
            });
        });
    });

    return createTimelineLaneEntryCache(entries, { cloneEntries: false });
}

function getTimelineLaneEntryCache({ laneCache = null, useCache = true } = {}) {
    if (laneCache) {
        if (Array.isArray(laneCache.entries)
            && laneCache.byItem instanceof Map
            && laneCache.byLaneIndex instanceof Map
        ) {
            return laneCache;
        }

        if (Array.isArray(laneCache)) {
            return createTimelineLaneEntryCache(laneCache);
        }
    }

    if (!useCache) {
        timelineLaneEntriesCache = buildTimelineLaneEntryCache();
        return timelineLaneEntriesCache;
    }

    if (!timelineLaneEntriesCache) {
        timelineLaneEntriesCache = buildTimelineLaneEntryCache();
    }

    return timelineLaneEntriesCache;
}

function resolveTimelineLaneEntryCache(laneCacheOrEntries = null) {
    return getTimelineLaneEntryCache({ laneCache: laneCacheOrEntries });
}

function getTimelineLaneEntries(options = {}) {
    return getTimelineLaneEntryCache(options).entries;
}

function getTimelinePlaybackSegments(laneCacheOverride = null) {
    const laneCache = resolveTimelineLaneEntryCache(laneCacheOverride);
    const { entries, totalDuration } = laneCache;

    if (!entries.length || !Number.isFinite(totalDuration) || totalDuration <= 0) {
        return {
            segments: [],
            totalDuration: Number.isFinite(totalDuration) ? totalDuration : 0,
            entries,
            laneCache,
        };
    }

    const changePoints = new Set([0, totalDuration]);
    entries.forEach((entry) => {
        changePoints.add(entry.start);
        changePoints.add(entry.end);
    });

    const sortedPoints = Array.from(changePoints)
        .filter((point) => Number.isFinite(point))
        .sort((a, b) => a - b);

    const segments = [];

    for (let index = 0; index < sortedPoints.length - 1; index += 1) {
        const start = sortedPoints[index];
        const end = sortedPoints[index + 1];
        if (end <= start) {
            continue;
        }
        const activeEntries = entries.filter(
            (entry) => start >= entry.start && start < entry.end,
        );

        const orderedEntries = activeEntries
            .slice()
            .sort((a, b) => {
                const aIndex = Number.isFinite(a?.laneIndex) ? a.laneIndex : Number.POSITIVE_INFINITY;
                const bIndex = Number.isFinite(b?.laneIndex) ? b.laneIndex : Number.POSITIVE_INFINITY;
                return aIndex - bIndex;
            });

        const isAudioEntry = (entry) => {
            if (!entry?.item) {
                return false;
            }
            const detector = (typeof isAudioTimelineItem === 'function')
                ? isAudioTimelineItem
                : ((item) => (item?.dataset?.fileType || '').startsWith('audio/'));
            return detector(entry.item);
        };

        const visualEntries = orderedEntries.filter((entry) => !isAudioEntry(entry));

        const activeEntrySource = visualEntries.length ? visualEntries : orderedEntries;
        const activeEntry = activeEntrySource
            .slice()
            .reverse()
            .find((entry) => Number.isFinite(entry?.laneIndex))
            || activeEntrySource[activeEntrySource.length - 1]
            || null;

        segments.push({
            start,
            end,
            duration: end - start,
            item: activeEntry ? activeEntry.item : null,
            items: orderedEntries,
        });
    }

    return {
        segments,
        totalDuration,
        entries,
        laneCache,
    };
}

function getTotalTimelineDuration(laneCacheOrEntries = null) {
    const laneCache = resolveTimelineLaneEntryCache(laneCacheOrEntries);
    return Number.isFinite(laneCache.totalDuration) ? laneCache.totalDuration : 0;
}

function getTimelineItemStartTime(timelineItem, laneCacheOrEntries = null) {
    if (!timelineItem) {
        return 0;
    }
    const laneCache = resolveTimelineLaneEntryCache(laneCacheOrEntries);
    const entry = laneCache.byItem.get(timelineItem) || null;
    return entry && Number.isFinite(entry.start) ? entry.start : 0;
}

function getTimelineFractionForTime(timeMs, laneCacheOrEntries = null) {
    const total = getTotalTimelineDuration(laneCacheOrEntries);
    if (!total) {
        return 0;
    }
    return clampProgress(Math.max(0, timeMs) / total);
}

function seekTimelineToFraction(fraction) {
    const { segments, totalDuration } = getTimelinePlaybackSegments();
    const clampedFraction = clampProgress(Number.isFinite(fraction) ? fraction : 0);
    const shouldRefreshSummary = exportSummaryLastRenderedVersion
        !== exportPlaybackContextMutationVersion;

    if (!segments.length || totalDuration <= 0) {
        setActiveTimelineItem(null);
        loadPreviewFromTimeline(null);
        resetTimelineProgressLine(0);
        updatePlaybackTimeDisplay(0, totalDuration);
        if (shouldRefreshSummary) {
            renderExportSummary(getTimelineItems(), null);
        }
        return;
    }

    const targetTime = clampedFraction * totalDuration;
    const safeTarget = Math.min(
        Math.max(targetTime, 0),
        Math.max(totalDuration - 1, 0),
    );

    let activeSegment = null;
    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        const isLastSegment = index === segments.length - 1;
        if (safeTarget >= segment.start && (safeTarget < segment.end || isLastSegment)) {
            activeSegment = segment;
            break;
        }
    }

    const activeItem = activeSegment ? activeSegment.item : null;
    const clipStart = activeSegment ? activeSegment.start : 0;
    const clipDuration = activeItem ? Math.max(0, getTimelineItemPlaybackDuration(activeItem)) : 0;
    const clipProgress = clipDuration > 0
        ? clampProgress((safeTarget - clipStart) / clipDuration)
        : 0;

    setActiveTimelineItem(activeItem, { clipProgress });
    loadPreviewFromTimeline(activeItem, activeSegment?.items || null);
    setActiveClipProgress(clipProgress, { source: 'seek', updatePreview: false });

    const safeFraction = totalDuration > 0 ? safeTarget / totalDuration : 0;
    resetTimelineProgressLine(safeFraction);
    updatePlaybackTimeDisplay(safeTarget, totalDuration);
    if (shouldRefreshSummary) {
        renderExportSummary(getTimelineItems(), null);
    }
}

function scrollTimelineItemIntoView(timelineItem) {
    if (!timelineItem) {
        return;
    }
    timelineItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function getTimelineLanes() {
    if (!timelineLaneList) {
        return [];
    }
    return Array.from(timelineLaneList.querySelectorAll('.timeline-lane'));
}

function refreshTimelineLaneIndices() {
    getTimelineLanes().forEach((lane, index) => {
        const laneIndex = String(index);
        const layerLabel = `Layer ${index + 1}`;
        lane.dataset.laneIndex = laneIndex;
        lane.dataset.layerLabel = layerLabel;
        lane.setAttribute('aria-label', layerLabel);
        lane.querySelectorAll('.timeline-item').forEach((item) => {
            item.dataset.laneIndex = laneIndex;
        });
    });

    invalidateTimelineLaneEntriesCache();
}

function createTimelineLaneElement() {
    const lane = document.createElement('div');
    lane.className = 'timeline-lane';
    return lane;
}

function insertTimelineLaneAt(index) {
    if (!timelineLaneList) {
        return null;
    }

    const lanes = getTimelineLanes();
    if (!lanes.length) {
        return ensureTimelineLane(0);
    }

    if (lanes.length >= MAX_TIMELINE_STACK_LANES) {
        const boundedIndex = Math.max(0, Math.min(index, lanes.length - 1));
        return lanes[boundedIndex] || lanes[lanes.length - 1] || null;
    }

    const insertionIndex = Math.max(0, Math.min(index, lanes.length));
    const lane = createTimelineLaneElement();
    const referenceLane = lanes[insertionIndex] || null;
    if (referenceLane) {
        timelineLaneList.insertBefore(lane, referenceLane);
    } else {
        timelineLaneList.appendChild(lane);
    }

    refreshTimelineLaneIndices();
    const updatedLanes = getTimelineLanes();
    return updatedLanes[insertionIndex] || updatedLanes[updatedLanes.length - 1] || lane;
}

function ensureTimelineLane(index = 0) {
    if (!timelineLaneList) {
        return null;
    }

    const clampedIndex = Math.max(
        0,
        Math.min(index, Math.max(0, MAX_TIMELINE_STACK_LANES - 1)),
    );

    let lanes = getTimelineLanes();
    while (lanes.length <= clampedIndex && lanes.length < MAX_TIMELINE_STACK_LANES) {
        timelineLaneList.appendChild(createTimelineLaneElement());
        lanes = getTimelineLanes();
    }

    refreshTimelineLaneIndices();
    const updatedLanes = getTimelineLanes();
    return (
        updatedLanes[clampedIndex] ||
        updatedLanes[updatedLanes.length - 1] ||
        null
    );
}

function cleanupEmptyTimelineLanes() {
    if (!timelineLaneList) {
        return;
    }

    const lanes = getTimelineLanes();
    lanes.forEach((lane) => {
        if (lane && !lane.querySelector('.timeline-item') && lanes.length > 1) {
            if (pendingTimelineLaneReflows.has(lane)) {
                const handle = pendingTimelineLaneReflows.get(lane);
                if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
                    window.cancelAnimationFrame(handle);
                }
                pendingTimelineLaneReflows.delete(lane);
            }
            lane.remove();
        }
    });
    refreshTimelineLaneIndices();
    updateTimelineEmptyState();
}

function updateTimelineEmptyState() {
    if (!timelineEmptyState || !timelineTrack) {        return;
    }
    const hasItems = Boolean(timelineTrack.querySelector('.timeline-item'));
    timelineEmptyState.hidden = hasItems;
    if (hasItems) {
        timelineTrack.classList.remove('timeline-track--empty');
    } else {
        timelineTrack.classList.add('timeline-track--empty');
    }
}

function setActiveDropLane(nextLane) {
    if (activeDropLane === nextLane) {
        return;
    }
    if (activeDropLane) {
        activeDropLane.classList.remove('is-drop-target');
    }
    activeDropLane = nextLane || null;
    if (activeDropLane) {
        activeDropLane.classList.add('is-drop-target');
    }
}

function getTimelineLaneFromEvent(event) {
    const lanes = getTimelineLanes();
    if (!lanes.length) {
        return ensureTimelineLane(0);
    }

    const pointerY = event.clientY;
    let closestLane = lanes[0] || null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < lanes.length; index += 1) {
        const lane = lanes[index];
        const rect = lane.getBoundingClientRect();
        if (!rect) {
            continue;
        }

        const { top, bottom, height } = rect;
        const center = top + height / 2;
        const hotzone = Math.min(TIMELINE_LANE_INSERT_HOTZONE, height / 2);

        if (pointerY >= top && pointerY <= bottom) {
            if (pointerY <= top + hotzone) {
                const targetLane = insertTimelineLaneAt(index);
                return targetLane || lane;
            }
            if (pointerY >= bottom - hotzone) {
                const targetLane = insertTimelineLaneAt(index + 1);
                return targetLane || lane;
            }
            return lane;
        }

        const distance = Math.abs(pointerY - center);
        if (distance < closestDistance) {
            closestLane = lane;
            closestDistance = distance;
        }
    }

    const firstLane = lanes[0];
    if (firstLane) {
        const rect = firstLane.getBoundingClientRect();
        if (rect && pointerY < rect.top - TIMELINE_LANE_INSERT_SPACING) {
            const targetLane = insertTimelineLaneAt(0);
            if (targetLane) {
                return targetLane;
            }
        }
    }

    const lastLane = lanes[lanes.length - 1];
    if (lastLane) {
        const rect = lastLane.getBoundingClientRect();
        if (rect && pointerY > rect.bottom + TIMELINE_LANE_INSERT_SPACING) {
            return ensureTimelineLane(lanes.length);
        }
    }

    return closestLane || ensureTimelineLane(0);
}

function updateActiveTimelineIndicators() {
    applyTimelineProgressGeometry();

    const laneCache = (typeof getTimelineLaneEntryCache === 'function')
        ? getTimelineLaneEntryCache()
        : null;
    const totalDuration = getTotalTimelineDuration(laneCache);

    if (isTimelinePlaying) {
        updatePlaybackTimeDisplay(playbackDisplayCurrentMs, totalDuration);
        return;
    }

    if (activeTimelineItem) {
        const startTime = getTimelineItemStartTime(activeTimelineItem, laneCache);
        const clipDuration = Math.max(0, getTimelineItemPlaybackDuration(activeTimelineItem));
        const clipProgress = getActiveClipProgress();
        const currentTime = startTime + (clipDuration * clipProgress);
        const fraction = totalDuration > 0 ? clampProgress(currentTime / totalDuration) : 0;
        resetTimelineProgressLine(fraction);
        updatePlaybackTimeDisplay(currentTime, totalDuration);
    } else {
        resetTimelineProgressLine();
        updatePlaybackTimeDisplay(0, totalDuration);
    }

    if (!isTimelinePlaying) {
        refreshActiveOverlayLayers();
    }
}

function getTimelineItemDurationKey(timelineItem) {
    if (!timelineItem) {
        return null;
    }
    const fileType = timelineItem.dataset.fileType || '';
    if (fileType.startsWith('image/')) {
        return 'imageDuration';
    }
    if (fileType.startsWith('video/')) {
        return 'videoDuration';
    }
    if (fileType.startsWith('audio/')) {
        return 'audioDuration';
    }
    return null;
}

function getTimelineItemMinimumDuration(timelineItem) {
    if (!timelineItem) {
        return MIN_IMAGE_DURATION;
    }
    const fileType = timelineItem.dataset.fileType || '';
    if (fileType.startsWith('video/')) {
        const minimum = Number(timelineItem.dataset.minVideoDuration);
        if (Number.isFinite(minimum) && minimum > 0) {
            return minimum;
        }
    }
    if (fileType.startsWith('audio/')) {
        return MIN_AUDIO_DURATION;
    }
    return MIN_IMAGE_DURATION;
}

function getTimelineItemMaximumDuration(timelineItem) {
    if (!timelineItem) {
        return null;
    }

    const fileType = timelineItem.dataset.fileType || '';
    if (!fileType.startsWith('audio/')) {
        return null;
    }

    const maximum = Number(timelineItem.dataset.maxAudioDuration);
    if (Number.isFinite(maximum) && maximum > 0) {
        return maximum;
    }

    return null;
}

function getTimelineItemResizeEdgeFromEvent(event, timelineItem) {
    if (!timelineItem) {
        return null;
    }

    const rect = timelineItem.getBoundingClientRect();
    if (!rect || !Number.isFinite(rect.width) || rect.width <= 0) {
        return null;
    }

    const threshold = Math.min(Math.max(rect.width * 0.25, 10), 22);
    const offsetX = event.clientX - rect.left;
    if (!Number.isFinite(offsetX)) {
        return null;
    }

    if (offsetX <= threshold) {
        return 'left';
    }

    if (offsetX >= rect.width - threshold) {
        return 'right';
    }

    return null;
}

function scheduleTimelineLaneReflow(lane) {
    if (!lane) {
        return;
    }

    if (typeof invalidateTimelineLaneEntriesCache === 'function') {
        invalidateTimelineLaneEntriesCache();
    }

    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
        reflowTimelineLane(lane);
        return;
    }

    if (pendingTimelineLaneReflows.has(lane)) {
        return;
    }

    const handle = window.requestAnimationFrame(() => {
        pendingTimelineLaneReflows.delete(lane);
        if (!lane.isConnected) {
            return;
        }
        reflowTimelineLane(lane);
    });
    pendingTimelineLaneReflows.set(lane, handle);
}

function flushTimelineLaneReflow(lane) {
    if (!lane) {
        return;
    }

    if (typeof invalidateTimelineLaneEntriesCache === 'function') {
        invalidateTimelineLaneEntriesCache();
    }

    if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        const handle = pendingTimelineLaneReflows.get(lane);
        if (handle !== undefined) {
            window.cancelAnimationFrame(handle);
            pendingTimelineLaneReflows.delete(lane);
        }
    } else {
        pendingTimelineLaneReflows.delete(lane);
    }

    if (!lane.isConnected) {
        return;
    }

    reflowTimelineLane(lane);
}

function flushAllTimelineLaneReflows() {
    if (typeof invalidateTimelineLaneEntriesCache === 'function') {
        invalidateTimelineLaneEntriesCache();
    }

    const entries = Array.from(pendingTimelineLaneReflows.entries());
    pendingTimelineLaneReflows.clear();

    entries.forEach(([lane, handle]) => {
        if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
            window.cancelAnimationFrame(handle);
        }
        if (lane?.isConnected) {
            reflowTimelineLane(lane);
        }
    });
}

function startTimelineItemResize(event, timelineItem, resizeEdgeOverride = null) {
    if (!timelineItem) {
        return;
    }

    const durationKey = getTimelineItemDurationKey(timelineItem);
    if (!durationKey) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    stopTimelinePlayback();
    setActiveTimelineItem(timelineItem);

    const handle = event.currentTarget;
    const resizeEdge = resizeEdgeOverride
        || handle?.dataset?.resizeEdge
        || getTimelineItemResizeEdgeFromEvent(event, timelineItem)
        || 'right';
    const isLeftResize = resizeEdge === 'left';

    const initialRect = timelineItem.getBoundingClientRect();
    const initialWidth = initialRect.width;
    const startX = event.clientX;
    const previousDraggable = timelineItem.draggable;
    const initialScrollLeft = timelineTrack ? timelineTrack.scrollLeft : 0;

    timelineItem.classList.add('is-resizing');
    timelineItem.draggable = false;
    timelineItem.dataset.resizeCursor = resizeEdge;
    activeTimelineResizeItem = timelineItem;
    setTimelineSnapLineState(null);

    const captureTarget = handle instanceof HTMLElement && handle !== timelineItem
        ? handle
        : timelineItem;
    captureTarget?.setPointerCapture?.(event.pointerId);

    let pendingDeltaX = 0;
    let resizeAnimationFrame = null;
    let resizeUpdateQueued = false;

    const applyResize = () => {
        resizeUpdateQueued = false;
        const tentativeWidth = Math.max(MIN_TIMELINE_ITEM_WIDTH, initialWidth + pendingDeltaX);
        let nextDuration = widthToDuration(tentativeWidth);
        const previousDuration = Number(timelineItem.dataset[durationKey]);
        const parentLane = timelineItem.closest('.timeline-lane');
        const startOffsetMs = Number(timelineItem.dataset.startOffsetMs);

        let snap = null;
        if (!isLeftResize) {
            snap = resolveTimelineSnapForResize({
                timelineItem,
                startMs: Number.isFinite(startOffsetMs) ? startOffsetMs : 0,
                desiredDuration: nextDuration,
                edge: 'end',
                excludeItem: timelineItem,
            });
        }

        if (snap) {
            nextDuration = Math.max(0, snap.durationMs);
            setTimelineSnapLineState({ ...snap, lane: parentLane });
        } else {
            setTimelineSnapLineState(null);
        }

        const maximumDuration = getTimelineItemMaximumDuration(timelineItem);
        const clampedByMaximum = Number.isFinite(maximumDuration)
            && maximumDuration > 0
            && nextDuration > maximumDuration;

        if (clampedByMaximum) {
            nextDuration = maximumDuration;
            if (snap) {
                setTimelineSnapLineState(null);
                snap = null;
            }
        }

        if (Number.isFinite(previousDuration) && previousDuration === nextDuration) {
            return;
        }

        setTimelineItemDuration(timelineItem, durationKey, nextDuration, { markCustom: true });

        if (snap && snap.edge === 'start' && Number.isFinite(snap.startMs)) {
            timelineItem.dataset.startOffsetMs = String(Math.max(0, Math.round(snap.startMs)));
        }

        updateActiveTimelineIndicators();
    };

    const scheduleResizeUpdate = () => {
        resizeUpdateQueued = true;
        if (resizeAnimationFrame !== null) {
            return;
        }
        resizeAnimationFrame = window.requestAnimationFrame(() => {
            resizeAnimationFrame = null;
            if (resizeUpdateQueued) {
                applyResize();
            }
        });
    };

    const flushResizeUpdate = () => {
        if (resizeAnimationFrame !== null) {
            window.cancelAnimationFrame(resizeAnimationFrame);
            resizeAnimationFrame = null;
        }
        if (resizeUpdateQueued) {
            applyResize();
        }
    };

    const onPointerMove = (moveEvent) => {
        maybeAutoScrollTimelineTrack(moveEvent.clientX);

        const currentScrollLeft = timelineTrack ? timelineTrack.scrollLeft : initialScrollLeft;
        const scrollDelta = currentScrollLeft - initialScrollLeft;
        const rawDeltaX = moveEvent.clientX - startX + scrollDelta;
        pendingDeltaX = isLeftResize ? -rawDeltaX : rawDeltaX;
        scheduleResizeUpdate();
    };

    const finishResize = () => {
        flushResizeUpdate();
        captureTarget?.releasePointerCapture?.(event.pointerId);
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', finishResize);
        document.removeEventListener('pointercancel', finishResize);
        timelineItem.classList.remove('is-resizing');
        timelineItem.draggable = previousDraggable;
        delete timelineItem.dataset.resizeCursor;
        updateActiveTimelineIndicators();
        setTimelineSnapLineState(null);
        const parentLane = timelineItem.closest('.timeline-lane');
        if (parentLane) {
            flushTimelineLaneReflow(parentLane);
        }
        if (activeTimelineResizeItem === timelineItem) {
            activeTimelineResizeItem = null;
        }
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', finishResize);
    document.addEventListener('pointercancel', finishResize);
}

function attachResizeHandles(timelineItem) {
    if (!timelineItem || timelineItem.dataset.resizeHandlesAttached === '1') {
        return;
    }

    timelineItem.dataset.resizeHandlesAttached = '1';

    ['left', 'right'].forEach((position) => {
        const handle = document.createElement('span');
        handle.className = `timeline-resize-handle ${position}`;
        handle.setAttribute('aria-hidden', 'true');
        handle.dataset.resizeEdge = position;
        handle.title = 'Drag side to adjust clip duration';
        handle.addEventListener('pointerdown', (event) => {
            if (activeTimelineResizeItem && activeTimelineResizeItem !== timelineItem) {
                return;
            }
            startTimelineItemResize(event, timelineItem, position);
        });
        timelineItem.appendChild(handle);
    });
}

function enableTimelineItemEdgeResizing(timelineItem) {
    if (!timelineItem || timelineItem.dataset.edgeResizeInitialized === '1') {
        return;
    }

    timelineItem.dataset.edgeResizeInitialized = '1';

    const clearCursor = () => {
        if (!timelineItem.classList.contains('is-resizing')) {
            delete timelineItem.dataset.resizeCursor;
        }
    };

    timelineItem.addEventListener('pointermove', (event) => {
        if (timelineItem.classList.contains('is-resizing')) {
            return;
        }
        if (activeTimelineResizeItem && activeTimelineResizeItem !== timelineItem) {
            return;
        }
        const edge = getTimelineItemResizeEdgeFromEvent(event, timelineItem);
        if (edge) {
            timelineItem.dataset.resizeCursor = edge;
        } else {
            delete timelineItem.dataset.resizeCursor;
        }
    });

    timelineItem.addEventListener('pointerleave', () => {
        if (activeTimelineResizeItem && activeTimelineResizeItem !== timelineItem) {
            return;
        }
        clearCursor();
    });

    timelineItem.addEventListener('pointerdown', (event) => {
        if (event.button && event.button !== 0) {
            return;
        }
        if (activeTimelineResizeItem && activeTimelineResizeItem !== timelineItem) {
            return;
        }
        const edge = getTimelineItemResizeEdgeFromEvent(event, timelineItem);
        if (!edge) {
            return;
        }
        startTimelineItemResize(event, timelineItem, edge);
    });
}

function createTimelineDragPreviewElement(timelineItem) {
    if (!timelineItem || !document?.body) {
        return null;
    }

    if (timelineDragPreviewElements.has(timelineItem)) {
        const existing = timelineDragPreviewElements.get(timelineItem);
        if (existing?.isConnected) {
            return existing;
        }
        timelineDragPreviewElements.delete(timelineItem);
    }

    const clone = timelineItem.cloneNode(true);
    clone.classList.add('timeline-item--drag-preview');
    const computed = window.getComputedStyle(timelineItem);
    clone.style.width = computed.width;
    clone.style.height = computed.height;
    clone.style.position = 'fixed';
    clone.style.top = '-9999px';
    clone.style.left = '-9999px';
    clone.style.margin = '0';
    clone.style.pointerEvents = 'none';
    clone.style.transform = 'none';
    clone.style.transition = 'none';
    document.body.appendChild(clone);
    timelineDragPreviewElements.set(timelineItem, clone);
    return clone;
}

function cleanupTimelineDragPreviewElement(timelineItem) {
    if (!timelineItem) {
        return;
    }
    const preview = timelineDragPreviewElements.get(timelineItem);
    if (preview) {
        preview.remove();
        timelineDragPreviewElements.delete(timelineItem);
    }
}

function enableTimelineItemDragging(timelineItem) {
    if (!timelineItem || timelineItem.dataset.draggingInitialized === '1') {
        return;
    }
    timelineItem.dataset.draggingInitialized = '1';
    timelineItem.setAttribute('draggable', 'true');

    const clearPointerOffset = () => {
        timelineDragPointerOffsets.delete(timelineItem);
    };

    timelineItem.addEventListener('pointerdown', (event) => {
        if ((event.button && event.button !== 0) || event.pointerType === 'touch') {
            clearPointerOffset();
            return;
        }

        if (event.target && event.target.closest('.timeline-item-remove')) {
            clearPointerOffset();
            return;
        }

        if (getTimelineItemResizeEdgeFromEvent(event, timelineItem)) {
            clearPointerOffset();
            return;
        }

        const rect = timelineItem.getBoundingClientRect();
        if (!rect) {
            clearPointerOffset();
            return;
        }

        const offsetX = clamp(event.clientX - rect.left, 0, rect.width || 0);
        const offsetY = clamp(event.clientY - rect.top, 0, rect.height || 0);
        timelineDragPointerOffsets.set(timelineItem, { x: offsetX, y: offsetY });
    });

    timelineItem.addEventListener('pointerup', clearPointerOffset);
    timelineItem.addEventListener('pointercancel', clearPointerOffset);

    timelineItem.addEventListener('dragstart', (event) => {
        stopTimelinePlayback();
        activeTimelineDragItem = timelineItem;
        timelineItem.classList.add('dragging');
        const transfer = event.dataTransfer;
        if (transfer) {
            transfer.effectAllowed = 'move';
            transfer.setData('text/plain', timelineItem.dataset.objectUrl || 'timeline-item');
            const preview = createTimelineDragPreviewElement(timelineItem);
            if (preview) {
                const rect = timelineItem.getBoundingClientRect();
                const pointerOffset = timelineDragPointerOffsets.get(timelineItem);
                const fallbackX = rect ? rect.width / 2 : 0;
                const fallbackY = rect ? rect.height / 2 : 0;
                const offsetX = Number.isFinite(pointerOffset?.x)
                    ? pointerOffset.x
                    : clamp(event.clientX - (rect?.left || 0), 0, rect?.width || fallbackX);
                const offsetY = Number.isFinite(pointerOffset?.y)
                    ? pointerOffset.y
                    : clamp(event.clientY - (rect?.top || 0), 0, rect?.height || fallbackY);
                transfer.setDragImage(
                    preview,
                    Number.isFinite(offsetX) ? offsetX : fallbackX,
                    Number.isFinite(offsetY) ? offsetY : fallbackY,
                );
            }
        }
    });

    timelineItem.addEventListener('dragend', () => {
        timelineItem.classList.remove('dragging');
        timelineItem.draggable = true;
        clearPointerOffset();
        setTimelineSnapLineState(null);
        if (activeTimelineDragItem !== timelineItem) {
            return;
        }
        activeTimelineDragItem = null;
        setActiveDropLane(null);
        cleanupEmptyTimelineLanes();
        const parentLane = timelineItem.closest('.timeline-lane');
        if (parentLane) {
            flushTimelineLaneReflow(parentLane);
        }
        reflowAllTimelineLanes();
        updateTimelineEmptyState();
        updateActiveTimelineIndicators();
        cleanupTimelineDragPreviewElement(timelineItem);
    });
}

function initializeTimelineItem(timelineItem) {
    if (!timelineItem) {
        return;
    }
    const durationKey = getTimelineItemDurationKey(timelineItem);
    if (durationKey) {
        const duration = getTimelineItemPlaybackDuration(timelineItem);
        updateTimelineItemDurationBadge(timelineItem, duration);
    }
    enableTimelineItemDragging(timelineItem);
    const fileType = timelineItem.dataset.fileType || '';
    if (fileType.startsWith('audio/')) {
        if (typeof detachTimelineItemVolumeControl === 'function') {
            detachTimelineItemVolumeControl(timelineItem);
        }
    }
    if (fileType.startsWith('video/')) {
        ensureTimelineAudioDefaults(timelineItem);
        if (typeof attachTimelineItemVolumeControl === 'function') {
            attachTimelineItemVolumeControl(timelineItem);
        }
    } else if (fileType.startsWith('audio/')) {
        ensureTimelineAudioDefaults(timelineItem);
    }
    if (fileType.startsWith('image/') || fileType.startsWith('video/') || fileType.startsWith('audio/')) {
        attachResizeHandles(timelineItem);
        enableTimelineItemEdgeResizing(timelineItem);
    }

    const parentLane = timelineItem.closest('.timeline-lane');
    if (parentLane) {
        flushTimelineLaneReflow(parentLane);
    }
}

if (timelineTrack) {
    timelineTrack.addEventListener('dragenter', (event) => {
        if (activeTimelineDragItem && activeTimelineDragItem.isConnected) {
            event.preventDefault();
        }
    });

    timelineTrack.addEventListener('dragover', (event) => {
        const draggingItem = (activeTimelineDragItem && activeTimelineDragItem.isConnected)
            ? activeTimelineDragItem
            : null;
        if (!draggingItem) {
            timelineDragOverState.lane = null;
            timelineDragOverState.item = null;
            setTimelineSnapLineState(null);
            return;
        }
        event.preventDefault();
        const lane = getTimelineLaneFromEvent(event);
        if (!lane) {
            timelineDragOverState.lane = null;
            timelineDragOverState.item = null;
            setTimelineSnapLineState(null);
            return;
        }
        setActiveDropLane(lane);
        if (draggingItem.parentElement !== lane) {
            lane.appendChild(draggingItem);
        }
        timelineDragOverState.lane = lane;
        timelineDragOverState.item = draggingItem;
        timelineDragOverState.clientX = event.clientX;
        scheduleTimelineDragOverUpdate();
    });

    timelineTrack.addEventListener('drop', (event) => {
        event.preventDefault();
        flushTimelineDragOverUpdate();
        timelineDragOverState.lane = null;
        timelineDragOverState.item = null;
        timelineDragOverState.clientX = 0;
        setTimelineSnapLineState(null);
        const draggingItem = (activeTimelineDragItem && activeTimelineDragItem.isConnected)
            ? activeTimelineDragItem
            : null;
        if (draggingItem) {
            draggingItem.classList.remove('dragging');
            draggingItem.draggable = true;
            cleanupTimelineDragPreviewElement(draggingItem);
            const parentLane = draggingItem.closest('.timeline-lane');
            if (parentLane) {
                flushTimelineLaneReflow(parentLane);
            }
        }
        setActiveDropLane(null);
        cleanupEmptyTimelineLanes();
        reflowAllTimelineLanes();
        updateTimelineEmptyState();
        updateActiveTimelineIndicators();
        if (draggingItem) {
            markExportPlaybackContextDirty({ refreshSummary: true });
        }
        activeTimelineDragItem = null;
    });
}

ensureTimelineLane(0);
updateTimelineEmptyState();
reflowAllTimelineLanes();

if (window.ResizeObserver) {
    if (previewArea && !previewAreaResizeObserver) {
        previewAreaResizeObserver = new ResizeObserver(() => {
            schedulePreviewViewportSizeUpdate();
        });
        previewAreaResizeObserver.observe(previewArea);
    }
    if (timelineTrack && !timelineTrackResizeObserver) {
        timelineTrackResizeObserver = new ResizeObserver(() => {
            scheduleTimelineIndicatorUpdate();
        });
        timelineTrackResizeObserver.observe(timelineTrack);
    }
}

window.addEventListener('resize', () => {
    schedulePreviewViewportSizeUpdate();
    scheduleTimelineIndicatorUpdate();
});

function setPreviewMode(mode) {
    if (!previewArea) {
        return;
    }
    previewArea.classList.remove('has-video', 'has-image');
    if (mode) {
        previewArea.classList.add(mode);
    }
}

function resetPreviewScroll() {
    if (!previewArea) {
        return;
    }
    previewArea.scrollTop = 0;
    previewArea.scrollLeft = 0;
}

function parseAspectRatio(value) {
    const [rawWidth, rawHeight] = String(value).split(':');
    const width = Number(rawWidth);
    const height = Number(rawHeight);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        return width / height;
    }
    return 16 / 9;
}

function updatePreviewViewportSize() {
    if (!previewArea || !previewViewport) {
        return;
    }

    const computedStyle = window.getComputedStyle(previewArea);
    const paddingLeft = Number.parseFloat(computedStyle.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(computedStyle.paddingRight) || 0;
    const paddingTop = Number.parseFloat(computedStyle.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(computedStyle.paddingBottom) || 0;

    const availableWidth = Math.max(0, previewArea.clientWidth - paddingLeft - paddingRight);
    const availableHeight = Math.max(0, previewArea.clientHeight - paddingTop - paddingBottom);

    if (availableWidth <= 0 || availableHeight <= 0) {
        previewViewport.style.removeProperty('width');
        previewViewport.style.removeProperty('height');
        handlePreviewViewportResized();
        return;
    }

    const aspectRatio = currentPreviewAspectRatio > 0 ? currentPreviewAspectRatio : 16 / 9;
    let nextWidth = availableWidth;
    let nextHeight = nextWidth / aspectRatio;

    if (nextHeight > availableHeight) {
        nextHeight = availableHeight;
        nextWidth = nextHeight * aspectRatio;
    }

    previewViewport.style.width = `${nextWidth}px`;
    previewViewport.style.height = `${nextHeight}px`;
    handlePreviewViewportResized();
}

function schedulePreviewViewportSizeUpdate() {
    if (previewViewportResizeFrame !== null) {
        return;
    }
    previewViewportResizeFrame = window.requestAnimationFrame(() => {
        previewViewportResizeFrame = null;
        updatePreviewViewportSize();
    });
}

function getPreviewViewportSize() {
    if (!previewViewport) {
        return { width: 0, height: 0 };
    }
    return {
        width: Math.max(0, previewViewport.clientWidth),
        height: Math.max(0, previewViewport.clientHeight),
    };
}

function evaluatePreviewImageAlignment(transform, viewportSize, tolerance = PREVIEW_ALIGNMENT_TOLERANCE) {
    if (!transform || !viewportSize) {
        return {
            left: false,
            right: false,
            top: false,
            bottom: false,
        };
    }

    const { width: viewportWidth, height: viewportHeight } = viewportSize;

    if (viewportWidth <= 0 || viewportHeight <= 0) {
        return {
            left: false,
            right: false,
            top: false,
            bottom: false,
        };
    }

    const safeTolerance = Number.isFinite(tolerance) && tolerance >= 0 ? tolerance : 0;
    const leftDelta = transform.left;
    const topDelta = transform.top;
    const rightDelta = viewportWidth - (transform.left + transform.width);
    const bottomDelta = viewportHeight - (transform.top + transform.height);

    return {
        left: Math.abs(leftDelta) <= safeTolerance,
        right: Math.abs(rightDelta) <= safeTolerance,
        top: Math.abs(topDelta) <= safeTolerance,
        bottom: Math.abs(bottomDelta) <= safeTolerance,
    };
}

function clamp(value, min, max) {
    const safeMin = Number.isFinite(min) ? min : 0;
    const safeMax = Number.isFinite(max) ? max : safeMin;
    const safeValue = Number.isFinite(value) ? value : safeMin;
    if (safeMin > safeMax) {
        return safeMin;
    }
    return Math.min(Math.max(safeValue, safeMin), safeMax);
}

function resetPreviewGuideElements() {
    if (previewGuideElements) {
        Object.values(previewGuideElements).forEach((element) => {
            if (!element) {
                return;
            }
            element.style.display = 'none';
            element.style.removeProperty('left');
            element.style.removeProperty('right');
            element.style.removeProperty('top');
            element.style.removeProperty('bottom');
            element.style.removeProperty('width');
            element.style.removeProperty('height');
            element.removeAttribute('data-state');
        });
    }

    if (previewGuideMeasurements) {
        Object.values(previewGuideMeasurements).forEach((element) => {
            if (!element) {
                return;
            }
            element.style.display = 'none';
            element.textContent = '';
            element.style.removeProperty('left');
            element.style.removeProperty('top');
            element.removeAttribute('data-placement');
        });
    }

    if (previewRulerElements) {
        const { horizontal, vertical, horizontalLabel, verticalLabel } = previewRulerElements;
        if (horizontal) {
            horizontal.classList.remove('is-visible');
            horizontal.style.removeProperty('--marker-start');
            horizontal.style.removeProperty('--marker-end');
        }
        if (vertical) {
            vertical.classList.remove('is-visible');
            vertical.style.removeProperty('--marker-start');
            vertical.style.removeProperty('--marker-end');
        }
        if (horizontalLabel) {
            horizontalLabel.textContent = '';
        }
        if (verticalLabel) {
            verticalLabel.textContent = '';
        }
    }
}

function setPreviewGuidesVisible(isVisible) {
    if (!previewGuidesLayer) {
        return;
    }

    if (previewGuidesHideTimeout) {
        window.clearTimeout(previewGuidesHideTimeout);
        previewGuidesHideTimeout = null;
    }

    if (isVisible) {
        previewGuidesLayer.classList.add('is-active');
        previewGuidesLayer.removeAttribute('hidden');
        previewGuidesLayer.setAttribute('aria-hidden', 'false');
    } else {
        previewGuidesLayer.classList.remove('is-active');
        previewGuidesLayer.setAttribute('aria-hidden', 'true');
        if (!previewGuidesLayer.hasAttribute('hidden')) {
            previewGuidesLayer.setAttribute('hidden', '');
        }
        resetPreviewGuideElements();
    }
}

function schedulePreviewGuidesHide(delay = 200) {
    if (!previewGuidesLayer) {
        return;
    }

    if (previewGuidesHideTimeout) {
        window.clearTimeout(previewGuidesHideTimeout);
    }

    previewGuidesHideTimeout = window.setTimeout(() => {
        previewGuidesHideTimeout = null;
        setPreviewGuidesVisible(false);
    }, Math.max(0, delay));
}

function hideGuideElement(element) {
    if (!element) {
        return;
    }
    element.style.display = 'none';
    element.style.removeProperty('left');
    element.style.removeProperty('right');
    element.style.removeProperty('top');
    element.style.removeProperty('bottom');
    element.style.removeProperty('width');
    element.style.removeProperty('height');
    element.removeAttribute('data-state');
}

function showGuideElement(element, styles = {}) {
    if (!element) {
        return;
    }

    element.style.display = 'block';
    element.style.removeProperty('left');
    element.style.removeProperty('right');
    element.style.removeProperty('top');
    element.style.removeProperty('bottom');
    element.style.removeProperty('width');
    element.style.removeProperty('height');

    Object.entries(styles).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') {
            element.style.removeProperty(key);
        } else {
            element.style[key] = value;
        }
    });
}

function updatePreviewGuides(transform, alignment) {
    if (!previewGuidesLayer
        || !previewGuideElements
        || !previewViewport
        || !previewGuidesLayer.classList.contains('is-active')) {
        return;
    }

    if (!transform) {
        resetPreviewGuideElements();
        return;
    }

    const viewportWidth = Math.max(0, previewViewport.clientWidth);
    const viewportHeight = Math.max(0, previewViewport.clientHeight);

    if (viewportWidth === 0 || viewportHeight === 0) {
        resetPreviewGuideElements();
        return;
    }

    const { left, top, width, height } = transform;

    if (![left, top, width, height].every((value) => Number.isFinite(value))) {
        resetPreviewGuideElements();
        return;
    }

    const safeAlignment = alignment
        || evaluatePreviewImageAlignment(transform, { width: viewportWidth, height: viewportHeight });

    const right = left + width;
    const bottom = top + height;
    const centerX = left + (width / 2);
    const centerY = top + (height / 2);
    const viewportCenterX = viewportWidth / 2;
    const viewportCenterY = viewportHeight / 2;

    const nearLeft = Math.abs(left) <= PREVIEW_GUIDE_NEAR_THRESHOLD;
    const nearRight = Math.abs(viewportWidth - right) <= PREVIEW_GUIDE_NEAR_THRESHOLD;
    const nearTop = Math.abs(top) <= PREVIEW_GUIDE_NEAR_THRESHOLD;
    const nearBottom = Math.abs(viewportHeight - bottom) <= PREVIEW_GUIDE_NEAR_THRESHOLD;
    const nearCenterX = Math.abs(centerX - viewportCenterX) <= PREVIEW_SMART_GUIDE_TOLERANCE;
    const nearCenterY = Math.abs(centerY - viewportCenterY) <= PREVIEW_SMART_GUIDE_TOLERANCE;

    if (safeAlignment.left) {
        showGuideElement(previewGuideElements.alignLeft, { left: '0px' });
    } else {
        hideGuideElement(previewGuideElements.alignLeft);
    }

    if (safeAlignment.right) {
        showGuideElement(previewGuideElements.alignRight, { left: `${viewportWidth}px` });
    } else {
        hideGuideElement(previewGuideElements.alignRight);
    }

    if (safeAlignment.top) {
        showGuideElement(previewGuideElements.alignTop, { top: '0px' });
    } else {
        hideGuideElement(previewGuideElements.alignTop);
    }

    if (safeAlignment.bottom) {
        showGuideElement(previewGuideElements.alignBottom, { top: `${viewportHeight}px` });
    } else {
        hideGuideElement(previewGuideElements.alignBottom);
    }

    if (nearCenterX) {
        showGuideElement(previewGuideElements.alignCenterVertical, { left: `${viewportCenterX}px` });
    } else {
        hideGuideElement(previewGuideElements.alignCenterVertical);
    }

    if (nearCenterY) {
        showGuideElement(previewGuideElements.alignCenterHorizontal, { top: `${viewportCenterY}px` });
    } else {
        hideGuideElement(previewGuideElements.alignCenterHorizontal);
    }

    if (!safeAlignment.left && nearLeft) {
        const leftEdge = clamp(left, 0, viewportWidth);
        showGuideElement(previewGuideElements.snapLeft, { left: `${leftEdge}px` });
    } else {
        hideGuideElement(previewGuideElements.snapLeft);
    }

    if (!safeAlignment.right && nearRight) {
        const rightEdge = clamp(right, 0, viewportWidth);
        showGuideElement(previewGuideElements.snapRight, { left: `${rightEdge}px` });
    } else {
        hideGuideElement(previewGuideElements.snapRight);
    }

    if (!safeAlignment.top && nearTop) {
        const topEdge = clamp(top, 0, viewportHeight);
        showGuideElement(previewGuideElements.snapTop, { top: `${topEdge}px` });
    } else {
        hideGuideElement(previewGuideElements.snapTop);
    }

    if (!safeAlignment.bottom && nearBottom) {
        const bottomEdge = clamp(bottom, 0, viewportHeight);
        showGuideElement(previewGuideElements.snapBottom, { top: `${bottomEdge}px` });
    } else {
        hideGuideElement(previewGuideElements.snapBottom);
    }

    const smartGuideElement = previewGuideElements.smartCenter;
    if (smartGuideElement) {
        if (nearCenterX || nearCenterY) {
            showGuideElement(smartGuideElement, {
                left: `${viewportCenterX}px`,
                top: `${viewportCenterY}px`,
            });
            smartGuideElement.dataset.state = (nearCenterX && nearCenterY) ? 'locked' : 'active';
        } else {
            hideGuideElement(smartGuideElement);
        }
    }

    if (previewGuideMeasurements?.size) {
        const sizeElement = previewGuideMeasurements.size;
        sizeElement.style.display = 'block';
        sizeElement.textContent = `${Math.round(width)} × ${Math.round(height)} px`;
        const labelX = clamp(centerX, 32, viewportWidth - 32);
        const labelY = clamp(centerY, 32, viewportHeight - 32);
        sizeElement.style.left = `${labelX}px`;
        sizeElement.style.top = `${labelY}px`;
    }

    if (previewGuideMeasurements?.position) {
        const positionElement = previewGuideMeasurements.position;
        positionElement.style.display = 'block';
        positionElement.textContent = `x ${Math.round(left)} px • y ${Math.round(top)} px`;
        const labelX = clamp(centerX, 36, viewportWidth - 36);
        let labelY = top - 14;
        let placement = 'above';
        if (labelY < 18) {
            labelY = top + height + 22;
            placement = 'below';
        }
        labelY = clamp(labelY, 18, viewportHeight - 18);
        positionElement.style.left = `${labelX}px`;
        positionElement.style.top = `${labelY}px`;
        positionElement.setAttribute('data-placement', placement);
    }

    if (previewRulerElements?.horizontal) {
        const startX = clamp(left, 0, viewportWidth);
        const endX = clamp(right, 0, viewportWidth);
        previewRulerElements.horizontal.classList.add('is-visible');
        previewRulerElements.horizontal.style.setProperty('--marker-start', `${startX}px`);
        previewRulerElements.horizontal.style.setProperty('--marker-end', `${endX}px`);
        if (previewRulerElements.horizontalLabel) {
            previewRulerElements.horizontalLabel.textContent = `X ${Math.round(left)} • W ${Math.round(width)}`;
        }
    }

    if (previewRulerElements?.vertical) {
        const startY = clamp(top, 0, viewportHeight);
        const endY = clamp(bottom, 0, viewportHeight);
        previewRulerElements.vertical.classList.add('is-visible');
        previewRulerElements.vertical.style.setProperty('--marker-start', `${startY}px`);
        previewRulerElements.vertical.style.setProperty('--marker-end', `${endY}px`);
        if (previewRulerElements.verticalLabel) {
            previewRulerElements.verticalLabel.textContent = `Y ${Math.round(top)} • H ${Math.round(height)}`;
        }
    }
}

function updatePreviewViewportAlignmentState(alignment) {
    if (!previewViewport) {
        return;
    }

    const resolved = alignment || {
        left: false,
        right: false,
        top: false,
        bottom: false,
    };

    let hasAny = false;
    let hasAll = true;

    (['left', 'right', 'top', 'bottom']).forEach((edge) => {
        const isAligned = Boolean(resolved[edge]);
        hasAny = hasAny || isAligned;
        hasAll = hasAll && isAligned;
        if (previewViewportAlignmentState[edge] !== isAligned) {
            previewViewport.classList.toggle(PREVIEW_ALIGNMENT_CLASSES[edge], isAligned);
            previewViewportAlignmentState[edge] = isAligned;
        }
    });

    previewViewport.classList.toggle('is-aligned', hasAny);
    previewViewport.classList.toggle('is-fully-aligned', hasAll);
}

function resetPreviewViewportAlignmentState() {
    if (!previewViewport) {
        return;
    }

    (['left', 'right', 'top', 'bottom']).forEach((edge) => {
        previewViewport.classList.remove(PREVIEW_ALIGNMENT_CLASSES[edge]);
        previewViewportAlignmentState[edge] = false;
    });

    previewViewport.classList.remove('is-aligned', 'is-fully-aligned');
}

function snapPreviewImageTransform(transform, options = {}) {
    if (!transform) {
        return {
            transform: null,
            alignment: evaluatePreviewImageAlignment(null, getPreviewViewportSize()),
        };
    }

    const viewportSize = getPreviewViewportSize();
    const snappedTransform = { ...transform };

    if (viewportSize.width > 0 && viewportSize.height > 0) {
        const threshold = PREVIEW_IMAGE_SNAP_THRESHOLD;
        if (options.mode === 'drag') {
            if (Math.abs(snappedTransform.left) <= threshold) {
                snappedTransform.left = 0;
            }

            const rightDelta = viewportSize.width - (snappedTransform.left + snappedTransform.width);
            if (Math.abs(rightDelta) <= threshold) {
                snappedTransform.left += rightDelta;
            }

            if (Math.abs(snappedTransform.top) <= threshold) {
                snappedTransform.top = 0;
            }

            const bottomDelta = viewportSize.height - (snappedTransform.top + snappedTransform.height);
            if (Math.abs(bottomDelta) <= threshold) {
                snappedTransform.top += bottomDelta;
            }
        } else if (options.mode === 'resize') {
            const handle = typeof options.handle === 'string' ? options.handle.toLowerCase() : '';

            if (handle) {
                const hasWest = handle.includes('w');
                const hasEast = handle.includes('e');
                const hasNorth = handle.includes('n');
                const hasSouth = handle.includes('s');

                const origin = options.origin || null;
                let aspectRatio = transform.aspectRatio > 0 ? transform.aspectRatio : null;
                if (!aspectRatio) {
                    const ratio = transform.width / transform.height;
                    aspectRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
                }

                const anchorX = hasWest
                    ? origin?.oppositeX ?? (transform.left + transform.width)
                    : origin?.left ?? transform.left;
                const anchorY = hasNorth
                    ? origin?.oppositeY ?? (transform.top + transform.height)
                    : origin?.top ?? transform.top;

                let movingX = hasWest ? transform.left : transform.left + transform.width;
                let movingY = hasNorth ? transform.top : transform.top + transform.height;

                let snappedHorizontal = false;
                let snappedVertical = false;

                if (hasWest && Math.abs(movingX) <= threshold) {
                    movingX = 0;
                    snappedHorizontal = true;
                } else if (hasEast && Math.abs(viewportSize.width - movingX) <= threshold) {
                    movingX = viewportSize.width;
                    snappedHorizontal = true;
                }

                if (hasNorth && Math.abs(movingY) <= threshold) {
                    movingY = 0;
                    snappedVertical = true;
                } else if (hasSouth && Math.abs(viewportSize.height - movingY) <= threshold) {
                    movingY = viewportSize.height;
                    snappedVertical = true;
                }

                if (snappedHorizontal || snappedVertical) {
                    const horizontalDelta = movingX - anchorX;                    const verticalDelta = movingY - anchorY;
                    const horizontalDirection = horizontalDelta === 0
                        ? (hasEast ? 1 : -1)
                        : Math.sign(horizontalDelta);
                    const verticalDirection = verticalDelta === 0
                        ? (hasSouth ? 1 : -1)
                        : Math.sign(verticalDelta);

                    let widthMagnitude = Math.abs(horizontalDelta);
                    let heightMagnitude = Math.abs(verticalDelta);

                    const targetHeightFromWidth = widthMagnitude / aspectRatio;
                    const targetWidthFromHeight = heightMagnitude * aspectRatio;

                    if (snappedHorizontal && !snappedVertical) {
                        heightMagnitude = targetHeightFromWidth;
                        movingY = anchorY + (verticalDirection || 1) * heightMagnitude;
                    } else if (snappedVertical && !snappedHorizontal) {
                        widthMagnitude = targetWidthFromHeight;
                        movingX = anchorX + (horizontalDirection || 1) * widthMagnitude;
                    } else {
                        const deltaHeight = Math.abs(targetHeightFromWidth - heightMagnitude);
                        const deltaWidth = Math.abs(targetWidthFromHeight - widthMagnitude);
                        if (deltaHeight <= deltaWidth) {
                            heightMagnitude = targetHeightFromWidth;
                            movingY = anchorY + (verticalDirection || 1) * heightMagnitude;
                        } else {
                            widthMagnitude = targetWidthFromHeight;
                            movingX = anchorX + (horizontalDirection || 1) * widthMagnitude;
                        }
                    }

                    const nextLeft = Math.min(anchorX, movingX);
                    const nextTop = Math.min(anchorY, movingY);
                    const nextWidth = Math.max(Math.abs(movingX - anchorX), 0);
                    const nextHeight = Math.max(Math.abs(movingY - anchorY), 0);

                    snappedTransform.left = nextLeft;
                    snappedTransform.top = nextTop;
                    snappedTransform.width = nextWidth;
                    snappedTransform.height = nextHeight;
                    snappedTransform.aspectRatio = aspectRatio;
                }
            }
        }
    }

    if (viewportSize.width > 0 && viewportSize.height > 0) {
        const viewportCenterX = viewportSize.width / 2;
        const viewportCenterY = viewportSize.height / 2;
        const currentCenterX = snappedTransform.left + (snappedTransform.width / 2);
        const currentCenterY = snappedTransform.top + (snappedTransform.height / 2);

        if (Math.abs(currentCenterX - viewportCenterX) <= PREVIEW_SMART_GUIDE_TOLERANCE) {
            snappedTransform.left = viewportCenterX - (snappedTransform.width / 2);
        }

        if (Math.abs(currentCenterY - viewportCenterY) <= PREVIEW_SMART_GUIDE_TOLERANCE) {
            snappedTransform.top = viewportCenterY - (snappedTransform.height / 2);
        }
    }

    const alignment = evaluatePreviewImageAlignment(snappedTransform, viewportSize);

    return {
        transform: snappedTransform,
        alignment,
    };
}

function getStoredPreviewImageTransform(timelineItem) {
    if (!timelineItem) {
        return null;
    }

    const raw = timelineItem.dataset.previewImageTransform || '';

    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw);
        return sanitizeNormalizedKeyframeTransform(parsed);
    } catch (error) {
        console.warn('Unable to parse stored preview image transform.', error);
        return null;
    }
}

function applyStoredPreviewImageTransform(storedTransform, viewportSizeOverride = null) {
    if (!storedTransform) {
        return false;
    }

    const viewportSize = viewportSizeOverride || getPreviewViewportSize();
    return applyNormalizedPreviewImageTransform(storedTransform, { viewportSize });
}

function tryRestorePreviewImageTransform(timelineItem) {
    const storedTransform = getStoredPreviewImageTransform(timelineItem);

    if (!storedTransform) {
        pendingPreviewImageTransform = null;
        return false;
    }

    if (applyStoredPreviewImageTransform(storedTransform)) {
        pendingPreviewImageTransform = null;
    } else {
        pendingPreviewImageTransform = storedTransform;
        schedulePreviewViewportSizeUpdate();
    }

    return true;
}

function persistPreviewImageTransformForActiveTimelineItem(options = {}) {
    if (!activeTimelineItem || !previewImageTransform || !previewViewport) {
        return;
    }

    if (!isImageTimelineItem(activeTimelineItem)) {
        return;
    }

    const viewportSize = getPreviewViewportSize();
    const normalized = normalizePreviewImageTransform(previewImageTransform, viewportSize);

    if (!normalized) {
        return;
    }

    activeTimelineItem.dataset.previewImageTransform = JSON.stringify(normalized);

    const existingKeyframes = getTimelineItemImageKeyframes(activeTimelineItem);
    const serializedExistingKeyframes = JSON.stringify(existingKeyframes);

    const targetProgress = Object.prototype.hasOwnProperty.call(options, 'progressOverride')
        ? clampProgress(options.progressOverride)
        : getActiveClipProgress();

    if (!Number.isFinite(targetProgress)) {
        return;
    }

    const hasKeyframes = existingKeyframes.length > 0;
    const allowKeyframeUpdate = Boolean(options.allowKeyframeUpdate);

    let shouldPersistKeyframe = Boolean(options.forceKeyframe);

    if (!shouldPersistKeyframe && allowKeyframeUpdate && hasKeyframes) {
        shouldPersistKeyframe = existingKeyframes.some(
            (entry) => Math.abs(entry.progress - targetProgress) <= KEYFRAME_PROGRESS_TOLERANCE,
        );
    }

    if (!shouldPersistKeyframe) {
        return;
    }

    const updatedKeyframes = upsertTimelineImageKeyframe(existingKeyframes, targetProgress, normalized);
    const serializedUpdatedKeyframes = JSON.stringify(updatedKeyframes);

    if (serializedUpdatedKeyframes === serializedExistingKeyframes) {
        return;
    }

    storeTimelineImageKeyframes(activeTimelineItem, updatedKeyframes);
    renderImageKeyframeTracks(activeTimelineItem);
}

let previewImageFrameUpdateHandle = 0;
let pendingPreviewImageFrameState = null;

function commitPreviewImageFrameState(state) {
    if (!state || !previewImageFrame || !previewImageTransform) {
        hidePreviewOutsideOutline();
        resetPreviewViewportAlignmentState();
        resetPreviewGuideElements();
        updateImageRotationControlState();
        return;
    }

    const {
        left,
        top,
        width,
        height,
        rotation,
        aspectRatio,
        alignmentOverride,
    } = state;

    if (![left, top, width, height].every((value) => Number.isFinite(value))) {
        hidePreviewOutsideOutline();
        resetPreviewViewportAlignmentState();
        resetPreviewGuideElements();
        updateImageRotationControlState();
        return;
    }

    previewImageFrame.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    previewImageFrame.style.width = `${width}px`;
    previewImageFrame.style.height = `${height}px`;
    if (typeof updatePreviewResizeHandlePositions === 'function') {
        updatePreviewResizeHandlePositions(width, height, rotation);
    }

    if (previewTextEditor) {
        if (!previewTextEditor.hidden) {
            const activeTextStyle = previewTextEditorState.currentItem
                ? getTimelineTextStyle(previewTextEditorState.currentItem)
                : null;
            const fontScale = getDefaultTextTemplateFontScale(activeTextStyle);
            const fontSizeFromHeight = height * fontScale;
            const fontSizeFromWidth = width * 0.18;
            const widthLimitedFontSize = fontSizeFromWidth > 0
                ? Math.min(fontSizeFromHeight, fontSizeFromWidth)
                : fontSizeFromHeight;
            const computedFontSize = Math.max(12, widthLimitedFontSize);
            previewTextEditor.style.fontSize = `${computedFontSize}px`;
        } else {
            previewTextEditor.style.removeProperty('font-size');
        }
    }

    updatePreviewImageFrameVisibility();

    if (previewImage) {
        previewImage.style.setProperty('--preview-image-rotation', `${rotation}deg`);
    }

    const transformForGuides = {
        left,
        top,
        width,
        height,
        aspectRatio,
    };

    const alignment = alignmentOverride
        || evaluatePreviewImageAlignment(transformForGuides, getPreviewViewportSize());
    updatePreviewViewportAlignmentState(alignment);
    updatePreviewOutsideOutline();
    updatePreviewGuides(transformForGuides, alignment);
    updateImageRotationControlState();
}

function flushPreviewImageFrameState() {
    const state = pendingPreviewImageFrameState;
    pendingPreviewImageFrameState = null;
    commitPreviewImageFrameState(state);
}

function applyPreviewImageTransform(alignmentOverride) {
    if (!previewImageFrame || !previewImageTransform) {
        if (typeof window !== 'undefined'
            && typeof window.cancelAnimationFrame === 'function'
            && previewImageFrameUpdateHandle) {
            window.cancelAnimationFrame(previewImageFrameUpdateHandle);
        }
        previewImageFrameUpdateHandle = 0;
        pendingPreviewImageFrameState = null;
        hidePreviewOutsideOutline();
        resetPreviewViewportAlignmentState();
        resetPreviewGuideElements();
        updateImageRotationControlState();
        return;
    }

    const rotation = clampRotation(previewImageTransform.rotation);
    previewImageTransform.rotation = rotation;

    pendingPreviewImageFrameState = {
        left: previewImageTransform.left,
        top: previewImageTransform.top,
        width: previewImageTransform.width,
        height: previewImageTransform.height,
        aspectRatio: previewImageTransform.aspectRatio,
        rotation,
        alignmentOverride,
    };

    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
        flushPreviewImageFrameState();
        return;
    }

    if (previewImageFrameUpdateHandle) {
        return;
    }

    previewImageFrameUpdateHandle = window.requestAnimationFrame(() => {
        previewImageFrameUpdateHandle = 0;
        flushPreviewImageFrameState();
    });
}

function clearPreviewImageTransform() {
    previewImageTransform = null;
    pendingPreviewImageFrameState = null;
    if (typeof window !== 'undefined'
        && typeof window.cancelAnimationFrame === 'function'
        && previewImageFrameUpdateHandle) {
        window.cancelAnimationFrame(previewImageFrameUpdateHandle);
    }
    previewImageFrameUpdateHandle = 0;
    if (previewImageFrame) {
        previewImageFrame.style.removeProperty('transform');
        previewImageFrame.style.removeProperty('width');
        previewImageFrame.style.removeProperty('height');
        previewImageFrame.classList.remove('is-dragging', 'is-resizing');
        previewImageFrame.removeAttribute('data-outside-viewport');
    }
    if (previewImage) {
        previewImage.style.removeProperty('--preview-image-rotation');
    }
    if (previewTextEditor) {
        previewTextEditor.style.removeProperty('font-size');
    }
    resetPreviewViewportAlignmentState();
    hidePreviewOutsideOutline();
    setPreviewGuidesVisible(false);
    updateImageRotationControlState();
}

const PREVIEW_TEXT_COMMIT_DELAY_MS = 200;
const PREVIEW_TEXT_DRAG_THRESHOLD = 6;
const DEFAULT_TEXT_TEMPLATE_ID_FALLBACK = 'default-text';
const DEFAULT_TEXT_TEMPLATE_PLACEHOLDER = '(Default Text)';
const DEFAULT_TEXT_TEMPLATE_FONT_SIZE_FALLBACK = 120;
const DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT_FALLBACK = 1080;
const DEFAULT_TEXT_TEMPLATE_PADDING_INLINE_FALLBACK = 32;
const DEFAULT_TEXT_TEMPLATE_PADDING_BLOCK_FALLBACK = 20;

const TEXT_FONT_LIBRARY = {
    inter: {
        key: 'inter',
        label: 'Inter',
        family: "Inter, 'Segoe UI', system-ui, sans-serif",
        weight: 600,
        letterSpacingScale: 0.04,
    },
    poppins: {
        key: 'poppins',
        label: 'Poppins',
        family: "'Poppins', 'Segoe UI', system-ui, sans-serif",
        weight: 600,
        letterSpacingScale: 0.045,
    },
    playfair: {
        key: 'playfair',
        label: 'Playfair Display',
        family: "'Playfair Display', 'Times New Roman', serif",
        weight: 600,
        letterSpacingScale: 0.02,
    },
    mono: {
        key: 'mono',
        label: 'JetBrains Mono',
        family: "'JetBrains Mono', 'Fira Code', monospace",
        weight: 500,
        letterSpacingScale: 0.02,
    },
    georgia: {
        key: 'georgia',
        label: 'Georgia',
        family: "'Georgia', 'Times New Roman', serif",
        weight: 600,
        letterSpacingScale: 0.018,
    },
    avenir: {
        key: 'avenir',
        label: 'Avenir Next',
        family: "'Avenir Next', 'Segoe UI', system-ui, sans-serif",
        weight: 600,
        letterSpacingScale: 0.038,
    },
};

const TEXT_ALIGNMENT_OPTIONS = new Set(['left', 'center', 'right']);
const TEXT_TRANSFORM_OPTIONS = new Set(['none', 'uppercase', 'lowercase', 'capitalize']);
const TEXT_FONT_STYLE_OPTIONS = new Set(['normal', 'italic']);
const TEXT_DECORATION_OPTIONS = new Set(['none', 'underline']);
const TEXT_FONT_SIZE_MIN = 48;
const TEXT_FONT_SIZE_MAX = 220;
const TEXT_LETTER_SPACING_MIN = -0.05;
const TEXT_LETTER_SPACING_MAX = 0.2;

const DEFAULT_TEXT_STYLE = {
    fontKey: 'inter',
    fontFamily: TEXT_FONT_LIBRARY.inter.family,
    fontWeight: TEXT_FONT_LIBRARY.inter.weight,
    fontStyle: 'normal',
    textDecoration: 'none',
    letterSpacingScale: TEXT_FONT_LIBRARY.inter.letterSpacingScale,
    fontSize: DEFAULT_TEXT_TEMPLATE_FONT_SIZE_FALLBACK,
    color: '#F8FAFC',
    align: 'center',
    transform: 'none',
};

const previewTextEditorState = {
    isEnabled: false,
    currentItem: null,
    lastCommittedValue: '',
    lockedTransform: null,
    lockedTransformSerialized: '',
};

let previewTextCommitTimer = null;

function getDefaultTextTemplateId() {
    if (typeof window !== 'undefined' && window.DEFAULT_TEXT_TEMPLATE_ID) {
        return window.DEFAULT_TEXT_TEMPLATE_ID;
    }
    return DEFAULT_TEXT_TEMPLATE_ID_FALLBACK;
}

function getDefaultTextTemplateLabel() {
    if (typeof window !== 'undefined' && window.DEFAULT_TEXT_TEMPLATE_LABEL) {
        return window.DEFAULT_TEXT_TEMPLATE_LABEL;
    }
    return DEFAULT_TEXT_TEMPLATE_PLACEHOLDER;
}

function getDefaultTextTemplateFontScale(style = null) {
    const customFontSize = style && Number.isFinite(style.fontSize)
        ? Number(style.fontSize)
        : null;
    const baseFontSize = customFontSize !== null
        ? customFontSize
        : ((typeof window !== 'undefined'
                && Number.isFinite(window.DEFAULT_TEXT_TEMPLATE_FONT_SIZE))
            ? Number(window.DEFAULT_TEXT_TEMPLATE_FONT_SIZE)
            : DEFAULT_TEXT_TEMPLATE_FONT_SIZE_FALLBACK);
    const baseCanvasHeight = (typeof window !== 'undefined'
            && Number.isFinite(window.DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT))
        ? Number(window.DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT)
        : DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT_FALLBACK;

    if (!Number.isFinite(baseFontSize)
        || !Number.isFinite(baseCanvasHeight)
        || baseFontSize <= 0
        || baseCanvasHeight <= 0) {
        return DEFAULT_TEXT_TEMPLATE_FONT_SIZE_FALLBACK
            / DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT_FALLBACK;
    }

    return baseFontSize / baseCanvasHeight;
}

function getDefaultTextTemplatePaddingInline() {
    if (typeof window !== 'undefined'
        && Number.isFinite(window.DEFAULT_TEXT_TEMPLATE_HORIZONTAL_PADDING)) {
        return Number(window.DEFAULT_TEXT_TEMPLATE_HORIZONTAL_PADDING);
    }
    return DEFAULT_TEXT_TEMPLATE_PADDING_INLINE_FALLBACK;
}

function getDefaultTextTemplatePaddingBlock() {
    if (typeof window !== 'undefined'
        && Number.isFinite(window.DEFAULT_TEXT_TEMPLATE_VERTICAL_PADDING)) {
        return Number(window.DEFAULT_TEXT_TEMPLATE_VERTICAL_PADDING);
    }
    return DEFAULT_TEXT_TEMPLATE_PADDING_BLOCK_FALLBACK;
}

function shouldAutoFitDefaultTextTimelineItem(timelineItem) {
    if (!timelineItem || !isDefaultTextTimelineItem(timelineItem)) {
        return false;
    }

    return timelineItem.dataset?.autoFitText !== 'false';
}

function autoFitDefaultTextTimelineItem(timelineItem, textContent, style = null) {
    if (!shouldAutoFitDefaultTextTimelineItem(timelineItem)) {
        return;
    }

    if (typeof window === 'undefined'
        || typeof window.calculateDefaultTextTemplateTransform !== 'function') {
        return;
    }

    let transform = null;
    try {
        transform = window.calculateDefaultTextTemplateTransform(textContent, style || getTimelineTextStyle(timelineItem));
    } catch (error) {
        console.warn('Unable to calculate text overlay dimensions.', error);
        transform = null;
    }

    if (!transform
        || !Number.isFinite(transform.width)
        || !Number.isFinite(transform.height)
        || transform.width <= 0
        || transform.height <= 0) {
        return;
    }

    timelineItem.dataset.previewImageTransform = JSON.stringify(transform);
    timelineItem.dataset.autoFitText = 'true';

    if (timelineItem === activeTimelineItem) {
        applyStoredPreviewImageTransform(transform);
        if (typeof refreshActiveOverlayLayers === 'function') {
            refreshActiveOverlayLayers();
        }
    }
}

function isDefaultTextTimelineItem(timelineItem) {
    if (!timelineItem) {
        return false;
    }
    const templateId = timelineItem.dataset?.templateId || '';
    return templateId === getDefaultTextTemplateId();
}

function normalizePreviewTextEditorValue(value) {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value);
}

function getFontLibraryEntry(fontKey) {
    if (!fontKey) {
        return TEXT_FONT_LIBRARY[DEFAULT_TEXT_STYLE.fontKey];
    }
    const normalizedKey = String(fontKey).toLowerCase();
    return TEXT_FONT_LIBRARY[normalizedKey] || TEXT_FONT_LIBRARY[DEFAULT_TEXT_STYLE.fontKey];
}

function getBoldFontWeightForFont(fontEntry = null) {
    const baseWeightCandidate = fontEntry && Number.isFinite(Number(fontEntry.weight))
        ? Number(fontEntry.weight)
        : DEFAULT_TEXT_STYLE.fontWeight;
    const increased = baseWeightCandidate + 200;
    const boldWeight = Math.max(700, increased);
    return Math.min(900, boldWeight);
}

function clampTextFontSize(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return DEFAULT_TEXT_STYLE.fontSize;
    }
    return Math.min(TEXT_FONT_SIZE_MAX, Math.max(TEXT_FONT_SIZE_MIN, numeric));
}

function clampTextLetterSpacing(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return DEFAULT_TEXT_STYLE.letterSpacingScale;
    }
    return Math.min(TEXT_LETTER_SPACING_MAX, Math.max(TEXT_LETTER_SPACING_MIN, numeric));
}

function formatLetterSpacingReadout(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return '0.00 em';
    }
    const rounded = Math.round(numeric * 100) / 100;
    return `${rounded.toFixed(2)} em`;
}

function normalizeTextColor(value) {
    if (typeof value !== 'string') {
        return DEFAULT_TEXT_STYLE.color;
    }
    const trimmed = value.trim();
    if (/^#([0-9a-fA-F]{6})$/.test(trimmed)) {
        return `#${trimmed.slice(1).toUpperCase()}`;
    }
    if (/^#([0-9a-fA-F]{3})$/.test(trimmed)) {
        const [, r, g, b] = trimmed.split('');
        return `#${`${r}${r}${g}${g}${b}${b}`.toUpperCase()}`;
    }
    return DEFAULT_TEXT_STYLE.color;
}

function getDefaultTextStyle() {
    return { ...DEFAULT_TEXT_STYLE };
}

function storeTimelineTextStyle(timelineItem, styleOverrides = {}) {
    if (!timelineItem) {
        return getDefaultTextStyle();
    }

    const fontEntry = getFontLibraryEntry(styleOverrides.fontKey || timelineItem.dataset.textFontKey);
    const didChangeFontKey = typeof styleOverrides.fontKey === 'string';
    const fontFamily = styleOverrides.fontFamily
        || (didChangeFontKey
            ? fontEntry.family
            : (timelineItem.dataset.textFontFamily || fontEntry.family));
    let fontWeight = fontEntry.weight;
    const fontWeightOverride = styleOverrides.fontWeight;
    if (Number.isFinite(Number(fontWeightOverride))) {
        fontWeight = Number(fontWeightOverride);
    } else if (!didChangeFontKey) {
        const datasetWeight = Number(timelineItem.dataset.textFontWeight);
        if (Number.isFinite(datasetWeight)) {
            fontWeight = datasetWeight;
        }
    }

    let letterSpacingScale = fontEntry.letterSpacingScale;
    const letterSpacingOverride = styleOverrides.letterSpacingScale;
    if (Number.isFinite(Number(letterSpacingOverride))) {
        letterSpacingScale = clampTextLetterSpacing(letterSpacingOverride);
    } else if (!didChangeFontKey) {
        const datasetLetterSpacing = Number(timelineItem.dataset.textLetterSpacingScale);
        if (Number.isFinite(datasetLetterSpacing)) {
            letterSpacingScale = clampTextLetterSpacing(datasetLetterSpacing);
        }
    }
    letterSpacingScale = clampTextLetterSpacing(letterSpacingScale);
    const fontSizeCandidate = styleOverrides.fontSize ?? timelineItem.dataset.textFontSize;
    const fontSize = clampTextFontSize(fontSizeCandidate);
    const fontStyleCandidate = styleOverrides.fontStyle || timelineItem.dataset.textFontStyle;
    const fontStyle = TEXT_FONT_STYLE_OPTIONS.has(fontStyleCandidate)
        ? fontStyleCandidate
        : DEFAULT_TEXT_STYLE.fontStyle;
    const decorationCandidate = styleOverrides.textDecoration || timelineItem.dataset.textDecoration;
    const textDecoration = TEXT_DECORATION_OPTIONS.has(decorationCandidate)
        ? decorationCandidate
        : DEFAULT_TEXT_STYLE.textDecoration;
    const color = normalizeTextColor(styleOverrides.color || timelineItem.dataset.textColor || DEFAULT_TEXT_STYLE.color);
    const alignCandidate = styleOverrides.align || timelineItem.dataset.textAlign;
    const align = TEXT_ALIGNMENT_OPTIONS.has(alignCandidate) ? alignCandidate : DEFAULT_TEXT_STYLE.align;
    const transformCandidate = styleOverrides.transform || timelineItem.dataset.textTransform;
    const transform = TEXT_TRANSFORM_OPTIONS.has(transformCandidate) ? transformCandidate : DEFAULT_TEXT_STYLE.transform;

    timelineItem.dataset.textFontKey = fontEntry.key;
    timelineItem.dataset.textFontFamily = fontFamily;
    timelineItem.dataset.textFontWeight = String(fontWeight);
    timelineItem.dataset.textLetterSpacingScale = String(letterSpacingScale);
    timelineItem.dataset.textFontSize = String(fontSize);
    timelineItem.dataset.textFontStyle = fontStyle;
    timelineItem.dataset.textDecoration = textDecoration;
    timelineItem.dataset.textColor = color;
    timelineItem.dataset.textAlign = align;
    timelineItem.dataset.textTransform = transform;

    return {
        fontKey: fontEntry.key,
        fontFamily,
        fontWeight,
        fontStyle,
        textDecoration,
        letterSpacingScale,
        fontSize,
        color,
        align,
        transform,
    };
}

function initializeDefaultTextStyleForTimelineItem(timelineItem) {
    if (!timelineItem) {
        return;
    }
    storeTimelineTextStyle(timelineItem, DEFAULT_TEXT_STYLE);
}

function getTimelineTextStyle(timelineItem) {
    if (!timelineItem) {
        return getDefaultTextStyle();
    }

    const fontKey = timelineItem.dataset.textFontKey || DEFAULT_TEXT_STYLE.fontKey;
    const fontEntry = getFontLibraryEntry(fontKey);
    const fontFamily = timelineItem.dataset.textFontFamily || fontEntry.family;
    const fontWeightCandidate = Number(timelineItem.dataset.textFontWeight);
    const fontWeight = Number.isFinite(fontWeightCandidate) ? fontWeightCandidate : fontEntry.weight;
    const letterSpacingCandidate = Number(timelineItem.dataset.textLetterSpacingScale);
    const letterSpacingScale = Number.isFinite(letterSpacingCandidate)
        ? clampTextLetterSpacing(letterSpacingCandidate)
        : fontEntry.letterSpacingScale;
    const fontSizeCandidate = Number(timelineItem.dataset.textFontSize);
    const fontSize = Number.isFinite(fontSizeCandidate)
        ? clampTextFontSize(fontSizeCandidate)
        : DEFAULT_TEXT_STYLE.fontSize;
    const color = normalizeTextColor(timelineItem.dataset.textColor || DEFAULT_TEXT_STYLE.color);
    const alignCandidate = timelineItem.dataset.textAlign;
    const align = TEXT_ALIGNMENT_OPTIONS.has(alignCandidate) ? alignCandidate : DEFAULT_TEXT_STYLE.align;
    const transformCandidate = timelineItem.dataset.textTransform;
    const transform = TEXT_TRANSFORM_OPTIONS.has(transformCandidate)
        ? transformCandidate
        : DEFAULT_TEXT_STYLE.transform;
    const fontStyleCandidate = timelineItem.dataset.textFontStyle;
    const fontStyle = TEXT_FONT_STYLE_OPTIONS.has(fontStyleCandidate)
        ? fontStyleCandidate
        : DEFAULT_TEXT_STYLE.fontStyle;
    const decorationCandidate = timelineItem.dataset.textDecoration;
    const textDecoration = TEXT_DECORATION_OPTIONS.has(decorationCandidate)
        ? decorationCandidate
        : DEFAULT_TEXT_STYLE.textDecoration;

    return {
        fontKey: fontEntry.key,
        fontFamily,
        fontWeight,
        fontStyle,
        textDecoration,
        letterSpacingScale,
        fontSize,
        color,
        align,
        transform,
    };
}

function applyTextStyleToPreviewEditor(styleOverrides = null) {
    if (!previewTextEditor) {
        return;
    }

    const style = styleOverrides || (
        previewTextEditorState.currentItem
            ? getTimelineTextStyle(previewTextEditorState.currentItem)
            : getDefaultTextStyle()
    );

    previewTextEditor.style.fontFamily = style.fontFamily;
    previewTextEditor.style.fontWeight = String(style.fontWeight);
    previewTextEditor.style.fontStyle = style.fontStyle || 'normal';
    previewTextEditor.style.letterSpacing = `${style.letterSpacingScale}em`;
    previewTextEditor.style.color = style.color;
    previewTextEditor.style.textDecoration = style.textDecoration || 'none';
    previewTextEditor.style.textTransform = style.transform || 'none';
    previewTextEditor.dataset.align = style.align || 'center';
}

function getActiveDefaultTextTimelineItem() {
    if (previewTextEditorState.isEnabled
        && previewTextEditorState.currentItem
        && previewTextEditorState.currentItem.isConnected) {
        return previewTextEditorState.currentItem;
    }
    if (activeTimelineItem && isDefaultTextTimelineItem(activeTimelineItem)) {
        return activeTimelineItem;
    }
    return null;
}

function updateTextEffectsControlsAvailability(isEnabled) {
    const controls = [
        textEffectFontSelect,
        textEffectSizeInput,
        textEffectColorInput,
        textEffectLetterSpacingInput,
        textEffectTransformSelect,
    ];
    controls.forEach((control) => {
        if (!control) {
            return;
        }
        control.disabled = !isEnabled;
    });
    textEffectAlignmentButtons.forEach((button) => {
        button.disabled = !isEnabled;
    });
    textStyleToolbarButtons.forEach((button) => {
        button.disabled = !isEnabled;
        if (!isEnabled) {
            button.setAttribute('aria-pressed', 'false');
            button.classList.remove('is-active');
        }
    });
    if (textEffectsPanel) {
        if (isEnabled) {
            textEffectsPanel.removeAttribute('aria-disabled');
        } else {
            textEffectsPanel.setAttribute('aria-disabled', 'true');
        }
    }
    if (!isEnabled && textEffectSizeValue) {
        textEffectSizeValue.textContent = '—';
    }
    if (!isEnabled && textEffectLetterSpacingValue) {
        textEffectLetterSpacingValue.textContent = '—';
    }
}

function syncTextEffectsControlsToTimelineItem(timelineItem) {
    if (!textEffectsPanel) {
        return;
    }

    const isTextItem = timelineItem && isDefaultTextTimelineItem(timelineItem);
    updateTextEffectsControlsAvailability(Boolean(isTextItem));

    if (!isTextItem) {
        textEffectAlignmentButtons.forEach((button) => {
            button.setAttribute('aria-pressed', 'false');
            button.classList.remove('is-active');
        });
        textStyleToolbarButtons.forEach((button) => {
            button.setAttribute('aria-pressed', 'false');
            button.classList.remove('is-active');
        });
        return;
    }

    const style = getTimelineTextStyle(timelineItem);
    if (textEffectFontSelect) {
        textEffectFontSelect.value = style.fontKey;
    }
    if (textEffectSizeInput) {
        textEffectSizeInput.value = String(Math.round(style.fontSize));
    }
    if (textEffectSizeValue) {
        textEffectSizeValue.textContent = `${Math.round(style.fontSize)} px`;
    }
    if (textEffectColorInput) {
        textEffectColorInput.value = style.color;
    }
    if (textEffectLetterSpacingInput) {
        textEffectLetterSpacingInput.value = String(style.letterSpacingScale.toFixed(3));
    }
    if (textEffectLetterSpacingValue) {
        textEffectLetterSpacingValue.textContent = formatLetterSpacingReadout(style.letterSpacingScale);
    }
    if (textEffectTransformSelect) {
        textEffectTransformSelect.value = style.transform || 'none';
    }
    textEffectAlignmentButtons.forEach((button) => {
        const targetAlign = button.dataset.textAlign;
        const isActive = targetAlign === style.align;
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        button.classList.toggle('is-active', isActive);
    });
    const fontEntry = getFontLibraryEntry(style.fontKey);
    const boldWeight = getBoldFontWeightForFont(fontEntry);
    textStyleToolbarButtons.forEach((button) => {
        const styleType = button.dataset.textStyle;
        let isActive = false;
        if (styleType === 'bold') {
            isActive = Number(style.fontWeight) >= boldWeight;
        } else if (styleType === 'italic') {
            isActive = (style.fontStyle || 'normal') === 'italic';
        } else if (styleType === 'underline') {
            isActive = (style.textDecoration || 'none') === 'underline';
        }
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        button.classList.toggle('is-active', isActive);
    });
}

function regenerateDefaultTextOverlayAssets(timelineItem, styleOverride = null) {
    if (!timelineItem) {
        return;
    }

    const style = styleOverride ? { ...getTimelineTextStyle(timelineItem), ...styleOverride } : getTimelineTextStyle(timelineItem);
    const rawText = timelineItem.dataset.textContent || '';
    const displayName = rawText.trim().length > 0 ? rawText : getDefaultTextTemplateLabel();

    timelineItem.dataset.displayName = displayName;
    const labelElement = timelineItem.querySelector('span');
    if (labelElement) {
        labelElement.textContent = displayName;
    }

    const previousObjectUrl = timelineItem.dataset.objectUrl || '';
    let nextObjectUrl = previousObjectUrl;

    if (typeof window !== 'undefined' && typeof window.createDefaultTextOverlayObjectURL === 'function') {
        try {
            nextObjectUrl = window.createDefaultTextOverlayObjectURL(displayName, style);
        } catch (error) {
            console.warn('Failed to generate text overlay preview.', error);
            nextObjectUrl = previousObjectUrl;
        }
    }

    if (nextObjectUrl && nextObjectUrl !== previousObjectUrl) {
        timelineItem.dataset.objectUrl = nextObjectUrl;
        const thumbnail = timelineItem.querySelector('.timeline-thumbnail--text');
        if (thumbnail) {
            thumbnail.src = nextObjectUrl;
        }
        if (previewImage && previewImage.src !== nextObjectUrl && timelineItem === activeTimelineItem) {
            previewImage.src = nextObjectUrl;
        }
        preloadTimelineImage(nextObjectUrl).catch(() => {});
        if (previousObjectUrl && previousObjectUrl !== nextObjectUrl) {
            releaseTimelineImage(previousObjectUrl);
            try {
                URL.revokeObjectURL(previousObjectUrl);
            } catch (error) {
                // Ignore revoke failures.
            }
        }
    }

    const isEditingCurrentItem = previewTextEditorState.isEnabled
        && previewTextEditorState.currentItem
        && previewTextEditorState.currentItem === timelineItem;

    if (isEditingCurrentItem) {
        const lockedSerialized = previewTextEditorState.lockedTransformSerialized || '';
        const lockedTransform = previewTextEditorState.lockedTransform;

        if (lockedSerialized) {
            timelineItem.dataset.previewImageTransform = lockedSerialized;
        } else if (lockedTransform) {
            const serializedLocked = JSON.stringify(lockedTransform);
            timelineItem.dataset.previewImageTransform = serializedLocked;
            previewTextEditorState.lockedTransformSerialized = serializedLocked;
        }

        if (lockedTransform && timelineItem === activeTimelineItem) {
            applyStoredPreviewImageTransform(lockedTransform);
        }
    } else {
        autoFitDefaultTextTimelineItem(timelineItem, displayName, style);
    }

    refreshActiveOverlayLayers();
    updatePreviewTextEditorPlaceholderState(previewTextEditor?.textContent || rawText);
}

function applyTimelineTextStyleUpdates(updates = {}) {
    const timelineItem = getActiveDefaultTextTimelineItem();
    if (!timelineItem) {
        return;
    }

    const normalizedStyle = storeTimelineTextStyle(timelineItem, updates);
    applyTextStyleToPreviewEditor(normalizedStyle);
    regenerateDefaultTextOverlayAssets(timelineItem, normalizedStyle);
    syncTextEffectsControlsToTimelineItem(timelineItem);
}

function toggleActiveTextStyle(styleKey) {
    if (!styleKey) {
        return;
    }

    const timelineItem = getActiveDefaultTextTimelineItem();
    if (!timelineItem) {
        return;
    }

    const currentStyle = getTimelineTextStyle(timelineItem);
    const fontEntry = getFontLibraryEntry(currentStyle.fontKey);

    if (styleKey === 'bold') {
        const baseWeight = Number.isFinite(Number(fontEntry?.weight))
            ? Number(fontEntry.weight)
            : DEFAULT_TEXT_STYLE.fontWeight;
        const boldWeight = getBoldFontWeightForFont(fontEntry);
        const isBoldActive = Number(currentStyle.fontWeight) >= boldWeight;
        const nextWeight = isBoldActive ? baseWeight : boldWeight;
        applyTimelineTextStyleUpdates({ fontWeight: nextWeight });
        return;
    }

    if (styleKey === 'italic') {
        const nextStyle = currentStyle.fontStyle === 'italic' ? 'normal' : 'italic';
        applyTimelineTextStyleUpdates({ fontStyle: nextStyle });
        return;
    }

    if (styleKey === 'underline') {
        const nextDecoration = currentStyle.textDecoration === 'underline' ? 'none' : 'underline';
        applyTimelineTextStyleUpdates({ textDecoration: nextDecoration });
    }
}

function updatePreviewTextEditorPlaceholderState(valueOverride = null) {
    if (!previewTextEditor) {
        return;
    }
    const placeholder = getDefaultTextTemplateLabel();
    previewTextEditor.dataset.placeholder = placeholder;
    const candidate = valueOverride !== null && valueOverride !== undefined
        ? String(valueOverride)
        : (previewTextEditor.textContent || '');
    const trimmed = candidate.trim();
    if (trimmed.length === 0) {
        previewTextEditor.setAttribute('data-show-placeholder', 'true');
    } else {
        previewTextEditor.removeAttribute('data-show-placeholder');
    }
}

function focusPreviewTextEditor(options = {}) {
    if (!previewTextEditor) {
        return;
    }

    const { placeCursorAtEnd = true } = options;

    try {
        previewTextEditor.focus({ preventScroll: true });
    } catch (error) {
        previewTextEditor.focus();
    }

    if (!placeCursorAtEnd) {
        return;
    }

    if (typeof window === 'undefined' || typeof window.getSelection !== 'function') {
        return;
    }

    const selection = window.getSelection();
    if (!selection) {
        return;
    }

    const range = document.createRange();
    range.selectNodeContents(previewTextEditor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
}

function enablePreviewTextEditor(timelineItem, options = {}) {
    if (!previewTextEditor || !timelineItem) {
        return;
    }

    const placeCursorAtEnd = options.placeCursorAtEnd !== false;

    const storedValue = timelineItem.dataset?.textContent || '';

    previewTextEditor.hidden = false;
    if (previewTextEditor.textContent !== storedValue) {
        previewTextEditor.textContent = storedValue;
    }

    applyTextStyleToPreviewEditor(getTimelineTextStyle(timelineItem));
    syncTextEffectsControlsToTimelineItem(timelineItem);

    const inlinePadding = getDefaultTextTemplatePaddingInline();
    const blockPadding = getDefaultTextTemplatePaddingBlock();
    if (Number.isFinite(inlinePadding)) {
        previewTextEditor.style.setProperty('--preview-text-padding-inline', `${inlinePadding}px`);
    }
    if (Number.isFinite(blockPadding)) {
        previewTextEditor.style.setProperty('--preview-text-padding-block', `${blockPadding}px`);
    }

    if (previewImageFrame) {
        previewImageFrame.classList.add('is-text-overlay');
    }

    if (typeof refreshActiveOverlayLayers === 'function') {
        refreshActiveOverlayLayers();
    }

    updatePreviewTextEditorPlaceholderState(storedValue);

    previewTextEditorState.isEnabled = true;
    previewTextEditorState.currentItem = timelineItem;
    previewTextEditorState.lastCommittedValue = normalizePreviewTextEditorValue(storedValue);
    previewTextEditorState.lockedTransform = null;
    previewTextEditorState.lockedTransformSerialized = '';

    const shouldFocus = options.forceFocus
        || (options.autoFocus !== false && document.activeElement !== previewTextEditor);

    if (shouldFocus && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => {
            focusPreviewTextEditor({ placeCursorAtEnd });
        });
    } else if (shouldFocus) {
        focusPreviewTextEditor({ placeCursorAtEnd });
    }
}

function disablePreviewTextEditor(options = {}) {
    if (!previewTextEditorState.isEnabled) {
        return;
    }

    if (!options.skipCommit) {
        commitPreviewTextEditorContent({ force: true });
    }

    previewTextEditorState.isEnabled = false;
    previewTextEditorState.currentItem = null;
    previewTextEditorState.lastCommittedValue = '';
    previewTextEditorState.lockedTransform = null;
    previewTextEditorState.lockedTransformSerialized = '';

    if (previewTextCommitTimer !== null) {
        window.clearTimeout(previewTextCommitTimer);
        previewTextCommitTimer = null;
    }

    if (previewTextEditor) {
        previewTextEditor.textContent = '';
        previewTextEditor.hidden = true;
        updatePreviewTextEditorPlaceholderState('');
        if (previewTextEditor === document.activeElement) {
            previewTextEditor.blur();
        }
    }

    if (previewImageFrame) {
        previewImageFrame.classList.remove('is-text-overlay', 'is-text-editing');
    }

    if (typeof refreshActiveOverlayLayers === 'function') {
        refreshActiveOverlayLayers();
    }

    syncTextEffectsControlsToTimelineItem(activeTimelineItem || null);
}

function syncPreviewTextEditorState(timelineItem, options = {}) {
    if (!previewTextEditor) {
        return;
    }

    if (!timelineItem || !isDefaultTextTimelineItem(timelineItem)) {
        if (previewTextEditorState.isEnabled) {
            disablePreviewTextEditor(options);
        }
        return;
    }

    const storedValue = timelineItem.dataset?.textContent || '';
    const needsEnable = !previewTextEditorState.isEnabled
        || previewTextEditorState.currentItem !== timelineItem;

    if (needsEnable) {
        enablePreviewTextEditor(timelineItem, options);
    } else if (previewTextEditor.textContent !== storedValue) {
        previewTextEditor.textContent = storedValue;
        updatePreviewTextEditorPlaceholderState(storedValue);
    }

    previewTextEditorState.currentItem = timelineItem;
    previewTextEditorState.lastCommittedValue = normalizePreviewTextEditorValue(storedValue);
    applyTextStyleToPreviewEditor(getTimelineTextStyle(timelineItem));
    syncTextEffectsControlsToTimelineItem(timelineItem);

    if (options.forceFocus && previewTextEditor && document.activeElement !== previewTextEditor) {
        const placeCursorAtEnd = options.placeCursorAtEnd !== false;
        focusPreviewTextEditor({ placeCursorAtEnd });
    }

    if (previewImageFrame) {
        previewImageFrame.classList.add('is-text-overlay');
    }
}

function schedulePreviewTextEditorCommit() {
    if (previewTextCommitTimer !== null) {
        window.clearTimeout(previewTextCommitTimer);
    }
    previewTextCommitTimer = window.setTimeout(() => {
        previewTextCommitTimer = null;
        commitPreviewTextEditorContent();
    }, PREVIEW_TEXT_COMMIT_DELAY_MS);
}

function updateDefaultTextTimelineItemContent(timelineItem, normalizedText) {
    if (!timelineItem) {
        return;
    }

    const committedValue = normalizedText;
    timelineItem.dataset.textContent = committedValue;

    regenerateDefaultTextOverlayAssets(timelineItem);
    applyTextStyleToPreviewEditor(getTimelineTextStyle(timelineItem));
    previewTextEditorState.lastCommittedValue = committedValue;
    updatePreviewTextEditorPlaceholderState(previewTextEditor?.textContent || committedValue);
}

function commitPreviewTextEditorContent(options = {}) {
    if (!previewTextEditorState.isEnabled) {
        return;
    }

    if (previewTextCommitTimer !== null) {
        window.clearTimeout(previewTextCommitTimer);
        previewTextCommitTimer = null;
    }

    const timelineItem = previewTextEditorState.currentItem;
    if (!timelineItem || !timelineItem.isConnected) {
        return;
    }

    const rawValue = previewTextEditor ? (previewTextEditor.textContent || '') : '';
    const normalized = normalizePreviewTextEditorValue(rawValue);

    if (normalized === previewTextEditorState.lastCommittedValue) {
        updatePreviewTextEditorPlaceholderState(rawValue);
        return;
    }

    updateDefaultTextTimelineItemContent(timelineItem, normalized);
}

function onPreviewTextEditorInput() {
    if (!previewTextEditorState.isEnabled || !previewTextEditor) {
        return;
    }

    const currentValue = previewTextEditor.textContent || '';
    updatePreviewTextEditorPlaceholderState(currentValue);
    schedulePreviewTextEditorCommit();
}

function onPreviewTextEditorFocus() {
    if (previewImageFrame) {
        previewImageFrame.classList.add('is-text-editing');
    }

    const timelineItem = previewTextEditorState.currentItem;
    if (!timelineItem || !timelineItem.isConnected || !isDefaultTextTimelineItem(timelineItem)) {
        previewTextEditorState.lockedTransform = null;
        previewTextEditorState.lockedTransformSerialized = '';
        return;
    }

    const serializedTransform = timelineItem.dataset?.previewImageTransform || '';
    previewTextEditorState.lockedTransformSerialized = serializedTransform;
    previewTextEditorState.lockedTransform = getStoredPreviewImageTransform(timelineItem);

    if (timelineItem.dataset) {
        timelineItem.dataset.autoFitText = 'false';
    }
}

function onPreviewTextEditorBlur() {
    if (previewImageFrame) {
        previewImageFrame.classList.remove('is-text-editing');
    }
    commitPreviewTextEditorContent({ force: true });
    previewTextEditorState.lockedTransform = null;
    previewTextEditorState.lockedTransformSerialized = '';
}

function onPreviewTextEditorKeyDown(event) {
    if (!previewTextEditorState.isEnabled) {
        return;
    }
    if (event.key === 'Enter') {
        event.preventDefault();
        previewTextEditor.blur();
        return;
    }
    if (event.key === 'Escape') {
        event.preventDefault();
        const revertValue = previewTextEditorState.lastCommittedValue || '';
        if (previewTextEditor.textContent !== revertValue) {
            previewTextEditor.textContent = revertValue;
            updatePreviewTextEditorPlaceholderState(revertValue);
        }
        previewTextEditor.blur();
    }
}

function onPreviewTextEditorPaste(event) {
    if (!previewTextEditorState.isEnabled) {
        return;
    }
    const text = event.clipboardData?.getData('text/plain');
    if (!text) {
        return;
    }
    event.preventDefault();
    let didInsert = false;
    try {
        if (typeof document.execCommand === 'function') {
            didInsert = document.execCommand('insertText', false, text);
        }
    } catch (error) {
        didInsert = false;
    }
    if (!didInsert && typeof window !== 'undefined' && typeof window.getSelection === 'function') {
        const selection = window.getSelection();
        if (selection) {
            selection.deleteFromDocument();
            const range = selection.getRangeAt(0);
            range.insertNode(document.createTextNode(text));
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
            didInsert = true;
        }
    }
    if (!didInsert && previewTextEditor) {
        previewTextEditor.textContent += text;
        focusPreviewTextEditor();
    }
    updatePreviewTextEditorPlaceholderState(previewTextEditor?.textContent || text);
    schedulePreviewTextEditorCommit();
}

function hidePreviewOutsideOutline() {
    if (!previewOutsideIndicator) {
        return;
    }

    previewOutsideIndicator.setAttribute('hidden', '');

    if (!previewOutsideSegments) {
        return;
    }

    Object.values(previewOutsideSegments).forEach((segment) => {
        if (!segment) {
            return;
        }
        segment.style.display = 'none';
        segment.style.removeProperty('left');
        segment.style.removeProperty('top');
        segment.style.removeProperty('width');
        segment.style.removeProperty('height');
    });
}

function updatePreviewOutsideOutline() {
    if (!previewOutsideIndicator
        || !previewOutsideSegments
        || !previewImageTransform
        || !previewViewport
        || !previewCard) {
        hidePreviewOutsideOutline();
        return;
    }

    const viewportWidth = Math.max(0, previewViewport.clientWidth);
    const viewportHeight = Math.max(0, previewViewport.clientHeight);

    if (viewportWidth === 0 || viewportHeight === 0) {
        hidePreviewOutsideOutline();
        return;
    }

    const frameWidth = Math.max(0, previewImageTransform.width);
    const frameHeight = Math.max(0, previewImageTransform.height);

    if (frameWidth === 0 || frameHeight === 0) {
        hidePreviewOutsideOutline();
        return;
    }

    const overflowLeft = Math.min(Math.max(0, -previewImageTransform.left), frameWidth);
    const overflowTop = Math.min(Math.max(0, -previewImageTransform.top), frameHeight);
    const overflowRight = Math.min(
        Math.max(0, (previewImageTransform.left + frameWidth) - viewportWidth),
        frameWidth,
    );
    const overflowBottom = Math.min(
        Math.max(0, (previewImageTransform.top + frameHeight) - viewportHeight),
        frameHeight,
    );

    if (overflowLeft <= 0 && overflowTop <= 0 && overflowRight <= 0 && overflowBottom <= 0) {
        hidePreviewOutsideOutline();
        return;
    }

    const viewportRect = previewViewport.getBoundingClientRect();
    const cardRect = previewCard.getBoundingClientRect();

    const frameLeft = viewportRect.left - cardRect.left + previewImageTransform.left;
    const frameTop = viewportRect.top - cardRect.top + previewImageTransform.top;

    previewOutsideIndicator.removeAttribute('hidden');

    const { top, right, bottom, left } = previewOutsideSegments;

    if (left) {
        if (overflowLeft > 0) {
            left.style.display = 'block';
            left.style.left = `${frameLeft}px`;
            left.style.top = `${frameTop}px`;
            left.style.width = `${overflowLeft}px`;
            left.style.height = `${frameHeight}px`;
        } else {
            left.style.display = 'none';
        }
    }

    if (right) {
        if (overflowRight > 0) {
            right.style.display = 'block';
            right.style.left = `${frameLeft + frameWidth - overflowRight}px`;
            right.style.top = `${frameTop}px`;
            right.style.width = `${overflowRight}px`;
            right.style.height = `${frameHeight}px`;
        } else {
            right.style.display = 'none';
        }
    }

    if (top) {
        if (overflowTop > 0) {
            top.style.display = 'block';
            top.style.left = `${frameLeft}px`;
            top.style.top = `${frameTop}px`;
            top.style.width = `${frameWidth}px`;
            top.style.height = `${overflowTop}px`;
        } else {
            top.style.display = 'none';
        }
    }

    if (bottom) {
        if (overflowBottom > 0) {
            bottom.style.display = 'block';
            bottom.style.left = `${frameLeft}px`;
            bottom.style.top = `${frameTop + frameHeight - overflowBottom}px`;
            bottom.style.width = `${frameWidth}px`;
            bottom.style.height = `${overflowBottom}px`;
        } else {
            bottom.style.display = 'none';
        }
    }
}

function resetPreviewImageFrameToFit() {
    if (!previewImage || !previewImageFrame || !previewViewport || previewImage.hidden) {
        return;
    }

    if (tryRestorePreviewImageTransform(activeTimelineItem)) {
        return;
    }

    const viewportWidth = Math.max(0, previewViewport.clientWidth);
    const viewportHeight = Math.max(0, previewViewport.clientHeight);

    if (viewportWidth === 0 || viewportHeight === 0) {
        return;
    }

    const naturalWidth = Math.max(1, previewImage.naturalWidth || viewportWidth);
    const naturalHeight = Math.max(1, previewImage.naturalHeight || viewportHeight);
    const aspectRatio = naturalWidth / naturalHeight || 1;

    let targetWidth = viewportWidth;
    let targetHeight = targetWidth / aspectRatio;

    if (targetHeight > viewportHeight) {
        targetHeight = viewportHeight;
        targetWidth = targetHeight * aspectRatio;
    }

    const minimumWidth = Math.min(viewportWidth, MIN_IMAGE_FRAME_SIZE);
    if (targetWidth < minimumWidth) {
        targetWidth = minimumWidth;
        targetHeight = targetWidth / aspectRatio;
    }

    const left = (viewportWidth - targetWidth) / 2;
    const top = (viewportHeight - targetHeight) / 2;

    previewImageTransform = {
        left,
        top,
        width: targetWidth,
        height: targetHeight,
        aspectRatio: aspectRatio > 0 ? aspectRatio : 1,
        rotation: 0,
    };

    lastPreviewViewportSize = { width: viewportWidth, height: viewportHeight };
    lastNonZeroPreviewViewportSize = { width: viewportWidth, height: viewportHeight };
    applyPreviewImageTransform();
}

function showPreviewImageLayer() {
    if (!previewImageLayer) {
        return;
    }
    previewImageLayer.removeAttribute('hidden');
}

function hidePreviewImageLayer() {
    if (!previewImageLayer) {
        return;
    }
    if (previewImagePointerState.pointerId !== null) {
        if (previewImageFrame?.hasPointerCapture?.(previewImagePointerState.pointerId)) {
            previewImageFrame.releasePointerCapture(previewImagePointerState.pointerId);
        }
        previewResizeHandles.forEach((handle) => {
            if (handle?.hasPointerCapture?.(previewImagePointerState.pointerId)) {
                handle.releasePointerCapture(previewImagePointerState.pointerId);
            }
        });
    }
    previewImageLayer.setAttribute('hidden', '');
    clearPreviewImageTransform();
    pendingPreviewImageTransform = null;
    shouldResetImageFrameOnNextViewportUpdate = false;
    lastPreviewViewportSize = null;
    lastNonZeroPreviewViewportSize = null;
    previewImagePointerState.pointerId = null;
    previewImagePointerState.mode = null;
    previewImagePointerState.handle = null;
    previewImagePointerState.origin = null;
}

function updatePreviewImageFrameVisibility() {
    if (!previewImageFrame || !previewViewport || !previewImageTransform) {
        if (previewImageFrame) {
            previewImageFrame.removeAttribute('data-outside-viewport');
        }
        return;
    }

    const viewportWidth = Math.max(0, previewViewport.clientWidth);
    const viewportHeight = Math.max(0, previewViewport.clientHeight);

    if (viewportWidth === 0 || viewportHeight === 0) {
        previewImageFrame.removeAttribute('data-outside-viewport');
        return;
    }

    const frameLeft = previewImageTransform.left;
    const frameTop = previewImageTransform.top;
    const frameRight = frameLeft + previewImageTransform.width;
    const frameBottom = frameTop + previewImageTransform.height;

    const extendsBeyondViewport = frameLeft < 0
        || frameTop < 0
        || frameRight > viewportWidth
        || frameBottom > viewportHeight;

    if (extendsBeyondViewport) {
        previewImageFrame.setAttribute('data-outside-viewport', 'true');
    } else {
        previewImageFrame.removeAttribute('data-outside-viewport');
    }
}

function queuePreviewImageFrameReset() {
    if (!previewImage || previewImage.hidden) {
        return;
    }
    shouldResetImageFrameOnNextViewportUpdate = true;
    schedulePreviewViewportSizeUpdate();
}

const CREATIVE_CONTROLS_MIN_SCROLL_HEIGHT = 500;
const CREATIVE_CONTROLS_BOTTOM_OFFSET = 24;

const creativeControlsPanel = document.querySelector('.settings-card');
let lastCreativeControlsPanelHeight = null;

function handlePreviewViewportResized() {
    if (!previewViewport) {
        hidePreviewOutsideOutline();
        refreshActiveOverlayLayers();
        return;
    }

    const width = Math.max(0, previewViewport.clientWidth);
    const height = Math.max(0, previewViewport.clientHeight);

    refreshCanvasBackdropExpansion();

    if (creativeControlsPanel) {
        const panelRect = creativeControlsPanel.getBoundingClientRect();
        const availableHeight = Math.max(
            0,
            window.innerHeight - panelRect.top - CREATIVE_CONTROLS_BOTTOM_OFFSET,
        );

        let targetHeight = height > 0 ? height : 0;

        if (availableHeight > 0) {
            targetHeight = Math.max(availableHeight, CREATIVE_CONTROLS_MIN_SCROLL_HEIGHT);

            if (targetHeight > availableHeight) {
                targetHeight = availableHeight;
            }
        } else if (targetHeight < CREATIVE_CONTROLS_MIN_SCROLL_HEIGHT) {
            targetHeight = CREATIVE_CONTROLS_MIN_SCROLL_HEIGHT;
        }

        if (targetHeight > 0) {
            const heightValue = `${Math.round(targetHeight)}px`;
            if (lastCreativeControlsPanelHeight !== heightValue) {
                creativeControlsPanel.style.setProperty('--settings-panel-height', heightValue);
                lastCreativeControlsPanelHeight = heightValue;
            }
        } else if (lastCreativeControlsPanelHeight !== null) {
            creativeControlsPanel.style.removeProperty('--settings-panel-height');
            lastCreativeControlsPanelHeight = null;
        }
    }

    if (width === 0 || height === 0) {
        lastPreviewViewportSize = { width, height };
        hidePreviewOutsideOutline();
        refreshActiveOverlayLayers();
        return;
    }

    if (pendingPreviewImageTransform) {
        const applied = applyStoredPreviewImageTransform(pendingPreviewImageTransform, { width, height });

        if (applied) {
            pendingPreviewImageTransform = null;
            lastPreviewViewportSize = { width, height };
            lastNonZeroPreviewViewportSize = { width, height };
            refreshActiveOverlayLayers();
            return;
        }
    }

    if (shouldResetImageFrameOnNextViewportUpdate) {
        shouldResetImageFrameOnNextViewportUpdate = false;
        resetPreviewImageFrameToFit();
        lastPreviewViewportSize = { width, height };
        lastNonZeroPreviewViewportSize = { width, height };
        refreshActiveOverlayLayers();
        return;
    }

    if (!previewImageTransform) {
        lastPreviewViewportSize = { width, height };
        lastNonZeroPreviewViewportSize = { width, height };
        hidePreviewOutsideOutline();
        refreshActiveOverlayLayers();
        return;
    }

    if (!lastPreviewViewportSize || lastPreviewViewportSize.width === 0) {
        lastPreviewViewportSize = { width, height };
        lastNonZeroPreviewViewportSize = { width, height };
        hidePreviewOutsideOutline();
        refreshActiveOverlayLayers();
        return;
    }

    const scale = width / lastPreviewViewportSize.width;

    if (!Number.isFinite(scale) || scale <= 0) {
        lastPreviewViewportSize = { width, height };
        lastNonZeroPreviewViewportSize = { width, height };
        hidePreviewOutsideOutline();
        refreshActiveOverlayLayers();
        return;
    }

    const previousCenterX = previewImageTransform.left + (previewImageTransform.width / 2);
    const previousCenterY = previewImageTransform.top + (previewImageTransform.height / 2);

    const nextWidth = previewImageTransform.width * scale;
    const nextHeight = nextWidth / (previewImageTransform.aspectRatio || 1);
    const nextCenterX = previousCenterX * scale;
    const nextCenterY = previousCenterY * scale;

    previewImageTransform.left = nextCenterX - (nextWidth / 2);
    previewImageTransform.top = nextCenterY - (nextHeight / 2);
    previewImageTransform.width = nextWidth;
    previewImageTransform.height = nextHeight;

    lastPreviewViewportSize = { width, height };
    lastNonZeroPreviewViewportSize = { width, height };
    applyPreviewImageTransform();
    refreshActiveOverlayLayers();
}

function calculatePreviewImageResize(handle, deltaX, deltaY, origin) {
    const aspectRatio = origin.aspectRatio > 0 ? origin.aspectRatio : 1;
    const baseMin = Math.max(32, MIN_IMAGE_FRAME_SIZE);
    const minWidth = baseMin;
    const minHeight = Math.max(32, baseMin / aspectRatio);

    const clampWidth = (value) => Math.max(minWidth, value);
    const clampHeight = (value) => Math.max(minHeight, value);

    const chooseWidth = (primary, secondary) => {
        const candidate = Math.abs(deltaX) >= Math.abs(deltaY) ? primary : secondary;
        return Math.max(baseMin, candidate);
    };

    switch (handle) {
        case 'n': {
            const nextHeight = clampHeight(origin.height - deltaY);
            const top = origin.oppositeY - nextHeight;
            return {
                left: origin.left,
                top,
                width: origin.width,
                height: nextHeight,
                aspectRatio: origin.width > 0 && nextHeight > 0
                    ? origin.width / nextHeight
                    : aspectRatio,
            };
        }
        case 's': {
            const nextHeight = clampHeight(origin.height + deltaY);
            return {
                left: origin.left,
                top: origin.top,
                width: origin.width,
                height: nextHeight,
                aspectRatio: origin.width > 0 && nextHeight > 0
                    ? origin.width / nextHeight
                    : aspectRatio,
            };
        }
        case 'w': {
            const nextWidth = clampWidth(origin.width - deltaX);
            const left = origin.oppositeX - nextWidth;
            return {
                left,
                top: origin.top,
                width: nextWidth,
                height: origin.height,
                aspectRatio: nextWidth > 0 && origin.height > 0
                    ? nextWidth / origin.height
                    : aspectRatio,
            };
        }
        case 'e': {
            const nextWidth = clampWidth(origin.width + deltaX);
            return {
                left: origin.left,
                top: origin.top,
                width: nextWidth,
                height: origin.height,
                aspectRatio: nextWidth > 0 && origin.height > 0
                    ? nextWidth / origin.height
                    : aspectRatio,
            };
        }
        case 'nw': {
            const widthFromDx = origin.width - deltaX;
            const heightFromDy = origin.height - deltaY;
            let nextWidth = chooseWidth(widthFromDx, heightFromDy * aspectRatio);
            let nextHeight = nextWidth / aspectRatio;
            if (nextHeight < minHeight) {
                nextHeight = minHeight;
                nextWidth = nextHeight * aspectRatio;
            }
            return {
                left: origin.oppositeX - nextWidth,
                top: origin.oppositeY - nextHeight,
                width: nextWidth,
                height: nextHeight,
                aspectRatio,
            };
        }
        case 'ne': {
            const widthFromDx = origin.width + deltaX;
            const heightFromDy = origin.height - deltaY;
            let nextWidth = chooseWidth(widthFromDx, heightFromDy * aspectRatio);
            let nextHeight = nextWidth / aspectRatio;
            if (nextHeight < minHeight) {
                nextHeight = minHeight;
                nextWidth = nextHeight * aspectRatio;
            }
            return {
                left: origin.left,
                top: origin.oppositeY - nextHeight,
                width: nextWidth,
                height: nextHeight,
                aspectRatio,
            };
        }
        case 'sw': {
            const widthFromDx = origin.width - deltaX;
            const heightFromDy = origin.height + deltaY;
            let nextWidth = chooseWidth(widthFromDx, heightFromDy * aspectRatio);
            let nextHeight = nextWidth / aspectRatio;
            if (nextHeight < minHeight) {
                nextHeight = minHeight;
                nextWidth = nextHeight * aspectRatio;
            }
            return {
                left: origin.oppositeX - nextWidth,
                top: origin.top,
                width: nextWidth,
                height: nextHeight,
                aspectRatio,
            };
        }
        case 'se':
        default: {
            const widthFromDx = origin.width + deltaX;
            const heightFromDy = origin.height + deltaY;
            let nextWidth = chooseWidth(widthFromDx, heightFromDy * aspectRatio);
            let nextHeight = nextWidth / aspectRatio;
            if (nextHeight < minHeight) {
                nextHeight = minHeight;
                nextWidth = nextHeight * aspectRatio;
            }
            return {
                left: origin.left,
                top: origin.top,
                width: nextWidth,
                height: nextHeight,
                aspectRatio,
            };
        }
    }
}

function endPreviewImagePointerInteraction() {
    if (previewImageFrame) {
        previewImageFrame.classList.remove('is-dragging', 'is-resizing');
    }
    const hadInteraction = previewImagePointerState.mode !== null
        && previewImagePointerState.mode !== 'text-edit';
    previewImagePointerState.pointerId = null;
    previewImagePointerState.mode = null;
    previewImagePointerState.handle = null;
    previewImagePointerState.origin = null;
    if (hadInteraction) {
        persistPreviewImageTransformForActiveTimelineItem({ allowKeyframeUpdate: true });
    }
    schedulePreviewGuidesHide();
}

function onPreviewImagePointerDown(event) {
    if (!previewImageFrame || !previewImageTransform || previewImage.hidden) {
        return;
    }

    if (event.button !== 0) {
        return;
    }

    const isTextEditorActive = previewTextEditorState.isEnabled
        && previewTextEditorState.currentItem
        && previewTextEditorState.currentItem === activeTimelineItem;

    const targetIsTextEditor = isTextEditorActive
        && previewTextEditor
        && (event.target === previewTextEditor || previewTextEditor.contains(event.target));

    if (targetIsTextEditor) {
        const pointerScale = typeof getPreviewViewportPointerScale === 'function'
            ? getPreviewViewportPointerScale()
            : { scaleX: 1, scaleY: 1 };
        const scaleX = Number.isFinite(pointerScale?.scaleX) && pointerScale.scaleX > 0
            ? pointerScale.scaleX
            : 1;
        const scaleY = Number.isFinite(pointerScale?.scaleY) && pointerScale.scaleY > 0
            ? pointerScale.scaleY
            : 1;

        previewImagePointerState.pointerId = event.pointerId;
        previewImagePointerState.mode = 'text-edit';
        previewImagePointerState.handle = 'se';
        previewImagePointerState.origin = {
            pointerX: event.clientX,
            pointerY: event.clientY,
            left: previewImageTransform.left,
            top: previewImageTransform.top,
            width: previewImageTransform.width,
            height: previewImageTransform.height,
            aspectRatio: previewImageTransform.aspectRatio || 1,
            oppositeX: previewImageTransform.left + previewImageTransform.width,
            oppositeY: previewImageTransform.top + previewImageTransform.height,
            scaleX,
            scaleY,
        };
        return;
    }

    const handleElement = event.target.closest('.preview-resize-handle');
    const captureTarget = handleElement || previewImageFrame;

    if (isTextEditorActive && previewTextEditor && previewTextEditor === document.activeElement) {
        previewTextEditor.blur();
    }

    if (typeof captureTarget.setPointerCapture === 'function') {
        captureTarget.setPointerCapture(event.pointerId);
    }

    const pointerScale = typeof getPreviewViewportPointerScale === 'function'
        ? getPreviewViewportPointerScale()
        : { scaleX: 1, scaleY: 1 };
    const scaleX = Number.isFinite(pointerScale?.scaleX) && pointerScale.scaleX > 0
        ? pointerScale.scaleX
        : 1;
    const scaleY = Number.isFinite(pointerScale?.scaleY) && pointerScale.scaleY > 0
        ? pointerScale.scaleY
        : 1;

    previewImagePointerState.pointerId = event.pointerId;
    previewImagePointerState.mode = handleElement ? 'resize' : 'drag';
    previewImagePointerState.handle = handleElement?.dataset.handle || 'se';
    previewImagePointerState.origin = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        left: previewImageTransform.left,
        top: previewImageTransform.top,
        width: previewImageTransform.width,
        height: previewImageTransform.height,
        aspectRatio: previewImageTransform.aspectRatio || 1,
        oppositeX: previewImageTransform.left + previewImageTransform.width,
        oppositeY: previewImageTransform.top + previewImageTransform.height,
        scaleX,
        scaleY,
    };

    if (previewImagePointerState.mode === 'resize') {
        previewImageFrame.classList.add('is-resizing');
    } else {
        previewImageFrame.classList.add('is-dragging');
    }

    setPreviewGuidesVisible(true);
    updatePreviewGuides(
        previewImageTransform,
        evaluatePreviewImageAlignment(previewImageTransform, getPreviewViewportSize()),
    );

    event.preventDefault();
    event.stopPropagation();
}

function onPreviewImagePointerMove(event) {
    if (previewImagePointerState.pointerId === null || event.pointerId !== previewImagePointerState.pointerId) {
        return;
    }

    if (!previewImageTransform) {
        return;
    }

    const origin = previewImagePointerState.origin || {};
    const scaleX = Number.isFinite(origin.scaleX) && origin.scaleX > 0 ? origin.scaleX : 1;
    const scaleY = Number.isFinite(origin.scaleY) && origin.scaleY > 0 ? origin.scaleY : 1;
    const deltaX = (event.clientX - origin.pointerX) * scaleX;
    const deltaY = (event.clientY - origin.pointerY) * scaleY;

    if (previewImagePointerState.mode === 'text-edit') {
        const threshold = PREVIEW_TEXT_DRAG_THRESHOLD;
        if ((deltaX * deltaX) + (deltaY * deltaY) <= (threshold * threshold)) {
            return;
        }
        previewImagePointerState.mode = 'drag';
        if (previewImageFrame) {
            previewImageFrame.classList.add('is-dragging');
        }
        if (previewTextEditor && previewTextEditor === document.activeElement) {
            previewTextEditor.blur();
        }
        if (typeof previewImageFrame?.setPointerCapture === 'function') {
            previewImageFrame.setPointerCapture(event.pointerId);
        }
        setPreviewGuidesVisible(true);
        updatePreviewGuides(
            previewImageTransform,
            evaluatePreviewImageAlignment(previewImageTransform, getPreviewViewportSize()),
        );
    }

    if (previewImagePointerState.mode !== 'drag' && previewImagePointerState.mode !== 'resize') {
        return;
    }

    setPreviewGuidesVisible(true);

    if (previewImagePointerState.mode === 'drag') {
        previewImageTransform.left = previewImagePointerState.origin.left + deltaX;
        previewImageTransform.top = previewImagePointerState.origin.top + deltaY;
    } else if (previewImagePointerState.mode === 'resize') {
        const next = calculatePreviewImageResize(
            previewImagePointerState.handle || 'se',
            deltaX,
            deltaY,
            previewImagePointerState.origin,
        );
        previewImageTransform.left = next.left;
        previewImageTransform.top = next.top;
        previewImageTransform.width = next.width;
        previewImageTransform.height = next.height;
        if (Number.isFinite(next.aspectRatio) && next.aspectRatio > 0) {
            previewImageTransform.aspectRatio = next.aspectRatio;
        } else if (previewImageTransform.width > 0 && previewImageTransform.height > 0) {
            previewImageTransform.aspectRatio = previewImageTransform.width / previewImageTransform.height;
        } else {
            previewImageTransform.aspectRatio = previewImagePointerState.origin.aspectRatio;
        }
    }

    const snapResult = snapPreviewImageTransform(previewImageTransform, {
        mode: previewImagePointerState.mode,
        handle: previewImagePointerState.handle,
        origin: previewImagePointerState.origin,
    });

    if (snapResult?.transform) {
        previewImageTransform.left = snapResult.transform.left;
        previewImageTransform.top = snapResult.transform.top;
        previewImageTransform.width = snapResult.transform.width;
        previewImageTransform.height = snapResult.transform.height;
        if (Number.isFinite(snapResult.transform.aspectRatio) && snapResult.transform.aspectRatio > 0) {
            previewImageTransform.aspectRatio = snapResult.transform.aspectRatio;
        }
    }

    applyPreviewImageTransform(snapResult?.alignment);

    event.preventDefault();
    event.stopPropagation();
}

function onPreviewImagePointerUp(event) {
    if (previewImagePointerState.pointerId === null || event.pointerId !== previewImagePointerState.pointerId) {
        return;
    }

    if (typeof event.target.releasePointerCapture === 'function' && event.target.hasPointerCapture(event.pointerId)) {
        event.target.releasePointerCapture(event.pointerId);
    }
    if (previewImageFrame?.hasPointerCapture?.(event.pointerId)) {
        previewImageFrame.releasePointerCapture(event.pointerId);
    }

    endPreviewImagePointerInteraction();
}

function onPreviewImagePointerCancel(event) {
    if (previewImagePointerState.pointerId === null || event.pointerId !== previewImagePointerState.pointerId) {
        return;
    }

    if (typeof event.target.releasePointerCapture === 'function' && event.target.hasPointerCapture(event.pointerId)) {
        event.target.releasePointerCapture(event.pointerId);
    }
    if (previewImageFrame?.hasPointerCapture?.(event.pointerId)) {
        previewImageFrame.releasePointerCapture(event.pointerId);
    }

    endPreviewImagePointerInteraction();
}

function setPreviewImageVisibility(isVisible) {
    if (!previewImage) {
        return;
    }

    cancelPreviewExitAnimation({ forceRestore: Boolean(isVisible) });

    if (isVisible) {
        previewImage.hidden = false;
        showPreviewImageLayer();
        schedulePreviewViewportSizeUpdate();
        if (previewImage.complete) {
            resetPreviewImageFrameToFit();
        } else {
            queuePreviewImageFrameReset();
        }
    } else {
        previewImage.classList.remove('is-visible');
        previewImage.hidden = true;
        hidePreviewImageLayer();
    }
}

function clearPreviewOverlayLayers() {
    if (!previewOverlayStack) {
        return;
    }

    if (typeof cancelOverlayPointerInteraction === 'function') {
        cancelOverlayPointerInteraction();
    }

    activeOverlayLayers.forEach((entry) => {
        if (!entry) {
            return;
        }
        entry.isVisible = false;
        entry.frame = null;
        entry.layerGroup = null;
        entry.zIndex = 0;
        entry.borderRadius = 0;
        entry.opacity = 1;
        entry.lastTimelineTime = null;
        resetOverlayAnimationState(entry);
        if (entry.layer) {
            overlayLayerToTimelineItem.delete(entry.layer);
            entry.layer.remove();
        }
    });
    activeOverlayLayers.clear();

    if (previewOverlayGroups) {
        const { below, above } = previewOverlayGroups;
        if (below) {
            below.textContent = '';
        }
        if (above) {
            above.textContent = '';
        }
    }

    previewOverlayStack.setAttribute('hidden', '');
    previewOverlayStack.setAttribute('aria-hidden', 'true');

    activeOverlayDescriptorCache = [];
    if (typeof resetActiveOverlayWindowState === 'function') {
        resetActiveOverlayWindowState();
    }

    lastOverlayRenderTimestamp = null;
}

function resolveLaneIndex(laneValue) {
    const parsed = Number.parseInt(laneValue ?? '', 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

function resolveOverlayFramePixels(timelineItem, viewportWidth, viewportHeight, options = {}) {
    if (!timelineItem || viewportWidth <= 0 || viewportHeight <= 0) {
        return null;
    }

    const { normalizedTransform = null } = options;

    let transform = null;
    if (normalizedTransform) {
        transform = sanitizeNormalizedKeyframeTransform(normalizedTransform);
    }

    if (!transform) {
        transform = getStoredPreviewImageTransform(timelineItem);
    }

    if (!transform) {
        return null;
    }

    const left = transform.left * viewportWidth;
    const top = transform.top * viewportHeight;
    const width = transform.width * viewportWidth;
    const height = transform.height * viewportHeight;

    if ([left, top, width, height].some((value) => !Number.isFinite(value))) {
        return null;
    }

    if (width <= 0 || height <= 0) {
        return null;
    }

    const rotation = clampRotation(transform.rotation);

    return {
        left,
        top,
        width,
        height,
        rotation,
    };
}

function doesClipIntersectWindow(descriptor, windowStart, windowEnd) {
    if (!descriptor) {
        return false;
    }

    const { start, end } = descriptor;

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return false;
    }

    if (end <= start) {
        return false;
    }

    if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd)) {
        return false;
    }

    const safeWindowStart = Math.min(windowStart, windowEnd);
    const safeWindowEnd = Math.max(windowStart, windowEnd);
    const tolerance = Math.max(0, Number(OVERLAY_TIMELINE_EDGE_TOLERANCE_MS) || 0);
    const extendedWindowStart = safeWindowStart - tolerance;
    const extendedWindowEnd = safeWindowEnd + tolerance;

    return end >= extendedWindowStart && start <= extendedWindowEnd;
}

function isClipActiveAtTime(descriptor, timeMs) {
    if (!descriptor) {
        return false;
    }

    const { start, end } = descriptor;

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return false;
    }

    if (end <= start) {
        return false;
    }

    if (!Number.isFinite(timeMs)) {
        return false;
    }

    return timeMs >= start && timeMs < end;
}

function easeOverlayTransitionProgress(value) {
    const t = clampProgress(Number(value) || 0);
    if (t <= 0) {
        return 0;
    }
    if (t >= 1) {
        return 1;
    }
    // Smoothstep for a gentle ease-in/ease-out curve that matches fade behaviour.
    return (t * t) * (3 - (2 * t));
}

function shouldRenderOverlayDescriptor(descriptor, timelineNow) {
    if (!descriptor || !descriptor.item) {
        return false;
    }

    if (descriptor.isActive) {
        return true;
    }

    const clipDuration = Math.max(
        0,
        Number.isFinite(descriptor.clipDuration)
            ? Number(descriptor.clipDuration)
            : (Number(descriptor.end) - Number(descriptor.start)),
    );
    if (clipDuration <= 0) {
        return false;
    }

    const descriptorEnd = Number(descriptor.end);
    if (!Number.isFinite(descriptorEnd)) {
        return false;
    }

    const effectiveTimelineNow = Number.isFinite(timelineNow)
        ? timelineNow
        : descriptorEnd;
    if (!Number.isFinite(effectiveTimelineNow)) {
        return false;
    }

    const activeEntry = getOverlayEntryForDescriptor(descriptor);
    const resolveEntryOpacity = (entry) => {
        if (!entry) {
            return 0;
        }
        if (Number.isFinite(entry.opacity)) {
            return entry.opacity;
        }
        if (Number.isFinite(entry.renderedOpacity)) {
            return entry.renderedOpacity;
        }
        return 0;
    };
    const previousOpacity = resolveEntryOpacity(activeEntry);

    const overshoot = effectiveTimelineNow - descriptorEnd;
    if (overshoot > OVERLAY_EXIT_OVERSHOOT_ALLOWANCE_MS && previousOpacity <= 0) {
        return false;
    }

    if (overshoot >= 0) {
        const tolerance = Math.max(0, Number(OVERLAY_TIMELINE_EDGE_TOLERANCE_MS) || 0);
        if (overshoot <= tolerance && previousOpacity > 0 && activeEntry?.isVisible) {
            return true;
        }
    }

    const animationSettings = descriptor.animationSettings
        || getTimelineItemAnimationSettings(descriptor.item);
    const direction = sanitizeAnimationDirection(animationSettings?.direction);
    if (direction !== 'out' && direction !== 'combo') {
        return false;
    }

    let exitConfig = descriptor.exitConfig;
    if (exitConfig === undefined) {
        exitConfig = getPreviewImageExitConfig({
            clipDurationMs: clipDuration,
            settingsOverride: animationSettings,
        }) || null;
        descriptor.exitConfig = exitConfig;
    }

    const totalExitWindow = Math.min(
        clipDuration,
        Math.max(0, Number(exitConfig?.totalDuration) || 0),
    );
    if (totalExitWindow <= 0) {
        return false;
    }

    const exitWindowStart = descriptorEnd - totalExitWindow;
    if (!Number.isFinite(exitWindowStart)) {
        return false;
    }

    return effectiveTimelineNow >= exitWindowStart;
}

function computeOverlayDescriptorOpacity(descriptor) {
    if (!descriptor || !descriptor.item) {
        return 1;
    }

    const clipDuration = Math.max(
        0,
        Number.isFinite(descriptor.clipDuration)
            ? Number(descriptor.clipDuration)
            : (Number(descriptor.end) - Number(descriptor.start)),
    );
    if (clipDuration <= 0) {
        return 1;
    }

    const animationSettings = descriptor.animationSettings
        || getTimelineItemAnimationSettings(descriptor.item);
    const direction = sanitizeAnimationDirection(animationSettings.direction);
    const elapsed = Math.max(0, Math.min(
        Number(descriptor.sampleTime) - Number(descriptor.start),
        clipDuration,
    ));

    let opacity = 1;

    if (direction === 'in' || direction === 'combo') {
        const entranceConfig = getPreviewImageEntranceConfig({
            clipDurationMs: clipDuration,
            settingsOverride: animationSettings,
        });
        const entranceWindow = Math.min(
            clipDuration,
            Math.max(0, Number(entranceConfig?.totalDuration) || 0),
        );
        if (entranceWindow > 0) {
            const entranceProgress = easeOverlayTransitionProgress(elapsed / entranceWindow);
            opacity *= entranceProgress;
        } else if (elapsed <= 0) {
            opacity *= 0;
        }
    }

    if (direction === 'out' || direction === 'combo') {
        let exitConfig = descriptor.exitConfig;
        if (exitConfig === undefined) {
            exitConfig = getPreviewImageExitConfig({
                clipDurationMs: clipDuration,
                settingsOverride: animationSettings,
            }) || null;
            descriptor.exitConfig = exitConfig;
        }
        const totalExitWindow = Math.min(
            clipDuration,
            Math.max(0, Number(exitConfig?.totalDuration) || 0),
        );

        if (totalExitWindow > 0) {
            const effectiveDelay = Math.min(
                totalExitWindow,
                Math.max(0, Number(exitConfig?.delay) || 0),
            );
            const effectiveDuration = Math.max(
                0,
                Math.min(
                    totalExitWindow,
                    Number(exitConfig?.duration) || (totalExitWindow - effectiveDelay),
                ),
            );
            const exitStart = clipDuration - totalExitWindow;

            if (elapsed >= exitStart) {
                const windowOffset = elapsed - exitStart;
                if (effectiveDuration <= 0 && windowOffset > effectiveDelay) {
                    opacity = 0;
                } else if (effectiveDuration > 0 && windowOffset > effectiveDelay) {
                    const exitProgress = easeOverlayTransitionProgress(
                        (windowOffset - effectiveDelay) / effectiveDuration,
                    );
                    opacity *= 1 - exitProgress;
                }
            }
        }
    }

    return clamp(opacity, 0, 1);
}

function computeOverlayEntryOpacity(entry) {
    if (!entry || !entry.layer || !entry.image) {
        return 1;
    }

    if (entry.layer.hasAttribute('hidden') || entry.image.hidden) {
        return 0;
    }

    if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
        return 1;
    }

    let opacity = 1;

    const layerStyle = window.getComputedStyle(entry.layer);
    if (layerStyle) {
        if (layerStyle.display === 'none' || layerStyle.visibility === 'hidden') {
            return 0;
        }
        const parsedLayerOpacity = Number.parseFloat(layerStyle.opacity);
        if (Number.isFinite(parsedLayerOpacity)) {
            opacity *= clamp(parsedLayerOpacity, 0, 1);
        }
    }

    const imageStyle = window.getComputedStyle(entry.image);
    if (imageStyle) {
        if (imageStyle.display === 'none' || imageStyle.visibility === 'hidden') {
            return 0;
        }
        const parsedImageOpacity = Number.parseFloat(imageStyle.opacity);
        if (Number.isFinite(parsedImageOpacity)) {
            opacity *= clamp(parsedImageOpacity, 0, 1);
        }
    }

    return clamp(opacity, 0, 1);
}

const OVERLAY_ANIMATION_IDENTITY = Object.freeze({
    translateX: 0,
    translateY: 0,
    scale: 1,
    rotate: 0,
});

const OVERLAY_ENTRANCE_ANIMATION_CURVES = {
    fade: [
        { time: 0, scale: 0.96 },
        { time: 0.45, scale: 1.01 },
        { time: 1, scale: 1 },
    ],
    'slide-up': [
        { time: 0, translateY: 26, scale: 0.94 },
        { time: 0.6, translateY: -6, scale: 1.02 },
        { time: 1, translateY: 0, scale: 1 },
    ],
    zoom: [
        { time: 0, scale: 0.82 },
        { time: 0.7, scale: 1.05 },
        { time: 1, scale: 1 },
    ],
    bounce: [
        { time: 0, translateY: 28, scale: 0.88 },
        { time: 0.55, translateY: -14, scale: 1.08 },
        { time: 0.75, translateY: 8, scale: 0.96 },
        { time: 1, translateY: 0, scale: 1 },
    ],
    'slide-left': [
        { time: 0, translateX: -104, scale: 0.98 },
        { time: 0.55, translateX: 2.5, scale: 1.01 },
        { time: 1, translateX: 0, scale: 1 },
    ],
};

const OVERLAY_EXIT_ANIMATION_CURVES = {
    fade: [
        { time: 0, scale: 1 },
        { time: 1, scale: 1 },
    ],
    'slide-down': [
        { time: 0, translateY: 0, scale: 1 },
        { time: 1, translateY: 28, scale: 0.92 },
    ],
    'zoom-out': [
        { time: 0, scale: 1 },
        { time: 1, scale: 0.78 },
    ],
    spin: [
        { time: 0, rotate: 0, scale: 1 },
        { time: 0.6, rotate: 0, scale: 1 },
        { time: 1, rotate: 540, scale: 0.6 },
    ],
    'slide-right': [
        { time: 0, translateX: 0, scale: 1 },
        { time: 0.35, translateX: -2.5, scale: 0.99 },
        { time: 1, translateX: 104, scale: 0.96 },
    ],
};

function formatOverlayAnimationPercent(value) {
    const numeric = Number.isFinite(value) ? value : 0;
    const rounded = Math.round(numeric * 1000) / 1000;
    if (Math.abs(rounded) < 0.0005) {
        return '0%';
    }
    return `${rounded}%`;
}

function formatOverlayAnimationScale(value) {
    const numeric = Number.isFinite(value) ? value : 1;
    const rounded = Math.round(numeric * 1000) / 1000;
    if (Math.abs(rounded) < 0.0005) {
        return '0';
    }
    return `${rounded}`;
}

function formatOverlayAnimationRotation(value) {
    const numeric = Number.isFinite(value) ? value : 0;
    const rounded = Math.round(numeric * 1000) / 1000;
    if (Math.abs(rounded) < 0.0005) {
        return '0deg';
    }
    return `${rounded}deg`;
}

function interpolateOverlayAnimationValue(start, end, ratio, fallback) {
    const startValue = Number.isFinite(start) ? start : fallback;
    const endValue = Number.isFinite(end) ? end : startValue;
    const clampedRatio = clampProgress(ratio);
    return startValue + ((endValue - startValue) * clampedRatio);
}

function evaluateOverlayAnimationCurve(curve, progress) {
    if (!Array.isArray(curve) || curve.length === 0) {
        return { ...OVERLAY_ANIMATION_IDENTITY };
    }

    const clampedProgress = clampProgress(progress);
    let previous = curve[0];

    if (clampedProgress <= previous.time) {
        return {
            translateX: Number.isFinite(previous.translateX) ? previous.translateX : 0,
            translateY: Number.isFinite(previous.translateY) ? previous.translateY : 0,
            scale: Number.isFinite(previous.scale) ? previous.scale : 1,
            rotate: Number.isFinite(previous.rotate) ? previous.rotate : 0,
        };
    }

    for (let index = 1; index < curve.length; index += 1) {
        const current = curve[index];
        if (clampedProgress <= current.time) {
            const span = current.time - previous.time;
            const ratio = span <= 0 ? 0 : (clampedProgress - previous.time) / span;
            return {
                translateX: interpolateOverlayAnimationValue(
                    previous.translateX,
                    current.translateX,
                    ratio,
                    0,
                ),
                translateY: interpolateOverlayAnimationValue(
                    previous.translateY,
                    current.translateY,
                    ratio,
                    0,
                ),
                scale: interpolateOverlayAnimationValue(previous.scale, current.scale, ratio, 1),
                rotate: interpolateOverlayAnimationValue(previous.rotate, current.rotate, ratio, 0),
            };
        }
        previous = current;
    }

    const last = curve[curve.length - 1];
    return {
        translateX: Number.isFinite(last.translateX) ? last.translateX : 0,
        translateY: Number.isFinite(last.translateY) ? last.translateY : 0,
        scale: Number.isFinite(last.scale) ? last.scale : 1,
        rotate: Number.isFinite(last.rotate) ? last.rotate : 0,
    };
}

function computeOverlayEntranceAnimationState(animationSettings, direction, clipDurationMs, clipTimeMs) {
    const sanitizedDirection = sanitizeAnimationDirection(direction);
    if (sanitizedDirection !== 'in' && sanitizedDirection !== 'combo') {
        return null;
    }

    const config = getPreviewImageEntranceConfig({
        clipDurationMs,
        settingsOverride: animationSettings,
    });
    if (!config) {
        return null;
    }

    const presetKey = sanitizedDirection === 'combo'
        ? sanitizeComboEntrancePreset(animationSettings?.comboInPreset)
        : sanitizeEntrancePreset(animationSettings?.inPreset);

    if (!presetKey || presetKey === 'none') {
        return { state: OVERLAY_ANIMATION_IDENTITY, active: false };
    }

    const curve = OVERLAY_ENTRANCE_ANIMATION_CURVES[presetKey]
        || OVERLAY_ENTRANCE_ANIMATION_CURVES.fade;
    const delay = Math.max(0, Number(config.delay) || 0);
    const duration = Math.max(0, Number(config.duration) || 0);
    if (duration <= 0) {
        return { state: OVERLAY_ANIMATION_IDENTITY, active: false };
    }

    const effectiveTime = Math.max(0, clipTimeMs - delay);
    const progress = duration > 0 ? effectiveTime / duration : 1;
    const state = evaluateOverlayAnimationCurve(curve, progress);
    const active = clipTimeMs < (delay + duration);
    return { state, active };
}

function computeOverlayExitAnimationState(animationSettings, direction, clipDurationMs, clipTimeMs, exitConfig) {
    const sanitizedDirection = sanitizeAnimationDirection(direction);
    if (sanitizedDirection !== 'out' && sanitizedDirection !== 'combo') {
        return null;
    }

    const config = exitConfig || getPreviewImageExitConfig({
        clipDurationMs,
        settingsOverride: animationSettings,
    });
    if (!config) {
        return null;
    }

    const presetKey = sanitizedDirection === 'combo'
        ? sanitizeComboExitPreset(animationSettings?.comboOutPreset)
        : sanitizeExitPreset(animationSettings?.outPreset);

    if (!presetKey || presetKey === 'none') {
        return { state: OVERLAY_ANIMATION_IDENTITY, active: false, hasStarted: false };
    }

    const curve = OVERLAY_EXIT_ANIMATION_CURVES[presetKey]
        || OVERLAY_EXIT_ANIMATION_CURVES.fade;
    const totalWindow = Math.min(
        clipDurationMs,
        Math.max(0, Number(config.totalDuration) || 0),
    );
    if (totalWindow <= 0) {
        return null;
    }

    const delay = Math.max(0, Number(config.delay) || 0);
    let duration = Math.max(0, Number(config.duration) || 0);
    if (duration <= 0 && totalWindow > delay) {
        duration = totalWindow - delay;
    }

    const windowStart = Math.max(0, clipDurationMs - totalWindow);
    const animationStart = windowStart + delay;
    if (clipTimeMs < windowStart) {
        return { state: OVERLAY_ANIMATION_IDENTITY, active: false, hasStarted: false };
    }

    if (duration <= 0) {
        return {
            state: evaluateOverlayAnimationCurve(curve, 1),
            active: false,
            hasStarted: clipTimeMs >= windowStart,
        };
    }

    const effectiveTime = clipTimeMs - animationStart;
    const progress = effectiveTime <= 0 ? 0 : effectiveTime / duration;
    const state = evaluateOverlayAnimationCurve(curve, progress);
    const active = clipTimeMs < (animationStart + duration);
    return { state, active, hasStarted: clipTimeMs >= windowStart };
}

function computeOverlayAnimationTransform(descriptor, clipDurationMs, clipTimeMs) {
    if (!descriptor || clipDurationMs <= 0) {
        return OVERLAY_ANIMATION_IDENTITY;
    }

    const animationSettings = descriptor.animationSettings
        || getTimelineItemAnimationSettings(descriptor.item);
    const direction = sanitizeAnimationDirection(animationSettings?.direction);
    if (direction === 'none') {
        return OVERLAY_ANIMATION_IDENTITY;
    }

    const exitState = computeOverlayExitAnimationState(
        animationSettings,
        direction,
        clipDurationMs,
        clipTimeMs,
        descriptor.exitConfig || null,
    );

    if (direction === 'out' && exitState) {
        return exitState.state;
    }

    const entranceState = computeOverlayEntranceAnimationState(
        animationSettings,
        direction,
        clipDurationMs,
        clipTimeMs,
    );

    if (exitState && (exitState.active || exitState.hasStarted)) {
        return exitState.state;
    }

    if (entranceState) {
        return entranceState.state;
    }

    if (exitState) {
        return exitState.state;
    }

    return OVERLAY_ANIMATION_IDENTITY;
}

function applyOverlayAnimationTransform(entry, transformState) {
    if (!entry || !entry.image) {
        return;
    }

    const target = transformState || OVERLAY_ANIMATION_IDENTITY;
    const translateX = Number.isFinite(target.translateX) ? target.translateX : 0;
    const translateY = Number.isFinite(target.translateY) ? target.translateY : 0;
    const scale = Number.isFinite(target.scale) ? target.scale : 1;
    const rotate = Number.isFinite(target.rotate) ? target.rotate : 0;

    const previous = entry.renderedAnimation;
    if (!previous || previous.translateX !== translateX) {
        entry.image.style.setProperty(
            '--overlay-animation-translate-x',
            formatOverlayAnimationPercent(translateX),
        );
    }
    if (!previous || previous.translateY !== translateY) {
        entry.image.style.setProperty(
            '--overlay-animation-translate-y',
            formatOverlayAnimationPercent(translateY),
        );
    }
    if (!previous || previous.scale !== scale) {
        entry.image.style.setProperty(
            '--overlay-animation-scale',
            formatOverlayAnimationScale(scale),
        );
    }
    if (!previous || previous.rotate !== rotate) {
        entry.image.style.setProperty(
            '--overlay-animation-rotation',
            formatOverlayAnimationRotation(rotate),
        );
    }

    entry.renderedAnimation = {
        translateX,
        translateY,
        scale,
        rotate,
    };
}

function resetOverlayAnimationState(entry) {
    if (!entry || !entry.image) {
        return;
    }

    entry.image.style.setProperty('--overlay-animation-translate-x', '0%');
    entry.image.style.setProperty('--overlay-animation-translate-y', '0%');
    entry.image.style.setProperty('--overlay-animation-scale', '1');
    entry.image.style.setProperty('--overlay-animation-rotation', '0deg');
    entry.renderedAnimation = {
        translateX: 0,
        translateY: 0,
        scale: 1,
        rotate: 0,
    };
}

function resolveOverlayDescriptorBaseId(descriptor) {
    if (!descriptor || !descriptor.item || !descriptor.item.dataset) {
        return '';
    }
    const { dataset } = descriptor.item;
    return dataset.instanceId
        || dataset.objectUrl
        || dataset.templateId
        || dataset.timelineItemId
        || dataset.displayName
        || descriptor.item.id
        || '';
}

function getOverlayDescriptorKey(descriptor) {
    if (!descriptor || !descriptor.item) {
        return null;
    }
    if (descriptor.layerKey) {
        return descriptor.layerKey;
    }
    const baseId = resolveOverlayDescriptorBaseId(descriptor) || 'item';
    const laneIndex = Number.isFinite(descriptor.laneIndex)
        ? descriptor.laneIndex
        : 'x';
    const startKey = Number.isFinite(descriptor.start)
        ? Math.round(descriptor.start)
        : 'start';
    const endKey = Number.isFinite(descriptor.end)
        ? Math.round(descriptor.end)
        : 'end';
    const roleKey = descriptor.transitionKey
        || descriptor.transitionRole
        || descriptor.descriptorRole
        || '';
    const keyParts = ['overlay', baseId, laneIndex, `${startKey}-${endKey}`];
    if (roleKey) {
        keyParts.push(String(roleKey));
    }
    const resolvedKey = keyParts.join(':');
    descriptor.layerKey = resolvedKey;
    return resolvedKey;
}

function getOverlayEntryForDescriptor(descriptor) {
    const key = getOverlayDescriptorKey(descriptor);
    if (!key) {
        return null;
    }
    return activeOverlayLayers.get(key) || null;
}

let activeOverlayDescriptorCache = [];

function normalizeOverlayRenderOptions(input) {
    if (Array.isArray(input)) {
        return {
            entries: input,
            descriptors: null,
            laneCache: null,
        };
    }
    if (!input || typeof input !== 'object') {
        return {
            entries: [],
            descriptors: null,
            laneCache: null,
        };
    }
    return {
        entries: Array.isArray(input.entries) ? input.entries : [],
        descriptors: Array.isArray(input.descriptors) ? input.descriptors : null,
        laneCache: input.laneCache || null,
    };
}

function extractOverlayDescriptorCacheEntry(descriptor) {
    if (!descriptor || !descriptor.item) {
        return null;
    }
    return {
        item: descriptor.item,
        laneIndex: descriptor.laneIndex,
        start: descriptor.start,
        end: descriptor.end,
        clipDuration: descriptor.clipDuration,
        animationSettings: descriptor.animationSettings,
        exitConfig: descriptor.exitConfig,
        layerKey: descriptor.layerKey || null,
    };
}

function renderPreviewOverlayLayers(primaryTimelineItem, options = null) {
    if (previewImage) {
        previewImage.style.removeProperty('mix-blend-mode');
    }

    if (!previewOverlayStack || !previewOverlayGroups) {
        return;
    }

    if (!primaryTimelineItem) {
        clearPreviewOverlayLayers();
        return;
    }

    const viewportSize = getPreviewViewportSize();
    const viewportWidth = Math.max(0, viewportSize.width || 0);
    const viewportHeight = Math.max(0, viewportSize.height || 0);

    if (viewportWidth === 0 || viewportHeight === 0) {
        clearPreviewOverlayLayers();
        return;
    }

    const primaryLaneIndex = resolveLaneIndex(primaryTimelineItem.dataset?.laneIndex);
    const primaryStartTime = getTimelineItemStartTime(primaryTimelineItem);
    const primaryDuration = Math.max(0, getTimelineItemPlaybackDuration(primaryTimelineItem));
    const primaryProgress = getActiveClipProgress();
    const defaultTimelineNow = primaryDuration > 0
        ? primaryStartTime + (primaryDuration * primaryProgress)
        : primaryStartTime;
    const playbackTimestamp = Number.isFinite(playbackDisplayCurrentMs)
        ? playbackDisplayCurrentMs
        : null;
    const primaryRangeEnd = primaryStartTime + primaryDuration;
    const endTolerance = Math.max(1, Math.round(primaryDuration * 0.01));
    const playbackWithinPrimary = playbackTimestamp !== null
        && playbackTimestamp >= primaryStartTime
        && playbackTimestamp <= (primaryRangeEnd + endTolerance);
    const timelineNowCandidate = (isTimelinePlaying || playbackWithinPrimary) && playbackTimestamp !== null
        ? playbackTimestamp
        : defaultTimelineNow;
    const safeTimelineNow = Number.isFinite(timelineNowCandidate)
        ? timelineNowCandidate
        : defaultTimelineNow;

    const previousTimelineNow = Number.isFinite(lastOverlayRenderTimestamp)
        ? lastOverlayRenderTimestamp
        : null;
    const timelineDelta = previousTimelineNow !== null
        ? Math.abs(safeTimelineNow - previousTimelineNow)
        : 0;
    const usePreviousWindow = previousTimelineNow !== null
        && timelineDelta > 0
        && timelineDelta <= (OVERLAY_TIMELINE_WINDOW_SLACK_MS * 4);
    const timelineWindowStart = usePreviousWindow
        ? Math.min(previousTimelineNow, safeTimelineNow)
        : safeTimelineNow;
    const timelineWindowEnd = usePreviousWindow
        ? Math.max(previousTimelineNow, safeTimelineNow)
        : safeTimelineNow;
    const expandedWindowStart = timelineWindowStart - OVERLAY_TIMELINE_WINDOW_SLACK_MS;
    const expandedWindowEnd = timelineWindowEnd + OVERLAY_TIMELINE_WINDOW_SLACK_MS;

    if (typeof updateActiveOverlayWindowState === 'function') {
        updateActiveOverlayWindowState(
            primaryTimelineItem,
            expandedWindowStart,
            expandedWindowEnd,
            safeTimelineNow,
        );
    }

    const normalizedOptions = normalizeOverlayRenderOptions(options ?? {});
    const descriptorCacheInput = (normalizedOptions.descriptors && normalizedOptions.descriptors.length)
        ? normalizedOptions.descriptors
        : activeOverlayDescriptorCache;
    const cachedDescriptorMap = (() => {
        if (!descriptorCacheInput || !descriptorCacheInput.length) {
            return null;
        }
        const map = new Map();
        descriptorCacheInput.forEach((descriptor) => {
            if (!descriptor) {
                return;
            }
            const key = getOverlayDescriptorKey(descriptor);
            if (key) {
                map.set(key, descriptor);
            }
            if (descriptor.item) {
                map.set(descriptor.item, descriptor);
            }
        });
        return map;
    })();
    let entrySource = (normalizedOptions.entries && normalizedOptions.entries.length)
        ? normalizedOptions.entries
        : (descriptorCacheInput || []);

    if ((!entrySource || entrySource.length === 0) && normalizedOptions.laneCache) {
        try {
            entrySource = getOverlayEntriesForTimelineItem(
                primaryTimelineItem,
                null,
                normalizedOptions.laneCache,
            );
        } catch (error) {
            entrySource = entrySource || [];
        }
    }

    const overlayEntries = (Array.isArray(entrySource) ? entrySource : [])
        .filter((entry) => entry && entry.item)
        .map((entry) => {
            const laneIndex = resolveLaneIndex(entry.laneIndex ?? entry.item?.dataset?.laneIndex);
            const start = Number.isFinite(entry.start)
                ? entry.start
                : getTimelineItemStartTime(entry.item);
            let end;
            if (Number.isFinite(entry.end)) {
                end = entry.end;
            } else {
                const fallbackDuration = Math.max(0, getTimelineItemPlaybackDuration(entry.item));
                end = start + fallbackDuration;
            }
            const descriptor = {
                item: entry.item,
                laneIndex,
                start,
                end,
            };

            const descriptorKey = getOverlayDescriptorKey(descriptor);
            const cached = (descriptorKey && cachedDescriptorMap?.get(descriptorKey))
                || cachedDescriptorMap?.get(entry.item)
                || null;

            const explicitClipDuration = Number.isFinite(entry.clipDuration)
                ? Math.max(0, Number(entry.clipDuration) || 0)
                : (Number.isFinite(cached?.clipDuration) ? Math.max(0, Number(cached.clipDuration) || 0) : null);
            const explicitSampleTime = Number.isFinite(entry.sampleTime)
                ? Number(entry.sampleTime)
                : null;
            const explicitProgress = Number.isFinite(entry.progress)
                ? clampProgress(entry.progress)
                : null;
            const explicitShouldRender = typeof entry.shouldRender === 'boolean'
                ? entry.shouldRender
                : null;
            const explicitIsActive = typeof entry.isActive === 'boolean'
                ? entry.isActive
                : null;
            const explicitIntersects = typeof entry.intersectsWindow === 'boolean'
                ? entry.intersectsWindow
                : null;

            descriptor.isActive = explicitIsActive !== null
                ? explicitIsActive
                : isClipActiveAtTime(descriptor, safeTimelineNow);
            descriptor.intersectsWindow = explicitIntersects !== null
                ? explicitIntersects
                : doesClipIntersectWindow(
                    descriptor,
                expandedWindowStart,                expandedWindowEnd,
            );
            if (explicitClipDuration !== null) {
                descriptor.clipDuration = explicitClipDuration;
            }
            if (explicitSampleTime !== null) {
                descriptor.sampleTime = explicitSampleTime;
            }
            if (explicitProgress !== null) {
                descriptor.progress = explicitProgress;
            }
            if (explicitShouldRender !== null) {
                descriptor.shouldRender = explicitShouldRender;
            }
            if (entry.animationSettings !== undefined) {
                descriptor.animationSettings = entry.animationSettings;
            } else if (cached && cached.animationSettings !== undefined) {
                descriptor.animationSettings = cached.animationSettings;
            }
            if ('exitConfig' in entry) {
                descriptor.exitConfig = entry.exitConfig;
            } else if (cached && cached.exitConfig !== undefined) {
                descriptor.exitConfig = cached.exitConfig;
            }

            if (!Number.isFinite(descriptor.sampleTime)) {
                if (descriptor.isActive) {
                    descriptor.sampleTime = safeTimelineNow;
                } else {
                    const clamped = Math.min(Math.max(safeTimelineNow, start), end);
                    descriptor.sampleTime = Number.isFinite(clamped)
                        ? clamped
                        : safeTimelineNow;
                }
            }
            return descriptor;
        })
        .filter((descriptor) => descriptor.item && descriptor.item !== primaryTimelineItem)
        .filter((descriptor) => (descriptor.item.dataset.fileType || '').startsWith('image/'))
        .filter((descriptor) => {
            if (descriptor.intersectsWindow || descriptor.isActive) {
                return true;
            }
            if (Number.isFinite(descriptor.sampleTime)) {
                const { start, end } = descriptor;
                if (Number.isFinite(start) && Number.isFinite(end)) {
                    const tolerance = Math.max(0, Number(OVERLAY_TIMELINE_EDGE_TOLERANCE_MS) || 0);
                    return descriptor.sampleTime >= (start - tolerance)
                        && descriptor.sampleTime <= (end + tolerance);
                }
                return true;
            }
            return false;
        });

    const OVERLAY_BELOW_Z_BASE = 10;
    const OVERLAY_BELOW_Z_MAX = 59;
    const OVERLAY_ABOVE_Z_BASE = 60;
    const OVERLAY_ABOVE_Z_MAX = 140;

    const resolveOverlayLaneRank = (laneIndex, group) => {
        const normalizedLaneIndex = resolveLaneIndex(laneIndex);
        const targetGroup = group === 'below' ? 'below' : 'above';
        const matchesGroup = targetGroup === 'below'
            ? normalizedLaneIndex > primaryLaneIndex
            : normalizedLaneIndex <= primaryLaneIndex;

        const laneSet = new Set(
            overlayEntries
                .map((entry) => resolveLaneIndex(entry.laneIndex))
                .filter((index) => (targetGroup === 'below'
                    ? index > primaryLaneIndex
                    : index <= primaryLaneIndex)),
        );

        if (matchesGroup) {
            laneSet.add(normalizedLaneIndex);
        }

        if (laneSet.size === 0) {
            return 0;
        }

        const ordered = Array.from(laneSet).sort((a, b) => a - b);
        const position = ordered.indexOf(normalizedLaneIndex);
        return position === -1 ? ordered.length - 1 : position;
    };

    const computeOverlayLayerGroup = (descriptor) => {
        if (!descriptor) {
            return 'above';
        }
        return descriptor.laneIndex > primaryLaneIndex ? 'below' : 'above';
    };

    const computeOverlayLayerZIndex = (descriptor) => {
        if (!descriptor) {
            return OVERLAY_ABOVE_Z_BASE + 1;
        }

        const group = computeOverlayLayerGroup(descriptor);
        const laneRank = resolveOverlayLaneRank(descriptor.laneIndex, group);

        if (group === 'below') {
            const range = Math.max(1, OVERLAY_BELOW_Z_MAX - OVERLAY_BELOW_Z_BASE);
            const clampedRank = Math.min(laneRank, range - 1);
            const zIndex = OVERLAY_BELOW_Z_MAX - clampedRank;
            return Math.max(OVERLAY_BELOW_Z_BASE + 1, zIndex);
        }

        const range = Math.max(1, OVERLAY_ABOVE_Z_MAX - OVERLAY_ABOVE_Z_BASE);
        const clampedRank = Math.min(laneRank, range - 1);
        const zIndex = OVERLAY_ABOVE_Z_MAX - clampedRank;
        return Math.max(OVERLAY_ABOVE_Z_BASE + 1, zIndex);
    };

    const getDescriptorLayerGroup = (descriptor) => (descriptor?.layerGroup === 'below'
        ? 'below'
        : 'above');
    const getDescriptorZIndex = (descriptor) => {
        if (!descriptor) {
            return OVERLAY_ABOVE_Z_BASE + 1;
        }
        if (Number.isFinite(descriptor.zIndex)) {
            return descriptor.zIndex;
        }
        const computed = computeOverlayLayerZIndex(descriptor);
        descriptor.zIndex = computed;
        return computed;
    };

    if (activeOverlayLayers.size) {
        const knownOverlayItems = new Set(overlayEntries.map((descriptor) => descriptor.item));
        const knownOverlayKeys = new Set();
        overlayEntries.forEach((descriptor) => {
            const key = getOverlayDescriptorKey(descriptor);
            if (key) {
                knownOverlayKeys.add(key);
            }
        });
        activeOverlayLayers.forEach((entry) => {
            const item = entry?.timelineItem || null;
            if (!entry || !entry.isVisible || !item || item === primaryTimelineItem) {
                return;
            }
            if (knownOverlayItems.has(item) || (entry.key && knownOverlayKeys.has(entry.key))) {
                return;
            }

            const fileType = item.dataset?.fileType || '';
            if (!fileType.startsWith('image/')) {
                return;
            }

            const laneIndex = resolveLaneIndex(item.dataset?.laneIndex);
            const start = getTimelineItemStartTime(item);
            const clipDuration = Math.max(0, getTimelineItemPlaybackDuration(item));
            const end = start + clipDuration;

            const descriptor = {
                item,
                laneIndex,
                start,
                end,
                clipDuration,
            };

            descriptor.isActive = isClipActiveAtTime(descriptor, safeTimelineNow);
            descriptor.intersectsWindow = doesClipIntersectWindow(
                descriptor,
                expandedWindowStart,
                expandedWindowEnd,
            );

            descriptor.layerGroup = computeOverlayLayerGroup(descriptor);
            descriptor.zIndex = computeOverlayLayerZIndex(descriptor);

            if (!descriptor.isActive && !descriptor.intersectsWindow) {
                const animationSettings = getTimelineItemAnimationSettings(item);
                descriptor.animationSettings = animationSettings;
                descriptor.exitConfig = clipDuration > 0
                    ? getPreviewImageExitConfig({
                        clipDurationMs: clipDuration,
                        settingsOverride: animationSettings,
                    })
                    : null;

                if (!shouldRenderOverlayDescriptor(descriptor, safeTimelineNow)) {
                    return;
                }
            }

            let animationSettings = descriptor.animationSettings;
            if (animationSettings === undefined && clipDuration > 0) {
                animationSettings = getTimelineItemAnimationSettings(item);
                descriptor.animationSettings = animationSettings;
            }

            let sampleEnd = end;
            if (!descriptor.isActive && clipDuration > 0) {
                let exitConfig = descriptor.exitConfig;
                if (exitConfig === undefined) {
                    exitConfig = getPreviewImageExitConfig({
                        clipDurationMs: clipDuration,
                        settingsOverride: animationSettings,
                    }) || null;
                    descriptor.exitConfig = exitConfig;
                }

                const totalExitWindow = Math.min(
                    clipDuration,
                    Math.max(0, Number(exitConfig?.totalDuration) || 0),
                );

                if (totalExitWindow > 0 && Number.isFinite(end)) {
                    sampleEnd = end + totalExitWindow;
                }
            }

            if (!Number.isFinite(descriptor.sampleTime)) {
                const clampedSample = Number.isFinite(sampleEnd)
                    ? Math.min(Math.max(safeTimelineNow, start), sampleEnd)
                    : safeTimelineNow;
                descriptor.sampleTime = descriptor.isActive
                    ? safeTimelineNow
                    : (Number.isFinite(clampedSample) ? clampedSample : safeTimelineNow);
            }

            overlayEntries.push(descriptor);
            knownOverlayItems.add(item);
            const descriptorKey = getOverlayDescriptorKey(descriptor);
            if (descriptorKey) {
                knownOverlayKeys.add(descriptorKey);
            }
        });
    }

    const recentOverlayHoldThreshold = Math.max(
        Number(OVERLAY_RECENT_HOLD_THRESHOLD_MS) || 0,
        OVERLAY_TIMELINE_WINDOW_SLACK_MS * 6,
    );
    let hasRecentOverlayLayers = false;
    activeOverlayLayers.forEach((entry) => {
        if (hasRecentOverlayLayers || !entry || !entry.isVisible) {
            return;
        }
        const lastTime = Number(entry.lastTimelineTime);
        if (!Number.isFinite(lastTime)) {
            return;
        }
        const age = Math.abs(safeTimelineNow - lastTime);
        if (age <= recentOverlayHoldThreshold) {
            hasRecentOverlayLayers = true;
        }
    });

    if (!overlayEntries.length) {

        if (hasRecentOverlayLayers) {
            activeOverlayLayers.forEach((entry) => {
                if (!entry || !entry.isVisible) {
                    return;
                }
                entry.lastTimelineTime = safeTimelineNow;
                entry.opacity = Number.isFinite(entry.renderedOpacity)
                    ? entry.renderedOpacity
                    : computeOverlayEntryOpacity(entry);
            });
            lastOverlayRenderTimestamp = safeTimelineNow;
            return;
        }
        
        clearPreviewOverlayLayers();
        return;
    }

    overlayEntries.forEach((descriptor) => {
        const { start, end } = descriptor;
        const duration = Number.isFinite(end) && Number.isFinite(start)
            ? Math.max(0, end - start)
            : 0;

        if (!Number.isFinite(descriptor.clipDuration)) {
            descriptor.clipDuration = duration;
        } else {
            descriptor.clipDuration = Math.max(0, Number(descriptor.clipDuration) || 0);
        }

        let animationSettings = descriptor.animationSettings;
        if (animationSettings === undefined) {
            animationSettings = getTimelineItemAnimationSettings(descriptor.item);
            descriptor.animationSettings = animationSettings;
        }

        if (descriptor.clipDuration > 0) {
            if (descriptor.exitConfig === undefined) {
                descriptor.exitConfig = getPreviewImageExitConfig({
                    clipDurationMs: descriptor.clipDuration,
                    settingsOverride: animationSettings,
                }) || null;
            }
        } else if (descriptor.exitConfig === undefined) {
            descriptor.exitConfig = null;
        }

        if (descriptor.clipDuration === 0) {
            if (!Number.isFinite(descriptor.progress)) {
                descriptor.progress = 0;
            } else {
                descriptor.progress = clampProgress(descriptor.progress);
            }
            if (typeof descriptor.shouldRender !== 'boolean') {
                descriptor.shouldRender = descriptor.isActive;
            }
            return;
        }

        if (!Number.isFinite(descriptor.progress)) {
            const relativeTime = (safeTimelineNow - start) / descriptor.clipDuration;
            descriptor.progress = Number.isFinite(relativeTime)
                ? clampProgress(relativeTime)
                : 0;
        } else {
            descriptor.progress = clampProgress(descriptor.progress);
        }

        if (typeof descriptor.shouldRender !== 'boolean') {
            descriptor.shouldRender = descriptor.isActive
                || shouldRenderOverlayDescriptor(descriptor, safeTimelineNow);
        }
    });

    const borderRadius = getPreviewImageFrameBorderRadius();

    const overlayGroups = { below: [], above: [] };

    const OVERLAY_PIXEL_PRECISION = 1000;
    const OVERLAY_OPACITY_EPSILON = 0.0005;

    const formatOverlayPixelValue = (value) => {
        if (!Number.isFinite(value)) {
            return '0px';
        }
        const rounded = Math.round(value * OVERLAY_PIXEL_PRECISION) / OVERLAY_PIXEL_PRECISION;
        return `${rounded}px`;
    };

    const shouldUpdateOpacity = (previous, next) => {
        if (!Number.isFinite(previous)) {
            return true;
        }
        return Math.abs(previous - next) > OVERLAY_OPACITY_EPSILON;
    };

    overlayEntries.forEach((descriptor) => {
        descriptor.layerGroup = computeOverlayLayerGroup(descriptor);
        descriptor.zIndex = computeOverlayLayerZIndex(descriptor);
        if (descriptor.layerGroup === 'below') {
            overlayGroups.below.push(descriptor);
        } else {
            overlayGroups.above.push(descriptor);
        }
    });

    overlayGroups.above.sort((a, b) => a.laneIndex - b.laneIndex);
    overlayGroups.below.sort((a, b) => a.laneIndex - b.laneIndex);

    const { below, above } = previewOverlayGroups;

    if (!below && !above) {
        clearPreviewOverlayLayers();
        return;
    }

    const nextActiveKeys = new Set();
    const nextKnownKeys = new Set();

    const overlayResizeHandleLabels = {
        n: 'Resize overlay from top edge',
        s: 'Resize overlay from bottom edge',
        e: 'Resize overlay from right edge',
        w: 'Resize overlay from left edge',
        nw: 'Resize overlay from top left',
        ne: 'Resize overlay from top right',
        se: 'Resize overlay from bottom right',
        sw: 'Resize overlay from bottom left',
    };

    const ensureOverlayLayerEntry = (descriptor) => {
        if (!descriptor || !descriptor.item) {
            return null;
        }

        const key = getOverlayDescriptorKey(descriptor);
        if (!key) {
            return null;
        }

        const objectURL = descriptor.item.dataset.objectUrl || '';
        if (!objectURL) {
            return null;
        }

        let entry = activeOverlayLayers.get(key);
        if (!entry) {
            const legacyEntry = activeOverlayLayers.get(descriptor.item);
            if (legacyEntry) {
                activeOverlayLayers.delete(descriptor.item);
                entry = legacyEntry;
            }
        }

        if (!entry) {
            activeOverlayLayers.forEach((candidate, candidateKey) => {
                if (entry || !candidate) {
                    return;
                }
                if (candidate.timelineItem === descriptor.item) {
                    activeOverlayLayers.delete(candidateKey);
                    entry = candidate;
                }
            });
        }

        if (!entry || !entry.layer || !entry.image) {
            const layer = document.createElement('div');
            layer.classList.add('preview-overlay-layer');
            const content = document.createElement('div');
            content.className = 'preview-overlay-content';
            layer.appendChild(content);
            const image = document.createElement('img');
            try {
                image.decoding = 'async';
            } catch (error) {
                // Ignore unsupported decoding hint.
            }
            image.loading = 'eager';
            image.draggable = false;
            content.appendChild(image);
            ['n', 's', 'e', 'w', 'nw', 'ne', 'se', 'sw'].forEach((direction) => {
                const handle = document.createElement('button');
                handle.type = 'button';
                handle.className = `preview-resize-handle handle-${direction}`;
                handle.dataset.handle = direction;
                handle.setAttribute(
                    'aria-label',
                    overlayResizeHandleLabels[direction] || 'Resize overlay',
                );
                layer.appendChild(handle);
            });
            entry = {
                layer,
                content,
                image,
                handles: Array.from(layer.querySelectorAll('.preview-resize-handle')),
                objectURL: '',
                frame: null,
                isVisible: false,
                layerGroup: null,
                zIndex: 0,
                borderRadius: 0,
                opacity: 1,
                lastTimelineTime: null,
                renderedFrame: null,
                renderedOpacity: null,
                renderedZIndex: null,
                renderedRotation: null,
                renderedAnimation: null,
                key,
                timelineItem: descriptor.item,
            };
            activeOverlayLayers.set(key, entry);
        } else {
            entry.key = key;
            entry.timelineItem = descriptor.item;
            if (!activeOverlayLayers.has(key)) {
                activeOverlayLayers.set(key, entry);
            }
        }

        const { layer, image } = entry;
        let { content } = entry;

        if (!content || !content.isConnected) {
            content = document.createElement('div');
            content.className = 'preview-overlay-content';
            layer.insertBefore(content, layer.firstChild);
            content.appendChild(image);
            entry.content = content;
        }

        if (!layer.querySelector('.preview-resize-handle')) {
            ['n', 's', 'e', 'w', 'nw', 'ne', 'se', 'sw'].forEach((direction) => {
                const handle = document.createElement('button');
                handle.type = 'button';
                handle.className = `preview-resize-handle handle-${direction}`;
                handle.dataset.handle = direction;
                handle.setAttribute(
                    'aria-label',
                    overlayResizeHandleLabels[direction] || 'Resize overlay',
                );
                layer.appendChild(handle);
            });
            entry.handles = Array.from(layer.querySelectorAll('.preview-resize-handle'));
        }

        layer.classList.add('preview-overlay-layer');
        layer.dataset.laneIndex = String(descriptor.laneIndex);

        const nextBorderRadius = borderRadius > 0 ? borderRadius : 0;
        if (content) {
            if (nextBorderRadius > 0) {
                if (entry.borderRadius !== nextBorderRadius) {
                    content.style.borderRadius = `${nextBorderRadius}px`;
                }
            } else if (entry.borderRadius !== 0) {
                content.style.removeProperty('border-radius');
            }
        }
        entry.borderRadius = nextBorderRadius;

        if (entry.objectURL !== objectURL || !image.src) {
            image.src = objectURL;
            entry.objectURL = objectURL;
        }

        image.alt = descriptor.item.dataset.displayName
            || descriptor.item.querySelector('span')?.textContent
            || 'Overlay layer';
        layer.title = image.alt;

        return entry;
    };

    const hideOverlayLayerEntry = (entry) => {
        if (!entry) {
            return;
        }

        entry.isVisible = false;
        entry.layerGroup = null;
        entry.zIndex = 0;
        entry.borderRadius = 0;
        entry.opacity = 1;
        entry.frame = null;
        entry.lastTimelineTime = null;
        entry.renderedFrame = null;
        entry.renderedOpacity = null;
        entry.renderedZIndex = null;
        entry.renderedRotation = null;
        resetOverlayAnimationState(entry);

        if (entry.layer) {
            entry.layer.classList.remove('is-active', 'is-dragging', 'is-resizing');
            overlayLayerToTimelineItem.delete(entry.layer);
            if (entry.layer.parentElement) {
                entry.layer.remove();
            }
        }
    };

    overlayEntries.forEach((descriptor) => {
        const entry = ensureOverlayLayerEntry(descriptor);
        if (!entry) {
            return;
        }

        const descriptorKey = entry.key || getOverlayDescriptorKey(descriptor);
        if (descriptorKey) {
            nextKnownKeys.add(descriptorKey);
        }

        if (!descriptor.shouldRender) {
            if (entry.isVisible) {
                const liveOpacity = Number.isFinite(entry.renderedOpacity)
                    ? entry.renderedOpacity
                    : computeOverlayEntryOpacity(entry);
                if (liveOpacity > 0 && liveOpacity < 0.999) {
                    descriptor.shouldRender = true;
                    entry.opacity = liveOpacity;
                    entry.lastTimelineTime = safeTimelineNow;
                    entry.layerGroup = getDescriptorLayerGroup(descriptor);
                    return;
                }

                const lastTime = Number(entry.lastTimelineTime);
                if (Number.isFinite(lastTime)) {
                    const age = Math.abs(safeTimelineNow - lastTime);
                    if (age <= recentOverlayHoldThreshold) {
                        const heldOpacity = Number.isFinite(entry.renderedOpacity)
                            ? entry.renderedOpacity
                            : computeOverlayEntryOpacity(entry);
                        descriptor.shouldRender = true;
                        entry.opacity = heldOpacity;
                        entry.lastTimelineTime = safeTimelineNow;
                        entry.layerGroup = getDescriptorLayerGroup(descriptor);
                        entry.zIndex = getDescriptorZIndex(descriptor);
                        return;
                    }
                }
            }

            hideOverlayLayerEntry(entry);
        }
    });

    const renderDescriptorIntoContainer = (descriptor, zIndex, container) => {
        if (!container || !descriptor || !descriptor.item || !descriptor.shouldRender) {
            return false;
        }

        const entry = ensureOverlayLayerEntry(descriptor);
        if (!entry) {
            return false;
        }

        const descriptorKey = entry.key || getOverlayDescriptorKey(descriptor);
        if (descriptorKey) {
            nextKnownKeys.add(descriptorKey);
        }

        const { layer, image } = entry;

        const isDefaultTextOverlay = typeof isDefaultTextTimelineItem === 'function'
            && isDefaultTextTimelineItem(descriptor.item);
        const isEditingDefaultText = isDefaultTextOverlay
            && typeof previewTextEditorState === 'object'
            && previewTextEditorState.isEnabled
            && previewTextEditorState.currentItem === descriptor.item;

        if (isEditingDefaultText) {
            hideOverlayLayerEntry(entry);
            return false;
        }

        const targetZIndex = Number.isFinite(zIndex) ? zIndex : getDescriptorZIndex(descriptor);
        if (entry.renderedZIndex !== targetZIndex) {
            layer.style.zIndex = String(targetZIndex);
            entry.renderedZIndex = targetZIndex;
        }

        const overlayProgress = Number.isFinite(descriptor.progress) ? descriptor.progress : null;
        const normalizedTransform = overlayProgress !== null
            ? getTimelineItemKeyframeTransformAtProgress(descriptor.item, overlayProgress)
            : null;

        const frame = resolveOverlayFramePixels(
            descriptor.item,
            viewportWidth,
            viewportHeight,
            { normalizedTransform },
        );

        const resolvedFrame = frame
            ? {
                left: frame.left,
                top: frame.top,
                width: frame.width,
                height: frame.height,
                rotation: Number.isFinite(frame.rotation) ? frame.rotation : 0,
            }
            : {
                left: 0,
                top: 0,
                width: viewportWidth,
                height: viewportHeight,
                rotation: 0,
            };

        const groupName = getDescriptorLayerGroup(descriptor);

        let appliedFrameStyles = null;
        let rotationValue = '0deg';

        if (frame) {
            appliedFrameStyles = {
                left: formatOverlayPixelValue(frame.left),
                top: formatOverlayPixelValue(frame.top),
                width: formatOverlayPixelValue(frame.width),
                height: formatOverlayPixelValue(frame.height),
            };
            const numericRotation = Number.isFinite(frame.rotation) ? frame.rotation : 0;
            rotationValue = `${numericRotation}deg`;
        } else {
            appliedFrameStyles = {
                left: '0px',
                top: '0px',
                width: '100%',
                height: '100%',
            };
            rotationValue = '0deg';
        }

        const previousFrameStyles = entry.renderedFrame;
        if (!previousFrameStyles
            || previousFrameStyles.left !== appliedFrameStyles.left
            || previousFrameStyles.top !== appliedFrameStyles.top
            || previousFrameStyles.width !== appliedFrameStyles.width
            || previousFrameStyles.height !== appliedFrameStyles.height) {
            layer.style.left = appliedFrameStyles.left;
            layer.style.top = appliedFrameStyles.top;
            layer.style.width = appliedFrameStyles.width;
            layer.style.height = appliedFrameStyles.height;
            entry.renderedFrame = appliedFrameStyles;
        }

        if (entry.renderedRotation !== rotationValue) {
            image.style.setProperty('--preview-overlay-rotation', rotationValue);
            entry.renderedRotation = rotationValue;
        }

        if (layer.parentElement !== container) {
            container.appendChild(layer);
        }

        overlayLayerToTimelineItem.set(layer, descriptor.item);

        const descriptorOpacity = computeOverlayDescriptorOpacity(descriptor);
        const clampedOpacity = clamp(descriptorOpacity, 0, 1);
        const nextOpacity = clampedOpacity >= 1 ? 1 : clampedOpacity;
        if (shouldUpdateOpacity(entry.renderedOpacity, nextOpacity)) {
            layer.style.opacity = nextOpacity >= 1 ? '1' : String(nextOpacity);
        }
        entry.renderedOpacity = nextOpacity;
        entry.opacity = nextOpacity;
        if (image) {
            image.style.opacity = '1';
        }

        const clipDurationMs = Math.max(0, Number(descriptor.clipDuration) || 0);
        const progressFraction = clampProgress(
            Number.isFinite(descriptor.progress) ? descriptor.progress : 0,
        );
        const clipTimeMs = clipDurationMs * progressFraction;
        const animationTransform = computeOverlayAnimationTransform(
            descriptor,
            clipDurationMs,
            clipTimeMs,
        );
        applyOverlayAnimationTransform(entry, animationTransform);

        const isActiveItem = descriptor.item === activeTimelineItem;
        const isPointerTarget = overlayPointerState.pointerId !== null
            && overlayPointerState.timelineItem === descriptor.item;
        const isDragging = isPointerTarget && overlayPointerState.mode === 'drag';
        const isResizing = isPointerTarget && overlayPointerState.mode === 'resize';

        layer.classList.toggle('is-active', isActiveItem);
        layer.classList.toggle('is-dragging', isDragging);
        layer.classList.toggle('is-resizing', isResizing);

        if (typeof updateOverlayLayerHandlePositions === 'function') {
            updateOverlayLayerHandlePositions(
                entry,
                resolvedFrame.width,
                resolvedFrame.height,
                resolvedFrame.rotation,
            );
        }

        entry.frame = resolvedFrame;
        entry.isVisible = true;
        entry.layerGroup = groupName;
        entry.zIndex = targetZIndex;
        entry.opacity = entry.renderedOpacity;
        entry.lastTimelineTime = safeTimelineNow;

        return true;
    };

    if (overlayGroups.below.length && below) {
        overlayGroups.below.forEach((descriptor) => {
            if (!descriptor.shouldRender) {
                return;
            }
            const zIndex = getDescriptorZIndex(descriptor);
            const rendered = renderDescriptorIntoContainer(descriptor, zIndex, below);
            if (rendered) {
                const descriptorKey = getOverlayDescriptorKey(descriptor);
                if (descriptorKey) {
                    nextActiveKeys.add(descriptorKey);
                }
                return;
            }
            const fallbackEntry = getOverlayEntryForDescriptor(descriptor);
            if (fallbackEntry?.isVisible) {
                fallbackEntry.opacity = Number.isFinite(fallbackEntry.renderedOpacity)
                    ? fallbackEntry.renderedOpacity
                    : computeOverlayEntryOpacity(fallbackEntry);
                if (fallbackEntry.key) {
                    nextActiveKeys.add(fallbackEntry.key);
                }
                fallbackEntry.lastTimelineTime = safeTimelineNow;
                fallbackEntry.layerGroup = getDescriptorLayerGroup(descriptor);
                fallbackEntry.zIndex = zIndex;
            }
        });
    }

    if (overlayGroups.above.length && above) {
        overlayGroups.above.forEach((descriptor) => {
            if (!descriptor.shouldRender) {
                return;
            }
            const zIndex = getDescriptorZIndex(descriptor);
            const rendered = renderDescriptorIntoContainer(descriptor, zIndex, above);
            if (rendered) {
                const descriptorKey = getOverlayDescriptorKey(descriptor);
                if (descriptorKey) {
                    nextActiveKeys.add(descriptorKey);
                }
                return;
            }
            const fallbackEntry = getOverlayEntryForDescriptor(descriptor);
            if (fallbackEntry?.isVisible) {
                fallbackEntry.opacity = Number.isFinite(fallbackEntry.renderedOpacity)
                    ? fallbackEntry.renderedOpacity
                    : computeOverlayEntryOpacity(fallbackEntry);
                if (fallbackEntry.key) {
                    nextActiveKeys.add(fallbackEntry.key);
                }
                fallbackEntry.lastTimelineTime = safeTimelineNow;
                fallbackEntry.layerGroup = getDescriptorLayerGroup(descriptor);
                fallbackEntry.zIndex = zIndex;
            }
        });
    }

    const staleKeys = [];
    activeOverlayLayers.forEach((entry, key) => {
        const resolvedKey = entry?.key || key;
        if (!resolvedKey || !nextKnownKeys.has(resolvedKey)) {
            staleKeys.push(key);
            return;
        }
        if (!nextActiveKeys.has(resolvedKey)) {
            hideOverlayLayerEntry(entry);
        }
    });
    staleKeys.forEach((key) => {
        const entry = activeOverlayLayers.get(key);
        if (entry && entry.layer) {
            overlayLayerToTimelineItem.delete(entry.layer);
            entry.layer.remove();
        }
        activeOverlayLayers.delete(key);
    });

    const hasLayers = Boolean((below && below.childElementCount) || (above && above.childElementCount));

    if (hasLayers) {
        previewOverlayStack.removeAttribute('hidden');
        previewOverlayStack.setAttribute('aria-hidden', 'false');
    } else {
        previewOverlayStack.setAttribute('hidden', '');
        previewOverlayStack.setAttribute('aria-hidden', 'true');
    }

    activeOverlayDescriptorCache = overlayEntries
        .map((descriptor) => extractOverlayDescriptorCacheEntry(descriptor))
        .filter((descriptor) => descriptor && descriptor.item);

    lastOverlayRenderTimestamp = safeTimelineNow;
    return overlayEntries;
}

function getActiveOverlayEntryForTimelineItem(timelineItem) {
    if (!timelineItem) {
        return null;
    }
    let matched = null;
    activeOverlayLayers.forEach((entry) => {
        if (matched || !entry) {
            return;
        }
        if (entry.timelineItem === timelineItem) {
            matched = entry;
        }
    });
    return matched;
}

function getActiveOverlayLayerSnapshots() {
    const snapshots = [];
    const groupPriority = { below: 0, above: 1 };

    activeOverlayLayers.forEach((entry) => {
        if (!entry || !entry.isVisible || !entry.frame) {
            return;
        }

        if (Number.isFinite(lastOverlayRenderTimestamp) && Number.isFinite(entry.lastTimelineTime)) {
            const age = Math.abs(lastOverlayRenderTimestamp - entry.lastTimelineTime);
            const snapshotHoldThreshold = Math.max(
                OVERLAY_TIMELINE_WINDOW_SLACK_MS * 2,
                Number(OVERLAY_RECENT_HOLD_THRESHOLD_MS) || 0,
            );
            if (age > snapshotHoldThreshold) {
                return;
            }
        }

        const { image } = entry;
        if (!image || !image.complete) {
            return;
        }

        const liveOpacity = Number.isFinite(entry.renderedOpacity)
            ? entry.renderedOpacity
            : computeOverlayEntryOpacity(entry);
        entry.opacity = liveOpacity;
        if (liveOpacity <= 0) {
            return;
        }

        const naturalWidth = Math.max(0, image.naturalWidth || 0);
        const naturalHeight = Math.max(0, image.naturalHeight || 0);
        if (naturalWidth <= 0 || naturalHeight <= 0) {
            return;
        }

        const frameWidth = Math.max(0, entry.frame.width || 0);
        const frameHeight = Math.max(0, entry.frame.height || 0);
        if (frameWidth <= 0 || frameHeight <= 0) {
            return;
        }

        const group = entry.layerGroup === 'below' ? 'below' : 'above';

        const animation = entry.renderedAnimation || null;

        snapshots.push({
            image,
            frame: {
                left: entry.frame.left,
                top: entry.frame.top,
                width: frameWidth,
                height: frameHeight,
                rotation: Number.isFinite(entry.frame.rotation) ? entry.frame.rotation : 0,
            },
            group,
            zIndex: Number.isFinite(entry.zIndex) ? entry.zIndex : 0,
            borderRadius: Number.isFinite(entry.borderRadius) ? entry.borderRadius : 0,
            opacity: Number.isFinite(entry.opacity) ? entry.opacity : 1,
            priority: groupPriority[group] ?? 1,
            animation: animation
                ? {
                    translateX: Number.isFinite(animation.translateX) ? animation.translateX : 0,
                    translateY: Number.isFinite(animation.translateY) ? animation.translateY : 0,
                    scale: Number.isFinite(animation.scale) ? animation.scale : 1,
                    rotate: Number.isFinite(animation.rotate) ? animation.rotate : 0,
                }
                : null,
        });
    });

    snapshots.sort((a, b) => {
        if (a.priority !== b.priority) {
            return a.priority - b.priority;
        }
        if (a.zIndex !== b.zIndex) {
            return a.zIndex - b.zIndex;
        }
        return 0;
    });

    return snapshots;
}

function drawOverlaySnapshotsToExportCanvas(snapshots, group, viewportWidth, viewportHeight) {
    if (!Array.isArray(snapshots) || !snapshots.length) {
        return;
    }

    const canvasWidth = Math.max(1, exportMirrorCanvas.width);
    const canvasHeight = Math.max(1, exportMirrorCanvas.height);
    const scaleX = viewportWidth > 0 ? canvasWidth / viewportWidth : 0;
    const scaleY = viewportHeight > 0 ? canvasHeight / viewportHeight : 0;

    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
        return;
    }

    snapshots
        .filter((snapshot) => snapshot.group === group)
        .forEach((snapshot) => {
            const { image, frame } = snapshot;
            if (!frame || frame.width <= 0 || frame.height <= 0) {
                return;
            }

            const naturalWidth = Math.max(1, image.naturalWidth || 0);
            const naturalHeight = Math.max(1, image.naturalHeight || 0);
            if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight)) {
                return;
            }

            const drawScale = Math.max(frame.width / naturalWidth, frame.height / naturalHeight);
            if (!Number.isFinite(drawScale) || drawScale <= 0) {
                return;
            }

            const baseRotationDegrees = Number.isFinite(frame.rotation) ? frame.rotation : 0;
            const animationState = snapshot.animation || null;
            const animationTranslateX = Number.isFinite(animationState?.translateX)
                ? animationState.translateX
                : 0;
            const animationTranslateY = Number.isFinite(animationState?.translateY)
                ? animationState.translateY
                : 0;
            const animationScale = Number.isFinite(animationState?.scale)
                ? animationState.scale
                : 1;
            const animationRotateDegrees = Number.isFinite(animationState?.rotate)
                ? animationState.rotate
                : 0;
            
            const totalRotationRadians = ((baseRotationDegrees + animationRotateDegrees) * Math.PI) / 180;
            const translateXPixels = (animationTranslateX / 100) * frame.width;
            const translateYPixels = (animationTranslateY / 100) * frame.height;
            const effectiveScale = animationScale > 0 ? animationScale : 0;
            const centerX = frame.width / 2;
            const centerY = frame.height / 2;

            exportMirrorContext.save();
            exportMirrorContext.setTransform(scaleX, 0, 0, scaleY, 0, 0);
            exportMirrorContext.translate(frame.left + centerX, frame.top + centerY);
            if (totalRotationRadians !== 0) {
                exportMirrorContext.rotate(totalRotationRadians);
            }
            if (translateXPixels !== 0 || translateYPixels !== 0) {
                exportMirrorContext.translate(translateXPixels, translateYPixels);
            }
            if (effectiveScale !== 1) {
                exportMirrorContext.scale(effectiveScale, effectiveScale);
            }
            exportMirrorContext.translate(-centerX, -centerY);

            const radius = Math.max(0, snapshot.borderRadius || 0);
            if (radius > 0) {
                clipRoundRectPath(exportMirrorContext, 0, 0, frame.width, frame.height, radius);
                exportMirrorContext.clip();
            }

            const clampedOpacity = clamp(Number(snapshot.opacity) || 1, 0, 1);
            exportMirrorContext.globalAlpha *= clampedOpacity;

            const drawWidth = naturalWidth * drawScale;
            const drawHeight = naturalHeight * drawScale;
            const offsetX = (frame.width - drawWidth) / 2;
            const offsetY = (frame.height - drawHeight) / 2;

            exportMirrorContext.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
            exportMirrorContext.restore();
        });
}

function applyOverlayLayerTransform(entry, transform) {
    if (!entry || !entry.layer || !transform) {
        return;
    }

    const rotationValue = Number.isFinite(transform.rotation) ? transform.rotation : 0;
    const left = Number.isFinite(transform.left) ? transform.left : 0;
    const top = Number.isFinite(transform.top) ? transform.top : 0;
    const width = Number.isFinite(transform.width) ? Math.max(transform.width, 0) : 0;
    const height = Number.isFinite(transform.height) ? Math.max(transform.height, 0) : 0;

    entry.layer.style.left = `${left}px`;
    entry.layer.style.top = `${top}px`;
    entry.layer.style.width = `${width}px`;
    entry.layer.style.height = `${height}px`;

    if (entry.image) {
        entry.image.style.setProperty('--preview-overlay-rotation', `${rotationValue}deg`);
    }

    if (typeof updateOverlayLayerHandlePositions === 'function') {
        updateOverlayLayerHandlePositions(entry, width, height, rotationValue);
    }

    entry.frame = {
        left,
        top,
        width,
        height,
        rotation: rotationValue,
    };
}

function storeOverlayTransformOnTimelineItem(timelineItem, transform, options = {}) {
    if (!timelineItem || !isImageTimelineItem(timelineItem) || !transform) {
        return null;
    }

    const viewportSize = getPreviewViewportSize();
    const normalized = normalizePreviewImageTransform(transform, viewportSize);

    if (!normalized) {
        return null;
    }

    timelineItem.dataset.previewImageTransform = JSON.stringify(normalized);

    const templateId = timelineItem.dataset?.templateId || '';
    const defaultTemplateId = (typeof getDefaultTextTemplateId === 'function')
        ? getDefaultTextTemplateId()
        : ((typeof window !== 'undefined' && window.DEFAULT_TEXT_TEMPLATE_ID)
            ? window.DEFAULT_TEXT_TEMPLATE_ID
            : 'default-text');
    if (templateId && templateId === defaultTemplateId) {
        timelineItem.dataset.autoFitText = 'false';
    }

    if (options.skipKeyframes) {
        return normalized;
    }

    const existingKeyframes = getTimelineItemImageKeyframes(timelineItem);

    if (!existingKeyframes.length) {
        return normalized;
    }

    const progress = Object.prototype.hasOwnProperty.call(options, 'progressOverride')
        ? clampProgress(options.progressOverride)
        : getActiveClipProgress();

    if (!Number.isFinite(progress)) {
        return normalized;
    }

    const updatedKeyframes = upsertTimelineImageKeyframe(existingKeyframes, progress, normalized);
    storeTimelineImageKeyframes(timelineItem, updatedKeyframes);
    renderImageKeyframeTracks(timelineItem);

    return normalized;
}

