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
const previewCanvasBackdrop = document.getElementById('preview-canvas-backdrop');
const previewCanvasVideo = document.getElementById('preview-canvas-video');
const previewCanvasImage = document.getElementById('preview-canvas-image');
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
const activeOverlayLayers = new Map();
const overlayLayerToTimelineItem = new WeakMap();
let lastOverlayRenderTimestamp = null;
const OVERLAY_TIMELINE_WINDOW_SLACK_MS = 8;
const OVERLAY_EXIT_OVERSHOOT_ALLOWANCE_MS = OVERLAY_TIMELINE_WINDOW_SLACK_MS * 2;
const OVERLAY_TIMELINE_EDGE_TOLERANCE_MS = 1;
const timelineDragPreviewElements = new WeakMap();
const timelineDragPointerOffsets = new WeakMap();
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
const timelineZoomInput = document.getElementById('timeline-zoom');
const timelineZoomValue = document.getElementById('timeline-zoom-value');
const timelineZoomButtons = timelineZoomInput
    ? Array.from(
        (timelineZoomInput.closest('.timeline-controls')
            || document).querySelectorAll('[data-timeline-zoom]'),
    )
    : [];
const timelineMagnetToggleButton = document.getElementById('timeline-magnet-toggle');
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
const animationComboApplyAllButton = document.getElementById('animation-combo-apply-all');
const animationComboApplyStatus = document.getElementById('animation-combo-apply-status');
const imageDurationApplyAllButton = document.getElementById('image-duration-apply-all');
const imageDurationApplyStatus = document.getElementById('image-duration-apply-status');
const imageRotationInput = document.getElementById('image-rotation');
const imageRotationValue = document.getElementById('image-rotation-value');
const masterVolumeInput = document.getElementById('video-volume');
const masterVolumeValue = document.getElementById('video-volume-value');
const audioFadeInInput = document.getElementById('audio-fade-in');
const audioFadeInValue = document.getElementById('audio-fade-in-value');
const audioFadeOutInput = document.getElementById('audio-fade-out');
const audioFadeOutValue = document.getElementById('audio-fade-out-value');
const canvasBackgroundModeSelect = document.getElementById('canvas-background-mode');
const canvasBackgroundUploadInput = document.getElementById('canvas-background-upload');
const canvasBackgroundUploadButton = document.getElementById('canvas-background-upload-button');
const canvasBackgroundRemoveButton = document.getElementById('canvas-background-remove');
const canvasBackgroundStatus = document.getElementById('canvas-background-status');
const canvasBlurInput = document.getElementById('canvas-background-blur');
const canvasBlurValue = document.getElementById('canvas-background-blur-value');
const settingsTabs = Array.from(document.querySelectorAll('.settings-tab'));
const settingsSections = Array.from(document.querySelectorAll('.settings-section'));
const exportMirrorCanvas = document.createElement('canvas');
const exportMirrorContext = exportMirrorCanvas.getContext('2d');
const DEFAULT_EXPORT_QUALITY = '720p';
const previewFullscreenToggle = document.getElementById('preview-fullscreen-toggle');

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

const CANVAS_BACKGROUND_MODES = new Set(['none', 'clip', 'custom']);
const DEFAULT_CANVAS_BLUR = 18;
const CANVAS_BLUR_MIN = 0;
const CANVAS_BLUR_MAX = 40;
const timelineCanvasCustomImageUrls = new WeakMap();

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
    none: {
        key: 'none',
        className: '',
        baseDuration: 0,
        minDuration: 0,
        easing: 'linear',
    },
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
    none: {
        key: 'none',
        className: '',
        baseDuration: 0,
        minDuration: 0,
        easing: 'linear',
    },
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

const COMBO_ENTRANCE_CLASS_NAMES = Object.values(COMBO_ENTRANCE_PRESETS)
    .map((preset) => preset.className)
    .filter((className) => Boolean(className));

const COMBO_EXIT_CLASS_NAMES = Object.values(COMBO_EXIT_PRESETS)
    .map((preset) => preset.className)
    .filter((className) => Boolean(className));

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
let animationComboApplyStatusTimer = 0;
let imageDurationApplyStatusTimer = 0;

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

const audioFadeControls = [
    { input: audioFadeInInput, readout: audioFadeInValue },
    { input: audioFadeOutInput, readout: audioFadeOutValue },
];

function formatAudioFadeDisplay(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return 'Off';
    }

    const rounded = Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(1);
    return `${rounded.replace(/\.0$/, '')}s`;
}

function syncAudioFadeControl(control, overrideSeconds = null) {
    const { input, readout } = control;
    if (!input || !readout) {
        return;
    }

    const parsedMin = Number.parseFloat(input.min);
    const parsedMax = Number.parseFloat(input.max);
    const sliderMin = Number.isFinite(parsedMin) ? parsedMin : 0;
    const sliderMax = Number.isFinite(parsedMax) ? parsedMax : AUDIO_FADE_MAX_SECONDS;

    let rawValue;
    if (overrideSeconds !== null && overrideSeconds !== undefined) {
        rawValue = Number(overrideSeconds);
    } else {
        rawValue = Number.parseFloat(input.value);
    }
    if (!Number.isFinite(rawValue)) {
        rawValue = sliderMin;
    }

    const clamped = Math.min(Math.max(rawValue, sliderMin), sliderMax);
    const display = formatAudioFadeDisplay(clamped);

    input.value = Number.isInteger(clamped) ? clamped.toString() : clamped.toFixed(1);
    input.dataset.fadeSeconds = clamped.toString();
    input.setAttribute('aria-valuemin', sliderMin.toString());
    input.setAttribute('aria-valuemax', sliderMax.toString());
    input.setAttribute('aria-valuenow', clamped.toString());
    input.setAttribute('aria-valuetext', display);

    if (!readout.hasAttribute('aria-live')) {
        readout.setAttribute('aria-live', 'polite');
    }

    readout.textContent = display;
}

const DEFAULT_AUDIO_VOLUME_PERCENT = 80;
const AUDIO_VOLUME_MIN_PERCENT = 0;
const AUDIO_VOLUME_MAX_PERCENT = 100;
const AUDIO_FADE_MAX_SECONDS = 5;

function clampVolume(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.min(Math.max(numeric, 0), 1);
}

const previewAudioEnvelopeState = {
    fadeInFrameId: 0,
    fadeOutFrameId: 0,
    fadeOutTimeoutId: 0,
    baseVolume: clampVolume(DEFAULT_AUDIO_VOLUME_PERCENT / 100),
};

function clampVolumePercent(value) {
    const numeric = Number.parseFloat(value);
    if (!Number.isFinite(numeric)) {
        return DEFAULT_AUDIO_VOLUME_PERCENT;
    }
    if (numeric < AUDIO_VOLUME_MIN_PERCENT) {
        return AUDIO_VOLUME_MIN_PERCENT;
    }
    if (numeric > AUDIO_VOLUME_MAX_PERCENT) {
        return AUDIO_VOLUME_MAX_PERCENT;
    }
    return Math.round(numeric);
}

function sanitizeFadeMilliseconds(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return 0;
    }
    const clamped = Math.min(
        Math.max(numeric, 0),
        AUDIO_FADE_MAX_SECONDS * 1000,
    );
    return Math.round(clamped / 500) * 500;
}

function getDefaultAudioSettings() {
    return {
        volumePercent: DEFAULT_AUDIO_VOLUME_PERCENT,
        fadeInMs: 0,
        fadeOutMs: 0,
    };
}

function getTimelineItemAudioSettings(timelineItem) {
    if (!isVideoTimelineItem(timelineItem)) {
        return getDefaultAudioSettings();
    }

    const dataset = timelineItem.dataset || {};
    const volumePercent = clampVolumePercent(
        dataset.audioVolumePercent ?? DEFAULT_AUDIO_VOLUME_PERCENT,
    );
    const fadeInMs = sanitizeFadeMilliseconds(dataset.audioFadeInMs);
    const fadeOutMs = sanitizeFadeMilliseconds(dataset.audioFadeOutMs);

    return {
        volumePercent,
        fadeInMs,
        fadeOutMs,
    };
}

function persistTimelineItemAudioSettings(timelineItem, settings) {
    if (!isVideoTimelineItem(timelineItem) || !timelineItem.dataset || !settings) {
        return;
    }

    if (Object.prototype.hasOwnProperty.call(settings, 'volumePercent')) {
        const percent = clampVolumePercent(settings.volumePercent);
        if (percent === DEFAULT_AUDIO_VOLUME_PERCENT) {
            delete timelineItem.dataset.audioVolumePercent;
        } else {
            timelineItem.dataset.audioVolumePercent = String(percent);
        }
    }

    if (Object.prototype.hasOwnProperty.call(settings, 'fadeInMs')) {
        const milliseconds = sanitizeFadeMilliseconds(settings.fadeInMs);
        if (milliseconds > 0) {
            timelineItem.dataset.audioFadeInMs = String(milliseconds);
        } else {
            delete timelineItem.dataset.audioFadeInMs;
        }
    }

    if (Object.prototype.hasOwnProperty.call(settings, 'fadeOutMs')) {
        const milliseconds = sanitizeFadeMilliseconds(settings.fadeOutMs);
        if (milliseconds > 0) {
            timelineItem.dataset.audioFadeOutMs = String(milliseconds);
        } else {
            delete timelineItem.dataset.audioFadeOutMs;
        }
    }
}

function persistActiveTimelineAudioSettings(partialSettings) {
    if (!activeTimelineItem) {
        return;
    }
    persistTimelineItemAudioSettings(activeTimelineItem, partialSettings);
}

function formatMasterVolumeDisplay(percent) {
    if (percent <= AUDIO_VOLUME_MIN_PERCENT) {
        return 'Muted';
    }
    if (percent >= AUDIO_VOLUME_MAX_PERCENT) {
        return `${AUDIO_VOLUME_MAX_PERCENT}%`;
    }
    return `${percent}%`;
}

function updateMasterVolumeReadout(percent, options = {}) {
    const { disabled = false } = options;
    if (masterVolumeValue) {
        masterVolumeValue.textContent = disabled
            ? 'Video only'
            : formatMasterVolumeDisplay(percent);
    }
    if (masterVolumeInput) {
        masterVolumeInput.setAttribute('aria-valuemin', String(AUDIO_VOLUME_MIN_PERCENT));
        masterVolumeInput.setAttribute('aria-valuemax', String(AUDIO_VOLUME_MAX_PERCENT));
        if (disabled) {
            masterVolumeInput.setAttribute('aria-valuenow', '0');
            masterVolumeInput.setAttribute(
                'aria-valuetext',
                'Audio controls available for video clips',
            );
        } else {
            masterVolumeInput.setAttribute('aria-valuenow', String(percent));
            masterVolumeInput.setAttribute(
                'aria-valuetext',
                formatMasterVolumeDisplay(percent),
            );
        }
    }
}

function applyMasterVolumeToPreview(volumePercent) {
    if (!previewVideo) {
        return;
    }
    const percent = clampVolumePercent(volumePercent);
    const normalized = clampVolume(percent / 100);
    previewVideo.muted = false;
    previewVideo.volume = normalized;
    previewAudioEnvelopeState.baseVolume = normalized;
}

function cancelPreviewAudioEnvelope(options = {}) {
    const { restoreVolume = false } = options;
    if (previewAudioEnvelopeState.fadeInFrameId) {
        window.cancelAnimationFrame(previewAudioEnvelopeState.fadeInFrameId);
        previewAudioEnvelopeState.fadeInFrameId = 0;
    }
    if (previewAudioEnvelopeState.fadeOutFrameId) {
        window.cancelAnimationFrame(previewAudioEnvelopeState.fadeOutFrameId);
        previewAudioEnvelopeState.fadeOutFrameId = 0;
    }
    if (previewAudioEnvelopeState.fadeOutTimeoutId) {
        window.clearTimeout(previewAudioEnvelopeState.fadeOutTimeoutId);
        previewAudioEnvelopeState.fadeOutTimeoutId = 0;
    }
    if (restoreVolume && previewVideo) {
        previewVideo.volume = clampVolume(previewAudioEnvelopeState.baseVolume);
    }
}

function applyPreviewAudioEnvelope(settings, clipDurationMs) {
    if (!previewVideo) {
        return;
    }

    cancelPreviewAudioEnvelope();

    const normalizedSettings = settings || getDefaultAudioSettings();
    const volumePercent = clampVolumePercent(normalizedSettings.volumePercent);
    const baseVolume = clampVolume(volumePercent / 100);
    const fadeInMs = sanitizeFadeMilliseconds(normalizedSettings.fadeInMs);
    const fadeOutMs = sanitizeFadeMilliseconds(normalizedSettings.fadeOutMs);
    const clipMs = Math.max(0, Math.round(Number(clipDurationMs) || 0));

    previewAudioEnvelopeState.baseVolume = baseVolume;
    previewVideo.muted = false;

    if (baseVolume <= 0) {
        previewVideo.volume = 0;
    } else if (fadeInMs > 0) {
        previewVideo.volume = 0;
        const fadeInStart = performance.now();
        const stepFadeIn = () => {
            const elapsed = performance.now() - fadeInStart;
            const progress = Math.min(Math.max(elapsed / fadeInMs, 0), 1);
            previewVideo.volume = clampVolume(baseVolume * progress);
            if (progress < 1) {
                previewAudioEnvelopeState.fadeInFrameId = window.requestAnimationFrame(stepFadeIn);
            }
        };
        previewAudioEnvelopeState.fadeInFrameId = window.requestAnimationFrame(stepFadeIn);
    } else {
        previewVideo.volume = baseVolume;
    }

    if (fadeOutMs > 0 && clipMs > 0 && baseVolume > 0) {
        const startDelay = Math.max(0, clipMs - fadeOutMs);
        previewAudioEnvelopeState.fadeOutTimeoutId = window.setTimeout(() => {
            const fadeOutStart = performance.now();
            const initialVolume = previewVideo.volume;
            const stepFadeOut = () => {
                const elapsed = performance.now() - fadeOutStart;
                const progress = Math.min(Math.max(elapsed / fadeOutMs, 0), 1);
                const nextVolume = clampVolume(initialVolume * (1 - progress));
                previewVideo.volume = nextVolume;
                if (progress < 1) {
                    previewAudioEnvelopeState.fadeOutFrameId = window.requestAnimationFrame(stepFadeOut);
                }
            };
            previewAudioEnvelopeState.fadeOutFrameId = window.requestAnimationFrame(stepFadeOut);
        }, startDelay);
    }
}

function ensureTimelineAudioDefaults(timelineItem) {
    if (!isVideoTimelineItem(timelineItem) || !timelineItem?.dataset) {
        return;
    }
    if (!timelineItem.dataset.audioVolumePercent) {
        timelineItem.dataset.audioVolumePercent = String(DEFAULT_AUDIO_VOLUME_PERCENT);
    }
}

audioFadeControls.forEach((control) => {
    const { input, readout } = control;
    if (!input || !readout) {
        return;
    }

    syncAudioFadeControl(control);

    const handleUpdate = () => {
        if (input.disabled) {
            return;
        }
        syncAudioFadeControl(control);
        const seconds = Number.parseFloat(input.dataset.fadeSeconds || input.value || '0');
        const milliseconds = Math.max(0, Math.round(seconds * 1000));
        if (input === audioFadeInInput) {
            persistActiveTimelineAudioSettings({ fadeInMs: milliseconds });
        } else if (input === audioFadeOutInput) {
            persistActiveTimelineAudioSettings({ fadeOutMs: milliseconds });
        }
        cancelPreviewAudioEnvelope({ restoreVolume: false });
    };

    input.addEventListener('input', handleUpdate);
    input.addEventListener('change', handleUpdate);
});

function syncAudioControlsToTimelineItem(timelineItem) {
    const isVideo = isVideoTimelineItem(timelineItem);
    const settings = isVideo
        ? getTimelineItemAudioSettings(timelineItem)
        : getDefaultAudioSettings();

    if (masterVolumeInput) {
        masterVolumeInput.disabled = !isVideo;
        if (isVideo) {
            masterVolumeInput.removeAttribute('aria-disabled');
        } else {
            masterVolumeInput.setAttribute('aria-disabled', 'true');
        }
        masterVolumeInput.value = String(settings.volumePercent);
        updateMasterVolumeReadout(settings.volumePercent, { disabled: !isVideo });
    }

    audioFadeControls.forEach((control) => {
        const { input, readout } = control;
        if (!input || !readout) {
            return;
        }

        if (!isVideo) {
            input.disabled = true;
            input.setAttribute('aria-disabled', 'true');
            input.value = '0';
            input.dataset.fadeSeconds = '0';
            input.setAttribute('aria-valuenow', '0');
            input.setAttribute('aria-valuetext', 'Audio fades available for video clips');
            readout.textContent = 'Video only';
            return;
        }

        input.disabled = false;
        input.removeAttribute('aria-disabled');
        const seconds = control.input === audioFadeInInput
            ? settings.fadeInMs / 1000
            : settings.fadeOutMs / 1000;
        syncAudioFadeControl(control, seconds);
    });

    if (isVideo) {
        applyMasterVolumeToPreview(settings.volumePercent);
    } else if (previewVideo) {
        cancelPreviewAudioEnvelope({ restoreVolume: false });
    }
}

function sanitizeCanvasMode(mode) {
    if (typeof mode !== 'string') {
        return 'none';
    }
    const normalized = mode.trim().toLowerCase();
    return CANVAS_BACKGROUND_MODES.has(normalized) ? normalized : 'none';
}

function clampCanvasBlur(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return CANVAS_BLUR_MIN;
    }
    return Math.min(
        Math.max(Math.round(numeric), CANVAS_BLUR_MIN),
        CANVAS_BLUR_MAX,
    );
}

function updateCanvasBlurReadout(value, options = {}) {
    if (!canvasBlurValue) {
        return;
    }
    const { disabled = false } = options;
    if (disabled) {
        canvasBlurValue.textContent = 'Disabled';
        return;
    }
    const clamped = clampCanvasBlur(value);
    canvasBlurValue.textContent = clamped <= 0 ? 'Off' : `${clamped}px`;
}

function getTimelineItemCanvasSettings(timelineItem) {
    const defaults = {
        mode: 'none',
        blur: 0,
        customImageUrl: '',
        customImageName: '',
    };

    if (!timelineItem) {
        return defaults;
    }

    const dataset = timelineItem.dataset || {};
    const mode = sanitizeCanvasMode(dataset.canvasMode);
    const hasStoredBlur = Object.prototype.hasOwnProperty.call(dataset, 'canvasBlur');
    const rawBlur = hasStoredBlur ? Number(dataset.canvasBlur) : Number.NaN;
    const blur = mode === 'none'
        ? clampCanvasBlur(Number.isFinite(rawBlur) ? rawBlur : 0)
        : clampCanvasBlur(Number.isFinite(rawBlur) ? rawBlur : DEFAULT_CANVAS_BLUR);
    const customImageUrl = dataset.canvasCustomImage || '';
    const customImageName = dataset.canvasCustomImageName || '';

    if (customImageUrl && !timelineCanvasCustomImageUrls.has(timelineItem)) {
        timelineCanvasCustomImageUrls.set(timelineItem, customImageUrl);
    }

    if (mode === 'custom' && !customImageUrl) {
        return {
            mode: 'none',
            blur: 0,
            customImageUrl: '',
            customImageName: '',
        };
    }

    return {
        mode,
        blur,
        customImageUrl,
        customImageName,
    };
}

function persistTimelineItemCanvasSettings(timelineItem, settings) {
    if (!timelineItem?.dataset || !settings) {
        return;
    }

    if (Object.prototype.hasOwnProperty.call(settings, 'mode')) {
        const mode = sanitizeCanvasMode(settings.mode);
        if (mode === 'none') {
            delete timelineItem.dataset.canvasMode;
        } else {
            timelineItem.dataset.canvasMode = mode;
        }
    }

    if (Object.prototype.hasOwnProperty.call(settings, 'blur')) {
        const blur = clampCanvasBlur(settings.blur);
        timelineItem.dataset.canvasBlur = String(blur);
    }

    if (Object.prototype.hasOwnProperty.call(settings, 'customImageUrl')) {
        const url = settings.customImageUrl;
        if (url) {
            timelineItem.dataset.canvasCustomImage = url;
        } else {
            delete timelineItem.dataset.canvasCustomImage;
        }
    }

    if (Object.prototype.hasOwnProperty.call(settings, 'customImageName')) {
        const name = settings.customImageName;
        if (name) {
            timelineItem.dataset.canvasCustomImageName = name;
        } else {
            delete timelineItem.dataset.canvasCustomImageName;
        }
    }
}

function releaseTimelineCanvasCustomImage(timelineItem) {
    if (!timelineItem) {
        return;
    }
    const cachedUrl = timelineCanvasCustomImageUrls.get(timelineItem);
    if (cachedUrl) {
        URL.revokeObjectURL(cachedUrl);
        timelineCanvasCustomImageUrls.delete(timelineItem);
    }
    if (timelineItem.dataset) {
        delete timelineItem.dataset.canvasCustomImage;
        delete timelineItem.dataset.canvasCustomImageName;
    }
}

function setTimelineItemCanvasCustomImage(timelineItem, file, objectURL) {
    if (!timelineItem?.dataset) {
        return;
    }
    const previous = timelineCanvasCustomImageUrls.get(timelineItem);
    if (previous && previous !== objectURL) {
        URL.revokeObjectURL(previous);
    }
    if (objectURL) {
        timelineCanvasCustomImageUrls.set(timelineItem, objectURL);
        persistTimelineItemCanvasSettings(timelineItem, {
            customImageUrl: objectURL,
            customImageName: file?.name || '',
        });
    } else {
        if (previous && (!timelineItem.dataset.canvasCustomImage || previous === timelineItem.dataset.canvasCustomImage)) {
            URL.revokeObjectURL(previous);
        }
        timelineCanvasCustomImageUrls.delete(timelineItem);
        persistTimelineItemCanvasSettings(timelineItem, {
            customImageUrl: '',
            customImageName: '',
        });
    }
}

function syncCanvasBlurControlState(timelineItem) {
    if (!canvasBlurInput || !canvasBlurValue) {
        return;
    }

    const isClip = isImageTimelineItem(timelineItem) || isVideoTimelineItem(timelineItem);
    if (!isClip) {
        canvasBlurInput.disabled = true;