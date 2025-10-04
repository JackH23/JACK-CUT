const uploadInput = document.getElementById('video-upload');
const uploadButton = document.getElementById('upload-button');
const uploadMetaStatus = document.querySelector('.upload-meta__status');
const uploadMetaHint = document.querySelector('.upload-meta__hint');
const uploadGallery = document.getElementById('upload-gallery');
const uploadGalleryList = document.getElementById('upload-gallery-list');
const previewArea = document.querySelector('.preview-area');
const previewViewport = document.querySelector('.preview-viewport');
const previewVideo = document.getElementById('preview-video');
const previewImage = document.getElementById('preview-image');
const previewImageLayer = document.getElementById('preview-image-layer');
const previewImageFrame = document.getElementById('preview-image-frame');
const previewResizeHandles = previewImageFrame
    ? Array.from(previewImageFrame.querySelectorAll('.preview-resize-handle'))
    : [];
const timelineImagePreloadCache = new Map();
const stagedUploadsByObjectUrl = new Map();
const previewCard = document.querySelector('.preview-card');
const previewOverlayStack = document.getElementById('preview-overlay-stack');
const previewOverlayGroups = previewOverlayStack
    ? {
        below: previewOverlayStack.querySelector('[data-layer-group="below"]'),
        above: previewOverlayStack.querySelector('[data-layer-group="above"]'),
    }
    : null;
const overlayLayerToTimelineItem = new WeakMap();
const previewOutsideIndicator = document.getElementById('preview-outside-indicator');
const previewOutsideSegments = previewOutsideIndicator
    ? {
        top: previewOutsideIndicator.querySelector('[data-segment="top"]'),
        right: previewOutsideIndicator.querySelector('[data-segment="right"]'),
        bottom: previewOutsideIndicator.querySelector('[data-segment="bottom"]'),
        left: previewOutsideIndicator.querySelector('[data-segment="left"]'),
    }
    : null;
const previewGuidesLayer = document.getElementById('preview-guides-layer');
const previewGuideElements = previewGuidesLayer
    ? {
        alignLeft: previewGuidesLayer.querySelector('[data-guide="align-left"]'),
        alignRight: previewGuidesLayer.querySelector('[data-guide="align-right"]'),
        alignTop: previewGuidesLayer.querySelector('[data-guide="align-top"]'),
        alignBottom: previewGuidesLayer.querySelector('[data-guide="align-bottom"]'),
        alignCenterVertical: previewGuidesLayer.querySelector('[data-guide="align-center-vertical"]'),
        alignCenterHorizontal: previewGuidesLayer.querySelector('[data-guide="align-center-horizontal"]'),
        snapLeft: previewGuidesLayer.querySelector('[data-guide="snap-left"]'),
        snapRight: previewGuidesLayer.querySelector('[data-guide="snap-right"]'),
        snapTop: previewGuidesLayer.querySelector('[data-guide="snap-top"]'),
        snapBottom: previewGuidesLayer.querySelector('[data-guide="snap-bottom"]'),
        smartCenter: previewGuidesLayer.querySelector('[data-guide="smart-center"]'),
    }
    : null;
const previewGuideMeasurements = previewGuidesLayer
    ? {
        size: previewGuidesLayer.querySelector('[data-measure="size"]'),
        position: previewGuidesLayer.querySelector('[data-measure="position"]'),
    }
    : null;
const previewRulerElements = previewGuidesLayer
    ? {
        horizontal: previewGuidesLayer.querySelector('[data-ruler="horizontal"]'),
        vertical: previewGuidesLayer.querySelector('[data-ruler="vertical"]'),
        horizontalLabel: previewGuidesLayer.querySelector('[data-ruler-value="horizontal"]'),
        verticalLabel: previewGuidesLayer.querySelector('[data-ruler-value="vertical"]'),
    }
    : null;
const previewPlaceholder = document.getElementById('preview-placeholder');

if (previewImage) {
    try {
        previewImage.decoding = 'async';
    } catch (error) {
        // Some browsers do not support setting the decoding hint.
    }
}
const timelineTrack = document.getElementById('timeline-track');
const timelineLaneList = document.getElementById('timeline-lane-list');
const timelineEmptyState = document.getElementById('timeline-empty-state');
const playVideoButton = document.getElementById('play-video-button');
const timelineProgressLine = document.getElementById('timeline-progress-line');
const timelineProgressInput = document.getElementById('timeline-progress');
if (timelineProgressInput) {
    timelineProgressInput.addEventListener('input', () => {
        stopTimelinePlayback(true, false);
        const rawValue = Number(timelineProgressInput.value);
        const fraction = Number.isFinite(rawValue) ? rawValue / 100 : 0;
        seekTimelineToFraction(fraction);
    });
}
const previewAspectSelect = document.getElementById('preview-aspect');
const previewAspectLabel = document.getElementById('preview-aspect-label');
const playbackTimeDisplay = document.getElementById('playback-time');
const exportButton = document.querySelector('.export-button');
const exportDialog = document.getElementById('export-dialog');
const exportTimelineList = document.getElementById('export-timeline-list');
const exportSummaryClips = document.getElementById('export-summary-clips');
const exportSummaryDuration = document.getElementById('export-summary-duration');
const exportSummaryResolution = document.getElementById('export-summary-resolution');
const exportSummaryFormat = document.getElementById('export-summary-format');
const exportDialogStatus = document.getElementById('export-dialog-status');
const confirmExportButton = document.getElementById('confirm-export-button');
const cancelExportButton = document.getElementById('cancel-export-button');
const addKeyframeButton = document.getElementById('add-keyframe-button');
const keyframeTrack = document.getElementById('keyframe-track');
const keyframeStatus = document.getElementById('keyframe-status');
const animationDirectionSelect = document.getElementById('animation-direction');
const animationModeContainers = animationDirectionSelect
    ? Array.from(document.querySelectorAll('[data-animation-mode]'))
    : [];
const animationInPresetSelect = document.getElementById('animation-in-preset');
const animationInTimingInput = document.getElementById('animation-in-timing');
const animationOutPresetSelect = document.getElementById('animation-out-preset');
const animationOutDelayInput = document.getElementById('animation-out-delay');
const animationComboInPresetSelect = document.getElementById('animation-combo-in-preset');
const animationComboOutPresetSelect = document.getElementById('animation-combo-out-preset');
const animationComboSpeedInput = document.getElementById('animation-combo-speed');
const animationComboSpeedValue = document.getElementById('animation-combo-speed-value');
const imageRotationInput = document.getElementById('image-rotation');
const imageRotationValue = document.getElementById('image-rotation-value');
const settingsTabs = Array.from(document.querySelectorAll('.settings-tab'));
const settingsSections = Array.from(document.querySelectorAll('.settings-section'));
const exportMirrorCanvas = document.createElement('canvas');
const exportMirrorContext = exportMirrorCanvas.getContext('2d');
const DEFAULT_EXPORT_QUALITY = '720p';

const optionSliderConfigs = [
    {
        inputId: 'animation-in-timing',
        readoutId: 'animation-in-timing-value',
        labelsId: 'animation-in-timing-labels',
        options: [
            { value: 'short', display: '0.3s — Quick' },
            { value: 'medium', display: '0.6s — Smooth' },
            { value: 'long', display: '1s — Dramatic' },
        ],
    },
    {
        inputId: 'animation-out-delay',
        readoutId: 'animation-out-delay-value',
        labelsId: 'animation-out-delay-labels',
        options: [
            { value: 'none', display: 'No delay' },
            { value: 'short', display: '0.2s delay' },
            { value: 'medium', display: '0.5s delay' },
            { value: 'long', display: '1s delay' },
        ],
    },
];

const IMAGE_FRAME_DURATION = 1000;

const ENTRANCE_ANIMATION_PRESETS = {
    fade: {
        key: 'fade',
        className: 'preview-image--enter-fade',
        baseDuration: 560,
        durationScale: 1,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
    'slide-up': {
        key: 'slide-up',
        className: 'preview-image--enter-slide-up',
        baseDuration: 620,
        durationScale: 1,
        easing: 'cubic-bezier(0.22, 0.68, 0.25, 1)',
        easingOverrides: {
            short: 'cubic-bezier(0.32, 0.72, 0.45, 1)',
            long: 'cubic-bezier(0.18, 1, 0.3, 1)',
        },
    },
    zoom: {
        key: 'zoom',
        className: 'preview-image--enter-zoom',
        baseDuration: 600,
        durationScale: 0.95,
        easing: 'cubic-bezier(0.26, 0.52, 0.34, 1)',
        easingOverrides: {
            short: 'cubic-bezier(0.34, 0.64, 0.4, 1)',
            long: 'cubic-bezier(0.2, 0.8, 0.26, 1)',
        },
    },
    bounce: {
        key: 'bounce',
        className: 'preview-image--enter-bounce',
        baseDuration: 680,
        durationScale: 1.2,
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        easingOverrides: {
            short: 'cubic-bezier(0.36, 1.36, 0.62, 1)',
            long: 'cubic-bezier(0.28, 1.7, 0.48, 1)',
        },
    },
};

const ENTRANCE_ANIMATION_TIMING_KEYS = ['short', 'medium', 'long'];
const ENTRANCE_ANIMATION_TIMING_OPTIONS = {
    short: {
        duration: 300,
        easing: 'cubic-bezier(0.32, 0, 0.67, 1)',
    },
    medium: {
        duration: 600,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
    long: {
        duration: 1000,
        easing: 'cubic-bezier(0.18, 0.89, 0.32, 1.28)',
    },
};

const ENTRANCE_ANIMATION_CLASS_NAMES = Object.values(ENTRANCE_ANIMATION_PRESETS).map(
    (preset) => preset.className,
);

const COMBO_ENTRANCE_PRESETS = {
    fade: {
        key: 'fade',
        className: 'preview-image--combo-enter-fade',
        baseDuration: 560,
        minDuration: 180,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
    'slide-up': {
        key: 'slide-up',
        className: 'preview-image--combo-enter-slide-up',
        baseDuration: 620,
        minDuration: 200,
        easing: 'cubic-bezier(0.22, 0.68, 0.25, 1)',
    },
    zoom: {
        key: 'zoom',
        className: 'preview-image--combo-enter-zoom',
        baseDuration: 600,
        minDuration: 180,
        easing: 'cubic-bezier(0.26, 0.52, 0.34, 1)',
    },
    bounce: {
        key: 'bounce',
        className: 'preview-image--combo-enter-bounce',
        baseDuration: 680,
        minDuration: 220,
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    },
    'slide-left': {
        key: 'slide-left',
        className: 'preview-image--combo-enter-slide-left',
        baseDuration: 620,
        minDuration: 200,
        easing: 'cubic-bezier(0.22, 0.68, 0.25, 1)',
    },
};

const COMBO_EXIT_PRESETS = {
    fade: {
        key: 'fade',
        className: 'preview-image--combo-exit-fade',
        baseDuration: 520,
        minDuration: 160,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
    'slide-down': {
        key: 'slide-down',
        className: 'preview-image--combo-exit-slide-down',
        baseDuration: 640,
        minDuration: 200,
        easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    },
    'zoom-out': {
        key: 'zoom-out',
        className: 'preview-image--combo-exit-zoom-out',
        baseDuration: 600,
        minDuration: 180,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
    spin: {
        key: 'spin',
        className: 'preview-image--combo-exit-spin',
        baseDuration: 720,
        minDuration: 220,
        easing: 'cubic-bezier(0.32, 0.12, 0.13, 0.94)',
    },
    'slide-right': {
        key: 'slide-right',
        className: 'preview-image--combo-exit-slide-right',
        baseDuration: 640,
        minDuration: 200,
        easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    },
};

const COMBO_ENTRANCE_CLASS_NAMES = Object.values(COMBO_ENTRANCE_PRESETS).map(
    (preset) => preset.className,
);

const COMBO_EXIT_CLASS_NAMES = Object.values(COMBO_EXIT_PRESETS).map(
    (preset) => preset.className,
);

function getActiveImageClipDurationMs() {
    if (!activeTimelineItem) {
        return null;
    }

    const fileType = activeTimelineItem.dataset.fileType || '';
    if (!fileType.startsWith('image/')) {
        return null;
    }

    const duration = Number(activeTimelineItem.dataset.imageDuration);
    if (Number.isFinite(duration) && duration > 0) {
        return duration;
    }

    return null;
}

let previewEntranceAnimationFallbackTimer = 0;
let previewEntranceAnimationState = {
    cleanup: null,
};
let comboPreviewExitTimeoutId = 0;

function cancelComboPreviewCycle() {
    window.clearTimeout(comboPreviewExitTimeoutId);
    comboPreviewExitTimeoutId = 0;
}

function scheduleComboExitPreview(entranceConfig = null, exitConfig = null, clipDurationOverride = null) {
    cancelComboPreviewCycle();

    const handleCycleComplete = () => {
        if (!isComboModeActive() || !previewImage || previewImage.hidden) {
            return;
        }

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (!isComboModeActive() || !previewImage || previewImage.hidden) {
                    return;
                }
                previewComboAnimationCycle();
            });
        });
    };

    const triggerExitPreview = () => {
        cancelComboPreviewCycle();
        if (!isComboModeActive()) {
            return;
        }

        const resolvedExitConfig = exitConfig
            || getPreviewImageExitConfig({ clipDurationMs: clipDurationOverride });

        const resolvedClipDuration = Number.isFinite(clipDurationOverride)
            ? clipDurationOverride
            : Number.isFinite(resolvedExitConfig?.combo?.clipDuration)
                ? resolvedExitConfig.combo.clipDuration
                : null;

        const exitOptions = {
            restoreOnComplete: true,
            restoreDelayMs: 90,
            clipDurationMs: resolvedClipDuration,
            onComplete: handleCycleComplete,
        };

        const executeExit = () => {
            let didAnimate = false;
            if (resolvedExitConfig) {
                didAnimate = runPreviewImageExitAnimation(exitOptions, resolvedExitConfig);
            } else {
                didAnimate = runPreviewImageExitAnimation(exitOptions);
            }

            if (!didAnimate) {
                handleCycleComplete();
            }
        };

        requestAnimationFrame(() => {
            requestAnimationFrame(executeExit);
        });
    };

    const estimatedDuration = Math.max(0, Number(entranceConfig?.totalDuration) || 0);
    const delay = Math.max(240, estimatedDuration + 120);

    comboPreviewExitTimeoutId = window.setTimeout(() => {
        triggerExitPreview();
    }, delay);

    return triggerExitPreview;
}

function previewComboAnimationCycle() {
    if (!isComboModeActive()) {
        return;
    }

    const entranceConfig = getPreviewImageEntranceConfig();
    if (!entranceConfig) {
        previewEntranceAnimationDemo();
        return;
    }

    const comboMeta = entranceConfig.combo || {};
    const clipDurationOverride = Number.isFinite(comboMeta.clipDuration)
        ? comboMeta.clipDuration
        : Number.isFinite(comboMeta.combinedDuration)
            ? comboMeta.combinedDuration
            : null;

    const resolvedExitConfig = getPreviewImageExitConfig({ clipDurationMs: clipDurationOverride });
    const triggerExitPreview = scheduleComboExitPreview(
        entranceConfig,
        resolvedExitConfig,
        clipDurationOverride,
    );

    const didAnimate = runPreviewImageEntranceAnimation({
        clipDurationMs: clipDurationOverride,
        configOverride: entranceConfig,
        onComplete: () => {
            window.clearTimeout(comboPreviewExitTimeoutId);
            comboPreviewExitTimeoutId = window.setTimeout(() => {
                triggerExitPreview();
            }, 32);
        },
    });

    if (!didAnimate) {
        window.clearTimeout(comboPreviewExitTimeoutId);
        triggerExitPreview();
    }
}

class OptionSliderController {
    constructor(config) {
        const slider = document.getElementById(config.inputId);
        const readout = document.getElementById(config.readoutId);
        const labelsContainer = config.labelsId
            ? document.getElementById(config.labelsId)
            : null;

        if (!slider || !readout) {
            return;
        }

        this.slider = slider;
        this.readout = readout;
        this.options = Array.isArray(config.options) ? config.options.slice() : [];
        this.labels = labelsContainer
            ? Array.from(labelsContainer.querySelectorAll('.line-slider__label'))
            : [];
        this.totalStops = Math.max(this.options.length - 1, 1);
        this.currentIndex = -1;
        this.pendingIndex = null;
        this.updateFrame = null;
        this.activeLabel = null;

        const maxIndex = Math.max(this.options.length - 1, 0);
        this.slider.min = '0';
        this.slider.max = String(maxIndex);
        this.slider.step = '1';
        this.slider.setAttribute('aria-valuemin', '0');
        this.slider.setAttribute('aria-valuemax', String(maxIndex));
        this.slider.dataset.optionCount = String(this.options.length);

        if (!this.readout.hasAttribute('aria-live')) {
            this.readout.setAttribute('aria-live', 'polite');
        }

        this.handleInput = this.handleInput.bind(this);

        this.slider.addEventListener('input', this.handleInput);
        this.slider.addEventListener('change', this.handleInput);

        this.labels.forEach((labelElement, labelIndex) => {
            const position = this.totalStops === 0 ? 0 : (labelIndex / this.totalStops) * 100;
            labelElement.style.setProperty('--slider-label-position', `${position}%`);

            if (labelIndex === 0) {
                labelElement.dataset.position = 'start';
            } else if (labelIndex === this.options.length - 1) {
                labelElement.dataset.position = 'end';
            } else {
                labelElement.dataset.position = 'middle';
            }

            labelElement.dataset.sliderIndex = String(labelIndex);
            labelElement.setAttribute('role', 'button');
            labelElement.setAttribute('tabindex', '0');
            labelElement.setAttribute('aria-controls', this.slider.id);

            labelElement.addEventListener('click', (event) => {
                event.preventDefault();
                this.focusSlider();
                this.setIndex(labelIndex);
            });

            labelElement.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                    event.preventDefault();
                    this.focusSlider();
                    this.setIndex(labelIndex);
                }
            });
        });

        const initialIndex = this.parseIndex(this.slider.value);
        this.setIndex(initialIndex, { force: true });
    }

    parseIndex(rawValue) {
        const parsed = Number.parseInt(rawValue, 10);
        return Number.isNaN(parsed) ? 0 : parsed;
    }

    clampIndex(index) {
        if (this.options.length === 0) {
            return 0;
        }

        return Math.min(Math.max(index, 0), this.options.length - 1);
    }

    handleInput() {
        this.setIndex(this.parseIndex(this.slider.value));
    }

    focusSlider() {
        if (typeof this.slider.focus === 'function') {
            try {
                this.slider.focus({ preventScroll: true });
            } catch (error) {
                this.slider.focus();
            }
        }
    }

    setIndex(nextIndex, { force = false } = {}) {
        if (this.options.length === 0) {
            return;
        }

        const clampedIndex = this.clampIndex(nextIndex);

        if (!force && (clampedIndex === this.pendingIndex || clampedIndex === this.currentIndex)) {
            return;
        }

        this.pendingIndex = clampedIndex;

        if (force || typeof window.requestAnimationFrame !== 'function') {
            this.applyIndex(this.pendingIndex);
            this.pendingIndex = null;
            return;
        }

        if (this.updateFrame !== null) {
            return;
        }

        this.updateFrame = window.requestAnimationFrame(() => {
            this.updateFrame = null;
            if (this.pendingIndex !== null) {
                this.applyIndex(this.pendingIndex);
                this.pendingIndex = null;
            }
        });
    }

    applyIndex(index) {
        if (index === this.currentIndex) {
            return;
        }

        const option = this.options[index];
        if (!option) {
            return;
        }

        const totalStops = Math.max(this.options.length - 1, 1);
        const progress = totalStops === 0 ? 0 : (index / totalStops) * 100;

        this.slider.value = String(index);
        this.slider.dataset.optionValue = option.value;
        this.slider.setAttribute('aria-valuenow', String(index));
        this.slider.setAttribute('aria-valuetext', option.display);
        this.slider.style.setProperty('--line-slider-progress', `${progress}%`);
        this.readout.textContent = option.display;

        if (this.activeLabel) {
            this.activeLabel.classList.remove('is-active');
        }

        const nextActiveLabel = this.labels[index] || null;
        if (nextActiveLabel) {
            nextActiveLabel.classList.add('is-active');
        }
        this.activeLabel = nextActiveLabel;

        this.currentIndex = index;
    }
}

optionSliderConfigs.forEach((config) => {
    new OptionSliderController(config);
});

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

function getEntranceTimingKey() {
    if (!animationInTimingInput) {
        return 'medium';
    }

    const optionValue = animationInTimingInput.dataset.optionValue;
    if (optionValue && Object.prototype.hasOwnProperty.call(ENTRANCE_ANIMATION_TIMING_OPTIONS, optionValue)) {
        return optionValue;
    }

    const fallbackIndex = Number.parseInt(animationInTimingInput.value, 10);
    const fallbackKey = Number.isFinite(fallbackIndex)
        ? ENTRANCE_ANIMATION_TIMING_KEYS[
            Math.max(0, Math.min(ENTRANCE_ANIMATION_TIMING_KEYS.length - 1, fallbackIndex))
        ]
        : 'medium';
    return fallbackKey || 'medium';
}

function isComboModeActive() {
    return animationDirectionSelect?.value === 'combo';
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
const DEFAULT_ANIMATION_DIRECTION = 'in';
const DEFAULT_COMBO_ENTRANCE_PRESET = 'fade';
const DEFAULT_COMBO_EXIT_PRESET = 'fade';

function sanitizeAnimationDirection(value) {
    const normalized = typeof value === 'string' ? value.toLowerCase() : '';
    if (normalized === 'combo' || normalized === 'out') {
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

function getDefaultAnimationSettings() {
    return {
        direction: DEFAULT_ANIMATION_DIRECTION,
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

    const source = context.source || 'clip';
    const appliedDuration = Number.isFinite(context.appliedDuration)
        ? Math.max(0, Math.round(context.appliedDuration))
        : null;

    const rawClipDuration = appliedDuration !== null
        ? appliedDuration
        : Math.max(0, Math.round(Number(timelineItem.dataset.imageDuration) || 0));
    const hasClipDuration = rawClipDuration > 0;

    const animationWindowInput = context.animationWindowMs ?? timelineItem.dataset.animationComboWindowMs;
    const hasStoredWindow = !(animationWindowInput === undefined || animationWindowInput === null || animationWindowInput === '');

    let targetWindow = sanitizeComboWindowMs(
        hasStoredWindow
            ? animationWindowInput
            : hasClipDuration
                ? rawClipDuration
                : DEFAULT_COMBO_SPEED_MS,
    );

    if (source === 'clip' && hasClipDuration) {
        targetWindow = sanitizeComboWindowMs(rawClipDuration);
    } else if (source === 'animation' && Number.isFinite(context.animationWindowMs)) {
        targetWindow = sanitizeComboWindowMs(context.animationWindowMs);
    } else if (source === 'direction' && !hasStoredWindow) {
        targetWindow = sanitizeComboWindowMs(
            hasClipDuration ? rawClipDuration : DEFAULT_COMBO_SPEED_MS,
        );
    }

    const nextClipDuration = Math.max(MIN_IMAGE_DURATION, targetWindow);
    const clipChanged = !hasClipDuration || rawClipDuration !== nextClipDuration;

    if (clipChanged) {
        setTimelineItemDuration(
            timelineItem,
            'imageDuration',
            nextClipDuration,
            { markCustom: true, skipAnimationSync: true },
        );
    }

    setTimelineItemAnimationDataset(
        timelineItem,
        'animationComboWindowMs',
        String(targetWindow),
        String(DEFAULT_COMBO_SPEED_MS),
    );

    if (clipChanged) {
        updateActiveTimelineIndicators();
    }

    if (timelineItem === activeTimelineItem && animationComboSpeedInput) {
        animationComboSpeedInput.dataset.windowMs = String(targetWindow);
        animationComboSpeedInput.value = String(Math.round(targetWindow / 1000));
        updateComboSpeedSliderDisplay({ triggerPreview: false });
    }
}

function computeComboAnimationDurations(entrancePreset, exitPreset, options = {}) {
    const clipDurationOverride = Number.isFinite(options.clipDurationMs)
        ? Math.max(0, Math.round(options.clipDurationMs))
        : null;
    const clipDuration = clipDurationOverride !== null
        ? clipDurationOverride
        : getActiveImageClipDurationMs();

    const speedWindowOverride = Number.isFinite(options.speedWindowMs)
        ? Math.max(0, Math.round(options.speedWindowMs))
        : null;
    const speedWindowMs = speedWindowOverride !== null
        ? speedWindowOverride
        : getComboSpeedWindowMs();

    const rawEntranceBase = Number(entrancePreset?.baseDuration) || 560;
    const rawExitBase = Number(exitPreset?.baseDuration) || 520;
    const rawEntranceMinimum = Number(entrancePreset?.minDuration) || 160;
    const rawExitMinimum = Number(exitPreset?.minDuration) || 160;

    const minimumSegmentDuration = 80;
    const baseEntrance = Math.max(minimumSegmentDuration, Math.round(rawEntranceBase));
    const baseExit = Math.max(minimumSegmentDuration, Math.round(rawExitBase));
    const minimumEntrance = Math.max(minimumSegmentDuration, Math.round(rawEntranceMinimum));
    const minimumExit = Math.max(minimumSegmentDuration, Math.round(rawExitMinimum));
    const combinedBase = Math.max(baseEntrance + baseExit, minimumEntrance + minimumExit, 240);

    let targetWindow = Math.round(combinedBase);
    if (Number.isFinite(speedWindowMs) && speedWindowMs > 0) {
        targetWindow = Math.round(speedWindowMs);
    }

    const minimumWindow = Math.max(minimumEntrance + minimumExit, COMBO_MIN_COMBINED_DURATION_MS);
    if (clipDuration && clipDuration > 0) {
        const minimumWithClip = Math.min(minimumWindow, clipDuration);
        targetWindow = Math.min(Math.max(targetWindow, minimumWithClip), clipDuration);
    } else {
        targetWindow = Math.max(targetWindow, minimumWindow);
    }

    const scale = combinedBase > 0 ? targetWindow / combinedBase : 1;

    let entranceDuration = Math.max(minimumEntrance, Math.round(baseEntrance * scale));
    let exitDuration = Math.max(minimumExit, Math.round(baseExit * scale));

    if (clipDuration && clipDuration > 0) {
        let total = entranceDuration + exitDuration;
        if (total > clipDuration) {
            const adjust = clipDuration / total;
            entranceDuration = Math.max(60, Math.round(entranceDuration * adjust));
            exitDuration = Math.max(60, Math.round(exitDuration * adjust));
            total = entranceDuration + exitDuration;
        }

        if (total > clipDuration) {
            const overflow = total - clipDuration;
            if (exitDuration >= entranceDuration) {
                exitDuration = Math.max(60, exitDuration - overflow);
            } else {
                entranceDuration = Math.max(60, entranceDuration - overflow);
            }
        }
    }

    return {
        entranceDuration,
        exitDuration,
        clipDuration,
        combinedDuration: entranceDuration + exitDuration,
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

    const presetKey = animationInPresetSelect?.value || 'fade';
    const preset = ENTRANCE_ANIMATION_PRESETS[presetKey] || ENTRANCE_ANIMATION_PRESETS.fade;
    const timingKey = getEntranceTimingKey();
    const timing = ENTRANCE_ANIMATION_TIMING_OPTIONS[timingKey] || ENTRANCE_ANIMATION_TIMING_OPTIONS.medium;

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
        previewImage.classList.remove(className);
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

    previewImage.classList.add('is-entering', className);

    return true;
}

function shouldPreviewEntranceAnimation() {
    if (!previewImage || previewImage.hidden) {
        return false;
    }

    if (!animationDirectionSelect) {
        return true;
    }

    const value = animationDirectionSelect.value;
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

function getExitAnimationDelayKey() {
    if (!animationOutDelayInput) {
        return 'none';
    }

    const optionValue = animationOutDelayInput.dataset.optionValue;
    if (optionValue && Object.prototype.hasOwnProperty.call(EXIT_ANIMATION_DELAY_OPTIONS, optionValue)) {
        return optionValue;
    }

    const fallbackIndex = Number.parseInt(animationOutDelayInput.value, 10);
    const fallbackKey = Number.isFinite(fallbackIndex)
        ? EXIT_ANIMATION_DELAY_KEYS[Math.max(0, Math.min(EXIT_ANIMATION_DELAY_KEYS.length - 1, fallbackIndex))]
        : 'none';
    return fallbackKey || 'none';
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

    const presetKey = animationOutPresetSelect?.value || 'fade';
    const preset = EXIT_ANIMATION_PRESETS[presetKey] || EXIT_ANIMATION_PRESETS.fade;
    const delayKey = getExitAnimationDelayKey();
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
        previewImage.classList.remove(className);
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

    previewImage.classList.add('is-exiting', className);

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
    const value = animationDirectionSelect.value;
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
let timelinePlaybackAbort = null;
let currentPreviewAspectRatio = 16 / 9;
let previewViewportResizeFrame = null;
let timelineIndicatorResizeFrame = null;
let previewAreaResizeObserver = null;
let timelineTrackResizeObserver = null;
let activeDropLane = null;
let isExportingTimeline = false;
let previewImageTransform = null;
let pendingPreviewImageTransform = null;
let lastPreviewViewportSize = null;
let shouldResetImageFrameOnNextViewportUpdate = false;
let previewGuidesHideTimeout = null;
let activeClipProgress = 0;
let keyframeStatusTimeout = null;

const MEDIA_READY_STATE_ENOUGH = typeof HTMLMediaElement !== 'undefined'
    && typeof HTMLMediaElement.HAVE_ENOUGH_DATA === 'number'
        ? HTMLMediaElement.HAVE_ENOUGH_DATA
        : 4;
const MEDIA_READY_EVENTS = ['canplaythrough', 'canplay', 'loadeddata'];

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
const TIMELINE_DURATION_PER_PIXEL = 12;
const MIN_TIMELINE_ITEM_WIDTH = 96;
const MIN_IMAGE_FRAME_SIZE = 96;
const MAX_TIMELINE_STACK_LANES = 4;
const TIMELINE_LANE_INSERT_HOTZONE = 28;
const TIMELINE_LANE_INSERT_SPACING = 32;

let playbackClockAnimationFrame = null;
let playbackClockStartTimestamp = 0;
let playbackClockBaseElapsed = 0;
let playbackClockTotalDuration = 0;
let playbackDisplayCurrentMs = 0;
let playbackDisplayTotalMs = 0;

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

    const validModes = new Set(animationModeContainers.map((container) => container.dataset.animationMode));
    const fallbackMode = animationModeContainers[0]?.dataset.animationMode;
    const mode = validModes.has(selectedMode) ? selectedMode : fallbackMode;

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

if (animationDirectionSelect && animationModeContainers.length) {
    updateAnimationModeContent(animationDirectionSelect.value);
    if (animationDirectionSelect.value === 'out') {
        cancelComboPreviewCycle();
        previewExitAnimationDemo();
    } else if (animationDirectionSelect.value === 'combo') {
        previewComboAnimationCycle();
    } else if (animationDirectionSelect.value === 'in') {
        cancelComboPreviewCycle();
        previewEntranceAnimationDemo();
    }

    animationDirectionSelect.addEventListener('change', (event) => {
        const nextValue = event.target.value;
        updateAnimationModeContent(nextValue);
        persistActiveTimelineAnimationDirection(nextValue);
        if (nextValue === 'out') {
            cancelComboPreviewCycle();
            previewExitAnimationDemo();
        } else {
            cancelPreviewExitAnimation({ forceRestore: true });
            if (nextValue === 'combo') {
                previewComboAnimationCycle();
            } else if (nextValue === 'in') {
                cancelComboPreviewCycle();
                previewEntranceAnimationDemo();
            }
        }
    });
}

if (animationInPresetSelect) {
    animationInPresetSelect.addEventListener('change', () => {
        if (!animationDirectionSelect || animationDirectionSelect.value === 'in') {
            previewEntranceAnimationDemo();
        }
    });
}

if (animationInTimingInput) {
    const handleEntranceTimingChange = () => {
        if (!animationDirectionSelect || animationDirectionSelect.value === 'in') {
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

syncAnimationControlsToTimelineItem(activeTimelineItem);

if (animationOutPresetSelect) {
    animationOutPresetSelect.addEventListener('change', () => {
        if (!animationDirectionSelect || animationDirectionSelect.value === 'out') {
            previewExitAnimationDemo();
        }
    });
}

if (animationOutDelayInput) {
    const handleExitDelayChange = () => {
        if (!animationDirectionSelect || animationDirectionSelect.value === 'out') {
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
    if (matrixMatch) {
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

    if (window.getComputedStyle) {
        const computedStyle = window.getComputedStyle(previewImage);
        if (computedStyle) {
            const opacityValue = Number.parseFloat(computedStyle.opacity);
            if (Number.isFinite(opacityValue)) {
                computedOpacity = clamp(opacityValue, 0, 1);
            }
            cssMatrix = parseCssTransformMatrix(
                computedStyle.transform || computedStyle.webkitTransform || '',
            );
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

    exportMirrorContext.drawImage(
        previewImage,
        0,
        0,
        drawWidth,
        drawHeight,
    );
    exportMirrorContext.restore();

    exportMirrorContext.restore();
    exportMirrorContext.restore();
    exportMirrorContext.setTransform(1, 0, 0, 1, 0, 0);
    return true;
}

function startPreviewMirroring(width, height) {
    if (!exportMirrorContext) {
        throw new Error('Unable to access export canvas context.');
    }

    exportMirrorCanvas.width = Math.max(1, Math.round(width));
    exportMirrorCanvas.height = Math.max(1, Math.round(height));

    let stopped = false;
    let rafId = 0;

    const drawFrame = () => {
        if (stopped) {
            return;
        }

        exportMirrorContext.setTransform(1, 0, 0, 1, 0, 0);
        exportMirrorContext.fillStyle = '#000000';
        exportMirrorContext.fillRect(0, 0, exportMirrorCanvas.width, exportMirrorCanvas.height);

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

        rafId = window.requestAnimationFrame(drawFrame);
    };

    drawFrame();

    return () => {
        stopped = true;
        if (rafId) {
            window.cancelAnimationFrame(rafId);
            rafId = 0;
        }
    };
}

function updatePlaybackTimeDisplay(currentMs, totalMs) {
    playbackDisplayCurrentMs = Math.max(0, Math.floor(Number(currentMs) || 0));
    playbackDisplayTotalMs = Math.max(0, Math.floor(Number(totalMs) || 0));

    if (!playbackTimeDisplay) {
        return;
    }

    const clampedCurrent = Math.min(playbackDisplayCurrentMs, playbackDisplayTotalMs);
    playbackTimeDisplay.textContent = `${formatTime(clampedCurrent)} / ${formatTime(playbackDisplayTotalMs)}`;
    playbackTimeDisplay.dataset.current = String(clampedCurrent);
    playbackTimeDisplay.dataset.total = String(playbackDisplayTotalMs);
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

function renderExportSummary(timelineItems, playbackCompleted = null) {
    if (exportSummaryClips) {
        exportSummaryClips.textContent = String(timelineItems.length);
    }

    const totalDuration = Math.max(getTotalTimelineDuration(), 0);
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
        if (!timelineItems.length) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'export-dialog__subtitle';
            emptyMessage.textContent = 'No media in the timeline. Add clips to export.';
            exportTimelineList.appendChild(emptyMessage);
        } else {
            const list = document.createElement('ul');
            list.className = 'export-timeline-list__items';
            timelineItems.forEach((timelineItem, index) => {
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

function startPlaybackClock(startElapsed, totalDuration) {
    playbackClockBaseElapsed = Math.max(0, Number(startElapsed) || 0);
    playbackClockTotalDuration = Math.max(0, Number(totalDuration) || 0);
    playbackClockStartTimestamp = performance.now();

    if (playbackClockAnimationFrame) {
        window.cancelAnimationFrame(playbackClockAnimationFrame);
    }

    const tick = () => {
        if (!isTimelinePlaying) {
            return;
        }
        const now = performance.now();
        const elapsed = Math.min(
            playbackClockTotalDuration,
            playbackClockBaseElapsed + Math.max(0, now - playbackClockStartTimestamp),
        );
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

function durationToWidth(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return MIN_TIMELINE_ITEM_WIDTH;
    }
    return Math.max(MIN_TIMELINE_ITEM_WIDTH, Math.round(durationMs / TIMELINE_DURATION_PER_PIXEL));
}

function widthToDuration(widthPx) {
    if (!Number.isFinite(widthPx) || widthPx <= 0) {
        return MIN_IMAGE_DURATION;
    }
    return Math.max(MIN_IMAGE_DURATION, Math.round(widthPx * TIMELINE_DURATION_PER_PIXEL));
}

function applyTimelineItemDurationStyles(timelineItem, durationMs) {
    const width = durationToWidth(durationMs);
    timelineItem.style.width = `${width}px`;
    timelineItem.style.flexBasis = `${width}px`;
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

    return applied;
}

function getTimelineItems() {
    return Array.from(timelineTrack.querySelectorAll('.timeline-item'));
}

function getTimelineLaneEntries() {
    const entries = [];
    const lanes = getTimelineLanes();
    lanes.forEach((lane, index) => {
        const laneIndex = Number.isFinite(Number(lane?.dataset?.laneIndex))
            ? Number(lane.dataset.laneIndex)
            : index;
        const laneItems = lane
            ? Array.from(lane.querySelectorAll('.timeline-item'))
            : [];
        let elapsed = 0;
        laneItems.forEach((item) => {
            const duration = Math.max(0, getTimelineItemPlaybackDuration(item));
            const start = elapsed;
            const end = start + duration;
            entries.push({
                item,
                laneIndex,
                start,
                end,
            });
            elapsed = end;
        });
    });
    return entries;
}

function getTimelinePlaybackSegments() {
    const entries = getTimelineLaneEntries();
    const totalDuration = entries.reduce(
        (max, entry) => Math.max(max, entry.end),
        0,
    );

    if (!entries.length || totalDuration <= 0) {
        return {
            segments: [],
            totalDuration,
            entries,
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

        const activeEntry = orderedEntries[0] || null;

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
    };
}

function getTotalTimelineDuration() {
    return getTimelineLaneEntries().reduce(
        (max, entry) => Math.max(max, entry.end),
        0,
    );
}

function getTimelineItemStartTime(timelineItem) {
    if (!timelineItem) {
        return 0;
    }
    const entry = getTimelineLaneEntries().find(
        (candidate) => candidate.item === timelineItem,
    );
    return entry ? entry.start : 0;
}

function getTimelineFractionForTime(timeMs) {
    const total = getTotalTimelineDuration();
    if (!total) {
        return 0;
    }
    return clampProgress(Math.max(0, timeMs) / total);
}

function seekTimelineToFraction(fraction) {
    const { segments, totalDuration } = getTimelinePlaybackSegments();
    const clampedFraction = clampProgress(Number.isFinite(fraction) ? fraction : 0);

    if (!segments.length || totalDuration <= 0) {
        setActiveTimelineItem(null);
        loadPreviewFromTimeline(null);
        resetTimelineProgressLine(0);
        updatePlaybackTimeDisplay(0, totalDuration);
        renderExportSummary(getTimelineItems(), null);
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
    renderExportSummary(getTimelineItems(), null);
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
        lane.dataset.laneIndex = laneIndex;
        lane.querySelectorAll('.timeline-item').forEach((item) => {
            item.dataset.laneIndex = laneIndex;
        });
    });
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
            lane.remove();
        }
    });
    refreshTimelineLaneIndices();
    updateTimelineEmptyState();
}

function updateTimelineEmptyState() {
    if (!timelineEmptyState || !timelineTrack) {
        return;
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

function getDragAfterElement(container, clientX) {
    const siblings = Array.from(
        container.querySelectorAll('.timeline-item:not(.dragging)'),
    );

    return siblings.reduce(
        (closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = clientX - box.left - box.width / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset, element: child };
            }
            return closest;
        },
        { offset: Number.NEGATIVE_INFINITY, element: null },
    ).element;
}

function updateActiveTimelineIndicators() {
    applyTimelineProgressGeometry();

    if (isTimelinePlaying) {
        updatePlaybackTimeDisplay(playbackDisplayCurrentMs, getTotalTimelineDuration());
        return;
    }

    if (activeTimelineItem) {
        const startTime = getTimelineItemStartTime(activeTimelineItem);
        const clipDuration = Math.max(0, getTimelineItemPlaybackDuration(activeTimelineItem));
        const clipProgress = getActiveClipProgress();
        const currentTime = startTime + (clipDuration * clipProgress);
        const total = getTotalTimelineDuration();
        const fraction = total > 0 ? clampProgress(currentTime / total) : 0;
        resetTimelineProgressLine(fraction);
        updatePlaybackTimeDisplay(currentTime, total);
    } else {
        resetTimelineProgressLine();
        updatePlaybackTimeDisplay(0, getTotalTimelineDuration());
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
    return MIN_IMAGE_DURATION;
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

    const autoScrollMargin = 60;
    const autoScrollSpeed = 16;

    timelineItem.classList.add('is-resizing');
    timelineItem.draggable = false;
    timelineItem.dataset.resizeCursor = resizeEdge;

    const captureTarget = handle instanceof HTMLElement && handle !== timelineItem
        ? handle
        : timelineItem;
    captureTarget?.setPointerCapture?.(event.pointerId);

    const onPointerMove = (moveEvent) => {
        if (timelineTrack) {
            const trackRect = timelineTrack.getBoundingClientRect();
            if (moveEvent.clientX > trackRect.right - autoScrollMargin) {
                timelineTrack.scrollLeft += autoScrollSpeed;
            } else if (moveEvent.clientX < trackRect.left + autoScrollMargin) {
                timelineTrack.scrollLeft = Math.max(
                    0,
                    timelineTrack.scrollLeft - autoScrollSpeed,
                );
            }
        }

        const currentScrollLeft = timelineTrack ? timelineTrack.scrollLeft : initialScrollLeft;
        const scrollDelta = currentScrollLeft - initialScrollLeft;
        let deltaX = moveEvent.clientX - startX + scrollDelta;
        if (isLeftResize) {
            deltaX = -deltaX;
        }
        const tentativeWidth = Math.max(MIN_TIMELINE_ITEM_WIDTH, initialWidth + deltaX);
        const nextDuration = widthToDuration(tentativeWidth);
        setTimelineItemDuration(timelineItem, durationKey, nextDuration, { markCustom: true });
        updateActiveTimelineIndicators();
    };

    const finishResize = () => {
        captureTarget?.releasePointerCapture?.(event.pointerId);
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', finishResize);
        document.removeEventListener('pointercancel', finishResize);
        timelineItem.classList.remove('is-resizing');
        timelineItem.draggable = previousDraggable;
        delete timelineItem.dataset.resizeCursor;
        updateActiveTimelineIndicators();
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
        handle.addEventListener('pointerdown', (event) => startTimelineItemResize(event, timelineItem, position));
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
        const edge = getTimelineItemResizeEdgeFromEvent(event, timelineItem);
        if (edge) {
            timelineItem.dataset.resizeCursor = edge;
        } else {
            delete timelineItem.dataset.resizeCursor;
        }
    });

    timelineItem.addEventListener('pointerleave', clearCursor);

    timelineItem.addEventListener('pointerdown', (event) => {
        if (event.button && event.button !== 0) {
            return;
        }
        const edge = getTimelineItemResizeEdgeFromEvent(event, timelineItem);
        if (!edge) {
            return;
        }
        startTimelineItemResize(event, timelineItem, edge);
    });
}

function enableTimelineItemDragging(timelineItem) {
    if (!timelineItem || timelineItem.dataset.draggingInitialized === '1') {
        return;
    }
    timelineItem.dataset.draggingInitialized = '1';
    timelineItem.setAttribute('draggable', 'true');

    timelineItem.addEventListener('dragstart', (event) => {
        stopTimelinePlayback();
        timelineItem.classList.add('dragging');
        const transfer = event.dataTransfer;
        if (transfer) {
            transfer.effectAllowed = 'move';
            transfer.setData('text/plain', timelineItem.dataset.objectUrl || 'timeline-item');
        }
    });

    timelineItem.addEventListener('dragend', () => {
        timelineItem.classList.remove('dragging');
        timelineItem.draggable = true;
        setActiveDropLane(null);
        cleanupEmptyTimelineLanes();
        updateTimelineEmptyState();
        updateActiveTimelineIndicators();
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
    if (fileType.startsWith('image/') || fileType.startsWith('video/')) {
        attachResizeHandles(timelineItem);
        enableTimelineItemEdgeResizing(timelineItem);
    }
}

if (timelineTrack) {
    timelineTrack.addEventListener('dragenter', (event) => {
        const draggingItem = timelineTrack.querySelector('.timeline-item.dragging');
        if (draggingItem) {
            event.preventDefault();
        }
    });

    timelineTrack.addEventListener('dragover', (event) => {
        const draggingItem = timelineTrack.querySelector('.timeline-item.dragging');
        if (!draggingItem) {
            return;
        }
        event.preventDefault();
        const lane = getTimelineLaneFromEvent(event);
        if (!lane) {
            return;
        }
        setActiveDropLane(lane);
        const afterElement = getDragAfterElement(lane, event.clientX);
        if (!afterElement) {
            lane.appendChild(draggingItem);
        } else if (afterElement !== draggingItem) {
            lane.insertBefore(draggingItem, afterElement);
        }
        draggingItem.dataset.laneIndex = lane.dataset.laneIndex || '0';
    });

    timelineTrack.addEventListener('drop', (event) => {
        event.preventDefault();
        const draggingItem = timelineTrack.querySelector('.timeline-item.dragging');
        if (draggingItem) {
            draggingItem.classList.remove('dragging');
            draggingItem.draggable = true;
        }
        setActiveDropLane(null);
        cleanupEmptyTimelineLanes();
        updateTimelineEmptyState();
        updateActiveTimelineIndicators();
    });
}

ensureTimelineLane(0);
updateTimelineEmptyState();

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
                    const horizontalDelta = movingX - anchorX;
                    const verticalDelta = movingY - anchorY;
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
    const shouldPersistKeyframe = Boolean(options.forceKeyframe) || existingKeyframes.length > 0;

    if (!shouldPersistKeyframe) {
        return;
    }

    const targetProgress = Object.prototype.hasOwnProperty.call(options, 'progressOverride')
        ? clampProgress(options.progressOverride)
        : getActiveClipProgress();

    if (!Number.isFinite(targetProgress)) {
        return;
    }

    const updatedKeyframes = upsertTimelineImageKeyframe(existingKeyframes, targetProgress, normalized);
    storeTimelineImageKeyframes(activeTimelineItem, updatedKeyframes);
    renderKeyframeTrack(activeTimelineItem);
}

function applyPreviewImageTransform(alignmentOverride) {
    if (!previewImageFrame || !previewImageTransform) {
        resetPreviewViewportAlignmentState();
        resetPreviewGuideElements();
        return;
    }

    previewImageFrame.style.transform = `translate3d(${previewImageTransform.left}px, ${previewImageTransform.top}px, 0)`;
    previewImageFrame.style.width = `${previewImageTransform.width}px`;
    previewImageFrame.style.height = `${previewImageTransform.height}px`;

    const rotation = clampRotation(previewImageTransform.rotation);
    previewImageTransform.rotation = rotation;
    if (previewImage) {
        previewImage.style.setProperty('--preview-image-rotation', `${rotation}deg`);
    }

    const alignment = alignmentOverride
        || evaluatePreviewImageAlignment(previewImageTransform, getPreviewViewportSize());
    updatePreviewViewportAlignmentState(alignment);
    updatePreviewOutsideOutline();
    updatePreviewGuides(previewImageTransform, alignment);
    updateImageRotationControlState();
}

function clearPreviewImageTransform() {
    previewImageTransform = null;
    if (previewImageFrame) {
        previewImageFrame.style.removeProperty('transform');
        previewImageFrame.style.removeProperty('width');
        previewImageFrame.style.removeProperty('height');
        previewImageFrame.classList.remove('is-dragging', 'is-resizing');
    }
    if (previewImage) {
        previewImage.style.removeProperty('--preview-image-rotation');
    }
    resetPreviewViewportAlignmentState();
    hidePreviewOutsideOutline();
    setPreviewGuidesVisible(false);
    updateImageRotationControlState();
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
    previewImagePointerState.pointerId = null;
    previewImagePointerState.mode = null;
    previewImagePointerState.handle = null;
    previewImagePointerState.origin = null;
}

function queuePreviewImageFrameReset() {
    if (!previewImage || previewImage.hidden) {
        return;
    }
    shouldResetImageFrameOnNextViewportUpdate = true;
    schedulePreviewViewportSizeUpdate();
}

function handlePreviewViewportResized() {
    if (!previewViewport) {
        hidePreviewOutsideOutline();
        refreshActiveOverlayLayers();
        return;
    }

    const width = Math.max(0, previewViewport.clientWidth);
    const height = Math.max(0, previewViewport.clientHeight);

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
            refreshActiveOverlayLayers();
            return;
        }
    }

    if (shouldResetImageFrameOnNextViewportUpdate) {
        shouldResetImageFrameOnNextViewportUpdate = false;
        resetPreviewImageFrameToFit();
        lastPreviewViewportSize = { width, height };
        refreshActiveOverlayLayers();
        return;
    }

    if (!previewImageTransform) {
        lastPreviewViewportSize = { width, height };
        hidePreviewOutsideOutline();
        refreshActiveOverlayLayers();
        return;
    }

    if (!lastPreviewViewportSize || lastPreviewViewportSize.width === 0) {
        lastPreviewViewportSize = { width, height };
        hidePreviewOutsideOutline();
        refreshActiveOverlayLayers();
        return;
    }

    const scale = width / lastPreviewViewportSize.width;

    if (!Number.isFinite(scale) || scale <= 0) {
        lastPreviewViewportSize = { width, height };
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
    applyPreviewImageTransform();
    refreshActiveOverlayLayers();
}

function calculatePreviewImageResize(handle, deltaX, deltaY, origin) {
    const aspectRatio = origin.aspectRatio > 0 ? origin.aspectRatio : 1;
    const baseMin = Math.max(32, MIN_IMAGE_FRAME_SIZE);
    const minHeight = Math.max(32, baseMin / aspectRatio);

    const chooseWidth = (primary, secondary) => {
        const candidate = Math.abs(deltaX) >= Math.abs(deltaY) ? primary : secondary;
        return Math.max(baseMin, candidate);
    };

    switch (handle) {
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
            };
        }
    }
}

function endPreviewImagePointerInteraction() {
    if (previewImageFrame) {
        previewImageFrame.classList.remove('is-dragging', 'is-resizing');
    }
    const hadInteraction = previewImagePointerState.mode !== null;
    previewImagePointerState.pointerId = null;
    previewImagePointerState.mode = null;
    previewImagePointerState.handle = null;
    previewImagePointerState.origin = null;
    if (hadInteraction) {
        persistPreviewImageTransformForActiveTimelineItem();
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

    const handleElement = event.target.closest('.preview-resize-handle');
    const captureTarget = handleElement || previewImageFrame;

    if (typeof captureTarget.setPointerCapture === 'function') {
        captureTarget.setPointerCapture(event.pointerId);
    }

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

    setPreviewGuidesVisible(true);

    const deltaX = event.clientX - previewImagePointerState.origin.pointerX;
    const deltaY = event.clientY - previewImagePointerState.origin.pointerY;

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
        previewImageTransform.aspectRatio = previewImagePointerState.origin.aspectRatio;
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

    endPreviewImagePointerInteraction();
}

function onPreviewImagePointerCancel(event) {
    if (previewImagePointerState.pointerId === null || event.pointerId !== previewImagePointerState.pointerId) {
        return;
    }

    if (typeof event.target.releasePointerCapture === 'function' && event.target.hasPointerCapture(event.pointerId)) {
        event.target.releasePointerCapture(event.pointerId);
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

    if (previewOverlayGroups) {
        const { below, above } = previewOverlayGroups;
        if (below) {
            below.innerHTML = '';
        }
        if (above) {
            above.innerHTML = '';
        }
    }

    previewOverlayStack.setAttribute('hidden', '');
    previewOverlayStack.setAttribute('aria-hidden', 'true');
}

function resolveLaneIndex(laneValue) {
    const parsed = Number.parseInt(laneValue ?? '', 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

function resolveOverlayFramePixels(timelineItem, viewportWidth, viewportHeight) {
    if (!timelineItem || viewportWidth <= 0 || viewportHeight <= 0) {
        return null;
    }

    const stored = getStoredPreviewImageTransform(timelineItem);
    if (!stored) {
        return null;
    }

    const left = stored.left * viewportWidth;
    const top = stored.top * viewportHeight;
    const width = stored.width * viewportWidth;
    const height = stored.height * viewportHeight;

    if ([left, top, width, height].some((value) => !Number.isFinite(value))) {
        return null;
    }

    if (width <= 0 || height <= 0) {
        return null;
    }

    return { left, top, width, height };
}

function renderPreviewOverlayLayers(primaryTimelineItem, entries = []) {
    if (previewImage) {
        previewImage.style.removeProperty('mix-blend-mode');
    }

    if (!previewOverlayStack || !previewOverlayGroups) {
        return;
    }

    clearPreviewOverlayLayers();

    if (!primaryTimelineItem) {
        return;
    }

    const viewportSize = getPreviewViewportSize();
    const viewportWidth = Math.max(0, viewportSize.width || 0);
    const viewportHeight = Math.max(0, viewportSize.height || 0);

    if (viewportWidth === 0 || viewportHeight === 0) {
        return;
    }

    const primaryLaneIndex = resolveLaneIndex(primaryTimelineItem.dataset?.laneIndex);

    const overlayEntries = (Array.isArray(entries) ? entries : [])
        .filter((entry) => entry && entry.item)
        .map((entry) => ({
            item: entry.item,
            laneIndex: resolveLaneIndex(entry.laneIndex ?? entry.item?.dataset?.laneIndex),
        }))
        .filter((descriptor) => descriptor.item && descriptor.item !== primaryTimelineItem)
        .filter((descriptor) => (descriptor.item.dataset.fileType || '').startsWith('image/'));

    if (!overlayEntries.length) {
        return;
    }

    const borderRadius = getPreviewImageFrameBorderRadius();
    const overlayGroups = { below: [], above: [] };

    overlayEntries.forEach((descriptor) => {
        if (descriptor.laneIndex < primaryLaneIndex) {
            overlayGroups.above.push(descriptor);
        } else if (descriptor.laneIndex > primaryLaneIndex) {
            overlayGroups.below.push(descriptor);
        } else {
            overlayGroups.above.push(descriptor);
        }
    });

    overlayGroups.above.sort((a, b) => a.laneIndex - b.laneIndex);
    overlayGroups.below.sort((a, b) => a.laneIndex - b.laneIndex);

    const { below, above } = previewOverlayGroups;

    const createLayerForDescriptor = (descriptor, zIndex) => {
        const objectURL = descriptor.item.dataset.objectUrl || '';
        if (!objectURL) {
            return null;
        }

        const layer = document.createElement('div');
        layer.className = 'preview-overlay-layer';
        layer.dataset.laneIndex = String(descriptor.laneIndex);
        layer.style.zIndex = String(zIndex);

        if (borderRadius > 0) {
            layer.style.borderRadius = `${borderRadius}px`;
        }

        const frame = resolveOverlayFramePixels(descriptor.item, viewportWidth, viewportHeight);
        if (frame) {
            layer.style.left = `${frame.left}px`;
            layer.style.top = `${frame.top}px`;
            layer.style.width = `${frame.width}px`;
            layer.style.height = `${frame.height}px`;
        } else {
            layer.style.left = '0px';
            layer.style.top = '0px';
            layer.style.width = '100%';
            layer.style.height = '100%';
        }

        const image = document.createElement('img');
        image.src = objectURL;
        image.alt = descriptor.item.dataset.displayName
            || descriptor.item.querySelector('span')?.textContent
            || 'Overlay layer';
        try {
            image.decoding = 'async';
        } catch (error) {
            // Ignore unsupported decoding hint.
        }
        image.loading = 'lazy';
        image.draggable = false;
        layer.appendChild(image);
        layer.title = image.alt;
        overlayLayerToTimelineItem.set(layer, descriptor.item);
        return layer;
    };

    if (overlayGroups.below.length && below) {
        overlayGroups.below.forEach((descriptor, index) => {
            const zIndex = 10 + overlayGroups.below.length - index;
            const layer = createLayerForDescriptor(descriptor, zIndex);
            if (layer) {
                below.appendChild(layer);
            }
        });
    }

    if (overlayGroups.above.length && above) {
        overlayGroups.above.forEach((descriptor, index) => {
            const zIndex = 60 + (overlayGroups.above.length - index);
            const layer = createLayerForDescriptor(descriptor, zIndex);
            if (layer) {
                above.appendChild(layer);
            }
        });
    }

    const hasLayers = Boolean((below && below.childElementCount) || (above && above.childElementCount));

    if (hasLayers) {
        previewOverlayStack.removeAttribute('hidden');
        previewOverlayStack.setAttribute('aria-hidden', 'false');
    }
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

    event.preventDefault();
    event.stopPropagation();

    stopTimelinePlayback();
    setActiveTimelineItem(timelineItem);
    loadPreviewFromTimeline(timelineItem);
}

function refreshActiveOverlayLayers() {
    if (!activeTimelineItem) {
        if (previewImage) {
            previewImage.style.removeProperty('mix-blend-mode');
        }
        clearPreviewOverlayLayers();
        return;
    }
    const entries = getOverlayEntriesForTimelineItem(activeTimelineItem);
    renderPreviewOverlayLayers(activeTimelineItem, entries);
}

function getOverlayEntriesForTimelineItem(timelineItem, entriesOverride = null) {
    if (!timelineItem) {
        return [];
    }

    const candidateEntries = Array.isArray(entriesOverride) && entriesOverride.length
        ? entriesOverride
        : getTimelineLaneEntries();

    if (!candidateEntries.length) {
        return [];
    }

    const start = getTimelineItemStartTime(timelineItem);
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

if (previewOverlayStack) {
    previewOverlayStack.addEventListener('pointerdown', onPreviewOverlayPointerDown);
}

if (window && typeof window.addEventListener === 'function') {
    window.addEventListener('pointermove', onPreviewImagePointerMove, { passive: false });
    window.addEventListener('pointerup', onPreviewImagePointerUp, { passive: true });
    window.addEventListener('pointercancel', onPreviewImagePointerCancel, { passive: true });
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

if (imageRotationInput) {
    imageRotationInput.addEventListener('input', (event) => {
        if (!isImageTimelineItem(activeTimelineItem) || !previewImageTransform) {
            updateImageRotationControlState();
            return;
        }
        const nextRotation = clampRotation(event.target.value);
        previewImageTransform.rotation = nextRotation;
        applyPreviewImageTransform();
        persistPreviewImageTransformForActiveTimelineItem();
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
        const progress = getKeyframeTrackProgressFromClientX(event.clientX);
        if (progress === null) {
            return;
        }
        event.preventDefault();
        setActiveClipProgress(progress, { source: 'keyframe-track', syncTimeline: true });
        if (typeof keyframeTrack.focus === 'function') {
            try {
                keyframeTrack.focus({ preventScroll: true });
            } catch (error) {
                keyframeTrack.focus();
            }
        }
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

function clampProgress(value) {
    return Math.min(Math.max(value, 0), 1);
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

function isImageTimelineItem(timelineItem) {
    if (!timelineItem || !timelineItem.dataset) {
        return false;
    }
    const fileType = timelineItem.dataset.fileType || '';
    return fileType.startsWith('image/');
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

function interpolateNormalizedTransforms(startTransform, endTransform, t) {
    const numericRatio = Number(t);
    const ratio = Number.isFinite(numericRatio) ? clampProgress(numericRatio) : 0;
    const lerp = (start, end) => start + ((end - start) * ratio);

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
        rotation: interpolateRotationDegrees(start.rotation, end.rotation, ratio),
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
    lastPreviewViewportSize = {
        width: Math.max(0, Number(viewportSize.width) || 0),
        height: Math.max(0, Number(viewportSize.height) || 0),
    };
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

function stopTimelinePlayback(resetButton = true, resetProgress = true) {
    const abort = timelinePlaybackAbort;
    timelinePlaybackAbort = null;

    if (typeof abort === 'function') {
        abort();
    }

    const wasPlaying = isTimelinePlaying;
    isTimelinePlaying = false;

    cancelPreviewExitAnimation({ forceRestore: true });

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
}

function clearPreview() {
    stopTimelinePlayback();
    previewVideo.pause();
    previewVideo.hidden = true;
    previewVideo.removeAttribute('src');
    previewVideo.load();
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
        setPreviewMode('has-video');
        resetPreviewScroll();
        setPreviewImageVisibility(false);
        previewImage.removeAttribute('src');
        previewVideo.hidden = false;
        if (previewVideo.src !== objectURL) {
            previewVideo.pause();
            previewVideo.src = objectURL;
            previewVideo.load();
        }
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
    }
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

    if (!isVideo && !isImage) {
        alert('Unsupported file type. Please upload an image or video file.');
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
        const wasActive = targetItem === activeTimelineItem;
        const fileType = targetItem.dataset.fileType || '';
        const url = targetItem.dataset.objectUrl;
        targetItem.remove();
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

async function playTimelineItem(timelineItem, segmentDurationMs = null, overlayEntriesOverride = null) {
    const fileType = timelineItem.dataset.fileType || '';
    const objectURL = timelineItem.dataset.objectUrl;
    const playbackWindow = Number.isFinite(segmentDurationMs)
        ? Math.max(0, Math.round(segmentDurationMs))
        : null;

    setActiveTimelineItem(timelineItem);

    const overlayEntries = getOverlayEntriesForTimelineItem(timelineItem, overlayEntriesOverride);
    renderPreviewOverlayLayers(timelineItem, overlayEntries);

    if (!objectURL) {
        return;
    }

    if (fileType.startsWith('video/')) {
        setPreviewMode('has-video');
        resetPreviewScroll();
        setPreviewImageVisibility(false);
        previewImage.removeAttribute('src');
        previewVideo.hidden = false;
        previewPlaceholder.hidden = true;

        await new Promise((resolve) => {
            let resolved = false;
            let timeoutId = 0;
            let onEnded = null;
            let onError = null;
            const abortController = new AbortController();
            let playbackStarted = false;

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
            };

            const finalize = () => {
                if (resolved) {
                    return;
                }
                resolved = true;
                window.clearTimeout(timeoutId);
                cleanup();
                previewVideo.pause();
                previewVideo.loop = false;
                previewVideo.currentTime = 0;
                if (timelinePlaybackAbort === abortPlayback) {
                    timelinePlaybackAbort = null;
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

                previewVideo.currentTime = 0;

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

                try {
                    const playPromise = previewVideo.play();
                    if (playPromise && typeof playPromise.then === 'function') {
                        await playPromise;
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
        const animationSettings = getTimelineItemAnimationSettings(timelineItem);
        const entranceConfigOverride = getPreviewImageEntranceConfig({
            clipDurationMs: safeEffectiveDuration,
            settingsOverride: animationSettings,
        });
        const exitConfig = getPreviewImageExitConfig({
            clipDurationMs: safeEffectiveDuration,
            settingsOverride: animationSettings,
        });
        const exitWindow = exitConfig ? Math.max(0, exitConfig.totalDuration) : 0;
        const comboCycleDuration = Number.isFinite(exitConfig?.combo?.combinedDuration)
            ? exitConfig.combo.combinedDuration
            : null;
        const exitPlaybackWindow = comboCycleDuration && comboCycleDuration > 0
            ? Math.min(safeEffectiveDuration, Math.max(comboCycleDuration, exitWindow))
            : safeEffectiveDuration;

        setPreviewMode('has-image');
        previewVideo.pause();
        previewVideo.hidden = true;
        previewVideo.removeAttribute('src');
        setPreviewImageVisibility(true);
        previewPlaceholder.hidden = true;
        await revealPreviewImageSource(objectURL, {
            clipDurationMs: safeEffectiveDuration,
            entranceConfigOverride,
        });
        resetPreviewScroll();
        setActiveClipProgress(0, { source: 'image-playback' });

        await new Promise((resolve) => {
            let resolved = false;
            const startTimestamp = performance.now();
            let animationFrameId = 0;
            let exitAnimationTimeoutId = 0;
            let exitAnimationStarted = false;

            const stopAnimation = () => {
                if (animationFrameId) {
                    window.cancelAnimationFrame(animationFrameId);
                    animationFrameId = 0;
                }
                if (exitAnimationTimeoutId) {
                    window.clearTimeout(exitAnimationTimeoutId);
                    exitAnimationTimeoutId = 0;
                }
            };

            const startExitAnimation = () => {
                if (exitAnimationStarted || !exitConfig) {
                    return;
                }
                exitAnimationStarted = runPreviewImageExitAnimation({ restoreOnComplete: false }, exitConfig);
            };

            const step = () => {
                if (resolved || !isTimelinePlaying) {
                    return;
                }
                const now = performance.now();
                const elapsed = Math.max(0, Math.min(now - startTimestamp, clipDuration));
                const playbackProgress = clipDuration > 0
                    ? clampProgress(elapsed / clipDuration)
                    : 0;
                setActiveClipProgress(playbackProgress, { source: 'image-playback' });
                if (elapsed < safeEffectiveDuration && isTimelinePlaying) {
                    animationFrameId = window.requestAnimationFrame(step);
                }
            };

            animationFrameId = window.requestAnimationFrame(step);

            if (exitConfig) {
                if (safeEffectiveDuration === 0) {
                    startExitAnimation();
                } else {
                    const exitStartOffset = Math.max(0, exitPlaybackWindow - exitWindow);
                    exitAnimationTimeoutId = window.setTimeout(() => {
                        if (!resolved && isTimelinePlaying) {
                            startExitAnimation();
                        }
                    }, Math.max(0, Math.round(exitStartOffset)));
                }
            }

            const timeoutId = window.setTimeout(() => {
                if (resolved) {
                    return;
                }
                resolved = true;
                startExitAnimation();
                stopAnimation();
                const finalProgress = clipDuration > 0
                    ? clampProgress(safeEffectiveDuration / clipDuration)
                    : 1;
                setActiveClipProgress(finalProgress, { source: 'image-playback-end', updatePreview: false });
                if (timelinePlaybackAbort === abortPlayback) {
                    timelinePlaybackAbort = null;
                }
                resolve();
            }, Math.max(0, Math.round(safeEffectiveDuration)));

            const abortPlayback = () => {
                if (resolved) {
                    return;
                }
                resolved = true;
                window.clearTimeout(timeoutId);
                stopAnimation();
                cancelPreviewExitAnimation({ forceRestore: true });
                timelinePlaybackAbort = null;
                resolve();
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

async function playTimelineSequence(startIndex = 0) {
    const timelineItems = getTimelineItems();
    if (!timelineItems.length) {
        alert('Upload an image or video to build your timeline.');
        return false;
    }

    const { segments, totalDuration } = getTimelinePlaybackSegments();
    if (!segments.length || totalDuration <= 0) {
        alert('Upload an image or video to build your timeline.');
        return false;
    }

    const boundedIndex = Math.min(
        Math.max(0, startIndex),
        Math.max(timelineItems.length - 1, 0),
    );
    const initialItem = timelineItems[boundedIndex] || null;
    let initialSegmentIndex = 0;
    if (initialItem) {
        const foundSegmentIndex = segments.findIndex(
            (segment) => segment.item === initialItem,
        );
        if (foundSegmentIndex >= 0) {
            initialSegmentIndex = foundSegmentIndex;
        }
    }
    const startSegment = segments[initialSegmentIndex] || null;
    const startElapsed = startSegment ? startSegment.start : 0;

    isTimelinePlaying = true;
    playVideoButton.textContent = 'Pause playback';
    updateKeyframeControlsState();
    resetTimelineProgressLine(getTimelineFractionForTime(startElapsed));
    updatePlaybackTimeDisplay(startElapsed, totalDuration);
    startPlaybackClock(startElapsed, totalDuration);

    let completedNaturally = true;

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
            const nextSegment = segments[index + 1];
            if (nextSegment?.item) {
                const nextUrl = nextSegment.item.dataset?.objectUrl;
                const nextType = nextSegment.item.dataset?.fileType || '';
                if (nextUrl && nextType.startsWith('image/')) {
                    preloadTimelineImage(nextUrl).catch(() => {});
                }
            }
            const startFraction = getTimelineFractionForTime(start);
            const endFraction = getTimelineFractionForTime(end);
            animateTimelineProgress(startFraction, endFraction, duration);
            if (item) {
                // eslint-disable-next-line no-await-in-loop
                await playTimelineItem(item, duration, segment.items || null);
            } else {
                // eslint-disable-next-line no-await-in-loop
                await waitForGapDuration(duration);
            }
        }
    } finally {
        stopTimelinePlayback(true, false);
        if (completedNaturally) {
            resetTimelineProgressLine(totalDuration > 0 ? 1 : 0);
            updatePlaybackTimeDisplay(totalDuration, totalDuration);
        } else {
            updateActiveTimelineIndicators();
        }
    }

    return completedNaturally;
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
            const refreshedTimelineItems = getTimelineItems();
            renderExportSummary(refreshedTimelineItems, null);
        } finally {
            exportButton.disabled = false;
            exportButton.textContent = originalLabel || 'Export video';
        }

        openExportDialog();
    });
}

if (cancelExportButton) {
    cancelExportButton.addEventListener('click', () => {
        if (isExportingTimeline) {
            return;
        }
        closeExportDialog();
    });
}

function attachPreviewAudioToStream(previewVideo, combinedStream) {
    if (!previewVideo || !combinedStream) {
        return {
            audioContext: null,
            success: false,
            error: new Error('Missing preview video or combined stream.'),
        };
    }

    let lastError = null;

    if (typeof previewVideo.captureStream === 'function') {
        try {
            const audioStream = previewVideo.captureStream();
            if (audioStream) {
                const audioTracks = audioStream.getAudioTracks();
                audioTracks.forEach((track) => combinedStream.addTrack(track));
                if (audioTracks.length) {
                    return { audioContext: null, success: true, error: null };
                }
            }
        } catch (error) {
            lastError = error;
        }
    }

    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
        return {
            audioContext: null,
            success: false,
            error: lastError || new Error('AudioContext is not supported in this browser.'),
        };
    }

    let audioContext = null;
    try {
        audioContext = new AudioContextConstructor();
        const sourceNode = audioContext.createMediaElementSource(previewVideo);
        const destination = audioContext.createMediaStreamDestination();
        sourceNode.connect(destination);
        sourceNode.connect(audioContext.destination);

        const audioTracks = destination.stream.getAudioTracks();
        audioTracks.forEach((track) => combinedStream.addTrack(track));
        if (!audioTracks.length) {
            const closeResult = audioContext.close();
            if (closeResult && typeof closeResult.catch === 'function') {
                closeResult.catch(() => {});
            }
            return {
                audioContext: null,
                success: false,
                error: lastError || new Error('No audio tracks available from preview video.'),
            };
        }

        return { audioContext, success: true, error: null };
    } catch (error) {
        if (audioContext && typeof audioContext.close === 'function') {
            const closeResult = audioContext.close();
            if (closeResult && typeof closeResult.catch === 'function') {
                closeResult.catch(() => {});
            }
        }
        return {
            audioContext: null,
            success: false,
            error: error || lastError || new Error('Failed to attach audio from preview video.'),
        };
    }
}

async function handleConfirmExport() {
    if (isExportingTimeline) {
        return;
    }

    const timelineItems = getTimelineItems();
    if (!timelineItems.length) {
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
        exportDialogStatus.innerHTML = `
            <span class="visually-hidden" role="status">Exporting timeline preview to ${exportFormat.label}…</span>
            <div class="export-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuetext="Exporting timeline preview" aria-live="off">
                <div class="export-progress__bar"></div>
            </div>
        `.trim();
    }

    stopTimelinePlayback();

    let stopMirroring = () => {};
    let recorder = null;
    let combinedStream = null;
    const recordedChunks = [];
    let exportAudioContext = null;

    try {
        stopMirroring = startPreviewMirroring(resolution.width, resolution.height);
        if (typeof exportMirrorCanvas.captureStream !== 'function') {
            throw new Error('Canvas captureStream is not supported in this browser.');
        }
        const canvasStream = exportMirrorCanvas.captureStream(30);
        if (!canvasStream) {
            throw new Error('Unable to access canvas capture stream.');
        }
        combinedStream = new MediaStream();
        canvasStream.getVideoTracks().forEach((track) => combinedStream.addTrack(track));

        const audioAttachment = attachPreviewAudioToStream(previewVideo, combinedStream);
        exportAudioContext = audioAttachment.audioContext;
        if (!audioAttachment.success) {
            console.warn('Unable to capture audio from preview video.', audioAttachment.error);
        }

        recorder = new MediaRecorder(combinedStream, {
            mimeType: exportFormat.mimeType,
            videoBitsPerSecond: 6_000_000,
        });

        const recordingPromise = new Promise((resolve, reject) => {
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

        recorder.start(250);
        const playbackCompleted = await playTimelineSequence(0);
        if (recorder.state !== 'inactive') {
            recorder.stop();
        }

        const exportBlob = await recordingPromise;

        if (!playbackCompleted) {
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
        console.error('Failed to export timeline preview.', error);
        alert(`Export failed: ${error?.message || error}`);
        if (exportDialogStatus) {
            exportDialogStatus.textContent = 'Export failed. Please try again.';
            exportDialogStatus.dataset.state = 'warning';
        }
    } finally {
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
        if (exportAudioContext) {
            try {
                const closeResult = exportAudioContext.close();
                if (closeResult && typeof closeResult.catch === 'function') {
                    closeResult.catch(() => {});
                }
            } catch (error) {
                // Ignore
            }
            exportAudioContext = null;
        }
        stopMirroring();
        confirmExportButton.disabled = false;
        confirmExportButton.textContent = originalLabel || 'Confirm export';
        isExportingTimeline = false;
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
        }
    });
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isExportDialogOpen()) {
        event.preventDefault();
        closeExportDialog();
    }
});

playVideoButton.addEventListener('click', () => {
    if (isTimelinePlaying) {
        stopTimelinePlayback();
        return;
    }

    const timelineItems = getTimelineItems();
    if (!timelineItems.length) {
        alert('Upload an image or video to build your timeline.');
        return;
    }

    const startIndex = activeTimelineItem ? timelineItems.indexOf(activeTimelineItem) : 0;
    playTimelineSequence(startIndex >= 0 ? startIndex : 0).catch((error) => {
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

