        canvasBlurInput.setAttribute('aria-disabled', 'true');
        canvasBlurInput.value = '0';
        updateCanvasBlurReadout(0, { disabled: true });
        return;
    }

    const settings = getTimelineItemCanvasSettings(timelineItem);
    const isDisabled = settings.mode === 'none';
    canvasBlurInput.disabled = isDisabled;
    if (isDisabled) {
        canvasBlurInput.setAttribute('aria-disabled', 'true');
    } else {
        canvasBlurInput.removeAttribute('aria-disabled');
    }
    const blurValue = isDisabled ? 0 : settings.blur;
    canvasBlurInput.value = String(blurValue);
    updateCanvasBlurReadout(blurValue, { disabled: isDisabled });
}

function syncCanvasCustomImageControls(timelineItem) {
    if (!canvasBackgroundUploadButton || !canvasBackgroundRemoveButton || !canvasBackgroundStatus) {
        return;
    }

    const isClip = isImageTimelineItem(timelineItem) || isVideoTimelineItem(timelineItem);
    if (!isClip) {
        canvasBackgroundUploadButton.disabled = true;
        canvasBackgroundRemoveButton.disabled = true;
        canvasBackgroundStatus.textContent = 'Select a clip to customize its canvas background.';
        return;
    }

    canvasBackgroundUploadButton.disabled = false;
    const settings = getTimelineItemCanvasSettings(timelineItem);
    const hasCustomImage = Boolean(settings.customImageUrl);
    canvasBackgroundRemoveButton.disabled = !hasCustomImage;

    if (hasCustomImage) {
        const label = settings.customImageName || 'Custom image';
        if (settings.mode === 'custom') {
            canvasBackgroundStatus.textContent = `Using ${label} as the canvas background.`;
        } else {
            canvasBackgroundStatus.textContent = `${label} ready to apply as the canvas background.`;
        }
    } else if (settings.mode === 'custom') {
        canvasBackgroundStatus.textContent = 'Upload a custom image to replace the canvas background.';
    } else {
        canvasBackgroundStatus.textContent = 'No custom image selected.';
    }
}

function syncCanvasControlsToTimelineItem(timelineItem) {
    if (canvasBackgroundModeSelect) {
        const isClip = isImageTimelineItem(timelineItem) || isVideoTimelineItem(timelineItem);
        if (!isClip) {
            canvasBackgroundModeSelect.disabled = true;
            canvasBackgroundModeSelect.setAttribute('aria-disabled', 'true');
            canvasBackgroundModeSelect.value = 'none';
        } else {
            canvasBackgroundModeSelect.disabled = false;
            canvasBackgroundModeSelect.removeAttribute('aria-disabled');
            const settings = getTimelineItemCanvasSettings(timelineItem);
            canvasBackgroundModeSelect.value = settings.mode;
        }
    }

    syncCanvasBlurControlState(timelineItem || null);
    syncCanvasCustomImageControls(timelineItem || null);
}

function setCanvasBackdropVisibility(isVisible) {
    if (!previewCanvasBackdrop) {
        return;
    }
    if (isVisible) {
        previewCanvasBackdrop.hidden = false;
        previewCanvasBackdrop.classList.add('is-visible');
    } else {
        previewCanvasBackdrop.classList.remove('is-visible');
        previewCanvasBackdrop.hidden = true;
        delete previewCanvasBackdrop.dataset.mode;
        delete previewCanvasBackdrop.dataset.source;
    }
}

function applyCanvasBlurToPreview(blur) {
    if (!previewCanvasBackdrop) {
        return;
    }
    const clamped = clampCanvasBlur(blur);
    previewCanvasBackdrop.style.setProperty('--canvas-blur-radius', `${clamped}px`);
}

function pausePreviewCanvasVideo() {
    if (previewCanvasVideo && !previewCanvasVideo.paused) {
        previewCanvasVideo.pause();
    }
}

function clearPreviewCanvasBackdrop() {
    if (!previewCanvasBackdrop) {
        return;
    }
    applyCanvasBlurToPreview(0);
    setCanvasBackdropVisibility(false);
    if (previewCanvasVideo) {
        previewCanvasVideo.pause();
        previewCanvasVideo.hidden = true;
        if (previewCanvasVideo.src) {
            previewCanvasVideo.removeAttribute('src');
            previewCanvasVideo.load();
        }
    }
    if (previewCanvasImage) {
        previewCanvasImage.hidden = true;
        if (previewCanvasImage.src) {
            previewCanvasImage.removeAttribute('src');
        }
    }
}

function applyCanvasSettingsToPreview(timelineItem) {
    if (!previewCanvasBackdrop) {
        return;
    }

    const isClip = isImageTimelineItem(timelineItem) || isVideoTimelineItem(timelineItem);
    if (!isClip) {
        clearPreviewCanvasBackdrop();
        return;
    }

    const settings = getTimelineItemCanvasSettings(timelineItem);
    if (settings.mode === 'none') {
        clearPreviewCanvasBackdrop();
        return;
    }

    applyCanvasBlurToPreview(settings.blur);
    previewCanvasBackdrop.dataset.mode = settings.mode;
    previewCanvasBackdrop.dataset.source = isVideoTimelineItem(timelineItem) ? 'video' : 'image';

    if (settings.mode === 'custom') {
        const url = settings.customImageUrl;
        if (!url) {
            clearPreviewCanvasBackdrop();
            return;
        }
        if (previewCanvasVideo) {
            previewCanvasVideo.pause();
            previewCanvasVideo.hidden = true;
            if (previewCanvasVideo.src) {
                previewCanvasVideo.removeAttribute('src');
                previewCanvasVideo.load();
            }
        }
        if (previewCanvasImage) {
            if (previewCanvasImage.src !== url) {
                previewCanvasImage.src = url;
            }
            previewCanvasImage.hidden = false;
        }
        setCanvasBackdropVisibility(true);
        return;
    }

    const objectURL = timelineItem.dataset.objectUrl || '';
    if (!objectURL) {
        clearPreviewCanvasBackdrop();
        return;
    }

    if (isVideoTimelineItem(timelineItem)) {
        if (previewCanvasImage) {
            previewCanvasImage.hidden = true;
            if (previewCanvasImage.src) {
                previewCanvasImage.removeAttribute('src');
            }
        }
        if (previewCanvasVideo) {
            if (previewCanvasVideo.src !== objectURL) {
                previewCanvasVideo.src = objectURL;
                previewCanvasVideo.load();
            }
            previewCanvasVideo.loop = true;
            previewCanvasVideo.muted = true;
            previewCanvasVideo.hidden = false;
        }
    } else {
        if (previewCanvasVideo) {
            previewCanvasVideo.pause();
            previewCanvasVideo.hidden = true;
            if (previewCanvasVideo.src) {
                previewCanvasVideo.removeAttribute('src');
                previewCanvasVideo.load();
            }
        }
        if (previewCanvasImage) {
            if (previewCanvasImage.src !== objectURL) {
                previewCanvasImage.src = objectURL;
            }
            previewCanvasImage.hidden = false;
        }
    }

    syncCanvasVideoToPreview();
    setCanvasBackdropVisibility(true);
}

function isCanvasBackdropUsingClipVideo() {
    return Boolean(
        previewCanvasBackdrop
        && previewCanvasBackdrop.dataset.mode === 'clip'
        && previewCanvasBackdrop.dataset.source === 'video'
        && previewCanvasVideo
        && !previewCanvasVideo.hidden,
    );
}

function syncCanvasVideoToPreview() {
    if (!previewVideo || !previewCanvasVideo || !isCanvasBackdropUsingClipVideo()) {
        return;
    }

    const mainCurrent = previewVideo.currentTime;
    if (!Number.isFinite(mainCurrent)) {
        return;
    }

    if (previewCanvasVideo.readyState >= 1) {
        try {
            const delta = Math.abs((previewCanvasVideo.currentTime || 0) - mainCurrent);
            if (!Number.isFinite(delta) || delta > 0.2) {
                previewCanvasVideo.currentTime = mainCurrent;
            }
        } catch (error) {
            // Ignore sync errors (may occur before metadata is ready).
        }
    }

    if (isTimelinePlaying || !previewVideo.paused) {
        previewCanvasVideo.play().catch(() => {});
    }
}

if (masterVolumeInput) {
    const handleMasterVolumeUpdate = () => {
        if (masterVolumeInput.disabled) {
            return;
        }
        const percent = clampVolumePercent(masterVolumeInput.value);
        masterVolumeInput.value = String(percent);
        updateMasterVolumeReadout(percent);
        persistActiveTimelineAudioSettings({ volumePercent: percent });
        cancelPreviewAudioEnvelope({ mediaElement: previewVideo, restoreVolume: false });
        cancelPreviewAudioEnvelope({ mediaElement: previewAudio, restoreVolume: false });
        const isVideo = isVideoTimelineItem(activeTimelineItem);
        const isAudio = isAudioTimelineItem(activeTimelineItem);
        if (isVideo) {
            applyMasterVolumeToPreview(percent, { mediaElement: previewVideo });
        }
        if (isAudio) {
            applyMasterVolumeToPreview(percent, { mediaElement: previewAudio });
        }
    };

    masterVolumeInput.addEventListener('input', handleMasterVolumeUpdate);
    masterVolumeInput.addEventListener('change', handleMasterVolumeUpdate);
}

if (canvasBackgroundModeSelect) {
    const handleCanvasModeChange = () => {
        const sanitized = sanitizeCanvasMode(canvasBackgroundModeSelect.value);
        canvasBackgroundModeSelect.value = sanitized;

        if (!activeTimelineItem || canvasBackgroundModeSelect.disabled) {
            return;
        }

        const dataset = activeTimelineItem.dataset || {};
        const hadBlur = Object.prototype.hasOwnProperty.call(dataset, 'canvasBlur');

        persistTimelineItemCanvasSettings(activeTimelineItem, { mode: sanitized });
        if (!hadBlur && sanitized !== 'none') {
            persistTimelineItemCanvasSettings(activeTimelineItem, { blur: DEFAULT_CANVAS_BLUR });
        }

        syncCanvasBlurControlState(activeTimelineItem);
        syncCanvasCustomImageControls(activeTimelineItem);
        applyCanvasSettingsToPreview(activeTimelineItem);
    };

    canvasBackgroundModeSelect.addEventListener('change', handleCanvasModeChange);
}

if (canvasBackgroundUploadButton && canvasBackgroundUploadInput) {
    canvasBackgroundUploadButton.addEventListener('click', () => {
        if (canvasBackgroundUploadButton.disabled) {
            return;
        }
        canvasBackgroundUploadInput.click();
    });
}

if (canvasBackgroundUploadInput) {
    canvasBackgroundUploadInput.addEventListener('change', (event) => {
        const files = Array.from(event.target.files || []);
        const file = files[0];
        if (!file) {
            return;
        }
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file for the canvas background.');
            canvasBackgroundUploadInput.value = '';
            return;
        }
        if (!activeTimelineItem) {
            canvasBackgroundUploadInput.value = '';
            return;
        }

        const objectURL = URL.createObjectURL(file);
        setTimelineItemCanvasCustomImage(activeTimelineItem, file, objectURL);
        persistTimelineItemCanvasSettings(activeTimelineItem, { mode: 'custom' });
        if (!Object.prototype.hasOwnProperty.call(activeTimelineItem.dataset || {}, 'canvasBlur')) {
            persistTimelineItemCanvasSettings(activeTimelineItem, { blur: DEFAULT_CANVAS_BLUR });
        }
        if (canvasBackgroundModeSelect) {
            canvasBackgroundModeSelect.disabled = false;
            canvasBackgroundModeSelect.removeAttribute('aria-disabled');
            canvasBackgroundModeSelect.value = 'custom';
        }
        syncCanvasControlsToTimelineItem(activeTimelineItem);
        applyCanvasSettingsToPreview(activeTimelineItem);
        canvasBackgroundUploadInput.value = '';
    });
}

if (canvasBackgroundRemoveButton) {
    canvasBackgroundRemoveButton.addEventListener('click', () => {
        if (!activeTimelineItem || canvasBackgroundRemoveButton.disabled) {
            return;
        }
        releaseTimelineCanvasCustomImage(activeTimelineItem);
        persistTimelineItemCanvasSettings(activeTimelineItem, { mode: 'none' });
        if (canvasBackgroundModeSelect) {
            canvasBackgroundModeSelect.value = 'none';
        }
        syncCanvasControlsToTimelineItem(activeTimelineItem);
        applyCanvasSettingsToPreview(activeTimelineItem);
    });
}

if (canvasBlurInput) {
    const handleCanvasBlurUpdate = () => {
        const rawValue = canvasBlurInput.value;
        const clamped = clampCanvasBlur(rawValue);
        canvasBlurInput.value = String(clamped);
        const isDisabled = canvasBlurInput.disabled;
        updateCanvasBlurReadout(clamped, { disabled: isDisabled });
        if (!activeTimelineItem || isDisabled) {
            return;
        }
        persistTimelineItemCanvasSettings(activeTimelineItem, { blur: clamped });
        applyCanvasBlurToPreview(clamped);
    };

    canvasBlurInput.addEventListener('input', handleCanvasBlurUpdate);
    canvasBlurInput.addEventListener('change', handleCanvasBlurUpdate);
}

if (previewCanvasVideo) {
    previewCanvasVideo.addEventListener('loadeddata', () => {
        syncCanvasVideoToPreview();
    });
}

if (previewVideo) {
    const syncCanvasWithPreview = () => {
        syncCanvasVideoToPreview();
    };
    previewVideo.addEventListener('timeupdate', syncCanvasWithPreview);
    previewVideo.addEventListener('seeked', syncCanvasWithPreview);
    previewVideo.addEventListener('loadeddata', syncCanvasWithPreview);
    previewVideo.addEventListener('play', syncCanvasWithPreview);
    previewVideo.addEventListener('pause', () => {
        if (!isTimelinePlaying && isCanvasBackdropUsingClipVideo()) {
            pausePreviewCanvasVideo();
        }
    });
}

syncAudioControlsToTimelineItem(null);
syncCanvasControlsToTimelineItem(null);

function updateComboSpeedSliderDisplay({ triggerPreview = false } = {}) {
    if (!animationComboSpeedInput) {
        return;
    }

    const parsedMin = Number.parseFloat(animationComboSpeedInput.min);
    const parsedMax = Number.parseFloat(animationComboSpeedInput.max);
    const sliderMin = Number.isFinite(parsedMin) ? parsedMin : COMBO_SPEED_MIN_SECONDS;
    const sliderMax = Number.isFinite(parsedMax) ? parsedMax : COMBO_SPEED_MAX_SECONDS;

    let rawValue = Number.parseFloat(animationComboSpeedInput.value);
    if (!Number.isFinite(rawValue)) {
        rawValue = sliderMin;
    }

    const clampedSeconds = Math.min(Math.max(rawValue, sliderMin), sliderMax);
    animationComboSpeedInput.value = String(clampedSeconds);
    animationComboSpeedInput.dataset.windowMs = String(Math.round(clampedSeconds * 1000));

    animationComboSpeedInput.setAttribute('aria-valuemin', sliderMin.toString());
    animationComboSpeedInput.setAttribute('aria-valuemax', sliderMax.toString());

    const displaySeconds = Number.isInteger(clampedSeconds)
        ? clampedSeconds.toFixed(0)
        : clampedSeconds.toFixed(1);
    animationComboSpeedInput.setAttribute('aria-valuenow', displaySeconds);
    animationComboSpeedInput.setAttribute('aria-valuetext', `${displaySeconds} seconds`);

    const progress = sliderMax > sliderMin
        ? ((clampedSeconds - sliderMin) / (sliderMax - sliderMin)) * 100
        : 0;
    animationComboSpeedInput.style.setProperty('--line-slider-progress', `${progress}%`);

    if (animationComboSpeedValue) {
        animationComboSpeedValue.textContent = `${displaySeconds}s combo cycle ceiling`;
    }

    if (triggerPreview && isComboModeActive()) {
        previewComboAnimationCycle();
    }
}

function getEntranceTimingKey(override = null) {
    if (override) {
        return sanitizeEntranceTiming(override);
    }

    if (!animationInTimingInput) {
        return DEFAULT_ENTRANCE_TIMING;
    }

    const optionValue = animationInTimingInput.dataset.optionValue;
    if (optionValue) {
        return sanitizeEntranceTiming(optionValue);
    }

    const fallbackIndex = Number.parseInt(animationInTimingInput.value, 10);
    const fallbackKey = Number.isFinite(fallbackIndex)
        ? ENTRANCE_ANIMATION_TIMING_KEYS[
            Math.max(0, Math.min(ENTRANCE_ANIMATION_TIMING_KEYS.length - 1, fallbackIndex))
        ]
        : DEFAULT_ENTRANCE_TIMING;
    return sanitizeEntranceTiming(fallbackKey);
}

function isComboModeActive() {
    return sanitizeAnimationDirection(animationDirectionSelect?.value) === 'combo';
}

function getComboSpeedWindowMs() {
    if (!animationComboSpeedInput) {
        return null;
    }

    const datasetWindowMs = Number.parseInt(animationComboSpeedInput.dataset.windowMs, 10);
    if (Number.isFinite(datasetWindowMs) && datasetWindowMs > 0) {
        const minMs = COMBO_SPEED_MIN_SECONDS * 1000;
        const maxMs = COMBO_SPEED_MAX_SECONDS * 1000;
        return Math.min(Math.max(datasetWindowMs, minMs), maxMs);
    }

    const rawSeconds = Number.parseFloat(animationComboSpeedInput.value);
    if (!Number.isFinite(rawSeconds)) {
        return null;
    }

    const minMs = COMBO_SPEED_MIN_SECONDS * 1000;
    const maxMs = COMBO_SPEED_MAX_SECONDS * 1000;
    const milliseconds = Math.round(rawSeconds * 1000);
    return Math.min(Math.max(milliseconds, minMs), maxMs);
}

const COMBO_SPEED_MIN_SECONDS = 5;
const COMBO_SPEED_MAX_SECONDS = 20;
const COMBO_MIN_COMBINED_DURATION_MS = COMBO_SPEED_MIN_SECONDS * 1000;
const COMBO_SPEED_DEFAULT_SECONDS = 10;
const DEFAULT_COMBO_SPEED_MS = Math.min(
    Math.max(COMBO_SPEED_DEFAULT_SECONDS, COMBO_SPEED_MIN_SECONDS),
    COMBO_SPEED_MAX_SECONDS,
) * 1000;
const DEFAULT_ANIMATION_DIRECTION = 'none';
const ALLOWED_ANIMATION_DIRECTIONS = new Set(['none', 'in', 'out', 'combo']);
const DEFAULT_COMBO_ENTRANCE_PRESET = 'fade';
const DEFAULT_COMBO_EXIT_PRESET = 'fade';
const DEFAULT_ENTRANCE_PRESET = 'fade';
const DEFAULT_ENTRANCE_TIMING = 'medium';
const DEFAULT_EXIT_PRESET = 'fade';
const DEFAULT_EXIT_DELAY = 'none';
const COMBO_APPLY_EMPTY_STATE_MESSAGE = 'Add images to apply animations.';

function sanitizeAnimationDirection(value) {
    const normalized = typeof value === 'string' ? value.toLowerCase() : '';
    if (ALLOWED_ANIMATION_DIRECTIONS.has(normalized)) {
        return normalized;
    }
    return DEFAULT_ANIMATION_DIRECTION;
}

function sanitizeComboEntrancePreset(value) {
    if (value && Object.prototype.hasOwnProperty.call(COMBO_ENTRANCE_PRESETS, value)) {
        return value;
    }
    return DEFAULT_COMBO_ENTRANCE_PRESET;
}

function sanitizeComboExitPreset(value) {
    if (value && Object.prototype.hasOwnProperty.call(COMBO_EXIT_PRESETS, value)) {
        return value;
    }
    return DEFAULT_COMBO_EXIT_PRESET;
}

function sanitizeComboWindowMs(value) {
    const minMs = COMBO_SPEED_MIN_SECONDS * 1000;
    const maxMs = COMBO_SPEED_MAX_SECONDS * 1000;
    const numeric = typeof value === 'string'
        ? Number.parseFloat(value)
        : Number(value);

    if (!Number.isFinite(numeric) || numeric <= 0) {
        return DEFAULT_COMBO_SPEED_MS;
    }

    const milliseconds = Math.round(numeric / 1000) * 1000;
    if (milliseconds < minMs) {
        return minMs;
    }
    if (milliseconds > maxMs) {
        return maxMs;
    }
    return milliseconds;
}

function sanitizeEntrancePreset(value) {
    if (value && Object.prototype.hasOwnProperty.call(ENTRANCE_ANIMATION_PRESETS, value)) {
        return value;
    }
    return DEFAULT_ENTRANCE_PRESET;
}

function sanitizeEntranceTiming(value) {
    if (value && Object.prototype.hasOwnProperty.call(ENTRANCE_ANIMATION_TIMING_OPTIONS, value)) {
        return value;
    }
    return DEFAULT_ENTRANCE_TIMING;
}

function sanitizeExitPreset(value) {
    if (value && Object.prototype.hasOwnProperty.call(EXIT_ANIMATION_PRESETS, value)) {
        return value;
    }
    return DEFAULT_EXIT_PRESET;
}

function sanitizeExitDelayKey(value) {
    if (value && Object.prototype.hasOwnProperty.call(EXIT_ANIMATION_DELAY_OPTIONS, value)) {
        return value;
    }
    return DEFAULT_EXIT_DELAY;
}

function getDefaultAnimationSettings() {
    return {
        direction: DEFAULT_ANIMATION_DIRECTION,
        inPreset: DEFAULT_ENTRANCE_PRESET,
        inTiming: DEFAULT_ENTRANCE_TIMING,
        outPreset: DEFAULT_EXIT_PRESET,
        outDelay: DEFAULT_EXIT_DELAY,
        comboInPreset: DEFAULT_COMBO_ENTRANCE_PRESET,
        comboOutPreset: DEFAULT_COMBO_EXIT_PRESET,
        comboWindowMs: DEFAULT_COMBO_SPEED_MS,
    };
}

function getTimelineItemAnimationSettings(timelineItem) {
    if (!timelineItem || !isImageTimelineItem(timelineItem)) {
        return getDefaultAnimationSettings();
    }

    const { dataset } = timelineItem;
    return {
        direction: sanitizeAnimationDirection(dataset.animationDirection),
        inPreset: sanitizeEntrancePreset(dataset.animationInPreset),
        inTiming: sanitizeEntranceTiming(dataset.animationInTiming),
        outPreset: sanitizeExitPreset(dataset.animationOutPreset),
        outDelay: sanitizeExitDelayKey(dataset.animationOutDelay),
        comboInPreset: sanitizeComboEntrancePreset(dataset.animationComboInPreset),
        comboOutPreset: sanitizeComboExitPreset(dataset.animationComboOutPreset),
        comboWindowMs: sanitizeComboWindowMs(dataset.animationComboWindowMs || DEFAULT_COMBO_SPEED_MS),
    };
}

function setTimelineItemAnimationDataset(timelineItem, key, value, defaultValue) {
    if (!timelineItem || !timelineItem.dataset) {
        return;
    }

    const normalizedValue = value === undefined || value === null ? null : String(value);
    const normalizedDefault = defaultValue === undefined || defaultValue === null
        ? null
        : String(defaultValue);

    if (normalizedValue === null || normalizedValue === '') {
        delete timelineItem.dataset[key];
        return;
    }

    if (normalizedDefault !== null && normalizedValue === normalizedDefault) {
        delete timelineItem.dataset[key];
        return;
    }

    timelineItem.dataset[key] = normalizedValue;
}

function synchronizeImageAnimationDurations(timelineItem, context = {}) {
    if (!timelineItem || !isImageTimelineItem(timelineItem)) {
        return;
    }

    const { durationKey = null } = context;
    if (durationKey && durationKey !== 'imageDuration') {
        return;
    }

    const direction = sanitizeAnimationDirection(timelineItem.dataset.animationDirection);
    if (direction !== 'combo') {
        return;
    }

    const rawExistingWindow = timelineItem.dataset.animationComboWindowMs;
    const previousWindowMs = rawExistingWindow
        ? sanitizeComboWindowMs(rawExistingWindow)
        : null;
    const fallbackWindowMs = previousWindowMs ?? DEFAULT_COMBO_SPEED_MS;

    const explicitWindowMs = Number.isFinite(context.animationWindowMs)
        ? sanitizeComboWindowMs(context.animationWindowMs)
        : null;
    
    let targetWindowMs = fallbackWindowMs;
    if (context.source === 'animation' && explicitWindowMs !== null) {
        targetWindowMs = explicitWindowMs;
    } else if (!rawExistingWindow && explicitWindowMs !== null) {
        targetWindowMs = explicitWindowMs;
    }

    setTimelineItemAnimationDataset(
        timelineItem,
        'animationComboWindowMs',
        String(targetWindowMs),
        String(DEFAULT_COMBO_SPEED_MS),
    );

    if (timelineItem === activeTimelineItem && animationComboSpeedInput) {
        const nextSeconds = Math.round(targetWindowMs / 1000);
        animationComboSpeedInput.dataset.windowMs = String(targetWindowMs);
        animationComboSpeedInput.value = String(nextSeconds);
        updateComboSpeedSliderDisplay({ triggerPreview: false });
    }
}

function computeComboAnimationDurations(entrancePreset, exitPreset, options = {}) {

    const speedWindowOverride = Number.isFinite(options.speedWindowMs)
        ? Math.max(0, Math.round(options.speedWindowMs))
        : null;
    const speedWindowMs = speedWindowOverride !== null
        ? speedWindowOverride
        : getComboSpeedWindowMs();

    const resolveDurationValue = (value, fallback) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    };

    const entranceIsNone = Boolean(entrancePreset?.key === 'none');
    const exitIsNone = Boolean(exitPreset?.key === 'none');

    const rawEntranceBase = resolveDurationValue(entrancePreset?.baseDuration, 560);
    const rawExitBase = resolveDurationValue(exitPreset?.baseDuration, 520);
    const rawEntranceMinimum = resolveDurationValue(entrancePreset?.minDuration, 160);
    const rawExitMinimum = resolveDurationValue(exitPreset?.minDuration, 160);

    const minimumSegmentDuration = 80;
    const entranceSegmentMinimum = entranceIsNone ? 0 : minimumSegmentDuration;
    const exitSegmentMinimum = exitIsNone ? 0 : minimumSegmentDuration;
    const baseEntrance = Math.max(entranceSegmentMinimum, Math.round(rawEntranceBase));
    const baseExit = Math.max(exitSegmentMinimum, Math.round(rawExitBase));
    const minimumEntrance = Math.max(entranceSegmentMinimum, Math.round(rawEntranceMinimum));
    const minimumExit = Math.max(exitSegmentMinimum, Math.round(rawExitMinimum));
    const combinedFallback = entranceIsNone && exitIsNone ? 0 : 240;
    const combinedBase = Math.max(
        baseEntrance + baseExit,
        minimumEntrance + minimumExit,
        combinedFallback,
    );

    let targetWindow = Math.round(combinedBase);
    if (Number.isFinite(speedWindowMs) && speedWindowMs > 0) {
        targetWindow = Math.round(speedWindowMs);
    }

    const clipDurationOverride = Number.isFinite(options.clipDurationMs)
        ? Math.max(0, Math.round(options.clipDurationMs))
        : null;
    if (!Number.isFinite(speedWindowMs) && clipDurationOverride && clipDurationOverride > 0) {
        targetWindow = Math.round(clipDurationOverride);
    }

    const minimumWindow = Math.max(minimumEntrance + minimumExit, COMBO_MIN_COMBINED_DURATION_MS);
    targetWindow = Math.max(targetWindow, minimumWindow);

    const scale = combinedBase > 0 ? targetWindow / combinedBase : 1;

    let entranceDuration = Math.max(minimumEntrance, Math.round(baseEntrance * scale));
    let exitDuration = Math.max(minimumExit, Math.round(baseExit * scale));

    const combinedDuration = entranceDuration + exitDuration;

    return {
        entranceDuration,
        exitDuration,
        clipDuration: targetWindow,
        combinedDuration,
    };
}

function getPreviewImageEntranceConfig(options = {}) {
    if (!previewImage) {
        return null;
    }

    const { settingsOverride = null } = options;
    const overrideDirection = settingsOverride
        ? sanitizeAnimationDirection(settingsOverride.direction)
        : null;
    const fallbackDirection = animationDirectionSelect?.value || DEFAULT_ANIMATION_DIRECTION;
    const direction = sanitizeAnimationDirection(overrideDirection || fallbackDirection);

    if (direction !== 'in' && direction !== 'combo') {
        return null;
    }

    if (direction === 'combo') {
        const presetKey = sanitizeComboEntrancePreset(
            settingsOverride?.comboInPreset || animationComboInPresetSelect?.value,
        );
        const exitPresetKey = sanitizeComboExitPreset(
            settingsOverride?.comboOutPreset || animationComboOutPresetSelect?.value,
        );
        const preset = COMBO_ENTRANCE_PRESETS[presetKey] || COMBO_ENTRANCE_PRESETS.fade;
        const exitPreset = COMBO_EXIT_PRESETS[exitPresetKey] || COMBO_EXIT_PRESETS.fade;
        const durations = computeComboAnimationDurations(preset, exitPreset, {
            clipDurationMs: options.clipDurationMs,
            speedWindowMs: Number.isFinite(settingsOverride?.comboWindowMs)
                ? settingsOverride.comboWindowMs
                : null,
        });

        const { entranceDuration, exitDuration, clipDuration, combinedDuration } = durations;

        return {
            key: `combo-${preset.key}`,
            className: preset.className,
            duration: entranceDuration,
            easing: preset.easing || 'cubic-bezier(0.4, 0, 0.2, 1)',
            delay: 0,
            totalDuration: entranceDuration,
            combo: {
                exitDuration,
                clipDuration,
                combinedDuration,
            },
        };
    }

    const presetKey = sanitizeEntrancePreset(
        settingsOverride?.inPreset || animationInPresetSelect?.value,
    );
    const preset = ENTRANCE_ANIMATION_PRESETS[presetKey]
        || ENTRANCE_ANIMATION_PRESETS[DEFAULT_ENTRANCE_PRESET];
    const timingKey = getEntranceTimingKey(settingsOverride?.inTiming);
    const timing = ENTRANCE_ANIMATION_TIMING_OPTIONS[timingKey]
        || ENTRANCE_ANIMATION_TIMING_OPTIONS[DEFAULT_ENTRANCE_TIMING];

    const baseDuration = Math.max(0, Number(preset.baseDuration) || 600);
    const timingDuration = Math.max(0, Number(timing.duration) || baseDuration);
    const durationScale = Number.isFinite(preset.durationScale) ? preset.durationScale : 1;
    const rawDuration = Math.max(120, Math.round(timingDuration * durationScale));
    const easing = (preset.easingOverrides && preset.easingOverrides[timingKey])
        || preset.easing
        || timing.easing
        || 'cubic-bezier(0.4, 0, 0.2, 1)';

    const clipDurationOverride = Number.isFinite(options.clipDurationMs)
        ? Math.max(0, Math.round(options.clipDurationMs))
        : null;
    const activeClipDuration = clipDurationOverride !== null
        ? clipDurationOverride
        : getActiveImageClipDurationMs();

    const clipDurationScale = activeClipDuration && activeClipDuration > 0
        ? activeClipDuration / IMAGE_FRAME_DURATION
        : 1;
    const scaledMinimumDuration = Math.max(0, Math.round(120 * clipDurationScale));
    const scaledRawDuration = Math.max(0, Math.round(rawDuration * clipDurationScale));
    const desiredDuration = Math.max(scaledMinimumDuration, scaledRawDuration);
    const duration = activeClipDuration && activeClipDuration > 0
        ? Math.min(desiredDuration, activeClipDuration)
        : rawDuration;

    return {
        key: `${preset.key}-${timingKey}`,
        className: preset.className,
        duration,
        easing,
        delay: 0,
        totalDuration: duration,
    };
}

function cancelPreviewEntranceAnimation() {
    window.clearTimeout(previewEntranceAnimationFallbackTimer);
    previewEntranceAnimationFallbackTimer = 0;

    if (previewEntranceAnimationState.cleanup) {
        previewEntranceAnimationState.cleanup(true);
    }

    previewEntranceAnimationState = {
        cleanup: null,
    };

    if (!previewImage) {
        return;
    }

    previewImage.classList.remove('is-entering');
    ENTRANCE_ANIMATION_CLASS_NAMES.forEach((className) => {
        previewImage.classList.remove(className);
    });
    COMBO_ENTRANCE_CLASS_NAMES.forEach((className) => {
        previewImage.classList.remove(className);
    });
    previewImage.removeAttribute('data-enter-animation');
    previewImage.style.removeProperty('--enter-animation-delay');
    previewImage.style.removeProperty('--enter-animation-duration');
    previewImage.style.removeProperty('--enter-animation-easing');
}

function runPreviewImageEntranceAnimation(options = {}) {
    if (!previewImage || previewImage.hidden) {
        return false;
    }

    const {
        clipDurationMs = null,
        configOverride = null,
        onComplete = null,
    } = options;

    cancelPreviewEntranceAnimation();

    previewImage.classList.add('is-visible');

    if (!shouldPreviewEntranceAnimation() || prefersReducedMotion()) {
        return false;
    }

    const config = configOverride || getPreviewImageEntranceConfig({ clipDurationMs });
    if (!config) {
        return false;
    }

    const { className, duration, easing, delay, key } = config;

    previewImage.dataset.enterAnimation = key;
    ENTRANCE_ANIMATION_CLASS_NAMES.forEach((enterClass) => {
        previewImage.classList.remove(enterClass);
    });
    COMBO_ENTRANCE_CLASS_NAMES.forEach((enterClass) => {
        previewImage.classList.remove(enterClass);
    });
    previewImage.classList.remove('is-entering');

    const safeDuration = Math.max(0, Number(duration) || 0);
    const safeDelay = Math.max(0, Number(delay) || 0);

    previewImage.style.setProperty('--enter-animation-duration', `${safeDuration}ms`);
    previewImage.style.setProperty('--enter-animation-delay', `${safeDelay}ms`);
    previewImage.style.setProperty('--enter-animation-easing', easing);

    void previewImage.offsetWidth;

    let completed = false;

    const finalize = (didCancel = false) => {
        if (completed) {
            return;
        }
        completed = true;

        window.clearTimeout(previewEntranceAnimationFallbackTimer);
        previewEntranceAnimationFallbackTimer = 0;

        previewImage.classList.remove('is-entering');
        if (className) {
            previewImage.classList.remove(className);
        }
        previewImage.removeAttribute('data-enter-animation');
        previewImage.style.removeProperty('--enter-animation-delay');
        previewImage.style.removeProperty('--enter-animation-duration');
        previewImage.style.removeProperty('--enter-animation-easing');

        if (!didCancel && typeof onComplete === 'function') {
            try {
                onComplete(config);
            } catch (error) {
                console.error('Error executing entrance animation completion callback.', error);
            }
        }

        previewEntranceAnimationState = {
            cleanup: null,
        };
    };

    const handleAnimationComplete = () => {
        finalize(false);
    };

    previewEntranceAnimationState = {
        cleanup: finalize,
    };

    previewImage.addEventListener('animationend', handleAnimationComplete, { once: true });
    previewImage.addEventListener('animationcancel', handleAnimationComplete, { once: true });

    previewEntranceAnimationFallbackTimer = window.setTimeout(() => {
        finalize(false);
    }, Math.max(0, safeDelay + safeDuration + 120));

    previewImage.classList.add('is-entering');
    if (className) {
        previewImage.classList.add(className);
    }

    return true;
}

function shouldPreviewEntranceAnimation() {
    if (!previewImage || previewImage.hidden) {
        return false;
    }

    if (!animationDirectionSelect) {
        return true;
    }

    const value = sanitizeAnimationDirection(animationDirectionSelect.value);
    return value === 'in' || value === 'combo';
}

function previewEntranceAnimationDemo() {
    if (!previewImage || previewImage.hidden) {
        return;
    }

    const didAnimate = runPreviewImageEntranceAnimation();
    if (!didAnimate) {
        previewImage.classList.add('is-visible');
    }
}

const EXIT_ANIMATION_PRESETS = {
    fade: {
        key: 'fade',
        className: 'preview-image--exit-fade',
        duration: 520,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
    'slide-down': {
        key: 'slide-down',
        className: 'preview-image--exit-slide-down',
        duration: 640,
        easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    },
    'zoom-out': {
        key: 'zoom-out',
        className: 'preview-image--exit-zoom-out',
        duration: 600,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
    spin: {
        key: 'spin',
        className: 'preview-image--exit-spin',
        duration: 720,
        easing: 'cubic-bezier(0.32, 0.12, 0.13, 0.94)',
    },
};

const EXIT_ANIMATION_DELAY_KEYS = ['none', 'short', 'medium', 'long'];
const EXIT_ANIMATION_DELAY_OPTIONS = {
    none: 0,
    short: 200,
    medium: 500,
    long: 1000,
};

const EXIT_ANIMATION_CLASS_NAMES = Object.values(EXIT_ANIMATION_PRESETS).map(
    (preset) => preset.className,
);

let prefersReducedMotionQuery = null;
let previewExitAnimationFallbackTimer = 0;
let previewExitAnimationState = {
    cleanup: null,
    restoreOnComplete: false,
};

function prefersReducedMotion() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }

    if (!prefersReducedMotionQuery) {
        prefersReducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    }

    return Boolean(prefersReducedMotionQuery.matches);
}

function getExitAnimationDelayKey(override = null) {
    if (override) {
        return sanitizeExitDelayKey(override);
    }

    if (!animationOutDelayInput) {
        return DEFAULT_EXIT_DELAY;
    }

    const optionValue = animationOutDelayInput.dataset.optionValue;
    if (optionValue) {
        return sanitizeExitDelayKey(optionValue);
    }

    const fallbackIndex = Number.parseInt(animationOutDelayInput.value, 10);
    const fallbackKey = Number.isFinite(fallbackIndex)
        ? EXIT_ANIMATION_DELAY_KEYS[Math.max(0, Math.min(EXIT_ANIMATION_DELAY_KEYS.length - 1, fallbackIndex))]
        : DEFAULT_EXIT_DELAY;
    return sanitizeExitDelayKey(fallbackKey);
}

function getPreviewImageExitConfig(options = {}) {
    if (!previewImage) {
        return null;
    }

    const { settingsOverride = null } = options;
    const overrideDirection = settingsOverride
        ? sanitizeAnimationDirection(settingsOverride.direction)
        : null;
    const fallbackDirection = animationDirectionSelect?.value || DEFAULT_ANIMATION_DIRECTION;
    const direction = sanitizeAnimationDirection(overrideDirection || fallbackDirection);

    if (direction !== 'combo' && direction !== 'out') {
        return null;
    }

    if (direction === 'combo') {
        const exitPresetKey = sanitizeComboExitPreset(
            settingsOverride?.comboOutPreset || animationComboOutPresetSelect?.value,
        );
        const entrancePresetKey = sanitizeComboEntrancePreset(
            settingsOverride?.comboInPreset || animationComboInPresetSelect?.value,
        );
        const exitPreset = COMBO_EXIT_PRESETS[exitPresetKey] || COMBO_EXIT_PRESETS.fade;
        const entrancePreset = COMBO_ENTRANCE_PRESETS[entrancePresetKey] || COMBO_ENTRANCE_PRESETS.fade;
        const durations = computeComboAnimationDurations(entrancePreset, exitPreset, {
            clipDurationMs: options.clipDurationMs,
            speedWindowMs: Number.isFinite(settingsOverride?.comboWindowMs)
                ? settingsOverride.comboWindowMs
                : null,
        });
        const { entranceDuration, exitDuration, clipDuration, combinedDuration } = durations;

        return {
            key: `combo-${exitPreset.key}`,
            className: exitPreset.className,
            duration: exitDuration,
            delay: 0,
            easing: exitPreset.easing || 'cubic-bezier(0.4, 0, 0.2, 1)',
            totalDuration: exitDuration,
            combo: {
                entranceDuration,
                clipDuration,
                combinedDuration,
            },
        };
    }

    const presetKey = sanitizeExitPreset(
        settingsOverride?.outPreset || animationOutPresetSelect?.value,
    );
    const preset = EXIT_ANIMATION_PRESETS[presetKey]
        || EXIT_ANIMATION_PRESETS[DEFAULT_EXIT_PRESET];
    const delayKey = getExitAnimationDelayKey(settingsOverride?.outDelay);
    const rawDelay = EXIT_ANIMATION_DELAY_OPTIONS[delayKey] ?? 0;
    const rawDuration = Math.max(0, Number(preset.duration) || 0);

    const clipDurationOverride = Number.isFinite(options.clipDurationMs)
        ? Math.max(0, Math.round(options.clipDurationMs))
        : null;
    const activeClipDuration = clipDurationOverride !== null
        ? clipDurationOverride
        : getActiveImageClipDurationMs();

    const clipDurationScale = activeClipDuration && activeClipDuration > 0
        ? activeClipDuration / IMAGE_FRAME_DURATION
        : 1;

    const scaledDelay = Math.max(0, Math.round(rawDelay * clipDurationScale));
    const scaledDuration = Math.max(0, Math.round(rawDuration * clipDurationScale));

    let delay = clipDurationScale !== 1 ? scaledDelay : rawDelay;
    let duration = clipDurationScale !== 1 ? scaledDuration : rawDuration;

    if (activeClipDuration && activeClipDuration > 0) {
        if (clipDurationScale === 1) {
            delay = rawDelay;
            duration = rawDuration;
        }
        if (delay >= activeClipDuration) {
            delay = activeClipDuration;
            duration = 0;
        } else if (delay + duration > activeClipDuration) {
            duration = Math.max(0, activeClipDuration - delay);
        }
    }

    return {
        key: preset.key,
        className: preset.className,
        duration,
        delay,
        easing: preset.easing || 'cubic-bezier(0.4, 0, 0.2, 1)',
        totalDuration: Math.max(0, duration + delay),
    };
}

function cancelPreviewExitAnimation(options = {}) {
    const { forceRestore = false } = options;

    window.clearTimeout(previewExitAnimationFallbackTimer);
    cancelComboPreviewCycle();

    cancelPreviewEntranceAnimation();

    if (previewExitAnimationState.cleanup) {
        previewExitAnimationState.cleanup(forceRestore ? true : null, true);
        previewExitAnimationState = {
            cleanup: null,
            restoreOnComplete: false,
        };
    } else if (forceRestore && previewImage && !previewImage.hidden) {
        previewImage.classList.add('is-visible');
    }

    if (previewImage) {
        previewImage.classList.remove('is-exiting');
        EXIT_ANIMATION_CLASS_NAMES.forEach((className) => {
            previewImage.classList.remove(className);
        });
        COMBO_EXIT_CLASS_NAMES.forEach((className) => {
            previewImage.classList.remove(className);
        });
        previewImage.removeAttribute('data-exit-animation');
        previewImage.style.removeProperty('--exit-animation-delay');
        previewImage.style.removeProperty('--exit-animation-duration');
        previewImage.style.removeProperty('--exit-animation-easing');
    }
}

function runPreviewImageExitAnimation(options = {}, configOverride = null) {
    if (!previewImage || previewImage.hidden) {
        return false;
    }

    const {
        clipDurationMs = null,
        restoreOnComplete: restoreOverride,
        onComplete = null,
    } = options;
    const config = configOverride || getPreviewImageExitConfig({ clipDurationMs });
    if (!config) {
        return false;
    }

    cancelPreviewExitAnimation({ forceRestore: false });

    const restoreOnComplete = restoreOverride === true;
    const restoreDelay = Math.max(0, Number(options.restoreDelayMs) || 0);
    const { className, delay, duration, easing } = config;

    previewImage.classList.add('is-visible');
    previewImage.dataset.exitAnimation = config.key;

    EXIT_ANIMATION_CLASS_NAMES.forEach((exitClass) => {
        previewImage.classList.remove(exitClass);
    });
    COMBO_EXIT_CLASS_NAMES.forEach((exitClass) => {
        previewImage.classList.remove(exitClass);
    });
    previewImage.classList.remove('is-exiting');

    let completed = false;
    let wasCancelled = false;

    const applyRestore = () => {
        if (!previewImage || previewImage.hidden) {
            return;
        }
        previewImage.classList.remove('is-visible');
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (previewImage && !previewImage.hidden) {
                    previewImage.classList.add('is-visible');
                }
            });
        });
    };

    const finalize = (forceRestore = null) => {
        if (completed) {
            return;
        }
        completed = true;

        window.clearTimeout(previewExitAnimationFallbackTimer);

        previewImage.classList.remove('is-exiting');
        if (className) {
            previewImage.classList.remove(className);
        }
        previewImage.removeAttribute('data-exit-animation');
        previewImage.style.removeProperty('--exit-animation-delay');
        previewImage.style.removeProperty('--exit-animation-duration');
        previewImage.style.removeProperty('--exit-animation-easing');

        const shouldRestore = forceRestore === null ? restoreOnComplete : forceRestore;
        if (shouldRestore && previewImage && !previewImage.hidden) {
            if (restoreDelay > 0) {
                window.setTimeout(applyRestore, restoreDelay);
            } else {
                applyRestore();
            }