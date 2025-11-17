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

const keyframeTrackPointerState = {
    pointerId: null,
    startProgress: 0,
    lastProgress: null,
    didScrub: false,
};

const imageBlurKeyframePointerState = {
    pointerId: null,
    marker: null,
    timelineItem: null,
    keyframes: null,
    entry: null,
    startProgress: 0,
    pointerOffsetProgress: 0,
    didMove: false,
};

const imageBlurTrackPointerState = {
    pointerId: null,
    startProgress: 0,
    lastProgress: null,
    didScrub: false,
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
const IMAGE_BLUR_KEYFRAME_STATUS_TIMEOUT_MS = 2600;
const KEYFRAME_TRACK_KEY_STEP = 0.05;
const KEYFRAME_TRACK_KEY_LARGE_STEP = 0.15;
const IMAGE_BLUR_TRACK_SNAP_THRESHOLD_PX = 8;
const MIN_ROTATION_DEGREES = -180;
const MAX_ROTATION_DEGREES = 180;
const DEFAULT_VIDEO_DURATION = 3000;
const MIN_IMAGE_DURATION = 400;
const MIN_AUDIO_DURATION = 400;
const IMAGE_DURATION_APPLY_EMPTY_STATE_MESSAGE = 'Add an image clip to enable Apply All.';
const IMAGE_DURATION_APPLY_SELECT_MESSAGE = 'Select an image clip to copy its duration.';
const IMAGE_DURATION_APPLY_NEED_TARGET_MESSAGE = 'Add another image clip to this layer to copy this duration.';
const IMAGE_DURATION_APPLY_ALREADY_APPLIED_MESSAGE = 'All images in this layer already use this duration.';
const TIMELINE_DURATION_PER_PIXEL_DEFAULT = 12;
const TIMELINE_DURATION_PER_PIXEL_MIN = 2;
const TIMELINE_DURATION_PER_PIXEL_MAX = 600;
const TIMELINE_ZOOM_BUTTON_STEP = 1;
const MIN_TIMELINE_ITEM_WIDTH = 96;
const MIN_IMAGE_FRAME_SIZE = 96;
const MAX_TIMELINE_STACK_LANES = 6;
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

const TIMELINE_ITEM_DURATION_FEEDBACK_CLASS = 'timeline-item--duration-applied';
const TIMELINE_ITEM_DURATION_FEEDBACK_TIMEOUT_MS = 900;
const timelineItemDurationFeedbackTimers = new WeakMap();

function normalizeLaneIndex(value) {
    const normalized = Number.parseInt(typeof value === 'string' ? value : `${value ?? ''}`, 10);
    return Number.isFinite(normalized) ? normalized : 0;
}

function getTimelineItemLaneIndex(timelineItem) {
    if (!timelineItem) {
        return 0;
    }

    const datasetLaneIndex = timelineItem.dataset?.laneIndex;
    if (typeof parseTimelineLaneIndex === 'function') {
        if (datasetLaneIndex !== undefined) {
            return parseTimelineLaneIndex(datasetLaneIndex);
        }
        const parentLaneValue = timelineItem.closest?.('.timeline-lane')?.dataset?.laneIndex;
        return parseTimelineLaneIndex(parentLaneValue);
    }

    if (datasetLaneIndex !== undefined) {
        return normalizeLaneIndex(datasetLaneIndex);
    }

    const fallbackLaneValue = timelineItem.closest?.('.timeline-lane')?.dataset?.laneIndex;
    return normalizeLaneIndex(fallbackLaneValue);
}

function flashTimelineItemDurationFeedback(timelineItem) {
    if (!timelineItem) {
        return;
    }

    if (timelineItemDurationFeedbackTimers.has(timelineItem)) {
        window.clearTimeout(timelineItemDurationFeedbackTimers.get(timelineItem));
        timelineItemDurationFeedbackTimers.delete(timelineItem);
    }

    timelineItem.classList.remove(TIMELINE_ITEM_DURATION_FEEDBACK_CLASS);
    void timelineItem.offsetWidth;
    timelineItem.classList.add(TIMELINE_ITEM_DURATION_FEEDBACK_CLASS);

    const timer = window.setTimeout(() => {
        timelineItem.classList.remove(TIMELINE_ITEM_DURATION_FEEDBACK_CLASS);
        timelineItemDurationFeedbackTimers.delete(timelineItem);
    }, TIMELINE_ITEM_DURATION_FEEDBACK_TIMEOUT_MS);

    timelineItemDurationFeedbackTimers.set(timelineItem, timer);
}

function setImageDurationApplyStatus(message, options = {}) {
    if (!imageDurationApplyStatus) {
        return;
    }

    window.clearTimeout(imageDurationApplyStatusTimer);
    imageDurationApplyStatusTimer = 0;

    const nextMessage = message || '';
    const showInline = options.inline !== false;

    if (nextMessage && options.toast && typeof showApplyFeedback === 'function') {
        showApplyFeedback(nextMessage, {
            tone: options.toast.tone || 'info',
            contextLabel: options.toast.contextLabel || 'Video',
            timeoutMs: options.toast.timeoutMs,
        });
    }

    if (!showInline) {
        return;
    }

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
    const activeLaneIndex = getTimelineItemLaneIndex(activeTimelineItem);
    const sameLaneTargets = imageItems.filter((item) => item !== activeTimelineItem
        && getTimelineItemLaneIndex(item) === activeLaneIndex);
    const hasTargets = sameLaneTargets.length > 0;

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
        setImageDurationApplyStatus(IMAGE_DURATION_APPLY_SELECT_MESSAGE, {
            timeoutMs: 3200,
            inline: false,
            toast: { tone: 'warning', contextLabel: 'Video' },
        });
        refreshImageDurationApplyAllAvailability();
        return;
    }

    const rawDatasetDuration = Math.round(Number(activeTimelineItem.dataset.imageDuration) || 0);
    const fallbackDuration = Math.round(getTimelineItemPlaybackDuration(activeTimelineItem));
    const targetDuration = Math.max(
        MIN_IMAGE_DURATION,
        rawDatasetDuration > 0 ? rawDatasetDuration : fallbackDuration,
    );

    if (!(targetDuration > 0)) {
        setImageDurationApplyStatus('The selected image has no duration to copy.', {
            timeoutMs: 3200,
            inline: false,
            toast: { tone: 'warning', contextLabel: 'Video' },
        });
        refreshImageDurationApplyAllAvailability();
        return;
    }

    const timelineItems = getTimelineItems();
    const activeLaneIndex = getTimelineItemLaneIndex(activeTimelineItem);
    const sameLaneTargets = timelineItems.filter((timelineItem) => isImageTimelineItem(timelineItem)
        && timelineItem !== activeTimelineItem
        && getTimelineItemLaneIndex(timelineItem) === activeLaneIndex);

    if (!sameLaneTargets.length) {
        setImageDurationApplyStatus(IMAGE_DURATION_APPLY_NEED_TARGET_MESSAGE, {
            timeoutMs: 3200,
            inline: false,
            toast: { tone: 'warning', contextLabel: 'Video' },
        });
        refreshImageDurationApplyAllAvailability();
        refreshCanvasBlurApplyAllAvailability();
        return;
    }

    const updatedItems = [];
    let appliedCount = 0;

    sameLaneTargets.forEach((timelineItem) => {

        const currentDuration = Math.max(0, Math.round(Number(timelineItem.dataset.imageDuration) || 0));
        if (currentDuration === targetDuration) {
            return;
        }

        setTimelineItemDuration(timelineItem, 'imageDuration', targetDuration, { markCustom: true });
        appliedCount += 1;
        updatedItems.push(timelineItem);
    });

    if (appliedCount === 0) {
        setImageDurationApplyStatus(IMAGE_DURATION_APPLY_ALREADY_APPLIED_MESSAGE, {
            timeoutMs: 3200,
            inline: false,
            toast: { tone: 'info', contextLabel: 'Video' },
        });
    } else {
        const pluralSuffix = appliedCount === 1 ? '' : 's';
        const feedbackMessage = `Applied to ${appliedCount} image${pluralSuffix} in this layer.`;
        setImageDurationApplyStatus(feedbackMessage, {
            timeoutMs: 3200,
            inline: false,
            toast: { tone: 'success', contextLabel: 'Video' },
        });
        updateActiveTimelineIndicators();
        renderExportSummary(getTimelineItems(), null);
        updatedItems.forEach((item) => {
            flashTimelineItemDurationFeedback(item);
        });
        if (typeof showAppToast === 'function') {
            showAppToast(feedbackMessage);
        }
    }

    refreshImageDurationApplyAllAvailability();
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
    const showInline = options.inline !== false;

    if (nextMessage && options.toast && typeof showApplyFeedback === 'function') {
        showApplyFeedback(nextMessage, {
            tone: options.toast.tone || 'info',
            contextLabel: options.toast.contextLabel || 'Animation',
            timeoutMs: options.toast.timeoutMs,
        });
    }

    if (!showInline) {
        return;
    }

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

function getLaneIndexForTimelineItem(timelineItem, laneCache = null) {
    if (!timelineItem) {
        return null;
    }

    const datasetLaneValue = timelineItem.dataset?.laneIndex;
    if (datasetLaneValue !== undefined) {
        const datasetLaneIndex = Number(datasetLaneValue);
        if (Number.isFinite(datasetLaneIndex)) {
            return datasetLaneIndex;
        }
    }

    const resolvedCache = laneCache
        || (typeof resolveTimelineLaneEntryCache === 'function'
            ? resolveTimelineLaneEntryCache()
            : null);

    if (resolvedCache?.byItem instanceof Map) {
        const entry = resolvedCache.byItem.get(timelineItem) || null;
        if (entry && Number.isFinite(entry.laneIndex)) {
            return Number(entry.laneIndex);
        }
    }

    return null;
}

function getTimelineItemsInSameLane(timelineItem, options = {}) {
    if (!timelineItem) {
        return [];
    }

    const { timelineItems = null, laneCache = null } = options;
    const resolvedCache = laneCache
        || (typeof resolveTimelineLaneEntryCache === 'function'
            ? resolveTimelineLaneEntryCache()
            : null);

    const items = Array.isArray(timelineItems) ? timelineItems : getTimelineItems();
    if (!items.length) {
        return [];
    }

    const laneIndex = getLaneIndexForTimelineItem(timelineItem, resolvedCache);
    if (!Number.isFinite(laneIndex)) {
        return [];
    }

    let laneItems = [];
    if (resolvedCache?.byLaneIndex instanceof Map) {
        const entries = resolvedCache.byLaneIndex.get(laneIndex) || [];
        laneItems = entries
            .map((entry) => entry?.item || null)
            .filter((item) => item && item.isConnected);
    }

    if (!laneItems.length) {
        laneItems = items.filter((item) => {
            const itemLaneIndex = getLaneIndexForTimelineItem(item, resolvedCache);
            return Number.isFinite(itemLaneIndex) && itemLaneIndex === laneIndex;
        });
    }

    if (!laneItems.length) {
        return [];
    }

    const validItems = new Set(items);
    return laneItems.filter((item) => validItems.has(item));
}

function refreshComboApplyAllAvailability() {
    if (!animationComboApplyAllButton || !timelineTrack) {
        return;
    }

    const timelineItems = getTimelineItems();
    const hasImages = timelineItems.some((item) => isImageTimelineItem(item));
    const activeIsImage = isImageTimelineItem(activeTimelineItem);

    animationComboApplyAllButton.disabled = !activeIsImage;

    if (!hasImages) {
        setAnimationComboApplyStatus(COMBO_APPLY_EMPTY_STATE_MESSAGE, { persist: true });
        return;
    }

    if (!activeIsImage) {
        setAnimationComboApplyStatus(COMBO_APPLY_SELECT_MESSAGE, { persist: true });
        return;
    }

    if (animationComboApplyStatus
        && (
            animationComboApplyStatus.textContent === COMBO_APPLY_EMPTY_STATE_MESSAGE
            || animationComboApplyStatus.textContent === COMBO_APPLY_SELECT_MESSAGE
        )
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

    if (!isImageTimelineItem(activeTimelineItem)) {
        setAnimationComboApplyStatus(COMBO_APPLY_SELECT_MESSAGE, {
            timeoutMs: 3200,
            inline: false,
            toast: { tone: 'warning', contextLabel: 'Animation' },
        });
        refreshComboApplyAllAvailability();
        return;
    }

    const timelineItems = getTimelineItems();
    const laneCache = typeof resolveTimelineLaneEntryCache === 'function'
        ? resolveTimelineLaneEntryCache()
        : null;
    const layerItems = getTimelineItemsInSameLane(activeTimelineItem, {
        timelineItems,
        laneCache,
    });

    if (!layerItems.length) {
        setAnimationComboApplyStatus('No clips found in this layer to update.', {
            timeoutMs: 3200,
            inline: false,
            toast: { tone: 'warning', contextLabel: 'Animation' },
        });
        refreshComboApplyAllAvailability();
        return;
    }

    const settings = getCurrentComboAnimationSettingsFromControls();
    let appliedCount = 0;

    layerItems.forEach((timelineItem) => {
        if (applyComboSettingsToTimelineItem(timelineItem, settings)) {
            appliedCount += 1;
        }
    });

    refreshComboApplyAllAvailability();

    if (appliedCount === 0) {
        setAnimationComboApplyStatus(COMBO_APPLY_LAYER_UNCHANGED_MESSAGE, {
            timeoutMs: 3200,
            inline: false,
            toast: { tone: 'info', contextLabel: 'Animation' },
        });
    } else {
        const pluralSuffix = appliedCount === 1 ? '' : 's';
        const laneIndex = getLaneIndexForTimelineItem(activeTimelineItem, laneCache);
        const layerLabel = Number.isFinite(laneIndex) ? `Layer ${laneIndex + 1}` : 'this layer';
        setAnimationComboApplyStatus(
            `Applied to ${appliedCount} clip${pluralSuffix} on ${layerLabel}.`,
            {
                timeoutMs: 3200,
                inline: false,
                toast: { tone: 'success', contextLabel: 'Animation' },
            },
        );
        if (typeof markExportPlaybackContextDirty === 'function') {
            markExportPlaybackContextDirty({ refreshSummary: true });
        } else {
            renderExportSummary(getTimelineItems(), null);
        }
        updateActiveTimelineIndicators();
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

    const matrixMatch = normalized.match(/^matrix\(([^)]+)\)$/i);    if (matrixMatch) {
        const parts = matrixMatch[1]
            .split(',')
            .map((value) => Number.parseFloat(value.trim()));
        if (parts.length === 6 && parts.every((part) => Number.isFinite(part))) {
            const [a, b, c, d, e, f] = parts;
            return {
                a,
                b,
                c,
                d,
                e,
                f,
                isIdentity: isMatrixApproximatelyIdentity(a, b, c, d, e, f),
            };
        }
    }

    const matrix3dMatch = normalized.match(/^matrix3d\(([^)]+)\)$/i);
    if (matrix3dMatch) {
        const parts = matrix3dMatch[1]
            .split(',')
            .map((value) => Number.parseFloat(value.trim()));
        if (parts.length === 16 && parts.every((part) => Number.isFinite(part))) {
            const [
                m11, m12, , ,
                m21, m22, , ,
                , , , ,
                m41, m42, , ,
            ] = parts;
            const a = m11;
            const b = m12;
            const c = m21;
            const d = m22;
            const e = m41;
            const f = m42;
            return {
                a,
                b,
                c,
                d,
                e,
                f,
                isIdentity: isMatrixApproximatelyIdentity(a, b, c, d, e, f),
            };
        }
    }

    return null;
}

const CANVAS_BACKDROP_SNAPSHOT_DEFAULT_SCALE = 1.08;
const CANVAS_BACKDROP_GRADIENT_TOP_COLOR = 'rgba(15, 23, 42, 0.32)';
const CANVAS_BACKDROP_GRADIENT_BOTTOM_COLOR = 'rgba(15, 23, 42, 0.5)';
let canvasBackdropSnapshotCanvas = null;
let canvasBackdropSnapshotContext = null;
let hasCanvasBackdropSnapshot = false;

function computeCoverDimensions(sourceWidth, sourceHeight, targetWidth, targetHeight) {
    if (!Number.isFinite(sourceWidth)
        || !Number.isFinite(sourceHeight)
        || sourceWidth <= 0
        || sourceHeight <= 0
        || !Number.isFinite(targetWidth)
        || !Number.isFinite(targetHeight)
        || targetWidth <= 0
        || targetHeight <= 0
    ) {
        return {
            x: 0,
            y: 0,
            width: Math.max(0, targetWidth),
            height: Math.max(0, targetHeight),
        };
    }

    const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    const x = (targetWidth - width) / 2;
    const y = (targetHeight - height) / 2;
    return { x, y, width, height };
}

function parseCanvasBackdropScale(sourceElement) {
    let scale = Number.parseFloat(
        previewCanvasBackdrop?.style?.getPropertyValue?.('--canvas-backdrop-scale') || '',
    );

    if (!Number.isFinite(scale) || scale <= 0) {
        if (window.getComputedStyle && sourceElement) {
            const computed = window.getComputedStyle(sourceElement);
            const matrix = computed
                ? parseCssTransformMatrix(computed.transform || computed.webkitTransform || '')
                : null;
            if (matrix && !matrix.isIdentity) {
                const scaleX = Number.isFinite(matrix.a) ? Math.abs(matrix.a) : 1;
                const scaleY = Number.isFinite(matrix.d) ? Math.abs(matrix.d) : 1;
                const resolved = Math.max(scaleX, scaleY);
                if (resolved > 0) {
                    scale = resolved;
                }
            }
        }
    }

    if (!Number.isFinite(scale) || scale <= 0) {
        scale = CANVAS_BACKDROP_SNAPSHOT_DEFAULT_SCALE;
    }

    return scale;
}

function parseCanvasBackdropBlurRadius() {
    let blur = Number.parseFloat(
        previewCanvasBackdrop?.style?.getPropertyValue?.('--canvas-blur-radius') || '',
    );

    if (!Number.isFinite(blur) || blur < 0) {
        if (window.getComputedStyle && previewCanvasBackdrop) {
            const computed = window.getComputedStyle(previewCanvasBackdrop);
            const filterValue = computed?.filter || computed?.webkitFilter || '';
            const match = typeof filterValue === 'string'
                ? filterValue.match(/blur\(([^)]+)\)/i)
                : null;
            if (match) {
                const parsed = Number.parseFloat(match[1]);
                if (Number.isFinite(parsed) && parsed >= 0) {
                    blur = parsed;
                }
            }
        }
    }

    if (!Number.isFinite(blur) || blur < 0) {
        blur = 0;
    }

    return blur;
}

function parsePreviewImageBlurRadius(computedStyleOverride = null) {
    if (!previewImage) {
        return 0;
    }

    let blur = Number.parseFloat(
        previewImage.style?.getPropertyValue?.('--preview-image-blur') || '',
    );

    if (!Number.isFinite(blur) || blur < 0) {
        const styleSource = computedStyleOverride
            || (window.getComputedStyle ? window.getComputedStyle(previewImage) : null);

        if (styleSource) {
            const variableValue = styleSource.getPropertyValue?.('--preview-image-blur') || '';
            const parsedVariable = Number.parseFloat(variableValue);

            if (Number.isFinite(parsedVariable) && parsedVariable >= 0) {
                blur = parsedVariable;
            } else {
                const filterValue = styleSource.filter || styleSource.webkitFilter || '';
                const match = typeof filterValue === 'string'
                    ? filterValue.match(/blur\(([^)]+)\)/i)
                    : null;

                if (match) {
                    const parsedFilter = Number.parseFloat(match[1]);
                    if (Number.isFinite(parsedFilter) && parsedFilter >= 0) {
                        blur = parsedFilter;
                    }
                }
            }
        }
    }

    if (!Number.isFinite(blur) || blur < 0) {
        blur = 0;
    }

    return blur;
}

function ensureCanvasBackdropSnapshotContext(width, height) {
    const safeWidth = Math.max(1, Math.round(Number(width) || 0));
    const safeHeight = Math.max(1, Math.round(Number(height) || 0));

    if (!canvasBackdropSnapshotCanvas) {
        canvasBackdropSnapshotCanvas = document.createElement('canvas');
    }

    if (canvasBackdropSnapshotCanvas.width !== safeWidth
        || canvasBackdropSnapshotCanvas.height !== safeHeight
    ) {
        canvasBackdropSnapshotCanvas.width = safeWidth;
        canvasBackdropSnapshotCanvas.height = safeHeight;
        if (canvasBackdropSnapshotContext) {
            canvasBackdropSnapshotContext = null;
        }
    }

    if (!canvasBackdropSnapshotContext && canvasBackdropSnapshotCanvas.getContext) {
        canvasBackdropSnapshotContext = canvasBackdropSnapshotCanvas.getContext('2d', { alpha: true });
        if (!canvasBackdropSnapshotContext) {
            canvasBackdropSnapshotContext = canvasBackdropSnapshotCanvas.getContext('2d');
        }
    }

    return canvasBackdropSnapshotContext;
}

function storeCanvasBackdropSnapshot(width, height) {
    if (!exportMirrorCanvas || !exportMirrorContext) {
        hasCanvasBackdropSnapshot = false;
        return;
    }

    const context = ensureCanvasBackdropSnapshotContext(width, height);
    if (!context || !canvasBackdropSnapshotCanvas) {
        hasCanvasBackdropSnapshot = false;
        return;
    }

    context.clearRect(0, 0, canvasBackdropSnapshotCanvas.width, canvasBackdropSnapshotCanvas.height);
    context.drawImage(
        exportMirrorCanvas,
        0,
        0,
        Math.max(1, Math.round(Number(width) || 0)),
        Math.max(1, Math.round(Number(height) || 0)),
        0,
        0,
        canvasBackdropSnapshotCanvas.width,
        canvasBackdropSnapshotCanvas.height,
    );
    hasCanvasBackdropSnapshot = true;
}

function drawCanvasBackdropSnapshot(width, height) {
    if (!hasCanvasBackdropSnapshot || !canvasBackdropSnapshotCanvas) {
        return false;
    }

    const safeWidth = Math.max(1, Math.round(Number(width) || 0));
    const safeHeight = Math.max(1, Math.round(Number(height) || 0));
    if (safeWidth <= 0 || safeHeight <= 0) {
        return false;
    }

    exportMirrorContext.drawImage(
        canvasBackdropSnapshotCanvas,
        0,
        0,
        canvasBackdropSnapshotCanvas.width,
        canvasBackdropSnapshotCanvas.height,
        0,
        0,
        safeWidth,
        safeHeight,
    );
    return true;
}

function clearCanvasBackdropSnapshot() {
    hasCanvasBackdropSnapshot = false;
    if (canvasBackdropSnapshotContext && canvasBackdropSnapshotCanvas) {
        canvasBackdropSnapshotContext.clearRect(
            0,
            0,
            canvasBackdropSnapshotCanvas.width,
            canvasBackdropSnapshotCanvas.height,
        );
    }
}

function isCanvasBackdropActive() {
    if (!previewCanvasBackdrop || previewCanvasBackdrop.hidden) {
        return false;
    }
    if (!previewCanvasBackdrop.classList.contains('is-visible')) {
        return false;
    }
    const mode = previewCanvasBackdrop.dataset?.mode || 'none';
    return mode !== 'none';
}

function drawCanvasBackdropToExportCanvas(viewportWidth, viewportHeight) {
    if (!previewCanvasBackdrop || viewportWidth <= 0 || viewportHeight <= 0) {
        return false;
    }

    const sourceType = previewCanvasBackdrop.dataset?.source || '';
    const useVideo = sourceType === 'video';
    const sourceElement = useVideo ? previewCanvasVideo : previewCanvasImage;

    if (!sourceElement) {
        return false;
    }

    if (useVideo) {
        if (sourceElement.readyState < 2) {
            return false;
        }
    } else if (!sourceElement.complete) {
        return false;
    }

    const naturalWidth = useVideo ? sourceElement.videoWidth : sourceElement.naturalWidth;
    const naturalHeight = useVideo ? sourceElement.videoHeight : sourceElement.naturalHeight;

    if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight)
        || naturalWidth <= 0 || naturalHeight <= 0
    ) {
        return false;
    }

    const canvasWidth = Math.max(1, Math.round(exportMirrorCanvas.width || 0));
    const canvasHeight = Math.max(1, Math.round(exportMirrorCanvas.height || 0));

    if (canvasWidth <= 0 || canvasHeight <= 0) {
        return false;
    }

    const scaleX = canvasWidth / viewportWidth;
    const scaleY = canvasHeight / viewportHeight;
    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
        return false;
    }

    const cover = computeCoverDimensions(naturalWidth, naturalHeight, viewportWidth, viewportHeight);
    const scaleMultiplier = parseCanvasBackdropScale(sourceElement);
    const drawWidth = cover.width * scaleMultiplier;
    const drawHeight = cover.height * scaleMultiplier;
    const offsetX = cover.x - ((drawWidth - cover.width) / 2);
    const offsetY = cover.y - ((drawHeight - cover.height) / 2);
    const blurRadius = parseCanvasBackdropBlurRadius();

    exportMirrorContext.save();
    exportMirrorContext.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    if (blurRadius > 0) {
        exportMirrorContext.filter = `blur(${blurRadius}px)`;
    } else {
        exportMirrorContext.filter = 'none';
    }

    try {
        exportMirrorContext.drawImage(
            sourceElement,
            offsetX,
            offsetY,
            drawWidth,
            drawHeight,
        );
    } catch (error) {
        exportMirrorContext.restore();
        exportMirrorContext.filter = 'none';
        return false;
    }

    exportMirrorContext.filter = 'none';

    const gradient = exportMirrorContext.createLinearGradient(0, 0, 0, viewportHeight);
    gradient.addColorStop(0, CANVAS_BACKDROP_GRADIENT_TOP_COLOR);
    gradient.addColorStop(1, CANVAS_BACKDROP_GRADIENT_BOTTOM_COLOR);
    exportMirrorContext.fillStyle = gradient;
    exportMirrorContext.fillRect(0, 0, viewportWidth, viewportHeight);

    exportMirrorContext.restore();
    return true;
}

function getPreviewImageFrameBorderRadius() {
    if (previewImageFrameBorderRadius !== null) {
        return previewImageFrameBorderRadius;
    }
    if (!previewImageFrame || !window.getComputedStyle) {
        previewImageFrameBorderRadius = 0;
        return previewImageFrameBorderRadius;
    }
    const computed = window.getComputedStyle(previewImageFrame).borderRadius || '';
    const parsed = parseFloat(computed);
    previewImageFrameBorderRadius = Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
    return previewImageFrameBorderRadius;
}

function clipRoundRectPath(context, x, y, width, height, radius) {
    if (!context) {
        return;
    }
    const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
    context.beginPath();
    if (typeof context.roundRect === 'function') {
        context.roundRect(x, y, width, height, safeRadius);
        return;
    }
    const r = safeRadius;
    if (r === 0) {
        context.rect(x, y, width, height);
        return;
    }
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
}

function getActivePreviewImageTransform(viewportWidth, viewportHeight) {
    if (previewImageTransform
        && Number.isFinite(previewImageTransform.left)
        && Number.isFinite(previewImageTransform.top)
        && Number.isFinite(previewImageTransform.width)
        && Number.isFinite(previewImageTransform.height)
    ) {
        return previewImageTransform;
    }

    if (!activeTimelineItem) {
        return null;
    }

    const storedTransform = getStoredPreviewImageTransform(activeTimelineItem);
    if (!storedTransform) {
        return null;
    }

    return denormalizePreviewImageTransform(storedTransform, {
        width: viewportWidth,
        height: viewportHeight,
    });
}

function drawPreviewImageToExportCanvas() {
    if (!previewImage
        || previewImage.hidden
        || !previewImage.complete
        || !previewImageFrame
        || !previewViewport
    ) {
        return false;
    }

    const viewportWidth = Math.max(0, previewViewport.clientWidth);
    const viewportHeight = Math.max(0, previewViewport.clientHeight);

    if (viewportWidth === 0 || viewportHeight === 0) {
        return false;
    }

    const transform = getActivePreviewImageTransform(viewportWidth, viewportHeight);
    if (!transform) {
        return false;
    }

    const naturalWidth = Math.max(1, previewImage.naturalWidth || 0);
    const naturalHeight = Math.max(1, previewImage.naturalHeight || 0);

    const canvasWidth = Math.max(1, exportMirrorCanvas.width);
    const canvasHeight = Math.max(1, exportMirrorCanvas.height);
    const scaleX = canvasWidth / viewportWidth;
    const scaleY = canvasHeight / viewportHeight;

    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) {
        return false;
    }

    exportMirrorContext.save();
    exportMirrorContext.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    exportMirrorContext.beginPath();
    exportMirrorContext.rect(0, 0, viewportWidth, viewportHeight);
    exportMirrorContext.clip();

    exportMirrorContext.save();
    clipRoundRectPath(
        exportMirrorContext,
        transform.left,
        transform.top,
        transform.width,
        transform.height,
        getPreviewImageFrameBorderRadius(),
    );
    exportMirrorContext.clip();

    const scale = Math.max(transform.width / naturalWidth, transform.height / naturalHeight);
    if (!Number.isFinite(scale) || scale <= 0) {
        exportMirrorContext.restore();
        exportMirrorContext.restore();
        return false;
    }

    const drawWidth = naturalWidth * scale;
    const drawHeight = naturalHeight * scale;
    const rotation = clampRotation(transform.rotation);
    const imageOffsetX = transform.left + ((transform.width - drawWidth) / 2);
    const imageOffsetY = transform.top + ((transform.height - drawHeight) / 2);

    let computedOpacity = 1;
    let cssMatrix = null;
    let blurRadius = 0;
    let computedStyle = null;

    if (window.getComputedStyle) {
        computedStyle = window.getComputedStyle(previewImage);
        if (computedStyle) {
            const opacityValue = Number.parseFloat(computedStyle.opacity);
            if (Number.isFinite(opacityValue)) {
                computedOpacity = clamp(opacityValue, 0, 1);
            }
            cssMatrix = parseCssTransformMatrix(
                computedStyle.transform || computedStyle.webkitTransform || '',
            );
            blurRadius = parsePreviewImageBlurRadius(computedStyle);
        }
    }

    exportMirrorContext.save();
    exportMirrorContext.translate(imageOffsetX, imageOffsetY);

    if (cssMatrix && !cssMatrix.isIdentity) {
        exportMirrorContext.transform(
            cssMatrix.a,
            cssMatrix.b,
            cssMatrix.c,
            cssMatrix.d,
            cssMatrix.e,
            cssMatrix.f,
        );
    } else if (rotation !== 0) {
        const originX = drawWidth / 2;
        const originY = drawHeight / 2;
        exportMirrorContext.translate(originX, originY);
        exportMirrorContext.rotate((rotation * Math.PI) / 180);
        exportMirrorContext.translate(-originX, -originY);
    }

    if (computedOpacity < 1) {
        exportMirrorContext.globalAlpha *= computedOpacity;
    }

    const filterValue = blurRadius > 0 ? `blur(${blurRadius}px)` : 'none';
    exportMirrorContext.filter = filterValue;

    exportMirrorContext.drawImage(
        previewImage,
        0,
        0,
        drawWidth,
        drawHeight,
    );
    exportMirrorContext.filter = 'none';
    exportMirrorContext.restore();

    exportMirrorContext.restore();
    exportMirrorContext.restore();
    exportMirrorContext.setTransform(1, 0, 0, 1, 0, 0);
    return true;
}

function startPreviewMirroring(width, height, options = {}) {
    if (!exportMirrorContext) {
        throw new Error('Unable to access export canvas context.');
    }

    exportMirrorCanvas.width = Math.max(1, Math.round(width));
    exportMirrorCanvas.height = Math.max(1, Math.round(height));
    clearCanvasBackdropSnapshot();

    let stopped = false;
    let rafId = 0;
    let videoFrameRequestId = 0;
    let lastDrawTimestamp = 0;
    const frameRate = Math.max(1, Math.min(60, Math.round(options.frameRate) || 30));
    const frameInterval = 1000 / frameRate;
    const useVideoFrameCallbacks = Boolean(
        options.useVideoFrameCallback !== false
        && previewVideo
        && typeof previewVideo.requestVideoFrameCallback === 'function'
        && typeof previewVideo.cancelVideoFrameCallback === 'function'
    );

    const drawFrame = (timestamp = performance.now()) => {
        if (stopped) {
            return;
        }

        if (timestamp - lastDrawTimestamp < frameInterval - 0.5) {
            scheduleNextFrame();
            return;
        }

        lastDrawTimestamp = timestamp;

        const canvasWidth = Math.max(1, exportMirrorCanvas.width);
        const canvasHeight = Math.max(1, exportMirrorCanvas.height);

        exportMirrorContext.setTransform(1, 0, 0, 1, 0, 0);
        exportMirrorContext.fillStyle = '#000000';
        exportMirrorContext.fillRect(0, 0, canvasWidth, canvasHeight);

        let viewportWidth = previewViewport ? Math.max(0, previewViewport.clientWidth) : 0;
        let viewportHeight = previewViewport ? Math.max(0, previewViewport.clientHeight) : 0;

        if ((viewportWidth === 0 || viewportHeight === 0)
            && lastNonZeroPreviewViewportSize
            && lastNonZeroPreviewViewportSize.width > 0
            && lastNonZeroPreviewViewportSize.height > 0) {
            viewportWidth = lastNonZeroPreviewViewportSize.width;
            viewportHeight = lastNonZeroPreviewViewportSize.height;
        }

        const overlaySnapshots = getActiveOverlayLayerSnapshots();
        const hasViewport = viewportWidth > 0 && viewportHeight > 0;

        if (hasViewport && isCanvasBackdropActive()) {
            const drewBackdrop = drawCanvasBackdropToExportCanvas(viewportWidth, viewportHeight);
            if (drewBackdrop) {
                storeCanvasBackdropSnapshot(canvasWidth, canvasHeight);
            } else if (!drawCanvasBackdropSnapshot(canvasWidth, canvasHeight)) {
                clearCanvasBackdropSnapshot();
            }
        } else {
            clearCanvasBackdropSnapshot();
        }

        if (overlaySnapshots.length && hasViewport) {
            drawOverlaySnapshotsToExportCanvas(overlaySnapshots, 'below', viewportWidth, viewportHeight);
        }

        if (!previewVideo.hidden && previewVideo.readyState >= 2) {
            const dimensions = computeContainDimensions(
                previewVideo.videoWidth,
                previewVideo.videoHeight,
                exportMirrorCanvas.width,
                exportMirrorCanvas.height,
            );
            exportMirrorContext.drawImage(
                previewVideo,
                dimensions.x,
                dimensions.y,
                dimensions.width,
                dimensions.height,
            );
        } else if (!previewImage.hidden && previewImage.complete) {
            const drewImage = drawPreviewImageToExportCanvas();
            if (!drewImage) {
                const fallbackDimensions = computeContainDimensions(
                    previewImage.naturalWidth,
                    previewImage.naturalHeight,
                    exportMirrorCanvas.width,
                    exportMirrorCanvas.height,
                );
                exportMirrorContext.drawImage(
                    previewImage,
                    fallbackDimensions.x,
                    fallbackDimensions.y,
                    fallbackDimensions.width,
                    fallbackDimensions.height,
                );
            }
        } else {
            exportMirrorContext.fillStyle = '#1f2937';
            exportMirrorContext.fillRect(0, 0, exportMirrorCanvas.width, exportMirrorCanvas.height);
            exportMirrorContext.fillStyle = '#e2e8f0';
            exportMirrorContext.textAlign = 'center';
            exportMirrorContext.textBaseline = 'middle';
            const fontSize = Math.max(18, Math.round(exportMirrorCanvas.height / 18));
            exportMirrorContext.font = `600 ${fontSize}px Inter, "Segoe UI", sans-serif`;
            exportMirrorContext.fillText(
                'Preparing preview…',
                exportMirrorCanvas.width / 2,
                exportMirrorCanvas.height / 2,
            );
        }

        if (overlaySnapshots.length && hasViewport) {
            drawOverlaySnapshotsToExportCanvas(overlaySnapshots, 'above', viewportWidth, viewportHeight);
        }

        scheduleNextFrame();
    };

    function scheduleNextFrame() {
        if (stopped) {
            return;
        }

        if (useVideoFrameCallbacks
            && !previewVideo.hidden
            && !previewVideo.paused
            && !previewVideo.ended) {
            videoFrameRequestId = previewVideo.requestVideoFrameCallback((now) => {
                drawFrame(now);
            });
            return;
        }

        rafId = window.requestAnimationFrame(drawFrame);
    }

    drawFrame(performance.now());

    return () => {
        stopped = true;
        clearCanvasBackdropSnapshot();
        if (rafId) {
            window.cancelAnimationFrame(rafId);
            rafId = 0;
        }
        if (useVideoFrameCallbacks && videoFrameRequestId) {
            try {
                previewVideo.cancelVideoFrameCallback(videoFrameRequestId);
            } catch (error) {
                // Ignore cleanup errors for browsers that partially implement the API.
            }
            videoFrameRequestId = 0;
        }
    };
}

let activeOverlayWindowState = {
    item: null,
    windowStart: null,
    windowEnd: null,
    anchorTime: null,
};

function resetActiveOverlayWindowState() {
    activeOverlayWindowState = {
        item: null,
        windowStart: null,
        windowEnd: null,
        anchorTime: null,
    };
}

function updateActiveOverlayWindowState(timelineItem, windowStart, windowEnd, anchorTime) {
    activeOverlayWindowState = {
        item: timelineItem || null,
        windowStart: Number.isFinite(windowStart) ? windowStart : null,
        windowEnd: Number.isFinite(windowEnd) ? windowEnd : null,
        anchorTime: Number.isFinite(anchorTime) ? anchorTime : null,
    };
}

function getActiveOverlayWindowState() {
    return activeOverlayWindowState;
}

function shouldRefreshOverlayWindowForTimelineTime(timelineItem, timelineTime) {
    if (!timelineItem || !Number.isFinite(timelineTime)) {
        return true;
    }

    const state = activeOverlayWindowState;
    if (!state || state.item !== timelineItem) {
        return true;
    }

    if (!Number.isFinite(state.windowStart) || !Number.isFinite(state.windowEnd)) {
        return true;
    }

    const tolerance = Math.max(0, Number(OVERLAY_TIMELINE_WINDOW_SLACK_MS) || 0);
    const paddedStart = state.windowStart - tolerance;
    const paddedEnd = state.windowEnd + tolerance;

    if (timelineTime >= paddedStart && timelineTime <= paddedEnd) {
        return false;
    }

    const clipStart = getTimelineItemStartTime(timelineItem);
    const clipDuration = Math.max(0, getTimelineItemPlaybackDuration(timelineItem));
    const clipEnd = clipStart + clipDuration;
    const expandedClipStart = clipStart - tolerance;
    const expandedClipEnd = clipEnd + tolerance;

    return timelineTime < expandedClipStart || timelineTime > expandedClipEnd;
}

function updatePlaybackTimeDisplay(currentMs, totalMs) {
    playbackDisplayCurrentMs = Math.max(0, Math.floor(Number(currentMs) || 0));
    playbackDisplayTotalMs = Math.max(0, Math.floor(Number(totalMs) || 0));

    const shouldRefreshOverlay = isTimelinePlaying && activeTimelineItem;

    if (!playbackTimeDisplay) {
        if (shouldRefreshOverlay) {
            const needsRefresh = shouldRefreshOverlayWindowForTimelineTime(
                activeTimelineItem,
                playbackDisplayCurrentMs,
            );
            if (needsRefresh) {
                refreshActiveOverlayLayers();
            }
        }
        return;
    }

    const clampedCurrent = Math.min(playbackDisplayCurrentMs, playbackDisplayTotalMs);
    playbackTimeDisplay.textContent = `${formatTime(clampedCurrent)} / ${formatTime(playbackDisplayTotalMs)}`;
    playbackTimeDisplay.dataset.current = String(clampedCurrent);
    playbackTimeDisplay.dataset.total = String(playbackDisplayTotalMs);

    if (typeof updateTimelinePlayheadIndicator === 'function') {
        const totalDuration = playbackDisplayTotalMs > 0 ? playbackDisplayTotalMs : 0;
        const fraction = totalDuration > 0
            ? Math.min(Math.max(clampedCurrent / totalDuration, 0), 1)
            : 0;
        updateTimelinePlayheadIndicator(fraction, {
            visible: isTimelinePlaying || isTimelinePaused,
        });
    }

    if (shouldRefreshOverlay) {
        const needsRefresh = shouldRefreshOverlayWindowForTimelineTime(
            activeTimelineItem,
            clampedCurrent,
        );
        if (needsRefresh) {
            refreshActiveOverlayLayers();
        }
    }
}

function formatSecondsLabel(durationMs) {
    const safeMs = Math.max(0, Number(durationMs) || 0);
    const seconds = safeMs / 1000;
    if (seconds <= 0) {
        return '0s';
    }
    if (Number.isInteger(seconds)) {
        return `${seconds}s`;
    }
    return `${seconds.toFixed(1)}s`;
}

function describeFileType(fileType) {
    if (typeof fileType !== 'string' || !fileType.length) {
        return 'Media clip';
    }
    if (fileType.startsWith('video/')) {
        return 'Video clip';
    }
    if (fileType.startsWith('image/')) {
        return 'Image frame';
    }
    if (fileType.startsWith('audio/')) {
        return 'Audio track';
    }
    return 'Media clip';
}

function getSelectedAspectLabel() {
    if (!previewAspectSelect) {
        return '16:9 (Landscape)';
    }
    const selectedOption = previewAspectSelect.selectedOptions?.[0];
    return selectedOption?.textContent?.trim() || `${previewAspectSelect.value} ratio`;
}

function updatePreviewAspectLabel() {
    if (!previewAspectLabel) {
        return;
    }
    previewAspectLabel.textContent = getSelectedAspectLabel();
}

let exportPlaybackContextMutationVersion = 0;
let exportSummaryLastRenderedVersion = -1;

function getTimelinePlaybackMutationVersion() {
    return exportPlaybackContextMutationVersion;
}

function markExportPlaybackContextDirty(options = {}) {
    const { refreshSummary = false, skipAutoRefresh = false } = options;
    exportPlaybackContextMutationVersion += 1;

    if (typeof resetExportPlaybackContext === 'function') {
        resetExportPlaybackContext();
    }

    const shouldRefreshSummary = refreshSummary
        || (!skipAutoRefresh
            && typeof isExportDialogOpen === 'function'
            && isExportDialogOpen());

    if (!shouldRefreshSummary) {
        return;
    }

    if (typeof prepareExportPlaybackContext === 'function') {
        const context = prepareExportPlaybackContext();
        renderExportSummary(
            context.timelineItems,
            null,
            context.playbackState,
        );
        return;
    }

    renderExportSummary(getTimelineItems(), null);
}

function renderExportSummary(timelineItems, playbackCompleted = null, playbackState = null) {
    let summaryItems = Array.isArray(timelineItems) ? timelineItems : [];
    let summaryPlaybackState = playbackState;

    if (!summaryPlaybackState || !Array.isArray(summaryPlaybackState.segments)) {
        if (typeof getTimelinePlaybackSegments === 'function') {
            summaryPlaybackState = getTimelinePlaybackSegments();
        }

        if ((!summaryPlaybackState || !Array.isArray(summaryPlaybackState.segments))
            && typeof prepareExportPlaybackContext === 'function'
        ) {
            const context = prepareExportPlaybackContext(summaryItems.length ? summaryItems : null);
            summaryItems = context.timelineItems;
            summaryPlaybackState = context.playbackState;
        }
    }

    if (exportSummaryClips) {
        exportSummaryClips.textContent = String(summaryItems.length);
    }

    const laneCache = summaryPlaybackState?.laneCache || null;
    const totalDuration = Math.max(
        Number.isFinite(summaryPlaybackState?.totalDuration)
            ? summaryPlaybackState.totalDuration
            : (typeof getTotalTimelineDuration === 'function'
                ? getTotalTimelineDuration(laneCache)
                : 0),
        0,
    );
    if (exportSummaryDuration) {
        const formattedDuration = formatTime(totalDuration);
        exportSummaryDuration.textContent = `${formattedDuration} (${formatSecondsLabel(totalDuration)})`;
    }

    const selectedQuality = DEFAULT_EXPORT_QUALITY;
    const selectedAspect = previewAspectSelect?.value || '16:9';
    const selectedAspectLabel = getSelectedAspectLabel();
    const exportFormat = getSupportedExportFormat();
    const resolution = getExportResolution(selectedAspect, selectedQuality);

    if (exportSummaryResolution) {
        if (resolution) {
            const dimensionLabel = `${resolution.width}×${resolution.height}`;
            exportSummaryResolution.textContent = `${selectedQuality} ${dimensionLabel} (${selectedAspectLabel})`;
        } else {
            exportSummaryResolution.textContent = `${selectedQuality} ${selectedAspectLabel}`;
        }
    }

    if (exportSummaryFormat) {
        exportSummaryFormat.textContent = exportFormat
            ? `${selectedQuality} ${exportFormat.label}`
            : 'Export format not supported in this browser';
    }

    if (exportDialogStatus) {
        if (playbackCompleted === true) {
            exportDialogStatus.dataset.state = 'ready';
            exportDialogStatus.textContent = 'Preview completed successfully. Ready to export.';
        } else if (playbackCompleted === false) {
            exportDialogStatus.dataset.state = 'warning';
            exportDialogStatus.textContent = 'Preview interrupted before completion. Review the details below.';
        } else {
            exportDialogStatus.dataset.state = 'ready';
            exportDialogStatus.textContent = 'Review your export settings and timeline before exporting.';
        }
    }

    if (exportTimelineList) {
        exportTimelineList.innerHTML = '';
        if (!summaryItems.length) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'export-dialog__subtitle';
            emptyMessage.textContent = 'No media in the timeline. Add clips to export.';
            exportTimelineList.appendChild(emptyMessage);
        } else {
            const list = document.createElement('ul');
            list.className = 'export-timeline-list__items';
            summaryItems.forEach((timelineItem, index) => {
                const listItem = document.createElement('li');
                listItem.className = 'export-timeline-list__item';

                const clipName = document.createElement('span');
                clipName.className = 'export-timeline-clip-name';
                const displayName = timelineItem.dataset.displayName
                    || timelineItem.dataset.fileName
                    || timelineItem.querySelector('span')?.textContent
                    || `Clip ${index + 1}`;
                clipName.textContent = `${index + 1}. ${displayName}`;

                const clipMeta = document.createElement('span');
                clipMeta.className = 'export-timeline-clip-meta';
                const duration = getTimelineItemPlaybackDuration(timelineItem);
                clipMeta.textContent = `${describeFileType(timelineItem.dataset.fileType || '')} • ${formatTime(duration)} (${formatSecondsLabel(duration)})`;

                listItem.appendChild(clipName);
                listItem.appendChild(clipMeta);
                list.appendChild(listItem);
            });
            exportTimelineList.appendChild(list);
        }
    }

    exportSummaryLastRenderedVersion = exportPlaybackContextMutationVersion;
}

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
        ? ` (Lane ${numericLaneIndex + 1})`
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
        const layerNumber = index + 1;
        const layerLabel = `Layer ${layerNumber}`;
        const isAudioLane = lane.classList.contains('timeline-lane--audio');
        lane.dataset.laneIndex = laneIndex;
        lane.dataset.layerLabel = layerLabel;
        if (isAudioLane) {
            lane.dataset.layerType = 'Audio';
            lane.setAttribute('aria-label', `${layerLabel} (Audio track)`);
        } else {
            lane.removeAttribute('data-layer-type');
            lane.setAttribute('aria-label', layerLabel);
        }
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
