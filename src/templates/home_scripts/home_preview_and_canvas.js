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

    const exitWindowEnd = descriptorEnd + totalExitWindow;
    const exitHoldAllowance = Math.max(
        Number(OVERLAY_EXIT_OVERSHOOT_ALLOWANCE_MS) || 0,
        Number(OVERLAY_TIMELINE_EDGE_TOLERANCE_MS) || 0,
    );

    if (Number.isFinite(exitWindowEnd)
        && Number.isFinite(effectiveTimelineNow)
        && effectiveTimelineNow > exitWindowEnd + exitHoldAllowance
    ) {
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
    return dataset.timelineInstanceId
        || dataset.instanceId
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
                opacity: 0,
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
        entry.opacity = 0;
        entry.frame = null;
        entry.lastTimelineTime = null;
        entry.renderedFrame = null;
        entry.renderedOpacity = null;
        entry.renderedZIndex = null;
        entry.renderedRotation = null;
        resetOverlayAnimationState(entry);

        if (entry.layer) {
            entry.layer.classList.remove('is-active', 'is-dragging', 'is-resizing');
            entry.layer.style.opacity = '0';
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
            showKeyframeStatus('Select an image clip to add keyframes.', { suppressInline: true });
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
            showImageBlurKeyframeStatus('Select an image clip to add keyframes.', { suppressInline: true });
            return;
        }
        if (!imageBlurInput || imageBlurInput.disabled || imageBlurControls?.hidden) {
            showImageBlurKeyframeStatus('Enable image blur to add keyframes.', { suppressInline: true });
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

function showKeyframeStatus(message, options = {}) {
    if (!keyframeStatus) {
        return;
    }
    if (keyframeStatusTimeout) {
        window.clearTimeout(keyframeStatusTimeout);
        keyframeStatusTimeout = null;
    }
    if (message && options.toast && typeof showApplyFeedback === 'function') {
        const tone = options.tone || 'info';
        const contextLabel = options.contextLabel || 'Video keyframes';
        showApplyFeedback(message, { tone, contextLabel });
    }
    if (options.suppressInline) {
        keyframeStatus.textContent = '';
        return;
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
            const message = `Keyframe moved to ${Math.round(finalProgress * 100)}%`;
            showKeyframeStatus(message, {
                toast: true,
                suppressInline: true,
                tone: 'success',
                contextLabel: 'Video keyframes',
            });
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
            const message = `Keyframe moved to ${Math.round(finalProgress * 100)}%`;
            showImageBlurKeyframeStatus(message, {
                toast: true,
                suppressInline: true,
                tone: 'success',
                contextLabel: 'Canvas keyframes',
            });
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

function showImageBlurKeyframeStatus(message, options = {}) {
    if (!imageBlurKeyframeStatus) {
        return;
    }
    if (imageBlurKeyframeStatusTimeout) {
        window.clearTimeout(imageBlurKeyframeStatusTimeout);
        imageBlurKeyframeStatusTimeout = null;
    }
    if (message && options.toast && typeof showApplyFeedback === 'function') {
        const tone = options.tone || 'info';
        const contextLabel = options.contextLabel || 'Canvas keyframes';
        showApplyFeedback(message, { tone, contextLabel });
    }
    if (options.suppressInline) {
        imageBlurKeyframeStatus.textContent = '';
        return;
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
    showImageBlurKeyframeStatus(
        hadExisting
            ? `Keyframe updated at ${percent}%`
            : `Keyframe added at ${percent}%`,
        {
            toast: true,
            tone: 'success',
            contextLabel: 'Canvas keyframes',
            suppressInline: true,
        },
    );

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
    showKeyframeStatus(
        hasExisting
            ? `Keyframe updated at ${percent}%`
            : `Keyframe added at ${percent}%`,
        {
            toast: true,
            tone: 'success',
            contextLabel: 'Video keyframes',
            suppressInline: true,
        },
    );
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
    const percent = Math.round(clampProgress(fraction) * 100);
    timelineProgressInput.value = String(percent);
    if (typeof syncTimelineSliderFill === 'function') {
        syncTimelineSliderFill(percent);
    }
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

