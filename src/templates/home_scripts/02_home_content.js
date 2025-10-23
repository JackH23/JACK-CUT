        }

        if (!wasCancelled && typeof onComplete === 'function') {
            try {
                onComplete(config);
            } catch (error) {
                console.error('Error executing exit animation completion callback.', error);
            }
        }
    };

    previewExitAnimationState = {
        cleanup: (forceRestoreParam = null, didCancel = false) => {
            if (didCancel) {
                wasCancelled = true;
            }
            finalize(forceRestoreParam);
        },
        restoreOnComplete,
    };

    if (prefersReducedMotion()) {
        previewImage.classList.remove('is-visible');
        previewExitAnimationFallbackTimer = window.setTimeout(() => {
            finalize();
        }, Math.max(restoreDelay, 16));
        return true;
    }

    previewImage.style.setProperty('--exit-animation-delay', `${Math.max(0, delay)}ms`);
    previewImage.style.setProperty('--exit-animation-duration', `${Math.max(0, duration)}ms`);
    previewImage.style.setProperty('--exit-animation-easing', easing);

    void previewImage.offsetWidth;

    const handleAnimationComplete = () => {
        finalize();
    };

    const handleAnimationCancel = () => {
        wasCancelled = true;
        finalize();
    };

    previewImage.addEventListener('animationend', handleAnimationComplete, { once: true });
    previewImage.addEventListener('animationcancel', handleAnimationCancel, { once: true });

    previewExitAnimationFallbackTimer = window.setTimeout(() => {
        finalize();
    }, Math.max(0, delay + duration + restoreDelay + 120));

    previewImage.classList.add('is-exiting');
    if (className) {
        previewImage.classList.add(className);
    }

    return true;
}

function shouldPreviewExitAnimation() {
    if (!previewImage || previewImage.hidden) {
        return false;
    }
    if (isTimelinePlaying) {
        return false;
    }
    if (!animationDirectionSelect) {
        return true;
    }
    const value = sanitizeAnimationDirection(animationDirectionSelect.value);
    return value === 'out' || value === 'combo';
}

function previewExitAnimationDemo() {
    if (!shouldPreviewExitAnimation()) {
        return;
    }

    runPreviewImageExitAnimation({ restoreOnComplete: true, restoreDelayMs: 90 });
}

let activeTimelineItem = null;
let isTimelinePlaying = false;
let isTimelinePaused = false;
let timelinePauseState = null;
let timelinePlaybackAbort = null;
let currentPreviewAspectRatio = 16 / 9;
let previewViewportResizeFrame = null;
let timelineIndicatorResizeFrame = null;
let previewAreaResizeObserver = null;
let timelineTrackResizeObserver = null;
let activeDropLane = null;
let timelineDragOverAnimationFrame = null;
const timelineDragOverState = {
    lane: null,
    item: null,
    clientX: 0,
};
let activeTimelineDragItem = null;
let activeTimelineResizeItem = null;
let activeTimelineSnapState = null;
const pendingTimelineLaneReflows = new Map();
let isExportingTimeline = false;
let isMainTrackMagnetEnabled = true;
let previewImageTransform = null;
let pendingPreviewImageTransform = null;
let lastPreviewViewportSize = null;
let lastNonZeroPreviewViewportSize = null;
let shouldResetImageFrameOnNextViewportUpdate = false;
let previewGuidesHideTimeout = null;
let activeClipProgress = 0;
let keyframeStatusTimeout = null;

const MEDIA_READY_STATE_ENOUGH = typeof HTMLMediaElement !== 'undefined'
    && typeof HTMLMediaElement.HAVE_ENOUGH_DATA === 'number'
        ? HTMLMediaElement.HAVE_ENOUGH_DATA
        : 4;
const MEDIA_READY_EVENTS = ['canplaythrough', 'canplay', 'loadeddata'];

function maybeAutoScrollTimelineTrack(clientX) {
    if (!timelineTrack || !Number.isFinite(clientX)) {
        return 0;
    }

    const rect = timelineTrack.getBoundingClientRect();
    const safeMargin = Math.max(1, TIMELINE_AUTO_SCROLL_MARGIN);
    const maxStep = Math.max(TIMELINE_AUTO_SCROLL_MIN_STEP, TIMELINE_AUTO_SCROLL_MAX_STEP);
    const minStep = Math.max(1, Math.min(TIMELINE_AUTO_SCROLL_MIN_STEP, maxStep));

    if (clientX > rect.right - safeMargin) {
        const distance = clientX - (rect.right - safeMargin);
        const intensity = Math.min(distance / safeMargin, 1);
        const step = Math.round(minStep + intensity * (maxStep - minStep));
        timelineTrack.scrollLeft += step;
        return step;
    }

    if (clientX < rect.left + safeMargin) {
        const distance = (rect.left + safeMargin) - clientX;
        const intensity = Math.min(distance / safeMargin, 1);
        const step = Math.round(minStep + intensity * (maxStep - minStep));
        timelineTrack.scrollLeft = Math.max(0, timelineTrack.scrollLeft - step);
        return -step;
    }

    return 0;
}

function runTimelineDragOverUpdate() {
    const { lane, item, clientX } = timelineDragOverState;
    if (!lane || !item) {
        setTimelineSnapLineState(null);
        return;
    }

    if (!lane.isConnected || !item.isConnected) {
        setTimelineSnapLineState(null);
        return;
    }

    maybeAutoScrollTimelineTrack(clientX);

    const styles = window.getComputedStyle(lane);
    const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
    const rect = lane.getBoundingClientRect();
    const relativeX = clientX - rect.left - paddingLeft;
    const perPixel = getTimelineDurationPerPixel();
    const desiredStartMs = Math.max(0, Math.round(Math.max(relativeX, 0) * perPixel));
    const clipDuration = Math.max(0, getTimelineItemPlaybackDuration(item));
    const snap = resolveTimelineSnapForMovement({
        desiredStartMs,
        clipDuration,
        excludeItem: item,
    });
    const appliedStartMs = Math.max(0, snap ? snap.startMs : desiredStartMs);
    const laneIndex = lane.dataset.laneIndex || '0';
    const previousLaneIndex = item.dataset.laneIndex || '0';
    const previousOffsetMs = Number(item.dataset.startOffsetMs);

    item.dataset.laneIndex = laneIndex;
    setTimelineSnapLineState(snap ? { ...snap, lane } : null);

    if (
        previousLaneIndex === laneIndex
        && Number.isFinite(previousOffsetMs)
        && previousOffsetMs === appliedStartMs
    ) {
        return;
    }

    item.dataset.startOffsetMs = String(appliedStartMs);
    flushTimelineLaneReflow(lane);
}

function scheduleTimelineDragOverUpdate() {
    if (timelineDragOverAnimationFrame !== null) {
        return;
    }
    timelineDragOverAnimationFrame = window.requestAnimationFrame(() => {
        timelineDragOverAnimationFrame = null;
        runTimelineDragOverUpdate();
    });
}

function flushTimelineDragOverUpdate() {
    if (timelineDragOverAnimationFrame !== null) {
        window.cancelAnimationFrame(timelineDragOverAnimationFrame);
        timelineDragOverAnimationFrame = null;
    }
    runTimelineDragOverUpdate();
}

function preloadTimelineImage(objectURL) {
    if (!objectURL) {
        return Promise.resolve(null);
    }

    if (timelineImagePreloadCache.has(objectURL)) {
        return timelineImagePreloadCache.get(objectURL);
    }

    const preloadPromise = new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';

        const finalize = () => {
            resolve(image);
        };

        image.addEventListener('load', () => {
            if (typeof image.decode === 'function') {
                image.decode().catch(() => {}).finally(finalize);
                return;
            }
            finalize();
        }, { once: true });

        image.addEventListener('error', (event) => {
            reject(event?.error || new Error('Failed to preload image.'));
        }, { once: true });

        image.src = objectURL;
    }).catch((error) => {
        timelineImagePreloadCache.delete(objectURL);
        throw error;
    });

    timelineImagePreloadCache.set(objectURL, preloadPromise);
    return preloadPromise;
}

function preloadTimelineVideo(objectURL) {
    if (!objectURL) {
        return Promise.resolve(null);
    }

    if (timelineVideoPreloadCache.has(objectURL)) {
        return timelineVideoPreloadCache.get(objectURL);
    }

    const preloadPromise = new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;

        let settled = false;

        const finalize = () => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            resolve(video);
        };

        const fail = (event) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            reject(event?.error || new Error('Failed to preload video.'));
        };

        const cleanup = () => {
            video.removeEventListener('loadeddata', finalize);
            video.removeEventListener('canplay', finalize);
            video.removeEventListener('error', fail);
        };

        video.addEventListener('loadeddata', finalize, { once: true });
        video.addEventListener('canplay', finalize, { once: true });
        video.addEventListener('error', fail, { once: true });

        try {
            video.src = objectURL;
            video.load();
        } catch (error) {
            fail({ error });
        }
    }).catch((error) => {
        timelineVideoPreloadCache.delete(objectURL);
        throw error;
    });

    timelineVideoPreloadCache.set(objectURL, preloadPromise);
    return preloadPromise;
}

function releaseTimelineVideo(objectURL) {
    if (!objectURL) {
        return;
    }
    timelineVideoPreloadCache.delete(objectURL);
}

function releaseTimelineImage(objectURL) {
    if (!objectURL) {
        return;
    }
    timelineImagePreloadCache.delete(objectURL);
}

async function revealPreviewImageSource(objectURL, options = {}) {
    const { immediate = false } = options;
    const clipDurationMs = Number.isFinite(options.clipDurationMs)
        ? Math.max(0, Number(options.clipDurationMs))
        : null;
    const entranceConfigOverride = options.entranceConfigOverride || null;

    if (!previewImage || !objectURL) {
        return;
    }

    if (!previewImage.hidden && previewImage.src === objectURL) {
        if (immediate) {
            cancelPreviewEntranceAnimation();
            previewImage.classList.add('is-visible');
        } else {
            const didAnimate = runPreviewImageEntranceAnimation({
                clipDurationMs,
                configOverride: entranceConfigOverride,
            });
            if (!didAnimate) {
                previewImage.classList.add('is-visible');
            }
        }
        return;
    }

    try {
        await preloadTimelineImage(objectURL);
    } catch (error) {
        console.warn('Unable to preload timeline image before preview.', error);
    }

    cancelPreviewEntranceAnimation();
    previewImage.classList.remove('is-visible');

    await new Promise((resolve) => {
        let settled = false;

        const finish = () => {
            if (settled) {
                return;
            }
            settled = true;
            previewImage.removeEventListener('load', finish);
            previewImage.removeEventListener('error', finish);
            if (immediate) {
                previewImage.classList.add('is-visible');
            } else {
                requestAnimationFrame(() => {
                    const didAnimate = runPreviewImageEntranceAnimation({
                        clipDurationMs,
                        configOverride: entranceConfigOverride,
                    });
                    if (!didAnimate) {
                        previewImage.classList.add('is-visible');
                    }
                });
            }
            resolve();
        };

        previewImage.addEventListener('load', finish, { once: true });
        previewImage.addEventListener('error', finish, { once: true });

        if (previewImage.src !== objectURL) {
            previewImage.src = objectURL;
        } else if (previewImage.complete && previewImage.naturalWidth > 0) {
            finish();
        }
    });
}

function waitForMediaReady(mediaElement, options = {}) {
    const { signal } = options;

    return new Promise((resolve, reject) => {
        if (!mediaElement) {
            resolve();
            return;
        }

        if (mediaElement.readyState >= MEDIA_READY_STATE_ENOUGH) {
            resolve();
            return;
        }

        let settled = false;

        const finish = (callback) => (value) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            callback(value);
        };

        const handleReady = finish(() => resolve());
        const handleError = finish((event) => {
            const error = event?.error || new Error('Unable to buffer media for preview.');
            reject(error);
        });
        const handleAbort = finish(() => {
            const abortError = typeof DOMException === 'function'
                ? new DOMException('Playback aborted', 'AbortError')
                : new Error('Playback aborted');
            reject(abortError);
        });

        function cleanup() {
            MEDIA_READY_EVENTS.forEach((eventName) => {
                mediaElement.removeEventListener(eventName, handleReady);
            });
            mediaElement.removeEventListener('error', handleError);
            if (signal) {
                signal.removeEventListener('abort', handleAbort);
            }
        }

        MEDIA_READY_EVENTS.forEach((eventName) => {
            mediaElement.addEventListener(eventName, handleReady);
        });
        mediaElement.addEventListener('error', handleError);

        if (signal) {
            if (signal.aborted) {
                handleAbort();
                return;
            }
            signal.addEventListener('abort', handleAbort);
        }
    });
}

const previewImagePointerState = {
    pointerId: null,
    mode: null,
    handle: null,
    origin: null,
};

const keyframeMarkerPointerState = {
    pointerId: null,
    marker: null,
    timelineItem: null,
    keyframes: null,
    entry: null,
    startProgress: 0,
    pointerOffsetProgress: 0,
    didMove: false,
};

const PREVIEW_IMAGE_SNAP_THRESHOLD = 12;
const PREVIEW_ALIGNMENT_TOLERANCE = 0.75;
const PREVIEW_GUIDE_NEAR_THRESHOLD = Math.max(PREVIEW_IMAGE_SNAP_THRESHOLD, 14);
const PREVIEW_SMART_GUIDE_TOLERANCE = 6;
const PREVIEW_ALIGNMENT_CLASSES = {
    left: 'is-aligned-left',
    right: 'is-aligned-right',
    top: 'is-aligned-top',
    bottom: 'is-aligned-bottom',
};

let previewViewportAlignmentState = {
    left: false,
    right: false,
    top: false,
    bottom: false,
};

const KEYFRAME_PROGRESS_TOLERANCE = 0.002;
const KEYFRAME_DRAG_EPSILON = 0.0001;
const KEYFRAME_DRAG_UPDATE_EPSILON = 0.00001;
const KEYFRAME_STATUS_TIMEOUT_MS = 2600;
const KEYFRAME_TRACK_KEY_STEP = 0.05;
const KEYFRAME_TRACK_KEY_LARGE_STEP = 0.15;
const MIN_ROTATION_DEGREES = -180;
const MAX_ROTATION_DEGREES = 180;
const DEFAULT_VIDEO_DURATION = 3000;
const MIN_IMAGE_DURATION = 400;
const MIN_AUDIO_DURATION = 400;
const IMAGE_DURATION_APPLY_EMPTY_STATE_MESSAGE = 'Add an image clip to enable Apply All.';
const IMAGE_DURATION_APPLY_SELECT_MESSAGE = 'Select an image clip to copy its duration.';
const IMAGE_DURATION_APPLY_NEED_TARGET_MESSAGE = 'Add another image clip to copy this duration.';
const TIMELINE_DURATION_PER_PIXEL_DEFAULT = 12;
const TIMELINE_DURATION_PER_PIXEL_MIN = 2;
const TIMELINE_DURATION_PER_PIXEL_MAX = 600;
const TIMELINE_ZOOM_BUTTON_STEP = 1;
const MIN_TIMELINE_ITEM_WIDTH = 96;
const MIN_IMAGE_FRAME_SIZE = 96;
const MAX_TIMELINE_STACK_LANES = 4;
const TIMELINE_LANE_INSERT_HOTZONE = 28;
const TIMELINE_LANE_INSERT_SPACING = 32;
const TIMELINE_AUTO_SCROLL_MARGIN = 72;
const TIMELINE_AUTO_SCROLL_MIN_STEP = 4;
const TIMELINE_AUTO_SCROLL_MAX_STEP = 24;
const TIMELINE_SNAP_THRESHOLD_PX = 12;

let playbackClockAnimationFrame = null;
let playbackClockStartTimestamp = 0;
let playbackClockBaseElapsed = 0;
let playbackClockTotalDuration = 0;
let playbackDisplayCurrentMs = 0;
let playbackDisplayTotalMs = 0;
let timelinePlaybackSyncSource = null;
const timelinePlaybackSyncFallback = {
    baseElapsed: 0,
    startTimestamp: 0,
};
let timelineDurationPerPixel = TIMELINE_DURATION_PER_PIXEL_DEFAULT;
let isPreviewFullscreen = false;

function activateSettingsSection(sectionName) {
    if (!settingsTabs.length || !settingsSections.length) {
        return;
    }

    const fallbackSection = settingsSections[0]?.dataset.section || '';
    const targetSection = sectionName || fallbackSection;
    let matched = false;

    settingsTabs.forEach((tab) => {
        const isMatch = tab.dataset.section === targetSection;
        tab.classList.toggle('is-active', isMatch);
        tab.setAttribute('aria-selected', String(isMatch));
        tab.tabIndex = isMatch ? 0 : -1;
        if (isMatch) {
            matched = true;
        }
    });

    const resolvedSection = matched ? targetSection : fallbackSection;

    settingsSections.forEach((section) => {
        const isActive = section.dataset.section === resolvedSection;
        section.classList.toggle('is-active', isActive);
        section.setAttribute('aria-hidden', String(!isActive));
        if (isActive) {
            section.removeAttribute('hidden');
        } else {
            section.setAttribute('hidden', '');
        }
    });

    if (!matched && resolvedSection !== targetSection) {
        settingsTabs.forEach((tab) => {
            const isFallback = tab.dataset.section === resolvedSection;
            tab.classList.toggle('is-active', isFallback);
            tab.setAttribute('aria-selected', String(isFallback));
            tab.tabIndex = isFallback ? 0 : -1;
        });
    }
}

settingsTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
        activateSettingsSection(tab.dataset.section);
    });
});

activateSettingsSection(settingsTabs.find((tab) => tab.classList.contains('is-active'))?.dataset.section);

function updateAnimationModeContent(selectedMode) {
    if (!animationModeContainers.length) {
        return;
    }

    const sanitizedMode = sanitizeAnimationDirection(selectedMode);
    if (sanitizedMode === 'none') {
        animationModeContainers.forEach((container) => {
            container.classList.remove('is-active');
            container.setAttribute('hidden', '');
            container.setAttribute('aria-hidden', 'true');
        });
        return;
    }

    const validModes = new Set(animationModeContainers.map((container) => container.dataset.animationMode));
    const fallbackMode = animationModeContainers[0]?.dataset.animationMode;
    const mode = validModes.has(sanitizedMode) ? sanitizedMode : fallbackMode;

    animationModeContainers.forEach((container) => {
        const isActive = container.dataset.animationMode === mode;
        container.classList.toggle('is-active', isActive);
        if (isActive) {
            container.removeAttribute('hidden');
            container.setAttribute('aria-hidden', 'false');
        } else {
            container.setAttribute('hidden', '');
            container.setAttribute('aria-hidden', 'true');
        }
    });
}

function previewAnimationForDirection(direction) {
    const sanitizedDirection = sanitizeAnimationDirection(direction);

    cancelPreviewExitAnimation({ forceRestore: true });

    if (sanitizedDirection === 'combo') {
        previewComboAnimationCycle();
        return;
    }

    if (sanitizedDirection === 'out') {
        previewExitAnimationDemo();
    } else if (sanitizedDirection === 'in') {
        previewEntranceAnimationDemo();
    }
}

function syncAnimationControlsToTimelineItem(timelineItem) {
    const isImage = isImageTimelineItem(timelineItem);
    const settings = isImage
        ? getTimelineItemAnimationSettings(timelineItem)
        : getDefaultAnimationSettings();

    if (animationDirectionSelect) {
        animationDirectionSelect.disabled = !isImage;
        animationDirectionSelect.value = settings.direction;
    }

    if (animationModeContainers.length) {
        const appliedDirection = animationDirectionSelect
            ? animationDirectionSelect.value
            : settings.direction;
        updateAnimationModeContent(appliedDirection);
    }

    if (animationInPresetSelect) {
        animationInPresetSelect.disabled = !isImage;
        animationInPresetSelect.value = settings.inPreset;
    }

    if (animationInTimingInput) {
        animationInTimingInput.disabled = !isImage;
        const sanitizedTiming = sanitizeEntranceTiming(settings.inTiming);
        const timingController = getOptionSliderController('animation-in-timing');
        if (timingController) {
            timingController.slider.disabled = !isImage;
            timingController.setValueByOption(sanitizedTiming, { force: true });
        } else {
            animationInTimingInput.dataset.optionValue = sanitizedTiming;
            const fallbackIndex = ENTRANCE_ANIMATION_TIMING_KEYS.indexOf(sanitizedTiming);
            animationInTimingInput.value = String(Math.max(fallbackIndex, 0));
        }
    }

    if (animationComboInPresetSelect) {
        animationComboInPresetSelect.disabled = !isImage;
        animationComboInPresetSelect.value = settings.comboInPreset;
    }

    if (animationComboOutPresetSelect) {
        animationComboOutPresetSelect.disabled = !isImage;
        animationComboOutPresetSelect.value = settings.comboOutPreset;
    }

    if (animationComboSpeedInput) {
        animationComboSpeedInput.disabled = !isImage;
        const sanitizedWindowMs = sanitizeComboWindowMs(settings.comboWindowMs);
        const seconds = Math.round(sanitizedWindowMs / 1000);
        const clampedSeconds = Math.min(
            Math.max(seconds, COMBO_SPEED_MIN_SECONDS),
            COMBO_SPEED_MAX_SECONDS,
        );
        const appliedWindowMs = clampedSeconds * 1000;
        animationComboSpeedInput.dataset.windowMs = String(appliedWindowMs);
        animationComboSpeedInput.value = String(clampedSeconds);
        updateComboSpeedSliderDisplay({ triggerPreview: false });
    }

    if (animationOutPresetSelect) {
        animationOutPresetSelect.disabled = !isImage;
        animationOutPresetSelect.value = settings.outPreset;
    }

    if (animationOutDelayInput) {
        animationOutDelayInput.disabled = !isImage;
        const sanitizedDelay = sanitizeExitDelayKey(settings.outDelay);
        const delayController = getOptionSliderController('animation-out-delay');
        if (delayController) {
            delayController.slider.disabled = !isImage;
            delayController.setValueByOption(sanitizedDelay, { force: true });
        } else {
            animationOutDelayInput.dataset.optionValue = sanitizedDelay;
            const fallbackIndex = EXIT_ANIMATION_DELAY_KEYS.indexOf(sanitizedDelay);
            animationOutDelayInput.value = String(Math.max(fallbackIndex, 0));
        }
    }

    refreshComboApplyAllAvailability();
}

function setImageDurationApplyStatus(message, options = {}) {
    if (!imageDurationApplyStatus) {
        return;
    }

    window.clearTimeout(imageDurationApplyStatusTimer);
    imageDurationApplyStatusTimer = 0;

    const nextMessage = message || '';
    imageDurationApplyStatus.textContent = nextMessage;

    if (!nextMessage) {
        return;
    }

    if (options.persist) {
        return;
    }

    const timeoutMs = Number.isFinite(options.timeoutMs) ? Number(options.timeoutMs) : 4000;
    imageDurationApplyStatusTimer = window.setTimeout(() => {
        if (imageDurationApplyStatus) {
            imageDurationApplyStatus.textContent = '';
        }
        imageDurationApplyStatusTimer = 0;
    }, Math.max(0, timeoutMs));
}

function refreshImageDurationApplyAllAvailability() {
    if (!imageDurationApplyAllButton) {
        return;
    }

    const timelineItems = timelineTrack ? getTimelineItems() : [];
    const imageItems = timelineItems.filter((item) => isImageTimelineItem(item));
    const hasImages = imageItems.length > 0;
    const activeIsImage = isImageTimelineItem(activeTimelineItem);
    const hasTargets = imageItems.length > 1;

    imageDurationApplyAllButton.disabled = !(activeIsImage && hasTargets);

    if (!hasImages) {
        setImageDurationApplyStatus(IMAGE_DURATION_APPLY_EMPTY_STATE_MESSAGE, { persist: true });
        return;
    }

    if (!activeIsImage) {
        setImageDurationApplyStatus(IMAGE_DURATION_APPLY_SELECT_MESSAGE, { persist: true });
        return;
    }

    if (!hasTargets) {
        setImageDurationApplyStatus(IMAGE_DURATION_APPLY_NEED_TARGET_MESSAGE, { persist: true });
        return;
    }

    if (imageDurationApplyStatus
        && (
            imageDurationApplyStatus.textContent === IMAGE_DURATION_APPLY_EMPTY_STATE_MESSAGE
            || imageDurationApplyStatus.textContent === IMAGE_DURATION_APPLY_SELECT_MESSAGE
            || imageDurationApplyStatus.textContent === IMAGE_DURATION_APPLY_NEED_TARGET_MESSAGE
        )
    ) {
        setImageDurationApplyStatus('');
    }
}

function handleImageDurationApplyAllClick() {
    if (!imageDurationApplyAllButton || imageDurationApplyAllButton.disabled) {
        return;
    }

    if (!isImageTimelineItem(activeTimelineItem)) {
        setImageDurationApplyStatus(IMAGE_DURATION_APPLY_SELECT_MESSAGE, { timeoutMs: 3200 });
        refreshImageDurationApplyAllAvailability();
        refreshCanvasBlurApplyAllAvailability();
        return;
    }

    const rawDatasetDuration = Math.round(Number(activeTimelineItem.dataset.imageDuration) || 0);
    const fallbackDuration = Math.round(getTimelineItemPlaybackDuration(activeTimelineItem));
    const targetDuration = Math.max(
        MIN_IMAGE_DURATION,
        rawDatasetDuration > 0 ? rawDatasetDuration : fallbackDuration,
    );

    if (!(targetDuration > 0)) {
        setImageDurationApplyStatus('The selected image has no duration to copy.', { timeoutMs: 3200 });
        refreshImageDurationApplyAllAvailability();
        refreshCanvasBlurApplyAllAvailability();
        return;
    }

    const timelineItems = getTimelineItems();
    let appliedCount = 0;

    timelineItems.forEach((timelineItem) => {
        if (!isImageTimelineItem(timelineItem) || timelineItem === activeTimelineItem) {
            return;
        }

        const currentDuration = Math.max(0, Math.round(Number(timelineItem.dataset.imageDuration) || 0));
        if (currentDuration === targetDuration) {
            return;
        }

        setTimelineItemDuration(timelineItem, 'imageDuration', targetDuration, { markCustom: true });
        appliedCount += 1;
    });

    if (appliedCount === 0) {
        setImageDurationApplyStatus('All images already use this duration.', { timeoutMs: 3200 });
    } else {
        const pluralSuffix = appliedCount === 1 ? '' : 's';
        setImageDurationApplyStatus(`Applied to ${appliedCount} image${pluralSuffix}.`, { timeoutMs: 3200 });
        updateActiveTimelineIndicators();
        renderExportSummary(getTimelineItems(), null);
    }

    refreshImageDurationApplyAllAvailability();
    refreshCanvasBlurApplyAllAvailability();
}

function persistActiveTimelineAnimationDirection(direction) {
    if (!isImageTimelineItem(activeTimelineItem)) {
        return;
    }

    const sanitized = sanitizeAnimationDirection(direction);
    setTimelineItemAnimationDataset(
        activeTimelineItem,
        'animationDirection',
        sanitized,
        DEFAULT_ANIMATION_DIRECTION,
    );

    if (sanitized === 'combo') {
        synchronizeImageAnimationDurations(activeTimelineItem, {
            source: 'direction',
            durationKey: 'imageDuration',
        });
    }
}

function persistActiveTimelineEntrancePreset(presetKey) {
    if (!isImageTimelineItem(activeTimelineItem)) {
        return;
    }

    const sanitized = sanitizeEntrancePreset(presetKey);
    setTimelineItemAnimationDataset(
        activeTimelineItem,
        'animationInPreset',
        sanitized,
        DEFAULT_ENTRANCE_PRESET,
    );
}

function persistActiveTimelineEntranceTiming(timingKey) {
    if (!isImageTimelineItem(activeTimelineItem)) {
        return;
    }

    const sanitized = sanitizeEntranceTiming(timingKey);
    setTimelineItemAnimationDataset(
        activeTimelineItem,
        'animationInTiming',
        sanitized,
        DEFAULT_ENTRANCE_TIMING,
    );
}

function persistActiveTimelineExitPreset(presetKey) {
    if (!isImageTimelineItem(activeTimelineItem)) {
        return;
    }

    const sanitized = sanitizeExitPreset(presetKey);
    setTimelineItemAnimationDataset(
        activeTimelineItem,
        'animationOutPreset',
        sanitized,
        DEFAULT_EXIT_PRESET,
    );
}

function persistActiveTimelineExitDelay(delayKey) {
    if (!isImageTimelineItem(activeTimelineItem)) {
        return;
    }

    const sanitized = sanitizeExitDelayKey(delayKey);
    setTimelineItemAnimationDataset(
        activeTimelineItem,
        'animationOutDelay',
        sanitized,
        DEFAULT_EXIT_DELAY,
    );
}

function persistActiveTimelineComboEntrancePreset(presetKey) {
    if (!isImageTimelineItem(activeTimelineItem)) {
        return;
    }

    const sanitized = sanitizeComboEntrancePreset(presetKey);
    setTimelineItemAnimationDataset(
        activeTimelineItem,
        'animationComboInPreset',
        sanitized,
        DEFAULT_COMBO_ENTRANCE_PRESET,
    );
}

function persistActiveTimelineComboExitPreset(presetKey) {
    if (!isImageTimelineItem(activeTimelineItem)) {
        return;
    }

    const sanitized = sanitizeComboExitPreset(presetKey);
    setTimelineItemAnimationDataset(
        activeTimelineItem,
        'animationComboOutPreset',
        sanitized,
        DEFAULT_COMBO_EXIT_PRESET,
    );
}

function persistActiveTimelineComboSpeed() {
    if (!isImageTimelineItem(activeTimelineItem)) {
        return;
    }

    const rawWindowMs = getComboSpeedWindowMs();
    const sanitized = sanitizeComboWindowMs(
        Number.isFinite(rawWindowMs) ? rawWindowMs : DEFAULT_COMBO_SPEED_MS,
    );

    setTimelineItemAnimationDataset(
        activeTimelineItem,
        'animationComboWindowMs',
        String(sanitized),
        String(DEFAULT_COMBO_SPEED_MS),
    );

    synchronizeImageAnimationDurations(activeTimelineItem, {
        source: 'animation',
        durationKey: 'imageDuration',
        animationWindowMs: sanitized,
    });
}

function setAnimationComboApplyStatus(message, options = {}) {
    if (!animationComboApplyStatus) {
        return;
    }

    window.clearTimeout(animationComboApplyStatusTimer);
    animationComboApplyStatusTimer = 0;

    const nextMessage = message || '';
    animationComboApplyStatus.textContent = nextMessage;

    if (!nextMessage) {
        return;
    }

    const persist = Boolean(options.persist);
    if (persist) {
        return;
    }

    const timeoutMs = Number.isFinite(options.timeoutMs)
        ? Number(options.timeoutMs)
        : 4000;

    animationComboApplyStatusTimer = window.setTimeout(() => {
        animationComboApplyStatus.textContent = '';
        animationComboApplyStatusTimer = 0;
    }, Math.max(0, timeoutMs));
}

function refreshComboApplyAllAvailability() {
    if (!animationComboApplyAllButton || !timelineTrack) {
        return;
    }

    const timelineItems = getTimelineItems();
    const hasImages = timelineItems.some((item) => isImageTimelineItem(item));
    animationComboApplyAllButton.disabled = !hasImages;

    if (!hasImages) {
        setAnimationComboApplyStatus(COMBO_APPLY_EMPTY_STATE_MESSAGE, { persist: true });
        return;
    }

    if (animationComboApplyStatus
        && animationComboApplyStatus.textContent === COMBO_APPLY_EMPTY_STATE_MESSAGE
    ) {
        setAnimationComboApplyStatus('');
    }
}

function getCurrentComboAnimationSettingsFromControls() {
    const comboInPreset = sanitizeComboEntrancePreset(animationComboInPresetSelect?.value);
    const comboOutPreset = sanitizeComboExitPreset(animationComboOutPresetSelect?.value);
    const rawWindowMs = getComboSpeedWindowMs();
    const fallbackWindowMs = Number.isFinite(rawWindowMs)
        ? rawWindowMs
        : DEFAULT_COMBO_SPEED_MS;
    const comboWindowMs = sanitizeComboWindowMs(fallbackWindowMs);

    return {
        comboInPreset,
        comboOutPreset,
        comboWindowMs,
    };
}

function applyComboSettingsToTimelineItem(timelineItem, settings) {
    if (!isImageTimelineItem(timelineItem)) {
        return false;
    }

    const previousSettings = getTimelineItemAnimationSettings(timelineItem);

    const sanitizedInPreset = sanitizeComboEntrancePreset(settings?.comboInPreset);
    const sanitizedOutPreset = sanitizeComboExitPreset(settings?.comboOutPreset);
    const sanitizedWindowMs = sanitizeComboWindowMs(settings?.comboWindowMs);

    const directionChanged = previousSettings.direction !== 'combo';
    const inChanged = previousSettings.comboInPreset !== sanitizedInPreset;
    const outChanged = previousSettings.comboOutPreset !== sanitizedOutPreset;
    const windowChanged = previousSettings.comboWindowMs !== sanitizedWindowMs;

    setTimelineItemAnimationDataset(
        timelineItem,
        'animationDirection',
        'combo',
        DEFAULT_ANIMATION_DIRECTION,
    );

    setTimelineItemAnimationDataset(
        timelineItem,
        'animationComboInPreset',
        sanitizedInPreset,
        DEFAULT_COMBO_ENTRANCE_PRESET,
    );

    setTimelineItemAnimationDataset(
        timelineItem,
        'animationComboOutPreset',
        sanitizedOutPreset,
        DEFAULT_COMBO_EXIT_PRESET,
    );

    setTimelineItemAnimationDataset(
        timelineItem,
        'animationComboWindowMs',
        String(sanitizedWindowMs),
        String(DEFAULT_COMBO_SPEED_MS),
    );

    synchronizeImageAnimationDurations(timelineItem, {
        source: 'animation',
        durationKey: 'imageDuration',
        animationWindowMs: sanitizedWindowMs,
    });

    return directionChanged || inChanged || outChanged || windowChanged;
}

function handleComboApplyAllClick() {
    if (!animationComboApplyAllButton || animationComboApplyAllButton.disabled) {
        return;
    }

    const timelineItems = getTimelineItems();
    const imageItems = timelineItems.filter((item) => isImageTimelineItem(item));

    if (!imageItems.length) {
        refreshComboApplyAllAvailability();
        return;
    }

    const settings = getCurrentComboAnimationSettingsFromControls();
    let appliedCount = 0;

    imageItems.forEach((timelineItem) => {
        if (applyComboSettingsToTimelineItem(timelineItem, settings)) {
            appliedCount += 1;
        }
    });

    refreshComboApplyAllAvailability();

    if (appliedCount === 0) {
        setAnimationComboApplyStatus('All images already use this combo animation.', { timeoutMs: 3200 });
    } else {
        const pluralSuffix = appliedCount === 1 ? '' : 's';
        setAnimationComboApplyStatus(`Applied to ${appliedCount} image${pluralSuffix}.`, { timeoutMs: 3200 });
    }

    syncAnimationControlsToTimelineItem(activeTimelineItem);

    if (isComboModeActive()) {
        cancelComboPreviewCycle();
        previewComboAnimationCycle();
    }
}

if (animationDirectionSelect && animationModeContainers.length) {
    const initialDirection = sanitizeAnimationDirection(animationDirectionSelect.value);
    animationDirectionSelect.value = initialDirection;
    updateAnimationModeContent(initialDirection);
    previewAnimationForDirection(initialDirection);

    animationDirectionSelect.addEventListener('change', (event) => {
        const rawValue = event.target.value;
        const sanitizedValue = sanitizeAnimationDirection(rawValue);
        animationDirectionSelect.value = sanitizedValue;
        updateAnimationModeContent(sanitizedValue);
        persistActiveTimelineAnimationDirection(sanitizedValue);
        previewAnimationForDirection(sanitizedValue);
    });
}

if (animationInPresetSelect) {
    animationInPresetSelect.addEventListener('change', () => {
        persistActiveTimelineEntrancePreset(animationInPresetSelect.value);
        if (!animationDirectionSelect
            || sanitizeAnimationDirection(animationDirectionSelect.value) === 'in') {
            previewEntranceAnimationDemo();
        }
    });
}

if (animationInTimingInput) {
    const handleEntranceTimingChange = () => {
        persistActiveTimelineEntranceTiming(getEntranceTimingKey());
        if (!animationDirectionSelect
            || sanitizeAnimationDirection(animationDirectionSelect.value) === 'in') {
            previewEntranceAnimationDemo();
        }
    };

    animationInTimingInput.addEventListener('change', handleEntranceTimingChange);
    animationInTimingInput.addEventListener('input', handleEntranceTimingChange);
}

if (animationComboInPresetSelect) {
    animationComboInPresetSelect.addEventListener('change', () => {
        persistActiveTimelineComboEntrancePreset(animationComboInPresetSelect.value);
        if (isComboModeActive()) {
            previewComboAnimationCycle();
        }
    });
}

if (animationComboOutPresetSelect) {
    animationComboOutPresetSelect.addEventListener('change', () => {
        persistActiveTimelineComboExitPreset(animationComboOutPresetSelect.value);
        if (isComboModeActive()) {
            previewComboAnimationCycle();
        }
    });
}

if (animationComboSpeedInput) {
    const handleComboSpeedChange = () => {
        updateComboSpeedSliderDisplay({ triggerPreview: true });
        persistActiveTimelineComboSpeed();
    };

    animationComboSpeedInput.addEventListener('change', handleComboSpeedChange);
    animationComboSpeedInput.addEventListener('input', handleComboSpeedChange);

    updateComboSpeedSliderDisplay();
}

if (animationComboApplyAllButton) {
    animationComboApplyAllButton.addEventListener('click', handleComboApplyAllClick);
}

if (imageDurationApplyAllButton) {
    imageDurationApplyAllButton.addEventListener('click', handleImageDurationApplyAllClick);
}

syncAnimationControlsToTimelineItem(activeTimelineItem);

if (animationOutPresetSelect) {
    animationOutPresetSelect.addEventListener('change', () => {
        persistActiveTimelineExitPreset(animationOutPresetSelect.value);
        if (!animationDirectionSelect
            || sanitizeAnimationDirection(animationDirectionSelect.value) === 'out') {
            previewExitAnimationDemo();
        }
    });
}

if (animationOutDelayInput) {
    const handleExitDelayChange = () => {
        persistActiveTimelineExitDelay(getExitAnimationDelayKey());
        if (!animationDirectionSelect
            || sanitizeAnimationDirection(animationDirectionSelect.value) === 'out') {
            previewExitAnimationDemo();
        }
    };

    animationOutDelayInput.addEventListener('change', handleExitDelayChange);
    animationOutDelayInput.addEventListener('input', handleExitDelayChange);
}

function formatTime(milliseconds) {
    const safeMs = Math.max(0, Math.floor(Number(milliseconds) || 0));
    const totalSeconds = Math.floor(safeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const EXPORT_RESOLUTION_PRESETS = {
    '16:9': {
        '480p': { width: 854, height: 480 },
        '720p': { width: 1280, height: 720 },
        '1080p': { width: 1920, height: 1080 },
    },
    '9:16': {
        '480p': { width: 480, height: 854 },
        '720p': { width: 720, height: 1280 },
        '1080p': { width: 1080, height: 1920 },
    },
};

function getExportResolution(aspectValue, qualityValue) {
    const aspectKey = (aspectValue || '16:9') in EXPORT_RESOLUTION_PRESETS
        ? aspectValue
        : '16:9';
    const presetsForAspect = EXPORT_RESOLUTION_PRESETS[aspectKey] || {};
    const qualityKey = qualityValue && qualityValue in presetsForAspect
        ? qualityValue
        : DEFAULT_EXPORT_QUALITY;
    return presetsForAspect[qualityKey];
}

const EXPORT_FORMAT_CANDIDATES = [
    {
        mimeType: 'video/mp4;codecs="avc1.42E01E, mp4a.40.2"',
        fileExtension: 'mp4',
        label: 'MP4 (H.264)',
    },
    {
        mimeType: 'video/mp4;codecs="avc1.4D401E, mp4a.40.2"',
        fileExtension: 'mp4',
        label: 'MP4 (H.264)',
    },
    {
        mimeType: 'video/mp4',
        fileExtension: 'mp4',
        label: 'MP4 (H.264)',
    },
    {
        mimeType: 'video/webm;codecs="vp9,opus"',
        fileExtension: 'webm',
        label: 'WebM (VP9)',
    },
    {
        mimeType: 'video/webm;codecs="vp8,opus"',
        fileExtension: 'webm',
        label: 'WebM (VP8)',
    },
    {
        mimeType: 'video/webm',
        fileExtension: 'webm',
        label: 'WebM',
    },
];

function getSupportedExportFormat() {
    if (!window.MediaRecorder) {
        return null;
    }
    for (const candidate of EXPORT_FORMAT_CANDIDATES) {
        try {
            if (window.MediaRecorder.isTypeSupported(candidate.mimeType)) {
                return candidate;
            }
        } catch (error) {
            // Continue to next candidate
        }
    }
    return null;
}

function computeContainDimensions(sourceWidth, sourceHeight, targetWidth, targetHeight) {
    if (!Number.isFinite(sourceWidth)
        || !Number.isFinite(sourceHeight)
        || sourceWidth <= 0
        || sourceHeight <= 0
    ) {
        return {
            x: 0,
            y: 0,
            width: targetWidth,
            height: targetHeight,
        };
    }

    const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    const x = (targetWidth - width) / 2;
    const y = (targetHeight - height) / 2;
    return { x, y, width, height };
}

let previewImageFrameBorderRadius = null;

const MATRIX_IDENTITY_EPSILON = 0.00001;

function isMatrixApproximatelyIdentity(a, b, c, d, e, f) {
    return (
        Math.abs((Number.isFinite(a) ? a : 1) - 1) <= MATRIX_IDENTITY_EPSILON
        && Math.abs(Number.isFinite(b) ? b : 0) <= MATRIX_IDENTITY_EPSILON
        && Math.abs(Number.isFinite(c) ? c : 0) <= MATRIX_IDENTITY_EPSILON
        && Math.abs((Number.isFinite(d) ? d : 1) - 1) <= MATRIX_IDENTITY_EPSILON
        && Math.abs(Number.isFinite(e) ? e : 0) <= MATRIX_IDENTITY_EPSILON
        && Math.abs(Number.isFinite(f) ? f : 0) <= MATRIX_IDENTITY_EPSILON
    );
}

function parseCssTransformMatrix(transformValue) {
    if (!transformValue || typeof transformValue !== 'string') {
        return null;
    }

    const normalized = transformValue.trim();
    if (!normalized || normalized === 'none') {
        return null;
    }

    if (typeof DOMMatrix === 'function') {
        try {
            const domMatrix = new DOMMatrix(normalized);
            if (
                Number.isFinite(domMatrix.a)
                && Number.isFinite(domMatrix.b)
                && Number.isFinite(domMatrix.c)
                && Number.isFinite(domMatrix.d)
                && Number.isFinite(domMatrix.e)
                && Number.isFinite(domMatrix.f)
            ) {
                const isIdentity = typeof domMatrix.isIdentity === 'boolean'
                    ? domMatrix.isIdentity
                    : isMatrixApproximatelyIdentity(
                        domMatrix.a,
                        domMatrix.b,
                        domMatrix.c,
                        domMatrix.d,
                        domMatrix.e,
                        domMatrix.f,
                    );
                return {
                    a: domMatrix.a,
                    b: domMatrix.b,
                    c: domMatrix.c,
                    d: domMatrix.d,
                    e: domMatrix.e,
                    f: domMatrix.f,
                    isIdentity: Boolean(isIdentity)
                        || isMatrixApproximatelyIdentity(
                            domMatrix.a,
                            domMatrix.b,
                            domMatrix.c,
                            domMatrix.d,
                            domMatrix.e,
                            domMatrix.f,
                        ),
                };
            }
        } catch (error) {
            // Fallback to manual parsing below if DOMMatrix construction fails.
        }
    }

    const matrixMatch = normalized.match(/^matrix\(([^)]+)\)$/i);