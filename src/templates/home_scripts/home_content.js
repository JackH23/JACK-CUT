const uploadInput = document.getElementById('video-upload');
const uploadButton = document.getElementById('upload-button');
const uploadMetaStatus = document.querySelector('.upload-meta__status');
const uploadMetaHint = document.querySelector('.upload-meta__hint');
const uploadGallery = document.getElementById('upload-gallery');
const uploadGalleryList = document.getElementById('upload-gallery-list');
const previewArea = document.querySelector('.preview-area');
const previewViewport = document.querySelector('.preview-viewport');
const previewVideo = document.getElementById('preview-video');
const previewAudio = document.getElementById('preview-audio');
let activeAudioOverlayEntry = null;
const overlayAudioElementRegistry = new Map();

function registerOverlayAudioElement(timelineItem, mediaElement) {
    if (!timelineItem || !mediaElement) {
        return;
    }
    overlayAudioElementRegistry.set(timelineItem, mediaElement);
}

function unregisterOverlayAudioElement(timelineItem, mediaElement = null) {
    if (!timelineItem || !overlayAudioElementRegistry.has(timelineItem)) {
        return;
    }
    const currentElement = overlayAudioElementRegistry.get(timelineItem);
    if (mediaElement && currentElement && mediaElement !== currentElement) {
        return;
    }
    overlayAudioElementRegistry.delete(timelineItem);
}

function getOverlayAudioElementForItem(timelineItem) {
    if (!timelineItem) {
        return null;
    }
    return overlayAudioElementRegistry.get(timelineItem) || null;
}

function getActiveOverlayAudioElements() {
    return Array.from(new Set(overlayAudioElementRegistry.values())).filter(Boolean);
}
const previewImage = document.getElementById('preview-image');
const PREVIEW_IMAGE_BLUR_PRECISION = 2;
const PREVIEW_IMAGE_BLUR_EPSILON = 1 / (10 ** (PREVIEW_IMAGE_BLUR_PRECISION + 1));
let lastPreviewImageBlurValue = null;
const previewImageLayer = document.getElementById('preview-image-layer');
const previewImageFrame = document.getElementById('preview-image-frame');
const previewTextEditor = document.getElementById('preview-text-editor');
const previewCanvasBackdrop = document.getElementById('preview-canvas-backdrop');
const previewCanvasVideo = document.getElementById('preview-canvas-video');
const previewCanvasImage = document.getElementById('preview-canvas-image');
const previewResizeHandles = previewImageFrame
    ? Array.from(previewImageFrame.querySelectorAll('.preview-resize-handle'))
    : [];
const RESIZE_HANDLE_ANCHORS = {
    n: { x: 0, y: -1 },
    s: { x: 0, y: 1 },
    e: { x: 1, y: 0 },
    w: { x: -1, y: 0 },
    ne: { x: 1, y: -1 },
    nw: { x: -1, y: -1 },
    se: { x: 1, y: 1 },
    sw: { x: -1, y: 1 },
};
function positionResizeHandles(handles, width, height, rotationDegrees) {
    if (!Array.isArray(handles) || !handles.length) {
        return;
    }

    const numericWidth = Number.isFinite(width) ? Math.max(width, 0) : 0;
    const numericHeight = Number.isFinite(height) ? Math.max(height, 0) : 0;
    const rotation = Number.isFinite(rotationDegrees) ? rotationDegrees : 0;
    const radians = (rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const centerX = numericWidth / 2;
    const centerY = numericHeight / 2;

    handles.forEach((handle) => {
        if (!(handle instanceof HTMLElement)) {
            return;
        }

        const handleKey = handle.dataset?.handle || '';
        const anchor = RESIZE_HANDLE_ANCHORS[handleKey];

        const localX = anchor ? centerX * anchor.x : 0;
        const localY = anchor ? centerY * anchor.y : 0;

        const rotatedX = (localX * cos) - (localY * sin);
        const rotatedY = (localX * sin) + (localY * cos);

        const finalX = centerX + rotatedX;
        const finalY = centerY + rotatedY;

        handle.style.left = `${finalX}px`;
        handle.style.top = `${finalY}px`;
        handle.style.right = 'auto';
        handle.style.bottom = 'auto';
        handle.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
    });
}

function updatePreviewResizeHandlePositions(width, height, rotationDegrees) {
    positionResizeHandles(previewResizeHandles, width, height, rotationDegrees);
}

function updateOverlayLayerHandlePositions(entry, width, height, rotationDegrees) {
    if (!entry) {
        return;
    }

    if (!Array.isArray(entry.handles) || !entry.handles.length) {
        entry.handles = entry.layer
            ? Array.from(entry.layer.querySelectorAll('.preview-resize-handle'))
            : [];
    }

    positionResizeHandles(entry.handles, width, height, rotationDegrees);
}
const timelineImagePreloadCache = new Map();
const timelineVideoPreloadCache = new Map();
const timelineAudioPreloadCache = new Map();
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
const overlayPointerState = {
    pointerId: null,
    timelineItem: null,
    mode: null,
    handle: null,
    origin: null,
    layer: null,
    captureTarget: null,
    lastTransform: null,
};
let lastOverlayRenderTimestamp = null;
const OVERLAY_TIMELINE_WINDOW_SLACK_MS = 8;
const OVERLAY_EXIT_OVERSHOOT_ALLOWANCE_MS = OVERLAY_TIMELINE_WINDOW_SLACK_MS * 2;
// Extend the edge tolerance to cover a full frame (and a little more) so that
// overlays that end on the same frame as the primary layer stay resident long
// enough for the next frame to render. This prevents a brief clearing of the
// overlay stack that previously manifested as a flicker in the preview and
// exported video when stacked clips ended together.
const OVERLAY_TIMELINE_EDGE_TOLERANCE_MS = Math.max(
    OVERLAY_TIMELINE_WINDOW_SLACK_MS * 2,
    24,
);
// Ensure we keep overlays resident long enough to bridge frame boundaries when
// clips end together, even if playback stutters for a few frames. This value is
// reused by the preview renderer and export pipeline.
const OVERLAY_RECENT_HOLD_THRESHOLD_MS = Math.max(
    OVERLAY_TIMELINE_WINDOW_SLACK_MS * 8,
    OVERLAY_TIMELINE_EDGE_TOLERANCE_MS * 3,
    96,
);
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
const defaultPreviewPlaceholderText = previewPlaceholder ? previewPlaceholder.textContent : '';

function getPreviewViewportPointerScale() {
    if (!previewViewport) {
        return { scaleX: 1, scaleY: 1 };
    }

    const rect = typeof previewViewport.getBoundingClientRect === 'function'
        ? previewViewport.getBoundingClientRect()
        : { width: previewViewport.clientWidth, height: previewViewport.clientHeight };

    const logicalWidth = Math.max(1, previewViewport.clientWidth || 0);
    const logicalHeight = Math.max(1, previewViewport.clientHeight || 0);
    const rectWidth = Math.max(1, rect?.width || 0);
    const rectHeight = Math.max(1, rect?.height || 0);

    return {
        scaleX: logicalWidth / rectWidth,
        scaleY: logicalHeight / rectHeight,
    };
}

if (previewImage) {
    try {
        previewImage.decoding = 'async';
    } catch (error) {
        // Some browsers do not support setting the decoding hint.
    }
}

function formatBlurRadius(value, precision = PREVIEW_IMAGE_BLUR_PRECISION) {
    const safePrecision = Math.max(0, Math.min(6, Math.round(Number(precision) || 0)));
    if (safePrecision === 0) {
        return String(Math.round(value));
    }
    return value.toFixed(safePrecision).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

function applyImageBlurToPreview(blur) {
    if (!previewImage) {
        lastPreviewImageBlurValue = null;
        return;
    }

    const clamped = clampImageBlur(blur, {
        snapToInteger: false,
        precision: PREVIEW_IMAGE_BLUR_PRECISION,
    });

    if (lastPreviewImageBlurValue !== null
        && Math.abs(clamped - lastPreviewImageBlurValue) <= PREVIEW_IMAGE_BLUR_EPSILON) {
        return;
    }

    lastPreviewImageBlurValue = clamped;
    const blurValue = formatBlurRadius(clamped);

    previewImage.style.setProperty('--preview-image-blur', `${blurValue}px`);

    if (clamped > 0) {
        previewImage.style.filter = `blur(${blurValue}px)`;
    } else {
        previewImage.style.removeProperty('filter');
    }
}
const editorLayout = document.querySelector('.editor-layout');
const timelineCard = document.querySelector('.timeline-card');
let timelineHeightSyncFrame = null;

function syncTimelineCardHeight() {
    if (!editorLayout || !timelineCard) {
        return;
    }

    if (timelineHeightSyncFrame) {
        window.cancelAnimationFrame(timelineHeightSyncFrame);
        timelineHeightSyncFrame = null;
    }

    timelineHeightSyncFrame = window.requestAnimationFrame(() => {
        const layoutRect = editorLayout.getBoundingClientRect();
        const nextHeight = Math.round(layoutRect.height);

        if (!Number.isFinite(nextHeight) || nextHeight <= 0) {
            return;
        }

        const nextValue = `${nextHeight}px`;
        const currentValue = document.documentElement.style.getPropertyValue('--timeline-height');

        if (currentValue !== nextValue) {
            document.documentElement.style.setProperty('--timeline-height', nextValue);
        }
    });
}

if (typeof ResizeObserver === 'function' && editorLayout) {
    const timelineHeightObserver = new ResizeObserver(() => {
        syncTimelineCardHeight();
    });
    timelineHeightObserver.observe(editorLayout);
}

window.addEventListener('resize', syncTimelineCardHeight);
syncTimelineCardHeight();

const timelineTrack = document.getElementById('timeline-track');
const timelineLaneList = document.getElementById('timeline-lane-list');
const timelineEmptyState = document.getElementById('timeline-empty-state');
const playVideoButton = document.getElementById('play-video-button');
const timelineProgressLine = document.getElementById('timeline-progress-line');
const timelinePlayheadLine = document.getElementById('timeline-playhead-line');
const timelineSnapLine = document.getElementById('timeline-snap-line');
const timelineProgressInput = document.getElementById('timeline-progress');
const syncTimelineSliderFill = (rawValue) => {
    const safeValue = Number.isFinite(rawValue) ? Math.min(Math.max(rawValue, 0), 100) : 0;
    if (timelineProgressInput) {
        timelineProgressInput.style.setProperty('--progress-fill', `${safeValue}%`);
    }
    return safeValue / 100;
};
if (timelineProgressInput) {
    syncTimelineSliderFill(Number(timelineProgressInput.value));
    timelineProgressInput.addEventListener('input', () => {
        stopTimelinePlayback(true, false);
        const rawValue = Number(timelineProgressInput.value);
        const fraction = syncTimelineSliderFill(rawValue);
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
const imageBlurApplyStatus = document.getElementById('image-blur-apply-status');
const applyFeedbackStack = document.getElementById('apply-feedback-stack');
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
const canvasBlurExpandToggle = document.getElementById('canvas-background-blur-expand');
const canvasBlurExpandContainer = document.getElementById('canvas-background-blur-expand-container');
const imageBlurControls = document.getElementById('image-blur-controls');
const imageBlurInput = document.getElementById('image-blur');
const imageBlurValue = document.getElementById('image-blur-value');
const imageBlurApplyButton = document.getElementById('image-blur-apply');
const imageBlurAddKeyframeButton = document.getElementById('image-blur-add-keyframe');
const imageBlurKeyframeTrack = document.getElementById('image-blur-keyframe-track');
const imageBlurKeyframeStatus = document.getElementById('image-blur-keyframe-status');
const settingsTabs = Array.from(document.querySelectorAll('.settings-tab'));
const settingsSections = Array.from(document.querySelectorAll('.settings-section'));
const textTemplateCard = document.querySelector('.text-template-card');
const textEffectsPanel = document.getElementById('text-effects-panel');
const textEffectFontSelect = document.getElementById('text-effect-font');
const textEffectSizeInput = document.getElementById('text-effect-size');
const textEffectSizeValue = document.getElementById('text-effect-size-value');
const textEffectColorInput = document.getElementById('text-effect-color');
const textEffectLetterSpacingInput = document.getElementById('text-effect-letter-spacing');
const textEffectLetterSpacingValue = document.getElementById('text-effect-letter-spacing-value');
const textEffectTransformSelect = document.getElementById('text-effect-transform');
const textEffectAlignmentButtons = textEffectsPanel
    ? Array.from(textEffectsPanel.querySelectorAll('[data-text-align]'))
    : [];
const textStyleToolbarButtons = textEffectsPanel
    ? Array.from(textEffectsPanel.querySelectorAll('[data-text-style]'))
    : [];
const exportMirrorCanvas = document.createElement('canvas');
let exportMirrorContext = null;
try {
    exportMirrorContext = exportMirrorCanvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
    });
} catch (error) {
    exportMirrorContext = null;
}

if (!exportMirrorContext) {
    exportMirrorContext = exportMirrorCanvas.getContext('2d');
}
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

const optionSliderRegistry = new Map();

function getOptionSliderController(inputId) {
    if (!inputId) {
        return null;
    }
    return optionSliderRegistry.get(inputId) || null;
}

const CANVAS_BACKGROUND_MODES = new Set(['none', 'clip', 'custom']);
const DEFAULT_CANVAS_BLUR = 18;
const CANVAS_BLUR_MIN = 0;
const CANVAS_BLUR_MAX = 40;
const DEFAULT_IMAGE_BLUR = 0;
const IMAGE_BLUR_MIN = 0;
const IMAGE_BLUR_MAX = 40;
const DEFAULT_CANVAS_BACKDROP_SCALE = 1.08;
const timelineCanvasCustomImageUrls = new WeakMap();

applyImageBlurToPreview(0);

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
let imageBlurApplyStatusTimer = 0;
let applyFeedbackTimeouts = new WeakMap();

const APPLY_FEEDBACK_TONES = ['success', 'info', 'warning'];
const APPLY_FEEDBACK_TIMEOUT_MS = 4400;

function sanitizeApplyFeedbackTone(tone) {
    if (APPLY_FEEDBACK_TONES.includes(tone)) {
        return tone;
    }
    return 'info';
}

function showApplyFeedback(message, options = {}) {
    if (!applyFeedbackStack || !message) {
        return null;
    }

    const tone = sanitizeApplyFeedbackTone(options.tone);
    const toast = document.createElement('div');
    toast.className = `apply-feedback-toast apply-feedback-toast--${tone}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const icon = document.createElement('span');
    icon.className = 'apply-feedback-toast__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = tone === 'success'
        ? '✓'
        : tone === 'warning'
            ? '!'
            : 'ℹ';

    const body = document.createElement('div');
    body.className = 'apply-feedback-toast__body';

    const contextLabel = document.createElement('span');
    contextLabel.className = 'apply-feedback-toast__context';
    contextLabel.textContent = options.contextLabel || 'Action applied';

    const messageEl = document.createElement('div');
    messageEl.className = 'apply-feedback-toast__message';
    messageEl.textContent = message;

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'apply-feedback-toast__close';
    closeButton.setAttribute('aria-label', 'Dismiss notification');
    closeButton.innerHTML = '&times;';

    body.append(contextLabel, messageEl);
    toast.append(icon, body, closeButton);

    const scheduleRemoval = (delayMs) => {
        if (!toast.isConnected) {
            return;
        }

        if (applyFeedbackTimeouts.has(toast)) {
            window.clearTimeout(applyFeedbackTimeouts.get(toast));
        }

        const timer = window.setTimeout(() => {
            toast.classList.add('is-leaving');
            const removeTimer = window.setTimeout(() => {
                toast.remove();
                applyFeedbackTimeouts.delete(toast);
            }, 240);
            applyFeedbackTimeouts.set(toast, removeTimer);
        }, Math.max(0, delayMs));

        applyFeedbackTimeouts.set(toast, timer);
    };

    closeButton.addEventListener('click', () => {
        scheduleRemoval(0);
    });

    applyFeedbackStack.appendChild(toast);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toast.classList.add('is-visible');
        });
    });

    const timeoutMs = Number.isFinite(options.timeoutMs)
        ? options.timeoutMs
        : APPLY_FEEDBACK_TIMEOUT_MS;
    scheduleRemoval(timeoutMs);

    return toast;
}

window.showApplyFeedback = showApplyFeedback;

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

        if (this.slider && this.slider.id) {
            optionSliderRegistry.set(this.slider.id, this);
        }
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

    setValueByOption(optionValue, { force = false } = {}) {
        if (this.options.length === 0) {
            return;
        }

        const index = this.options.findIndex((option) => option.value === optionValue);
        const targetIndex = index === -1 ? 0 : index;
        this.setIndex(targetIndex, { force });
    }

    getCurrentOptionValue() {
        const option = this.options[this.currentIndex];
        return option ? option.value : null;
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

const DEFAULT_AUDIO_VOLUME_PERCENT = 100;
const AUDIO_VOLUME_MIN_PERCENT = 0;
const AUDIO_VOLUME_MAX_PERCENT = 150;
const AUDIO_FADE_MAX_SECONDS = 5;
const TIMELINE_AUDIO_SUMMARY_CLASS = 'timeline-item__audio-summary';

function isVideoTimelineEntry(item) {
    if (!item) {
        return false;
    }
    if (typeof isVideoTimelineItem === 'function') {
        return Boolean(isVideoTimelineItem(item));
    }
    const fileType = item.dataset?.fileType || '';
    return fileType.startsWith('video/');
}

function isAudioTimelineEntry(item) {
    if (!item) {
        return false;
    }
    if (typeof isAudioTimelineItem === 'function') {
        return Boolean(isAudioTimelineItem(item));
    }
    const fileType = item.dataset?.fileType || '';
    return fileType.startsWith('audio/');
}

function supportsTimelineItemAudio(item) {
    return isVideoTimelineEntry(item) || isAudioTimelineEntry(item);
}

function getTimelineItemAudioSummaryElement(timelineItem) {
    if (!timelineItem) {
        return null;
    }
    return timelineItem.querySelector(`.${TIMELINE_AUDIO_SUMMARY_CLASS}`) || null;
}

function ensureTimelineItemAudioSummaryElement(timelineItem) {
    if (!timelineItem) {
        return null;
    }
    const existing = getTimelineItemAudioSummaryElement(timelineItem);
    if (existing) {
        return existing;
    }
    const summary = document.createElement('span');
    summary.className = TIMELINE_AUDIO_SUMMARY_CLASS;
    summary.setAttribute('aria-live', 'polite');
    const removeButton = timelineItem.querySelector('.timeline-item-remove');
    if (removeButton && removeButton.parentNode === timelineItem) {
        timelineItem.insertBefore(summary, removeButton);
    } else {
        timelineItem.appendChild(summary);
    }
    return summary;
}

function removeTimelineItemAudioSummary(timelineItem) {
    const summary = getTimelineItemAudioSummaryElement(timelineItem);
    if (summary && summary.parentNode) {
        summary.parentNode.removeChild(summary);
    }
    if (timelineItem?.dataset) {
        delete timelineItem.dataset.audioSummary;
    }
    if (timelineItem?.hasAttribute?.('aria-label')) {
        const displayName = timelineItem.dataset?.displayName || '';
        if (displayName) {
            timelineItem.setAttribute('aria-label', displayName);
        } else {
            timelineItem.removeAttribute('aria-label');
        }
    }
    if (timelineItem) {
        timelineItem.removeAttribute?.('title');
    }
}

function updateTimelineAudioSettingsSummary(timelineItem, options = {}) {
    if (!timelineItem) {
        return;
    }

    if (!supportsTimelineItemAudio(timelineItem)) {
        removeTimelineItemAudioSummary(timelineItem);
        return;
    }

    const settings = options?.settings && typeof options.settings === 'object'
        ? options.settings
        : getTimelineItemAudioSettings(timelineItem);
    const summaryElement = ensureTimelineItemAudioSummaryElement(timelineItem);
    if (!summaryElement) {
        return;
    }

    const volumeDisplay = formatMasterVolumeDisplay(settings.volumePercent);
    const summaryParts = [];
    if (volumeDisplay === 'Muted') {
        summaryParts.push('Muted');
    } else {
        summaryParts.push(`Volume ${volumeDisplay}`);
    }
    if (settings.fadeInMs > 0) {
        summaryParts.push(`Fade in ${formatAudioFadeDisplay(settings.fadeInMs / 1000)}`);
    }
    if (settings.fadeOutMs > 0) {
        summaryParts.push(`Fade out ${formatAudioFadeDisplay(settings.fadeOutMs / 1000)}`);
    }

    const summaryText = summaryParts.join(' • ');
    summaryElement.textContent = summaryText;
    summaryElement.hidden = summaryText.length === 0;
    timelineItem.dataset.audioSummary = summaryText;

    const displayName = (timelineItem.dataset?.displayName || '').trim();
    const labelParts = [];
    if (displayName) {
        labelParts.push(displayName);
    }
    if (summaryText) {
        labelParts.push(summaryText);
    }
    if (labelParts.length) {
        timelineItem.setAttribute('aria-label', labelParts.join(': '));
    }
    timelineItem.title = summaryText || displayName || '';
}

function computeTimelineAudioMix(entries = [], options = {}) {
    const fallbackItem = options?.fallbackItem || null;
    const resolvedEntries = Array.isArray(entries) ? entries : [];
    const layers = [];
    const seenItems = new Set();

    const addEntry = (entry) => {
        if (!entry) {
            return;
        }
        const item = entry.item || entry;
        if (!item || seenItems.has(item) || !supportsTimelineItemAudio(item)) {
            return;
        }
        seenItems.add(item);
        const laneValue = entry.laneIndex ?? item?.dataset?.laneIndex;
        const laneIndex = typeof resolveLaneIndex === 'function'
            ? resolveLaneIndex(laneValue)
            : Number.isFinite(Number(laneValue))
                ? Number(laneValue)
                : 0;
        const settings = getTimelineItemAudioSettings(item);
        layers.push({
            item,
            laneIndex,
            settings,
            baseVolume: clampVolume(settings.volumePercent / 100),
        });
    };

    resolvedEntries.forEach(addEntry);

    if (fallbackItem && !seenItems.has(fallbackItem) && supportsTimelineItemAudio(fallbackItem)) {
        addEntry({ item: fallbackItem });
    }

    if (!layers.length) {
        return {
            layers: [],
            totalGain: 0,
            gainsByItem: new Map(),
        };
    }

    layers.sort((a, b) => a.laneIndex - b.laneIndex);
    const highestLaneIndex = layers[layers.length - 1].laneIndex;
    layers.forEach((layer) => {
        layer.isTopLayer = layer.laneIndex === highestLaneIndex;
        layer.gain = layer.baseVolume;
    });

    const gainsByItem = new Map();
    layers.forEach((layer) => {
        gainsByItem.set(layer.item, layer.gain);
    });

    return {
        layers,
        totalGain: layers.reduce((total, layer) => total + layer.gain, 0),
        gainsByItem,
    };
}

function applyAudioMixToPreview(mix, context = {}) {
    if (!mix || typeof mix !== 'object') {
        return null;
    }

    const gainsByItem = mix.gainsByItem instanceof Map ? mix.gainsByItem : new Map();
    const activeItem = context?.activeItem !== undefined
        ? context.activeItem
        : (typeof activeTimelineItem !== 'undefined' ? activeTimelineItem : null);

    if (previewVideo && activeItem && isVideoTimelineEntry(activeItem)) {
        const settings = getTimelineItemAudioSettings(activeItem);
        const mixGain = gainsByItem.has(activeItem) ? gainsByItem.get(activeItem) : null;
        applyMasterVolumeToPreview(settings.volumePercent, {
            mediaElement: previewVideo,
            mixGain,
        });
    }

    const overlayItems = new Set();
    if (Array.isArray(context?.overlayItems)) {
        context.overlayItems.filter(Boolean).forEach((item) => overlayItems.add(item));
    }
    if (context?.overlayItem) {
        overlayItems.add(context.overlayItem);
    } else if (!overlayItems.size && typeof activeAudioOverlayEntry !== 'undefined' && activeAudioOverlayEntry?.item) {
        overlayItems.add(activeAudioOverlayEntry.item);
    }

    overlayItems.forEach((overlayItem) => {
        if (!overlayItem || !isAudioTimelineEntry(overlayItem)) {
            return;
        }
        const mediaElement = typeof getOverlayAudioElementForItem === 'function'
            ? getOverlayAudioElementForItem(overlayItem)
            : null;
        const targetElement = mediaElement || (overlayItem === (activeAudioOverlayEntry?.item) ? previewAudio : null);
        if (!targetElement) {
            return;
        }
        const settings = getTimelineItemAudioSettings(overlayItem);
        const mixGain = gainsByItem.has(overlayItem) ? gainsByItem.get(overlayItem) : null;
        applyMasterVolumeToPreview(settings.volumePercent, {
            mediaElement: targetElement,
            mixGain,
        });
    });

    return mix;
}

function refreshPreviewAudioMix(options = {}) {
    const activeItem = options?.activeItem !== undefined
        ? options.activeItem
        : (typeof activeTimelineItem !== 'undefined' ? activeTimelineItem : null);
    const overlayItem = options?.overlayItem !== undefined
        ? options.overlayItem
        : (typeof activeAudioOverlayEntry !== 'undefined' ? activeAudioOverlayEntry?.item || null : null);
    const overlayItems = Array.isArray(options?.overlayItems)
        ? options.overlayItems.filter(Boolean)
        : [];

    let candidateEntries = Array.isArray(options?.entries)
        ? options.entries
        : null;

    if (!candidateEntries && activeItem && typeof getOverlayEntriesForTimelineItem === 'function') {
        const laneCache = (typeof getTimelineLaneEntryCache === 'function')
            ? getTimelineLaneEntryCache()
            : null;
        candidateEntries = getOverlayEntriesForTimelineItem(activeItem, null, laneCache);
    }

    const mix = computeTimelineAudioMix(candidateEntries || [], { fallbackItem: activeItem });
    applyAudioMixToPreview(mix, { activeItem, overlayItem, overlayItems });
    return mix;
}

function clampVolume(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.min(
        Math.max(numeric, 0),
        AUDIO_VOLUME_MAX_PERCENT / 100,
    );
}

const mediaEnvelopeStates = new WeakMap();
let sharedPreviewAudioContext = null;
let sharedPreviewAudioDestination = null;

function getOrCreatePreviewAudioContext() {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
        return null;
    }

    if (sharedPreviewAudioContext && sharedPreviewAudioContext.state === 'closed') {
        sharedPreviewAudioContext = null;
        sharedPreviewAudioDestination = null;
    }

    if (!sharedPreviewAudioContext) {
        try {
            sharedPreviewAudioContext = new AudioContextConstructor();
        } catch (error) {
            sharedPreviewAudioContext = null;
            return null;
        }
    }

    return sharedPreviewAudioContext;
}

function getOrCreatePreviewAudioDestination() {
    const audioContext = getOrCreatePreviewAudioContext();
    if (!audioContext) {
        sharedPreviewAudioDestination = null;
        return null;
    }

    if (sharedPreviewAudioDestination && sharedPreviewAudioDestination.context !== audioContext) {
        sharedPreviewAudioDestination = null;
    }

    if (!sharedPreviewAudioDestination) {
        try {
            sharedPreviewAudioDestination = audioContext.createMediaStreamDestination();
        } catch (error) {
            sharedPreviewAudioDestination = null;
            return null;
        }
    }

    return sharedPreviewAudioDestination;
}

function disconnectMediaEnvelopeAudio(state) {
    if (!state) {
        return;
    }
    if (state.gainNode) {
        try {
            state.gainNode.disconnect();
        } catch (error) {
            // Ignore disconnect errors when cleaning up audio routing.
        }
    }
    if (state.envelopeNode) {
        try {
            state.envelopeNode.disconnect();
        } catch (error) {
            // Ignore disconnect errors when cleaning up audio routing.
        }
    }
    if (state.sourceNode) {
        try {
            state.sourceNode.disconnect();
        } catch (error) {
            // Ignore disconnect errors when cleaning up audio routing.
        }
    }
    if (state.previewDestination && state.gainNode) {
        try {
            state.gainNode.disconnect(state.previewDestination);
        } catch (error) {
            // Ignore disconnect errors when cleaning up audio routing.
        }
    }
    state.gainNode = null;
    state.envelopeNode = null;
    state.sourceNode = null;
    state.audioContext = null;
    state.previewDestination = null;
}

function getMediaEnvelopeState(mediaElement) {
    if (!mediaElement) {
        return null;
    }
    if (!mediaEnvelopeStates.has(mediaElement)) {
        mediaEnvelopeStates.set(mediaElement, {
            fadeInFrameId: 0,
            fadeOutFrameId: 0,
            fadeOutTimeoutId: 0,
            baseVolume: clampVolume(DEFAULT_AUDIO_VOLUME_PERCENT / 100),
            audioContext: null,
            sourceNode: null,
            gainNode: null,
            envelopeNode: null,
            previewDestination: null,
        });
    }
    const state = mediaEnvelopeStates.get(mediaElement);
    if (state?.audioContext && state.audioContext.state === 'closed') {
        disconnectMediaEnvelopeAudio(state);
    }
    return state;
}

function ensureMediaElementGainNode(mediaElement) {
    if (!mediaElement) {
        return null;
    }

    const state = getMediaEnvelopeState(mediaElement);
    if (!state) {
        return null;
    }

    const audioContext = getOrCreatePreviewAudioContext();
    if (!audioContext) {
        disconnectMediaEnvelopeAudio(state);
        return null;
    }

    if (state.audioContext && state.audioContext !== audioContext) {
        disconnectMediaEnvelopeAudio(state);
    }

    if (!state.sourceNode || !state.gainNode || !state.envelopeNode) {
        disconnectMediaEnvelopeAudio(state);
        try {
            const sourceNode = audioContext.createMediaElementSource(mediaElement);
            const envelopeNode = audioContext.createGain();
            envelopeNode.gain.value = 1;
            const gainNode = audioContext.createGain();
            gainNode.gain.value = clampVolume(state.baseVolume);
            sourceNode.connect(envelopeNode);
            envelopeNode.connect(gainNode);
            gainNode.connect(audioContext.destination);
            const previewDestination = getOrCreatePreviewAudioDestination();
            if (previewDestination) {
                try {
                    gainNode.connect(previewDestination);
                    state.previewDestination = previewDestination;
                } catch (error) {
                    // Ignore connection errors to preview export destination.
                }
            }
            state.audioContext = audioContext;
            state.sourceNode = sourceNode;
            state.envelopeNode = envelopeNode;
            state.gainNode = gainNode;
        } catch (error) {
            disconnectMediaEnvelopeAudio(state);
            return null;
        }
    }

    const previewDestination = getOrCreatePreviewAudioDestination();
    if (previewDestination && state.previewDestination !== previewDestination && state.gainNode) {
        try {
            state.gainNode.connect(previewDestination);
            state.previewDestination = previewDestination;
        } catch (error) {
            // Ignore connection errors when reusing preview export destination.
        }
    }

    if (state.audioContext && state.audioContext.state === 'suspended') {
        state.audioContext.resume().catch(() => {});
    }

    return state.gainNode;
}

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
    const supportsAudio = isVideoTimelineItem(timelineItem) || isAudioTimelineItem(timelineItem);
    if (!supportsAudio) {
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

function normalizeTimelineAudioSettings(timelineItem, settings) {
    const normalized = {};
    if (!timelineItem || !settings || typeof settings !== 'object') {
        return normalized;
    }

    if (Object.prototype.hasOwnProperty.call(settings, 'volumePercent')) {
        normalized.volumePercent = clampVolumePercent(settings.volumePercent);
    }

    const includesFadeIn = Object.prototype.hasOwnProperty.call(settings, 'fadeInMs');
    const includesFadeOut = Object.prototype.hasOwnProperty.call(settings, 'fadeOutMs');

    if (!includesFadeIn && !includesFadeOut) {
        return normalized;
    }

    const currentSettings = getTimelineItemAudioSettings(timelineItem);
    let nextFadeIn = includesFadeIn
        ? sanitizeFadeMilliseconds(settings.fadeInMs)
        : currentSettings.fadeInMs;
    let nextFadeOut = includesFadeOut
        ? sanitizeFadeMilliseconds(settings.fadeOutMs)
        : currentSettings.fadeOutMs;

    const clipDurationMs = typeof getTimelineItemPlaybackDuration === 'function'
        ? Math.max(0, Math.round(getTimelineItemPlaybackDuration(timelineItem)))
        : null;

    if (clipDurationMs !== null) {
        if (clipDurationMs <= 0) {
            nextFadeIn = 0;
            nextFadeOut = 0;
        } else {
            nextFadeIn = Math.min(nextFadeIn, clipDurationMs);
            nextFadeOut = Math.min(nextFadeOut, clipDurationMs);

            const totalFade = nextFadeIn + nextFadeOut;
            if (totalFade > clipDurationMs) {
                const adjustingFadeInOnly = includesFadeIn && !includesFadeOut;
                const adjustingFadeOutOnly = includesFadeOut && !includesFadeIn;

                if (adjustingFadeInOnly) {
                    nextFadeIn = Math.max(0, clipDurationMs - nextFadeOut);
                } else if (adjustingFadeOutOnly) {
                    nextFadeOut = Math.max(0, clipDurationMs - nextFadeIn);
                } else if (totalFade > 0) {
                    const scale = clipDurationMs / totalFade;
                    nextFadeIn = Math.round(nextFadeIn * scale);
                    nextFadeOut = Math.round(nextFadeOut * scale);
                } else {
                    nextFadeIn = 0;
                    nextFadeOut = 0;
                }
            }
        }
    }

    normalized.fadeInMs = sanitizeFadeMilliseconds(nextFadeIn);
    normalized.fadeOutMs = sanitizeFadeMilliseconds(nextFadeOut);
    return normalized;
}

function persistTimelineItemAudioSettings(timelineItem, settings) {
    const supportsAudio = isVideoTimelineItem(timelineItem) || isAudioTimelineItem(timelineItem);
    if (!supportsAudio || !timelineItem?.dataset || !settings) {
        return null;
    }

    const normalizedSettings = normalizeTimelineAudioSettings(timelineItem, settings);
    const persisted = {};
    let touched = false;

    if (Object.prototype.hasOwnProperty.call(normalizedSettings, 'volumePercent')) {
        const percent = normalizedSettings.volumePercent;
        if (percent === DEFAULT_AUDIO_VOLUME_PERCENT) {
            delete timelineItem.dataset.audioVolumePercent;
        } else {
            timelineItem.dataset.audioVolumePercent = String(percent);
        }
        persisted.volumePercent = percent;
        touched = true;
    }

    if (Object.prototype.hasOwnProperty.call(normalizedSettings, 'fadeInMs')) {
        const milliseconds = normalizedSettings.fadeInMs;
        if (milliseconds > 0) {
            timelineItem.dataset.audioFadeInMs = String(milliseconds);
        } else {
            delete timelineItem.dataset.audioFadeInMs;
        }
        persisted.fadeInMs = milliseconds;
        touched = true;
    }

    if (Object.prototype.hasOwnProperty.call(normalizedSettings, 'fadeOutMs')) {
        const milliseconds = normalizedSettings.fadeOutMs;
        if (milliseconds > 0) {
            timelineItem.dataset.audioFadeOutMs = String(milliseconds);
        } else {
            delete timelineItem.dataset.audioFadeOutMs;
        }
        persisted.fadeOutMs = milliseconds;
        touched = true;
    }

    if (typeof syncTimelineItemVolumeControl === 'function') {
        syncTimelineItemVolumeControl(timelineItem);
    }
    updateTimelineAudioSettingsSummary(timelineItem);
    if (typeof refreshPreviewAudioMix === 'function') {
        refreshPreviewAudioMix();
    }

    if (touched && typeof markExportPlaybackContextDirty === 'function') {
        markExportPlaybackContextDirty({ refreshSummary: true });
    }

    return touched ? persisted : null;
}

function persistActiveTimelineAudioSettings(partialSettings) {
    if (!activeTimelineItem) {
        return null;
    }
    return persistTimelineItemAudioSettings(activeTimelineItem, partialSettings);
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
    const {
        disabled = false,
        disabledLabel = 'Media only',
        disabledAriaText = 'Audio controls available for media clips',
    } = options;
    if (masterVolumeValue) {
        masterVolumeValue.textContent = disabled
            ? disabledLabel
            : formatMasterVolumeDisplay(percent);
    }
    if (masterVolumeInput) {
        masterVolumeInput.setAttribute('aria-valuemin', String(AUDIO_VOLUME_MIN_PERCENT));
        masterVolumeInput.setAttribute('aria-valuemax', String(AUDIO_VOLUME_MAX_PERCENT));
        if (disabled) {
            masterVolumeInput.setAttribute('aria-valuenow', '0');
            masterVolumeInput.setAttribute(
                'aria-valuetext',
                disabledAriaText,
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

function applyMasterVolumeToPreview(volumePercent, options = {}) {
    const {
        mediaElement: target = previewVideo,
        mixGain = null,
    } = options;
    if (!target) {
        return;
    }
    const percent = clampVolumePercent(volumePercent);
    const mixGainValue = Number.isFinite(mixGain) ? clampVolume(mixGain) : null;
    const normalized = mixGainValue !== null
        ? mixGainValue
        : clampVolume(percent / 100);
    const state = getMediaEnvelopeState(target);
    if (state) {
        state.baseVolume = normalized;
    }
    target.muted = false;

    const gainNode = ensureMediaElementGainNode(target);
    if (gainNode && (state?.audioContext || gainNode.context)) {
        try {
            const audioContext = state?.audioContext || gainNode.context;
            const now = audioContext.currentTime;
            const gainParam = gainNode.gain;
            gainParam.cancelScheduledValues(now);
            gainParam.setValueAtTime(normalized, now);
            target.volume = 1;
            return;
        } catch (error) {
            disconnectMediaEnvelopeAudio(state);
        }
    }

    target.volume = normalized;
}

function cancelPreviewAudioEnvelope(options = {}) {
    const { restoreVolume = false } = options;
    const target = options.mediaElement || previewVideo;
    const state = getMediaEnvelopeState(target);
    if (!state) {
        return;
    }
    if (state.fadeInFrameId) {
        window.cancelAnimationFrame(state.fadeInFrameId);
        state.fadeInFrameId = 0;
    }
    if (state.fadeOutFrameId) {
        window.cancelAnimationFrame(state.fadeOutFrameId);
        state.fadeOutFrameId = 0;
    }
    if (state.fadeOutTimeoutId) {
        window.clearTimeout(state.fadeOutTimeoutId);
        state.fadeOutTimeoutId = 0;
    }
    const volumeNode = state.gainNode;
    const envelopeNode = state.envelopeNode;
    const audioNode = envelopeNode || volumeNode;
    if (audioNode && (state.audioContext || audioNode.context)) {
        try {
            const audioContext = state.audioContext || audioNode.context;
            const now = audioContext.currentTime;
            audioNode.gain.cancelScheduledValues(now);
            if (envelopeNode) {
                audioNode.gain.setValueAtTime(1, now);
                if (restoreVolume && volumeNode) {
                    volumeNode.gain.cancelScheduledValues(now);
                    volumeNode.gain.setValueAtTime(clampVolume(state.baseVolume), now);
                }
                } else if (restoreVolume) {
                audioNode.gain.setValueAtTime(clampVolume(state.baseVolume), now);
            }
            if (restoreVolume && target) {
                target.volume = 1;
            }
            return;
        } catch (error) {
            disconnectMediaEnvelopeAudio(state);
        }
    }

    if (restoreVolume && target) {
        target.volume = clampVolume(state.baseVolume);
    } else if (target && envelopeNode) {
        target.volume = 1;
    }
}

function applyPreviewAudioEnvelope(settings, clipDurationMs, options = {}) {
    const {
        mediaElement: target = previewVideo,
        mixGain = null,
        clipOffsetMs: rawClipOffsetMs = 0,
        clipTotalDurationMs: rawTotalDurationMs = null,
    } = options;
    if (!target) {
        return;
    }

    cancelPreviewAudioEnvelope({ mediaElement: target });

    const normalizedSettings = settings || getDefaultAudioSettings();
    const volumePercent = clampVolumePercent(normalizedSettings.volumePercent);
    const mixGainValue = Number.isFinite(mixGain) ? clampVolume(mixGain) : null;
    const baseVolume = mixGainValue !== null
        ? mixGainValue
        : clampVolume(volumePercent / 100);
    const fadeInMs = sanitizeFadeMilliseconds(normalizedSettings.fadeInMs);
    const fadeOutMs = sanitizeFadeMilliseconds(normalizedSettings.fadeOutMs);
    const playbackMs = Math.max(0, Math.round(Number(clipDurationMs) || 0));
    const clipOffsetMs = Math.max(0, Math.round(Number(rawClipOffsetMs) || 0));
    const totalClipMs = Number.isFinite(rawTotalDurationMs)
        ? Math.max(clipOffsetMs, Math.round(rawTotalDurationMs))
        : clipOffsetMs + playbackMs;
    const playbackEndMs = clipOffsetMs + playbackMs;
    const fadeOutStartMs = totalClipMs > 0
        ? Math.max(0, totalClipMs - fadeOutMs)
        : 0;
    const fadeInLimitMs = (fadeOutMs > 0 && totalClipMs > 0 && fadeOutStartMs > clipOffsetMs)
        ? Math.max(0, fadeOutStartMs - clipOffsetMs)
        : playbackMs;
    const fadeInRemainingMs = fadeInMs > clipOffsetMs
        ? Math.max(
            0,
            Math.min(
                fadeInMs - clipOffsetMs,
                playbackMs,
                fadeInLimitMs,
            ),
        )
        : 0;
    const fadeOutDelayMs = fadeOutMs > 0 && totalClipMs > 0 && playbackEndMs > fadeOutStartMs
        ? Math.max(0, fadeOutStartMs - clipOffsetMs)
        : 0;
    const fadeOutElapsedMs = fadeOutMs > 0 && totalClipMs > 0 && clipOffsetMs > fadeOutStartMs
        ? clipOffsetMs - fadeOutStartMs
        : 0;
    const fadeOutDurationMs = (() => {
        if (fadeOutMs <= 0 || totalClipMs <= 0 || playbackEndMs <= fadeOutStartMs) {
            return 0;
        }
        const remainingFadeMs = Math.max(0, fadeOutMs - fadeOutElapsedMs);
        const remainingPlaybackMs = Math.max(0, playbackMs - fadeOutDelayMs);
        return Math.max(0, Math.min(remainingFadeMs, remainingPlaybackMs));
    })();

    const state = getMediaEnvelopeState(target);

    if (state) {
        state.baseVolume = baseVolume;
    }
    target.muted = false;

    const gainNode = ensureMediaElementGainNode(target);
    const envelopeNode = state?.envelopeNode || null;
    const envelopeTarget = envelopeNode || gainNode;

    if (envelopeTarget && (state?.audioContext || envelopeTarget.context)) {
        try {
            const audioContext = state?.audioContext || envelopeTarget.context;
            const now = audioContext.currentTime;
            const gainParam = envelopeTarget.gain;
            const steadyValue = envelopeNode ? 1 : baseVolume;

            const computeInitialGain = () => {
                let value = steadyValue;
                if (fadeInMs > 0) {
                    if (clipOffsetMs <= 0) {
                        value = 0;
                    } else if (clipOffsetMs < fadeInMs) {
                        value = steadyValue * clampProgress(clipOffsetMs / fadeInMs);
                    }
                }
                if (fadeOutMs > 0 && totalClipMs > 0) {
                    if (clipOffsetMs >= totalClipMs) {
                        value = 0;
                    } else if (clipOffsetMs >= fadeOutStartMs) {
                        const fadeProgress = clampProgress(
                            fadeOutMs > 0 ? (clipOffsetMs - fadeOutStartMs) / fadeOutMs : 1,
                        );
                        value = Math.min(value, steadyValue * (1 - fadeProgress));
                    }
                }
                return clampVolume(value);
            };

            if (gainNode && gainNode !== envelopeTarget) {
                const baseParam = gainNode.gain;
                baseParam.cancelScheduledValues(now);
                baseParam.setValueAtTime(baseVolume, now);
            }

            gainParam.cancelScheduledValues(now);

            if (baseVolume <= 0) {
                gainParam.setValueAtTime(0, now);
                target.volume = 1;
                return;
            }

            const initialGain = computeInitialGain();
            gainParam.setValueAtTime(initialGain, now);

            if (fadeInRemainingMs > 0) {
                const fadeInEndTime = now + (fadeInRemainingMs / 1000);
                gainParam.linearRampToValueAtTime(steadyValue, fadeInEndTime);
            } else if (initialGain >= steadyValue && fadeOutDurationMs <= 0) {
                gainParam.setValueAtTime(steadyValue, now);
            }

            if (fadeOutDurationMs > 0) {
                const fadeOutStartTime = now + (fadeOutDelayMs / 1000);
                if (fadeOutDelayMs > 0) {
                    gainParam.setValueAtTime(steadyValue, fadeOutStartTime);
                }
                const fadeOutEndTime = fadeOutStartTime + (fadeOutDurationMs / 1000);
                gainParam.linearRampToValueAtTime(0, fadeOutEndTime);
            } else if (fadeOutMs > 0 && totalClipMs > 0 && clipOffsetMs >= totalClipMs) {
                gainParam.setValueAtTime(0, now);
            }

            target.volume = 1;
            return;
        } catch (error) {
            disconnectMediaEnvelopeAudio(state);
        }
    }

    if (baseVolume <= 0) {
        target.volume = 0;
        return;
    }

    const steadyVolume = clampVolume(baseVolume);
    const initialVolume = (() => {
        let value = steadyVolume;
        if (fadeInMs > 0) {
            if (clipOffsetMs <= 0) {
                value = 0;
            } else if (clipOffsetMs < fadeInMs) {
                value = steadyVolume * clampProgress(clipOffsetMs / fadeInMs);
            }
        }
        if (fadeOutMs > 0 && totalClipMs > 0) {
            if (clipOffsetMs >= totalClipMs) {
                value = 0;
            } else if (clipOffsetMs >= fadeOutStartMs) {
                const fadeProgress = clampProgress(
                    fadeOutMs > 0 ? (clipOffsetMs - fadeOutStartMs) / fadeOutMs : 1,
                );
                value = Math.min(value, steadyVolume * (1 - fadeProgress));
            }
        }
        return clampVolume(value);
    })();

    target.volume = initialVolume;

    if (fadeInRemainingMs > 0 && state) {
        const fadeInStart = performance.now();
        const startVolume = target.volume;
        const targetVolume = steadyVolume;
        const stepFadeIn = () => {
            const elapsed = performance.now() - fadeInStart;
            const progress = Math.min(Math.max(elapsed / fadeInRemainingMs, 0), 1);
            const nextVolume = clampVolume(startVolume + ((targetVolume - startVolume) * progress));
            target.volume = nextVolume;
            if (progress < 1) {
                state.fadeInFrameId = window.requestAnimationFrame(stepFadeIn);
            }
        };
        state.fadeInFrameId = window.requestAnimationFrame(stepFadeIn);
    }

    if (fadeOutDurationMs > 0 && state) {
        state.fadeOutTimeoutId = window.setTimeout(() => {
            const fadeOutStart = performance.now();
            const startVolume = target.volume;
            const stepFadeOut = () => {
                const elapsed = performance.now() - fadeOutStart;
                const progress = Math.min(Math.max(elapsed / fadeOutDurationMs, 0), 1);
                const nextVolume = clampVolume(startVolume * (1 - progress));
                target.volume = nextVolume;
                if (progress < 1) {
                    state.fadeOutFrameId = window.requestAnimationFrame(stepFadeOut);
                }
            };
            state.fadeOutFrameId = window.requestAnimationFrame(stepFadeOut);
        }, fadeOutDelayMs);
    } else if (fadeOutMs > 0 && totalClipMs > 0 && clipOffsetMs >= totalClipMs) {
        target.volume = 0;
    }
}

function ensureTimelineAudioDefaults(timelineItem) {
    const supportsAudio = isVideoTimelineItem(timelineItem) || isAudioTimelineItem(timelineItem);
    if (!supportsAudio || !timelineItem?.dataset) {
        if (timelineItem) {
            updateTimelineAudioSettingsSummary(timelineItem);
        }
        return;
    }
    if (!timelineItem.dataset.audioVolumePercent) {
        timelineItem.dataset.audioVolumePercent = String(DEFAULT_AUDIO_VOLUME_PERCENT);
    }
    updateTimelineAudioSettingsSummary(timelineItem);
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
        let persisted = null;
        if (input === audioFadeInInput) {
            persisted = persistActiveTimelineAudioSettings({ fadeInMs: milliseconds });
        } else if (input === audioFadeOutInput) {
            persisted = persistActiveTimelineAudioSettings({ fadeOutMs: milliseconds });
        }

        const targetTimelineItem = typeof activeTimelineItem !== 'undefined'
            ? activeTimelineItem
            : null;

        if (targetTimelineItem) {
            if (persisted) {
                syncAudioControlsToTimelineItem(targetTimelineItem);
            } else {
                updateTimelineAudioSettingsSummary(targetTimelineItem);
            }
        }
    };

    input.addEventListener('input', handleUpdate);
    input.addEventListener('change', handleUpdate);
});

function syncAudioControlsToTimelineItem(timelineItem) {
    const isVideo = isVideoTimelineItem(timelineItem);
    const isAudio = isAudioTimelineItem(timelineItem);
    const supportsAudio = isVideo || isAudio;
    const settings = supportsAudio
        ? getTimelineItemAudioSettings(timelineItem)
        : getDefaultAudioSettings();

    if (timelineItem && typeof syncTimelineItemVolumeControl === 'function') {
        syncTimelineItemVolumeControl(timelineItem);
    }

    if (masterVolumeInput) {
        masterVolumeInput.disabled = !supportsAudio;
        if (supportsAudio) {
            masterVolumeInput.removeAttribute('aria-disabled');
        } else {
            masterVolumeInput.setAttribute('aria-disabled', 'true');
        }
        masterVolumeInput.value = String(settings.volumePercent);
        updateMasterVolumeReadout(settings.volumePercent, {
            disabled: !supportsAudio,
            disabledLabel: 'Select a clip',
            disabledAriaText: 'Audio controls become available when a clip with sound is selected',
        });
    }

    audioFadeControls.forEach((control) => {
        const { input, readout } = control;
        if (!input || !readout) {
            return;
        }

        if (!supportsAudio) {
            input.disabled = true;
            input.setAttribute('aria-disabled', 'true');
            input.value = '0';
            input.dataset.fadeSeconds = '0';
            input.setAttribute('aria-valuenow', '0');
            input.setAttribute('aria-valuetext', 'Audio fades available for media clips');
            readout.textContent = 'Select a clip';
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
        applyMasterVolumeToPreview(settings.volumePercent, { mediaElement: previewVideo });
    }
    if (isAudio) {
        applyMasterVolumeToPreview(settings.volumePercent, { mediaElement: previewAudio });
    }
    updateTimelineAudioSettingsSummary(timelineItem, { settings });
    if (!supportsAudio) {
        cancelPreviewAudioEnvelope({ mediaElement: previewVideo, restoreVolume: false });
        cancelPreviewAudioEnvelope({ mediaElement: previewAudio, restoreVolume: false });
    }

    if (typeof refreshPreviewAudioMix === 'function') {
        refreshPreviewAudioMix({ activeItem: timelineItem });
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

function clampImageBlur(value, options = {}) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return IMAGE_BLUR_MIN;
    }

    const clamped = Math.min(
        Math.max(numeric, IMAGE_BLUR_MIN),
        IMAGE_BLUR_MAX,
    );

    const { snapToInteger = true, precision = PREVIEW_IMAGE_BLUR_PRECISION } = options;

    if (snapToInteger) {
        return Math.round(clamped);
    }

    const safePrecision = Math.max(0, Math.min(6, Math.round(Number(precision) || 0)));
    if (safePrecision === 0) {
        return Math.round(clamped);
    }

    const factor = 10 ** safePrecision;
    return Math.round(clamped * factor) / factor;
}

function getTimelineItemImageBlur(timelineItem, progress = null) {
    const isImageItem = typeof isImageTimelineItem === 'function'
        ? isImageTimelineItem(timelineItem)
        : Boolean(timelineItem?.dataset?.fileType?.startsWith?.('image/'));

    if (!isImageItem) {
        return DEFAULT_IMAGE_BLUR;
    }

    if (typeof getTimelineItemImageBlurKeyframes === 'function') {
        const keyframes = getTimelineItemImageBlurKeyframes(timelineItem);

        if (Array.isArray(keyframes) && keyframes.length) {
            const targetProgress = Number.isFinite(progress) ? progress : 0;

            if (typeof evaluateImageBlurKeyframes === 'function') {
                return evaluateImageBlurKeyframes(keyframes, targetProgress);
            }

            const firstEntry = keyframes[0];
            if (firstEntry && Number.isFinite(firstEntry.blur)) {
                return clampImageBlur(firstEntry.blur, {
                    snapToInteger: false,
                    precision: PREVIEW_IMAGE_BLUR_PRECISION,
                });
            }
        }
    }

    const dataset = timelineItem?.dataset || {};
    const rawBlur = Number(dataset.imageBlur);
    if (!Number.isFinite(rawBlur)) {
        return DEFAULT_IMAGE_BLUR;
    }
    return clampImageBlur(rawBlur, {
        snapToInteger: false,
        precision: PREVIEW_IMAGE_BLUR_PRECISION,
    });
}

function persistTimelineItemImageBlur(timelineItem, blur) {
    if (!timelineItem?.dataset) {
        return;
    }

    const isImageItem = typeof isImageTimelineItem === 'function'
        ? isImageTimelineItem(timelineItem)
        : Boolean(timelineItem.dataset?.fileType?.startsWith?.('image/'));

    if (!isImageItem) {
        return;
    }

    const clamped = clampImageBlur(blur);
    if (clamped <= IMAGE_BLUR_MIN) {
        delete timelineItem.dataset.imageBlur;
    } else {
        timelineItem.dataset.imageBlur = String(clamped);
    }
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

function updateImageBlurReadout(value, options = {}) {
    if (!imageBlurValue) {
        return;
    }

    const { disabled = false } = options;
    if (disabled) {
        imageBlurValue.textContent = 'Disabled';
        return;
    }

    const clamped = clampImageBlur(value, {
        snapToInteger: false,
        precision: PREVIEW_IMAGE_BLUR_PRECISION,
    });
    imageBlurValue.textContent = clamped <= 0 ? 'Off' : `${formatBlurRadius(clamped)}px`;
}

function updateCanvasBlurExpandUI({ blur = 0, disabled = true, expandEnabled = false } = {}) {
    if (!canvasBlurExpandToggle) {
        if (canvasBlurExpandContainer) {
            canvasBlurExpandContainer.hidden = true;
        }
        return;
    }

    const resolvedBlur = clampCanvasBlur(blur);
    const isDisabled = Boolean(disabled);
    const shouldReveal = !isDisabled && resolvedBlur > CANVAS_BLUR_MIN;

    canvasBlurExpandToggle.checked = Boolean(expandEnabled);
    canvasBlurExpandToggle.disabled = !shouldReveal;

    if (shouldReveal) {
        canvasBlurExpandToggle.removeAttribute('aria-disabled');
    } else {
        canvasBlurExpandToggle.setAttribute('aria-disabled', 'true');
    }

    if (canvasBlurExpandContainer) {
        canvasBlurExpandContainer.hidden = !shouldReveal;
    }
}

function getTimelineItemCanvasSettings(timelineItem) {
    const defaults = {
        mode: 'none',
        blur: 0,
        customImageUrl: '',
        customImageName: '',
        expandBlur: false,
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
    const expandBlur = dataset.canvasBlurExpand === 'true';

    if (customImageUrl && !timelineCanvasCustomImageUrls.has(timelineItem)) {
        timelineCanvasCustomImageUrls.set(timelineItem, customImageUrl);
    }

    if (mode === 'custom' && !customImageUrl) {
        return {
            mode: 'none',
            blur: 0,
            customImageUrl: '',
            customImageName: '',
            expandBlur: false,
        };
    }

    return {
        mode,
        blur,
        customImageUrl,
        customImageName,
        expandBlur,
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

    if (Object.prototype.hasOwnProperty.call(settings, 'expandBlur')) {
        if (settings.expandBlur) {
            timelineItem.dataset.canvasBlurExpand = 'true';
        } else {
            delete timelineItem.dataset.canvasBlurExpand;
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
        updateCanvasBlurExpandUI({ blur: 0, disabled: true, expandEnabled: false });
        return;
    }

    const isClip = isImageTimelineItem(timelineItem) || isVideoTimelineItem(timelineItem);
    if (!isClip) {
        canvasBlurInput.disabled = true;        canvasBlurInput.setAttribute('aria-disabled', 'true');
        canvasBlurInput.value = '0';
        updateCanvasBlurReadout(0, { disabled: true });
        updateCanvasBlurExpandUI({ blur: 0, disabled: true, expandEnabled: false });
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
    updateCanvasBlurExpandUI({
        blur: blurValue,
        disabled: isDisabled,
        expandEnabled: Boolean(settings.expandBlur),
    });
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

const TIMELINE_ITEM_BLUR_FEEDBACK_CLASS = 'timeline-item--blur-applied';
const TIMELINE_ITEM_BLUR_FEEDBACK_TIMEOUT_MS = 900;
const timelineItemBlurFeedbackTimers = new WeakMap();

function setImageBlurApplyStatus(message, options = {}) {
    if (!imageBlurApplyStatus) {
        return;
    }

    window.clearTimeout(imageBlurApplyStatusTimer);
    imageBlurApplyStatusTimer = 0;

    const nextMessage = message || '';
    const showInline = options.inline !== false;

    if (nextMessage && options.toast && typeof showApplyFeedback === 'function') {
        showApplyFeedback(nextMessage, {
            tone: options.toast.tone || 'info',
            contextLabel: options.toast.contextLabel || 'Canvas',
            timeoutMs: options.toast.timeoutMs,
        });
    }

    if (!showInline) {
        return;
    }

    imageBlurApplyStatus.textContent = nextMessage;

    if (!nextMessage) {
        return;
    }

    if (options.persist) {
        return;
    }

    const timeoutMs = Number.isFinite(options.timeoutMs) ? Number(options.timeoutMs) : 3200;
    imageBlurApplyStatusTimer = window.setTimeout(() => {
        if (imageBlurApplyStatus) {
            imageBlurApplyStatus.textContent = '';
        }
        imageBlurApplyStatusTimer = 0;
    }, Math.max(0, timeoutMs));
}

function flashTimelineItemBlurFeedback(timelineItem) {
    if (!timelineItem) {
        return;
    }

    const existingTimer = timelineItemBlurFeedbackTimers.get(timelineItem);
    if (existingTimer) {
        window.clearTimeout(existingTimer);
    }

    timelineItem.classList.remove(TIMELINE_ITEM_BLUR_FEEDBACK_CLASS);
    void timelineItem.offsetWidth;
    timelineItem.classList.add(TIMELINE_ITEM_BLUR_FEEDBACK_CLASS);

    const timer = window.setTimeout(() => {
        timelineItem.classList.remove(TIMELINE_ITEM_BLUR_FEEDBACK_CLASS);
        timelineItemBlurFeedbackTimers.delete(timelineItem);
    }, TIMELINE_ITEM_BLUR_FEEDBACK_TIMEOUT_MS);

    timelineItemBlurFeedbackTimers.set(timelineItem, timer);
}

function syncImageBlurControlState(timelineItem) {
    if (!imageBlurControls || !imageBlurInput || !imageBlurValue || !imageBlurApplyButton) {
        return;
    }

    const isImageItem = typeof isImageTimelineItem === 'function'
        ? isImageTimelineItem(timelineItem)
        : Boolean(timelineItem?.dataset?.fileType?.startsWith?.('image/'));

    if (!isImageItem) {
        imageBlurControls.hidden = true;
        imageBlurInput.disabled = true;
        imageBlurInput.setAttribute('aria-disabled', 'true');
        imageBlurInput.value = String(DEFAULT_IMAGE_BLUR);
        imageBlurApplyButton.disabled = true;
        updateImageBlurReadout(DEFAULT_IMAGE_BLUR, { disabled: true });
        applyImageBlurToPreview(0);
        setImageBlurApplyStatus('Select an image clip to adjust blur.', { persist: true });
        return;
    }

    imageBlurControls.hidden = false;
    imageBlurInput.disabled = false;
    imageBlurInput.removeAttribute('aria-disabled');
    imageBlurApplyButton.disabled = false;
    setImageBlurApplyStatus('');

    const activeProgress = typeof getActiveClipProgress === 'function'
        ? getActiveClipProgress()
        : 0;
    const blurValue = getTimelineItemImageBlur(timelineItem, activeProgress);
    const previewBlur = clampImageBlur(blurValue, { snapToInteger: false });
    const sliderValue = clampImageBlur(previewBlur);
    imageBlurInput.value = String(sliderValue);
    updateImageBlurReadout(previewBlur);
    applyImageBlurToPreview(previewBlur);
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
    syncImageBlurControlState(timelineItem || null);
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

function getCanvasBackdropContentAspectRatio() {
    if (!previewCanvasBackdrop) {
        return null;
    }

    const source = previewCanvasBackdrop.dataset.source;

    if (source === 'video' && previewCanvasVideo) {
        const width = previewCanvasVideo.videoWidth;
        const height = previewCanvasVideo.videoHeight;
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
            return width / height;
        }
    }

    if (previewCanvasImage && source === 'image') {
        const width = previewCanvasImage.naturalWidth;
        const height = previewCanvasImage.naturalHeight;
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
            return width / height;
        }
    }

    if (previewVideo) {
        const width = previewVideo.videoWidth;
        const height = previewVideo.videoHeight;
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
            return width / height;
        }
    }

    if (previewImage) {
        const width = previewImage.naturalWidth;
        const height = previewImage.naturalHeight;
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
            return width / height;
        }
    }

    return null;
}

function refreshCanvasBackdropExpansion(options = {}) {
    if (!previewCanvasBackdrop) {
        return;
    }

    const {
        timelineItem: providedTimelineItem = activeTimelineItem,
        blurOverride = null,
        expandOverride = null,
    } = options;

    const viewportWidth = Math.max(0, previewViewport?.clientWidth || 0);
    const viewportHeight = Math.max(0, previewViewport?.clientHeight || 0);

    if (viewportWidth <= 0 || viewportHeight <= 0) {
        previewCanvasBackdrop.style.removeProperty('--canvas-backdrop-scale');
        return;
    }

    const timelineItem = providedTimelineItem && providedTimelineItem.isConnected
        ? providedTimelineItem
        : activeTimelineItem;
    const isClip = timelineItem
        ? (isImageTimelineItem(timelineItem) || isVideoTimelineItem(timelineItem))
        : false;
    const settings = timelineItem ? getTimelineItemCanvasSettings(timelineItem) : null;
    const mode = settings?.mode || 'none';
    const blurValue = blurOverride !== null && blurOverride !== undefined
        ? clampCanvasBlur(blurOverride)
        : clampCanvasBlur(settings?.blur ?? 0);
    const expandEnabled = expandOverride !== null && expandOverride !== undefined
        ? Boolean(expandOverride)
        : Boolean(settings?.expandBlur);

    if (!isClip || mode === 'none' || !expandEnabled || blurValue <= CANVAS_BLUR_MIN) {
        previewCanvasBackdrop.style.removeProperty('--canvas-backdrop-scale');
        return;
    }

    const aspect = getCanvasBackdropContentAspectRatio();
    const viewportAspect = viewportWidth / viewportHeight;

    let displayWidth = viewportWidth;
    let displayHeight = viewportHeight;

    if (Number.isFinite(aspect) && aspect > 0) {
        if (viewportAspect > aspect) {
            displayHeight = viewportHeight;
            displayWidth = viewportHeight * aspect;
        } else {
            displayWidth = viewportWidth;
            displayHeight = viewportWidth / aspect;
        }
    }

    const scaleX = displayWidth > 0 ? viewportWidth / displayWidth : 1;
    const scaleY = displayHeight > 0 ? viewportHeight / displayHeight : 1;
    const resolvedScale = Math.max(
        DEFAULT_CANVAS_BACKDROP_SCALE,
        Number.isFinite(scaleX) ? scaleX : 1,
        Number.isFinite(scaleY) ? scaleY : 1,
    );

    previewCanvasBackdrop.style.setProperty('--canvas-backdrop-scale', resolvedScale.toFixed(4));
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
    refreshCanvasBackdropExpansion({ timelineItem: null, blurOverride: 0, expandOverride: false });
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
    if (settings.mode === 'custom') {
        previewCanvasBackdrop.dataset.source = 'image';
    } else {
        previewCanvasBackdrop.dataset.source = isVideoTimelineItem(timelineItem) ? 'video' : 'image';
    }

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
        refreshCanvasBackdropExpansion({ timelineItem, blurOverride: settings.blur });
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
    refreshCanvasBackdropExpansion({ timelineItem, blurOverride: settings.blur });
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
        refreshCanvasBackdropExpansion({ timelineItem: activeTimelineItem, blurOverride: clamped });
        updateCanvasBlurExpandUI({
            blur: clamped,
            disabled: isDisabled,
            expandEnabled: Boolean(canvasBlurExpandToggle?.checked),
        });
    };

    canvasBlurInput.addEventListener('input', handleCanvasBlurUpdate);
    canvasBlurInput.addEventListener('change', handleCanvasBlurUpdate);
}

if (canvasBlurExpandToggle) {
    const handleCanvasBlurExpandChange = () => {
        if (!activeTimelineItem || canvasBlurExpandToggle.disabled) {
            return;
        }
        const isChecked = canvasBlurExpandToggle.checked;
        persistTimelineItemCanvasSettings(activeTimelineItem, { expandBlur: isChecked });
        refreshCanvasBackdropExpansion({
            timelineItem: activeTimelineItem,
            expandOverride: isChecked,
        });
    };

    canvasBlurExpandToggle.addEventListener('change', handleCanvasBlurExpandChange);
}

const applyImageBlurFromControl = () => {
    if (!imageBlurInput) {
        return DEFAULT_IMAGE_BLUR;
    }

    const rawValue = imageBlurInput.value;
    const clamped = clampImageBlur(rawValue);
    imageBlurInput.value = String(clamped);
    const isDisabled = imageBlurInput.disabled || imageBlurControls?.hidden;
    updateImageBlurReadout(clamped, { disabled: isDisabled });

    if (!activeTimelineItem || !isImageTimelineItem(activeTimelineItem) || isDisabled) {
        applyImageBlurToPreview(0);
        return clamped;
    }

    applyImageBlurToPreview(clamped);
    persistTimelineItemImageBlur(activeTimelineItem, clamped);
    return clamped;
};

if (imageBlurInput) {
    const updateActiveBlurKeyframeFromControl = (event, clampedValue) => {
        if (!activeTimelineItem || !isImageTimelineItem(activeTimelineItem)) {
            return;
        }
        if (typeof getTimelineItemImageBlurKeyframes !== 'function') {
            return;
        }
        const keyframes = getTimelineItemImageBlurKeyframes(activeTimelineItem);
        if (!Array.isArray(keyframes) || !keyframes.length) {
            return;
        }
        const progress = typeof getActiveClipProgress === 'function'
            ? getActiveClipProgress()
            : 0;
        const targetIndex = keyframes.findIndex((entry) => Math.abs(entry.progress - progress)
            <= (typeof KEYFRAME_PROGRESS_TOLERANCE === 'number'
                ? KEYFRAME_PROGRESS_TOLERANCE * 2
                : 0.004));
        if (targetIndex === -1) {
            return;
        }

        const nextKeyframes = [...keyframes];
        nextKeyframes[targetIndex] = {
            ...nextKeyframes[targetIndex],
            blur: clampedValue,
        };

        if (typeof storeTimelineItemImageBlurKeyframes === 'function') {
            storeTimelineItemImageBlurKeyframes(activeTimelineItem, nextKeyframes);
        }

        if (event?.type === 'change'
            && typeof showImageBlurKeyframeStatus === 'function'
        ) {
            const percent = Math.round((Number.isFinite(progress) ? progress : 0) * 100);
            showImageBlurKeyframeStatus(`Keyframe updated at ${percent}%`);
        }
    };

    const handleImageBlurInput = (event) => {
        const clamped = applyImageBlurFromControl();
        updateActiveBlurKeyframeFromControl(event, clamped);
    };

    imageBlurInput.addEventListener('input', handleImageBlurInput);
    imageBlurInput.addEventListener('change', handleImageBlurInput);
}

if (imageBlurApplyButton) {
    const resolveLaneIndexSafe = (laneValue) => {
        if (laneValue === undefined || laneValue === null || laneValue === '') {
            return null;
        }
        if (typeof resolveLaneIndex === 'function') {
            return resolveLaneIndex(laneValue);
        }
        const parsed = Number.parseInt(String(laneValue), 10);
        return Number.isFinite(parsed) ? parsed : null;
    };

    const findLaneElementByIndex = (laneIndex) => {
        if (!Number.isFinite(laneIndex) || typeof getTimelineLanes !== 'function') {
            return null;
        }
        return getTimelineLanes().find((lane) => (
            resolveLaneIndexSafe(lane?.dataset?.laneIndex) === laneIndex
        )) || null;
    };

    imageBlurApplyButton.addEventListener('click', () => {
        if (imageBlurApplyButton.disabled) {
            return;
        }

        const activeIsImage = Boolean(activeTimelineItem && isImageTimelineItem(activeTimelineItem));
        const activeProgress = typeof getActiveClipProgress === 'function'
            ? getActiveClipProgress()
            : 0;
        const previousActiveBlur = activeIsImage
            ? getTimelineItemImageBlur(activeTimelineItem, activeProgress)
            : null;

        const clamped = applyImageBlurFromControl();
        if (!activeIsImage || !activeTimelineItem) {
            setImageBlurApplyStatus('Select an image clip to apply blur.', {
                timeoutMs: 3200,
                inline: false,
                toast: { tone: 'warning', contextLabel: 'Canvas' },
            });
            return;
        }

        persistTimelineItemImageBlur(activeTimelineItem, clamped);

        let changedCount = 0;

        if (previousActiveBlur !== clamped) {
            changedCount += 1;
            flashTimelineItemBlurFeedback(activeTimelineItem);
        }

        let laneElement = activeTimelineItem.closest('.timeline-lane');
        const laneIndex = resolveLaneIndexSafe(activeTimelineItem.dataset?.laneIndex);
        if (!laneElement && Number.isFinite(laneIndex)) {
            laneElement = findLaneElementByIndex(laneIndex);
        }

        const previewObjectUrl = (previewImage && !previewImage.hidden)
            ? (previewImage.currentSrc || previewImage.src || '')
            : '';
        let shouldUpdatePreview = false;

        if (previousActiveBlur !== clamped && previewObjectUrl) {
            const activeObjectUrl = activeTimelineItem.dataset?.objectUrl || '';
            if (activeObjectUrl && activeObjectUrl === previewObjectUrl) {
                shouldUpdatePreview = true;
            }
        }

        const laneItems = laneElement
            ? Array.from(laneElement.querySelectorAll('.timeline-item'))
            : [];

        laneItems.forEach((timelineItem) => {
            if (timelineItem === activeTimelineItem) {
                return;
            }
            if (timelineItem.classList?.contains('timeline-item--drag-preview')) {
                return;
            }
            if (!isImageTimelineItem(timelineItem)) {
                return;
            }

            const previousBlur = getTimelineItemImageBlur(timelineItem, 0);
            if (previousBlur === clamped) {
                return;
            }

            persistTimelineItemImageBlur(timelineItem, clamped);
            changedCount += 1;
            flashTimelineItemBlurFeedback(timelineItem);

            if (!shouldUpdatePreview && previewObjectUrl) {
                const itemObjectUrl = timelineItem.dataset?.objectUrl || '';
                if (itemObjectUrl && itemObjectUrl === previewObjectUrl) {
                    shouldUpdatePreview = true;
                }
            }
        });

        if (shouldUpdatePreview) {
            applyImageBlurToPreview(clamped);
        }

        if (changedCount > 0) {
            const message = changedCount === 1
                ? 'Applied blur to 1 image in this lane.'
                : `Applied blur to ${changedCount} images in this lane.`;
            setImageBlurApplyStatus(message, {
                timeoutMs: 3600,
                inline: false,
                toast: { tone: 'success', contextLabel: 'Canvas' },
            });
            return;
        }

        setImageBlurApplyStatus('Blur already applied to this lane.', {
            timeoutMs: 3200,
            inline: false,
            toast: { tone: 'info', contextLabel: 'Canvas' },
        });
    });
}

if (previewCanvasVideo) {
    const refreshBackdropFromCanvasVideo = () => {
        refreshCanvasBackdropExpansion();
    };
    previewCanvasVideo.addEventListener('loadeddata', () => {
        syncCanvasVideoToPreview();
        refreshCanvasBackdropExpansion();
    });
    previewCanvasVideo.addEventListener('loadedmetadata', refreshBackdropFromCanvasVideo);
}

if (previewCanvasImage) {
    previewCanvasImage.addEventListener('load', () => {
        refreshCanvasBackdropExpansion();
    });
}

if (previewVideo) {
    const syncCanvasWithPreview = () => {
        syncCanvasVideoToPreview();
    };
    previewVideo.addEventListener('timeupdate', syncCanvasWithPreview);
    previewVideo.addEventListener('seeked', syncCanvasWithPreview);
    previewVideo.addEventListener('loadeddata', () => {
        syncCanvasWithPreview();
        refreshCanvasBackdropExpansion();
    });
    previewVideo.addEventListener('play', syncCanvasWithPreview);
    previewVideo.addEventListener('pause', () => {
        if (!isTimelinePlaying && isCanvasBackdropUsingClipVideo()) {
            pausePreviewCanvasVideo();
        }
    });
    previewVideo.addEventListener('loadedmetadata', () => {
        refreshCanvasBackdropExpansion();
    });
}

if (previewImage) {
    previewImage.addEventListener('load', () => {
        refreshCanvasBackdropExpansion();
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
const COMBO_APPLY_SELECT_MESSAGE = 'Select an image clip to apply animations.';
const COMBO_APPLY_LAYER_UNCHANGED_MESSAGE = 'All clips in this layer already use this combo animation.';

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

    const applyRestore = (skipFlash = false) => {
        if (!previewImage || previewImage.hidden) {
            return;
        }
        if (skipFlash) {
            previewImage.classList.add('is-visible');
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

    const finalize = (forceRestore = null, didCancel = false) => {
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
            const skipFlash = didCancel === true;
            const triggerRestore = () => applyRestore(skipFlash);
            if (restoreDelay > 0) {
                window.setTimeout(triggerRestore, restoreDelay);
            } else {
                triggerRestore();
            }        }

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
let imageBlurKeyframeStatusTimeout = null;

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
        return Promise.resolve();
    }

    if (timelineImagePreloadCache.has(objectURL)) {
        return timelineImagePreloadCache.get(objectURL);
    }

    const preloadPromise = new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';

        let settled = false;

        const cleanup = () => {
            image.removeEventListener('load', handleLoad);
            image.removeEventListener('error', handleError);
            image.src = '';
            image.removeAttribute?.('src');
        };

        const finalize = () => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            resolve();
        };

        const handleLoad = () => {
            let decodePromise = Promise.resolve();
            if (typeof image.decode === 'function') {
                try {
                    decodePromise = image.decode();
                } catch (decodeError) {
                    decodePromise = Promise.reject(decodeError);
                }
            }
            decodePromise.catch(() => {}).finally(finalize);
        };

        const handleError = (event) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            reject(event?.error || new Error('Failed to preload image.'));
        };

        image.addEventListener('load', handleLoad, { once: true });
        image.addEventListener('error', handleError, { once: true });

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
        return Promise.resolve();
    }

    const cachedRecord = timelineVideoPreloadCache.get(objectURL);
    if (cachedRecord?.promise) {
        return cachedRecord.promise;
    }

    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    let removeListeners = null;
    const record = {
        element: video,
        ready: false,
        promise: null,
        release() {
            if (typeof removeListeners === 'function') {
                removeListeners();
                removeListeners = null;
            }
            try {
                video.pause();
            } catch (pauseError) {
                // Ignore pause errors triggered during release.
            }
            try {
                video.removeAttribute?.('src');
            } catch (removeError) {
                // Ignore attribute removal failures on release.
            }
            try {
                video.load();
            } catch (loadError) {
                // Ignore load reset failures on release.
            }
        },
    };

    const preloadPromise = new Promise((resolve, reject) => {
        let settled = false;

        const finalize = (callback) => (event) => {
            if (settled) {
                return;
            }
            settled = true;
            if (typeof removeListeners === 'function') {
                removeListeners();
                removeListeners = null;
            }
            try {
                video.pause();
            } catch (pauseError) {
                // Ignore pause failures while settling the preload.
            }
            callback(event);
        };

        const handleReady = finalize(() => {
            record.ready = true;
            resolve();
        });

        const handleError = finalize((event) => {
            record.ready = false;
            reject(event?.error || new Error('Failed to preload video.'));
        });

        removeListeners = () => {
            video.removeEventListener('loadeddata', handleReady);
            video.removeEventListener('canplay', handleReady);
            video.removeEventListener('canplaythrough', handleReady);
            video.removeEventListener('error', handleError);
        };

        video.addEventListener('loadeddata', handleReady, { once: true });
        video.addEventListener('canplay', handleReady, { once: true });
        video.addEventListener('canplaythrough', handleReady, { once: true });
        video.addEventListener('error', handleError, { once: true });

        try {
            video.src = objectURL;
            video.load();
        } catch (error) {
            handleError({ error });
        }
    }).catch((error) => {
        timelineVideoPreloadCache.delete(objectURL);
        record.release();
        throw error;
    }).finally(() => {
        if (!record.ready) {
            return;
        }
        try {
            video.currentTime = 0;
        } catch (seekError) {
            // Ignore failures while rewinding the warm video element.
        }
    });

    record.promise = preloadPromise.then(() => undefined);
    timelineVideoPreloadCache.set(objectURL, record);
    return record.promise;
}

function getPreloadedTimelineVideo(objectURL) {
    if (!objectURL) {
        return null;
    }
    const record = timelineVideoPreloadCache.get(objectURL);
    return record?.element || null;
}

function releaseTimelineVideo(objectURL) {
    if (!objectURL) {
        return;
    }
    const record = timelineVideoPreloadCache.get(objectURL);
    if (!record) {
        return;
    }
    timelineVideoPreloadCache.delete(objectURL);
    if (typeof record.release === 'function') {
        record.release();
        return;
    }
    const video = record.element;
    if (!video) {
        return;
    }
    try {
        video.pause();
    } catch (pauseError) {
        // Ignore pause failures during release.
    }
    try {
        video.removeAttribute?.('src');
    } catch (removeError) {
        // Ignore remove attribute failures during release.
    }
    try {
        video.load();
    } catch (loadError) {
        // Ignore load reset failures during release.
    }
}

function releaseTimelineImage(objectURL) {
    if (!objectURL) {
        return;
    }
    timelineImagePreloadCache.delete(objectURL);
}

function preloadTimelineAudio(objectURL) {
    if (!objectURL) {
        return Promise.resolve();
    }

    const cachedRecord = timelineAudioPreloadCache.get(objectURL);
    if (cachedRecord?.promise) {
        return cachedRecord.promise;
    }

    const audio = document.createElement('audio');
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';

    let removeListeners = null;
    const record = {
        element: audio,
        ready: false,
        promise: null,
        release() {
            if (typeof removeListeners === 'function') {
                removeListeners();
                removeListeners = null;
            }
            try {
                audio.pause();
            } catch (pauseError) {
                // Ignore pause errors triggered during release.
            }
            try {
                audio.removeAttribute?.('src');
            } catch (removeError) {
                // Ignore attribute removal failures on release.
            }
            try {
                audio.load();
            } catch (loadError) {
                // Ignore load reset failures on release.
            }
        },
    };

    const preloadPromise = new Promise((resolve, reject) => {
        let settled = false;

        const finalize = (callback) => (event) => {
            if (settled) {
                return;
            }
            settled = true;
            if (typeof removeListeners === 'function') {
                removeListeners();
                removeListeners = null;
            }
            try {
                audio.pause();
            } catch (pauseError) {
                // Ignore pause failures during preload finalization.
            }
            callback(event);
        };

        const handleReady = finalize(() => {
            record.ready = true;
            resolve();
        });

        const handleError = finalize((event) => {
            record.ready = false;
            reject(event?.error || new Error('Failed to preload audio.'));
        });

        removeListeners = () => {
            audio.removeEventListener('loadeddata', handleReady);
            audio.removeEventListener('canplay', handleReady);
            audio.removeEventListener('canplaythrough', handleReady);
            audio.removeEventListener('error', handleError);
        };

        audio.addEventListener('loadeddata', handleReady, { once: true });
        audio.addEventListener('canplay', handleReady, { once: true });
        audio.addEventListener('canplaythrough', handleReady, { once: true });
        audio.addEventListener('error', handleError, { once: true });

        try {
            audio.src = objectURL;
            audio.load();
        } catch (error) {
            handleError({ error });
        }
    }).catch((error) => {
        timelineAudioPreloadCache.delete(objectURL);
        record.release();
        throw error;
    }).finally(() => {
        if (!record.ready) {
            return;
        }
        try {
            audio.currentTime = 0;
        } catch (seekError) {
            // Ignore rewind failures for audio warmup elements.
        }
    });

    record.promise = preloadPromise.then(() => undefined);
    timelineAudioPreloadCache.set(objectURL, record);
    return record.promise;
}

function getPreloadedTimelineAudio(objectURL) {
    if (!objectURL) {
        return null;
    }
    const record = timelineAudioPreloadCache.get(objectURL);
    return record?.element || null;
}

function releaseTimelineAudio(objectURL) {
    if (!objectURL) {
        return;
    }
    const record = timelineAudioPreloadCache.get(objectURL);
    if (!record) {
        return;
    }
    timelineAudioPreloadCache.delete(objectURL);
    if (typeof record.release === 'function') {
        record.release();
        return;
    }
    const audio = record.element;
    if (!audio) {
        return;
    }
    try {
        audio.pause();
    } catch (pauseError) {
        // Ignore pause failures during release.
    }
    try {
        audio.removeAttribute?.('src');
    } catch (removeError) {
        // Ignore attribute removal failures during release.
    }
    try {
        audio.load();
    } catch (loadError) {
        // Ignore load reset failures during release.
    }
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
const timelineInstanceIdRegistry = new Map();
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

    const existingId = timelineItem.dataset.timelineInstanceId;
    if (!options.force && existingId) {
        const owner = timelineInstanceIdRegistry.get(existingId);
        if (!owner || owner === timelineItem || !owner.isConnected) {
            timelineInstanceIdRegistry.set(existingId, timelineItem);
            return existingId;
        }
    }

    if (existingId) {
        const previousOwner = timelineInstanceIdRegistry.get(existingId);
        if (previousOwner === timelineItem) {
            timelineInstanceIdRegistry.delete(existingId);
        }
    }

    let id = generateTimelineInstanceId();
    while (timelineInstanceIdRegistry.has(id)) {
        id = generateTimelineInstanceId();
    }

    timelineItem.dataset.timelineInstanceId = id;
    timelineInstanceIdRegistry.set(id, timelineItem);
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

function releaseTimelineInstanceId(timelineItem) {
    if (!timelineItem || !timelineItem.dataset) {
        return;
    }

    const { timelineInstanceId: instanceId } = timelineItem.dataset;
    if (!instanceId) {
        return;
    }

    const owner = timelineInstanceIdRegistry.get(instanceId);
    if (!owner || owner === timelineItem || !owner.isConnected) {
        timelineInstanceIdRegistry.delete(instanceId);
    }
}

function refreshTimelineObjectUrlUsage() {
    timelineObjectUrlUsage.clear();
    timelineInstanceIdRegistry.clear();
    getTimelineItems().forEach((item) => {
        assignTimelineInstanceId(item);
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
    releaseTimelineInstanceId(timelineItem);
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

let uploadPreviewIntersectionObserver = null;
let uploadPreviewObserverUnavailable = false;
const uploadPreviewControllersByElement = new WeakMap();
let uploadPreviewListObserver = null;

function ensureUploadPreviewIntersectionObserver() {
    if (uploadPreviewIntersectionObserver) {
        return uploadPreviewIntersectionObserver;
    }

    if (uploadPreviewObserverUnavailable) {
        return null;
    }

    if (typeof IntersectionObserver !== 'function') {
        uploadPreviewObserverUnavailable = true;
        return null;
    }

    uploadPreviewIntersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            const controller = uploadPreviewControllersByElement.get(entry.target);
            if (!controller) {
                return;
            }

            const isVisible = entry.isIntersecting && entry.intersectionRatio > 0;
            controller.setVisible(isVisible);

            if (!isVisible && typeof controller.pause === 'function') {
                controller.pause();
            }
        });
    }, {
        threshold: 0.25,
    });

    return uploadPreviewIntersectionObserver;
}

function createUploadPreviewController(listItem, video) {
    if (!(listItem instanceof HTMLElement) || !(video instanceof HTMLVideoElement)) {
        return null;
    }

    const controller = {
        listItem,
        video,
        isVisible: false,
        isDisabled: false,
        isPlaying: false,
        isHovering: false,
        hasFocus: false,
    };

    const observer = ensureUploadPreviewIntersectionObserver();

    const refreshPlayback = () => {
        const shouldPlay = controller.isVisible
            && !controller.isDisabled
            && (controller.isHovering || controller.hasFocus);

        if (shouldPlay) {
            if (controller.isPlaying) {
                return;
            }

            const playPromise = controller.video.play();
            if (playPromise && typeof playPromise.then === 'function') {
                playPromise.then(() => {
                    controller.isPlaying = true;
                }).catch(() => {
                    controller.isPlaying = false;
                });
            } else {
                controller.isPlaying = true;
            }
        } else {
            controller.pause();
        }
    };

    const handlePointerEnter = () => {
        controller.isHovering = true;
        refreshPlayback();
    };

    const handlePointerLeave = () => {
        controller.isHovering = false;
        refreshPlayback();
    };

    const handleFocusIn = () => {
        controller.hasFocus = true;
        refreshPlayback();
    };

    const handleFocusOut = (event) => {
        if (event && event.relatedTarget && controller.listItem.contains(event.relatedTarget)) {
            return;
        }
        controller.hasFocus = false;
        refreshPlayback();
    };

    const handleLoadedMetadata = () => {
        if (!controller.isHovering && !controller.hasFocus) {
            controller.pause();
        }
    };

    controller.setVisible = (visible) => {
        controller.isVisible = Boolean(visible);
        refreshPlayback();
    };

    controller.setDisabled = (disabled) => {
        controller.isDisabled = Boolean(disabled);
        refreshPlayback();
    };

    controller.pause = () => {
        pauseUploadPreviewVideo(controller.video);
        controller.isPlaying = false;
    };

    controller.cleanup = () => {
        uploadPreviewControllersByElement.delete(controller.listItem);
        if (observer) {
            try {
                observer.unobserve(controller.listItem);
            } catch (error) {
                // Ignore failures when unobserving.
            }
        }
        controller.listItem.removeEventListener('mouseenter', handlePointerEnter);
        controller.listItem.removeEventListener('mouseleave', handlePointerLeave);
        controller.listItem.removeEventListener('focusin', handleFocusIn);
        controller.listItem.removeEventListener('focusout', handleFocusOut);
        controller.video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        controller.isHovering = false;
        controller.hasFocus = false;
        controller.isVisible = false;
        controller.isDisabled = false;
        controller.pause();
    };

    listItem.addEventListener('mouseenter', handlePointerEnter);
    listItem.addEventListener('mouseleave', handlePointerLeave);
    listItem.addEventListener('focusin', handleFocusIn);
    listItem.addEventListener('focusout', handleFocusOut);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    uploadPreviewControllersByElement.set(listItem, controller);

    if (observer) {
        observer.observe(listItem);
    } else {
        controller.isVisible = true;
    }

    controller.pause();

    return controller;
}

function handleUploadGalleryItemRemoval(item) {
    if (!(item instanceof HTMLElement)) {
        return;
    }

    const controller = uploadPreviewControllersByElement.get(item);
    if (controller && typeof controller.cleanup === 'function') {
        controller.cleanup();
    }

    const objectURL = item.dataset?.objectUrl;
    if (objectURL && stagedUploadsByObjectUrl.has(objectURL)) {
        const entry = stagedUploadsByObjectUrl.get(objectURL);
        if (entry?.previewController
            && entry.previewController !== controller
            && typeof entry.previewController.cleanup === 'function') {
            entry.previewController.cleanup();
        }
        stagedUploadsByObjectUrl.delete(objectURL);
    }
}

function ensureUploadGalleryListObserver() {
    if (uploadPreviewListObserver || !uploadGalleryList || typeof MutationObserver !== 'function') {
        return uploadPreviewListObserver;
    }

    uploadPreviewListObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.removedNodes.forEach((node) => {
                if (!(node instanceof HTMLElement)) {
                    return;
                }

                if (node.classList && node.classList.contains('upload-gallery__item')) {
                    handleUploadGalleryItemRemoval(node);
                }

                if (typeof node.querySelectorAll === 'function') {
                    node.querySelectorAll('.upload-gallery__item').forEach((child) => {
                        handleUploadGalleryItemRemoval(child);
                    });
                }
            });
        });
    });

    try {
        uploadPreviewListObserver.observe(uploadGalleryList, { childList: true });
    } catch (error) {
        // Ignore observer failures.
    }

    return uploadPreviewListObserver;
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

    ensureUploadGalleryListObserver();

    const listItem = document.createElement('li');
    listItem.className = 'upload-gallery__item';
    listItem.dataset.objectUrl = objectURL;

    const previewWrapper = document.createElement('div');
    previewWrapper.className = 'upload-gallery__preview';

    let previewController = null;

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
        video.playsInline = true;
        previewWrapper.appendChild(video);
        previewController = createUploadPreviewController(listItem, video);
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
        if (previewController) {
            if (typeof previewController.setDisabled === 'function') {
                previewController.setDisabled(true);
            }
            if (typeof previewController.pause === 'function') {
                previewController.pause();
            }
        }
        try {
            await addToTimeline(file, objectURL);
            setStagedUploadAddedState(objectURL, true);
        } catch (error) {
            console.error('Failed to add upload to timeline.', error);
            addButton.disabled = false;
            if (previewController && typeof previewController.setDisabled === 'function') {
                previewController.setDisabled(false);
            }
        }
    });

    actions.appendChild(addButton);

    listItem.append(previewWrapper, meta, actions);
    uploadGalleryList.appendChild(listItem);

    stagedUploadsByObjectUrl.set(objectURL, {
        file,
        listItem,
        addButton,
        previewController,
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
let sharedAudioDecodeContext = null;
let sharedAudioDecodeContextPromise = null;
let sharedAudioDecodeContextClosing = null;
const audioWaveformResizeObservers = new WeakMap();

async function ensureSharedAudioDecodeContext(AudioContextConstructor) {
    if (!AudioContextConstructor) {
        return null;
    }

    if (sharedAudioDecodeContextClosing) {
        await sharedAudioDecodeContextClosing;
    }

    if (sharedAudioDecodeContext && sharedAudioDecodeContext.state === 'closed') {
        sharedAudioDecodeContext = null;
        sharedAudioDecodeContextPromise = null;
    }

    if (sharedAudioDecodeContext) {
        return sharedAudioDecodeContext;
    }

    if (!sharedAudioDecodeContextPromise) {
        sharedAudioDecodeContextPromise = Promise.resolve().then(() => {
            const context = new AudioContextConstructor();
            sharedAudioDecodeContext = context;
            return context;
        }).catch((error) => {
            sharedAudioDecodeContextPromise = null;
            sharedAudioDecodeContext = null;
            throw error;
        });
    }

    return sharedAudioDecodeContextPromise;
}

function resetSharedAudioDecodeContext() {
    if (sharedAudioDecodeContextClosing) {
        return sharedAudioDecodeContextClosing;
    }

    const context = sharedAudioDecodeContext;
    sharedAudioDecodeContext = null;
    sharedAudioDecodeContextPromise = null;

    if (!context || typeof context.close !== 'function') {
        return Promise.resolve();
    }

    let closingPromise = null;
    try {
        closingPromise = Promise.resolve(context.close());
    } catch (error) {
        closingPromise = Promise.resolve();
    }

    closingPromise = closingPromise.catch(() => {}).finally(() => {
        if (sharedAudioDecodeContextClosing === closingPromise) {
            sharedAudioDecodeContextClosing = null;
        }
    });

    sharedAudioDecodeContextClosing = closingPromise;
    return closingPromise;
}

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
        try {
            const audioContext = await ensureSharedAudioDecodeContext(AudioContextConstructor);

            if (!audioContext) {
                return null;
            }

            const decodeAudioData = audioContext.decodeAudioData;
            const decodeAudioDataArity = typeof decodeAudioData === 'function'
                ? decodeAudioData.length
                : 0;

            // Older implementations that require callbacks sometimes mutate the buffer
            // argument, so defensively clone only when the callback signature is detected.
            const shouldCloneArrayBufferForDecode = typeof decodeAudioData === 'function'
                && decodeAudioDataArity >= 2
                && typeof arrayBuffer.slice === 'function';

            const bufferForDecoding = shouldCloneArrayBufferForDecode
                ? arrayBuffer.slice(0)
                : arrayBuffer;

            const audioBuffer = await (decodeAudioDataArity <= 1
                ? decodeAudioData.call(audioContext, bufferForDecoding)
                : new Promise((resolve, reject) => {
                    decodeAudioData.call(audioContext, bufferForDecoding, resolve, reject);
                }));

            return audioBuffer;
        } catch (error) {
            console.warn('Unable to decode audio file for waveform rendering.', error);
            await resetSharedAudioDecodeContext();
            return null;
        }
    });
}

function buildWaveformChannelDataFromAudioBuffer(audioBuffer) {
    if (!audioBuffer) {
        return null;
    }

    let channelData = null;
    if (typeof AudioBuffer !== 'undefined' && audioBuffer instanceof AudioBuffer) {
        channelData = audioBuffer.numberOfChannels > 0
            ? audioBuffer.getChannelData(0)
            : null;
    } else if (audioBuffer instanceof Float32Array) {
        channelData = audioBuffer;
    } else if (audioBuffer?.channelData instanceof Float32Array) {
        channelData = audioBuffer.channelData;
    }

    if (!channelData) {
        return null;
    }

    const totalSamples = channelData.length;
    if (!Number.isFinite(totalSamples) || totalSamples <= 0) {
        return null;
    }

    const TARGET_BUCKETS = 4000;
    const bucketWidth = Math.max(1, Math.floor(totalSamples / TARGET_BUCKETS) || 1);
    const bucketCount = Math.ceil(totalSamples / bucketWidth);
    const buckets = new Float32Array(bucketCount * 2);

    for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
        const startIndex = bucketIndex * bucketWidth;
        const endIndex = Math.min(totalSamples, startIndex + bucketWidth);
        let min = 1;
        let max = -1;

        for (let sampleIndex = startIndex; sampleIndex < endIndex; sampleIndex += 1) {
            const sample = channelData[sampleIndex] || 0;
            if (sample < min) {
                min = sample;
            }
            if (sample > max) {
                max = sample;
            }
        }

        buckets[(bucketIndex * 2)] = min;
        buckets[(bucketIndex * 2) + 1] = max;
    }

    return {
        bucketWidth,
        buckets,
        totalSamples,
    };
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
    let totalSamples = 0;
    let bucketWidth = 1;
    let buckets = null;
    let bucketCount = 0;

    const isAudioBuffer = typeof AudioBuffer !== 'undefined'
        && audioBuffer instanceof AudioBuffer;

    if (isAudioBuffer || audioBuffer instanceof Float32Array || audioBuffer?.channelData instanceof Float32Array) {
        channelData = isAudioBuffer
            ? (audioBuffer.numberOfChannels > 0 ? audioBuffer.getChannelData(0) : null)
            : (audioBuffer instanceof Float32Array
                ? audioBuffer
                : audioBuffer.channelData);
        totalSamples = channelData?.length || 0;
    } else if (
        audioBuffer
        && typeof audioBuffer === 'object'
        && audioBuffer.buckets instanceof Float32Array
        && Number.isFinite(audioBuffer.bucketWidth)
    ) {
        buckets = audioBuffer.buckets;
        bucketWidth = Math.max(1, Math.round(audioBuffer.bucketWidth));
        bucketCount = Math.max(0, Math.floor(buckets.length / 2));
        totalSamples = Math.max(1, Math.round(audioBuffer.totalSamples || (bucketWidth * bucketCount)));
    }

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
        if (startIndex >= totalSamples) {
            min = 0;
            max = 0;
        } else if (buckets && bucketCount > 0) {
            const startBucket = Math.min(bucketCount - 1, Math.max(0, Math.floor(startIndex / bucketWidth)));
            const endBucket = Math.min(
                bucketCount - 1,
                Math.max(startBucket, Math.floor((Math.max(startIndex, endIndex - 1)) / bucketWidth)),
            );
            for (let bucketIndex = startBucket; bucketIndex <= endBucket; bucketIndex += 1) {
                const bucketMin = buckets[(bucketIndex * 2)] ?? 0;
                const bucketMax = buckets[(bucketIndex * 2) + 1] ?? 0;
                if (bucketMin < min) {
                    min = bucketMin;
                }
                if (bucketMax > max) {
                    max = bucketMax;
                }
            }
        } else if (channelData) {
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

    if (!cacheEntry.channelData && cacheEntry.audioBuffer) {
        cacheEntry.channelData = buildWaveformChannelDataFromAudioBuffer(cacheEntry.audioBuffer);
        if (cacheEntry.channelData) {
            delete cacheEntry.audioBuffer;
        }
    }

    if (cacheEntry.audioBuffer || cacheEntry.channelData) {
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
        if (!existing.channelData && existing.audioBuffer) {
            existing.channelData = buildWaveformChannelDataFromAudioBuffer(existing.audioBuffer);
            delete existing.audioBuffer;
        }
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
        const channelData = buildWaveformChannelDataFromAudioBuffer(audioBuffer);
        const cacheEntry = {
            imageDataUrl: null,
            durationMs,
            drawn: true,
            channelData,
        };
        if (!channelData) {
            cacheEntry.audioBuffer = audioBuffer;
        }
        audioWaveformByObjectUrl.set(objectURL, cacheEntry);
        timelineItem.dataset.maxAudioDuration = String(durationMs);
        setTimelineItemDuration(timelineItem, 'audioDuration', durationMs, { markCustom: false });
        if (waveformCanvas) {
            const widthOverride = timelineItem
                ? Math.round(timelineItem.getBoundingClientRect().width)
                : null;
            drawAudioWaveform(waveformCanvas, channelData || audioBuffer, {
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

const supplementalOverlayAudioPlayers = new Map();

function stopAllSupplementalOverlayAudio(options = {}) {
    const { resetTime = true } = options;
    const players = Array.from(supplementalOverlayAudioPlayers.entries());
    players.forEach(([item, state]) => {
        const element = state?.element || null;
        if (!element) {
            supplementalOverlayAudioPlayers.delete(item);
            return;
        }
        try {
            element.pause();
        } catch (error) {
            // Ignore pause errors for supplemental audio.
        }
        if (resetTime) {
            try {
                element.currentTime = 0;
            } catch (error) {
                // Ignore reset errors.
            }
        }
        cancelPreviewAudioEnvelope({ mediaElement: element, restoreVolume: false });
        if (typeof unregisterOverlayAudioElement === 'function') {
            unregisterOverlayAudioElement(item, element);
        }
        if (element !== previewAudio && element.parentElement) {
            element.parentElement.removeChild(element);
        }
        supplementalOverlayAudioPlayers.delete(item);
    });
}

function stopPreviewAudio(options = {}) {
    const { resetTime = true } = options;
    if (previewAudio) {
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
    }

    stopAllSupplementalOverlayAudio({ resetTime });

    if (activeAudioOverlayEntry?.syncSource) {
        clearTimelinePlaybackSyncSource(activeAudioOverlayEntry.syncSource);
    }
    if (typeof unregisterOverlayAudioElement === 'function' && activeAudioOverlayEntry?.item && previewAudio) {
        unregisterOverlayAudioElement(activeAudioOverlayEntry.item, previewAudio);
    }
    activeAudioOverlayEntry = null;

    if (typeof refreshPreviewAudioMix === 'function') {
        refreshPreviewAudioMix({ overlayItems: [] });
    }
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
    const laneIndex = typeof resolveLaneIndex === 'function'
        ? resolveLaneIndex(entry.laneIndex ?? entry.item?.dataset?.laneIndex)
        : Number(entry.laneIndex ?? entry.item?.dataset?.laneIndex ?? 0);

    return {
        item: entry.item,
        start: startTime,
        end: safeEndTime,
        laneIndex,
    };
}

function getSupplementalAudioContainer() {
    if (previewAudio?.parentElement) {
        return previewAudio.parentElement;
    }
    if (previewAudio?.ownerDocument?.body) {
        return previewAudio.ownerDocument.body;
    }
    return typeof document !== 'undefined' ? document.body : null;
}

function syncSupplementalOverlayPlayers(audioEntries, options = {}) {
    const normalizedSegmentTime = Number.isFinite(options?.normalizedSegmentTime)
        ? Math.max(0, Math.round(options.normalizedSegmentTime))
        : null;
    const mix = options?.mix || null;
    const activeItems = new Set();

    audioEntries.forEach((entry) => {
        if (!entry?.item || !isAudioTimelineItem(entry.item)) {
            return;
        }

        const clipDuration = Math.max(0, getTimelineItemPlaybackDuration(entry.item));
        const referenceTime = normalizedSegmentTime !== null ? normalizedSegmentTime : entry.start;
        const offsetMs = Math.max(
            0,
            Math.min(
                Math.round(referenceTime - entry.start),
                clipDuration || Math.max(0, entry.end - entry.start),
            ),
        );
        const objectURL = entry.item?.dataset?.objectUrl || '';
        const audioSettings = getTimelineItemAudioSettings(entry.item);
        const overlayGain = (mix?.gainsByItem instanceof Map && mix.gainsByItem.has(entry.item))
            ? mix.gainsByItem.get(entry.item)
            : null;

        let state = supplementalOverlayAudioPlayers.get(entry.item);
        if (!state) {
            const container = getSupplementalAudioContainer();
            let element = null;
            if (typeof Audio !== 'undefined') {
                element = new Audio();
            } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
                element = document.createElement('audio');
            }
            if (!element) {
                return;
            }
            element.hidden = true;
            element.setAttribute('aria-hidden', 'true');
            element.preload = 'auto';
            element.crossOrigin = 'anonymous';
            if (container) {
                container.appendChild(element);
            }
            state = {
                element,
                lastObjectUrl: '',
            };
            supplementalOverlayAudioPlayers.set(entry.item, state);
        }

        const { element } = state;
        if (!element) {
            return;
        }

        if (objectURL && element.src !== objectURL) {
            element.src = objectURL;
            try {
                element.load();
            } catch (error) {
                // Ignore load errors for supplemental audio elements.
            }
            state.lastObjectUrl = objectURL;
        }

        if (typeof registerOverlayAudioElement === 'function') {
            registerOverlayAudioElement(entry.item, element);
        }

        applyMasterVolumeToPreview(audioSettings.volumePercent, {
            mediaElement: element,
            mixGain: overlayGain,
        });

        const remainingDuration = Math.max(0, clipDuration - offsetMs);
        if (remainingDuration > 0) {
            applyPreviewAudioEnvelope(audioSettings, remainingDuration, {
                mediaElement: element,
                mixGain: overlayGain,
                clipOffsetMs: offsetMs,
                clipTotalDurationMs: clipDuration,
            });
        } else {
            cancelPreviewAudioEnvelope({ mediaElement: element, restoreVolume: false });
        }

        const desiredTime = offsetMs / 1000;
        if (Math.abs((element.currentTime || 0) - desiredTime) > 0.2) {
            try {
                element.currentTime = desiredTime;
            } catch (error) {
                // Ignore seek errors for supplemental audio.
            }
        }

        if (element.paused) {
            element.play().catch((error) => {
                console.warn('Unable to start overlay audio clip playback.', error);
            });
        }

        activeItems.add(entry.item);
    });

    const removableItems = [];
    supplementalOverlayAudioPlayers.forEach((state, item) => {
        if (!activeItems.has(item)) {
            removableItems.push(item);
        }
    });

    removableItems.forEach((item) => {
        const state = supplementalOverlayAudioPlayers.get(item);
        const element = state?.element || null;
        if (element) {
            if (typeof unregisterOverlayAudioElement === 'function') {
                unregisterOverlayAudioElement(item, element);
            }
            cancelPreviewAudioEnvelope({ mediaElement: element, restoreVolume: false });
            try {
                element.pause();
            } catch (error) {
                // Ignore pause errors when removing supplemental audio.
            }
            try {
                element.currentTime = 0;
            } catch (error) {
                // Ignore reset errors when removing supplemental audio.
            }
            if (element !== previewAudio && element.parentElement) {
                element.parentElement.removeChild(element);
            }
        }
        supplementalOverlayAudioPlayers.delete(item);
    });
}

function getTimelineAudioEntriesAtTime(timeMs) {
    if (typeof getTimelineLaneEntries !== 'function') {
        return [];
    }

    const rawTime = Number(timeMs);
    if (!Number.isFinite(rawTime)) {
        return [];
    }

    const targetTime = Math.max(0, Math.round(rawTime));
    const candidateEntries = getTimelineLaneEntries();

    if (!candidateEntries.length) {
        return [];
    }

    return candidateEntries
        .filter((entry) => entry?.item && isAudioTimelineItem(entry.item))
        .map((entry) => {
            const start = Number.isFinite(entry.start)
                ? Math.max(0, Math.round(entry.start))
                : 0;
            const end = Number.isFinite(entry.end)
                ? Math.max(0, Math.round(entry.end))
                : start;
            const laneIndex = typeof resolveLaneIndex === 'function'
                ? resolveLaneIndex(entry.laneIndex ?? entry.item?.dataset?.laneIndex)
                : Number(entry.laneIndex ?? entry.item?.dataset?.laneIndex ?? 0);
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
}

function syncPreviewAudioOverlay(entries, segmentStartTimeMs) {
    const normalizedSegmentTime = Number.isFinite(segmentStartTimeMs)
        ? Math.max(0, Math.round(segmentStartTimeMs))
        : null;
    const activePlaybackItem = typeof activeTimelineItem !== 'undefined'
        ? activeTimelineItem
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

    const overlayAudioEntries = [];
    const seenOverlayItems = new Set();

    if (audioEntry?.item) {
        overlayAudioEntries.push(audioEntry);
        seenOverlayItems.add(audioEntry.item);
    }

    entries
        .filter((entry) => entry?.item && isAudioTimelineItem(entry.item))
        .forEach((entry) => {
            const normalized = normalizeAudioOverlayEntry(entry);
            if (!normalized?.item || seenOverlayItems.has(normalized.item)) {
                return;
            }
            overlayAudioEntries.push(normalized);
            seenOverlayItems.add(normalized.item);
        });

    if (normalizedSegmentTime !== null) {
        const timelineAudioEntries = getTimelineAudioEntriesAtTime(normalizedSegmentTime);
        timelineAudioEntries.forEach((entry) => {
            const normalized = normalizeAudioOverlayEntry(entry);
            if (!normalized?.item || seenOverlayItems.has(normalized.item)) {
                return;
            }
            overlayAudioEntries.push(normalized);
            seenOverlayItems.add(normalized.item);
        });
    }

    if (!overlayAudioEntries.length) {
        if (typeof refreshPreviewAudioMix === 'function') {
            refreshPreviewAudioMix({
                entries,
                activeItem: activePlaybackItem,
                overlayItems: [],
            });
        }
        stopPreviewAudio({ resetTime: false });
        return;
    }

    if (!audioEntry || !audioEntry.item) {
        audioEntry = overlayAudioEntries[0];
    }

    const additionalEntries = overlayAudioEntries.slice(1);

    const overlayItemsForMix = overlayAudioEntries.map((entry) => entry.item).filter(Boolean);

    if (!previewAudio) {
        if (typeof refreshPreviewAudioMix === 'function') {
            refreshPreviewAudioMix({
                entries,
                activeItem: activePlaybackItem,
                overlayItems: overlayItemsForMix,
            });
        }
        syncSupplementalOverlayPlayers(additionalEntries, {
            normalizedSegmentTime,
            mix: null,
        });
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

    const mix = typeof refreshPreviewAudioMix === 'function'
        ? refreshPreviewAudioMix({
            entries,
            activeItem: activePlaybackItem,
            overlayItem: audioEntry.item,
            overlayItems: overlayItemsForMix,
        })
        : null;
    const overlayGain = (mix?.gainsByItem instanceof Map && mix.gainsByItem.has(audioEntry.item))
        ? mix.gainsByItem.get(audioEntry.item)
        : null;

    if (activeAudioOverlayEntry?.item && activeAudioOverlayEntry.item !== audioEntry.item
        && typeof unregisterOverlayAudioElement === 'function' && previewAudio
    ) {
        unregisterOverlayAudioElement(activeAudioOverlayEntry.item, previewAudio);
    }

    const needsRestart = !activeAudioOverlayEntry
        || activeAudioOverlayEntry.item !== audioEntry.item
        || previewAudio.src !== objectURL;

    const applyAudioSyncSource = () => {
        if (activeAudioOverlayEntry?.syncSource) {
            clearTimelinePlaybackSyncSource(activeAudioOverlayEntry.syncSource);
        }
        const syncSource = {
            priority: 20,
            getTimelineTime: () => {
                if (!previewAudio) {
                    return Number.NaN;
                }
                const mediaTime = Number(previewAudio.currentTime) || 0;
                return audioEntry.start + (mediaTime * 1000);
            },
        };
        setTimelinePlaybackSyncSource(syncSource);
        activeAudioOverlayEntry = {
            item: audioEntry.item,
            start: audioEntry.start,
            end: audioEntry.end,
            syncSource,
        };
    };

    const audioSettings = getTimelineItemAudioSettings(audioEntry.item);

    if (needsRestart) {
        if (objectURL && previewAudio.src !== objectURL) {
            previewAudio.src = objectURL;
            try {
                previewAudio.load();
            } catch (error) {
                // Ignore load errors.
            }
        }

        applyMasterVolumeToPreview(audioSettings.volumePercent, {
            mediaElement: previewAudio,
            mixGain: overlayGain,
        });
        const remainingDuration = Math.max(0, clipDuration - offsetMs);
        if (remainingDuration > 0) {
            applyPreviewAudioEnvelope(audioSettings, remainingDuration, {
                mediaElement: previewAudio,
                mixGain: overlayGain,
                clipOffsetMs: offsetMs,
                clipTotalDurationMs: clipDuration,
            });
        } else {
            cancelPreviewAudioEnvelope({ mediaElement: previewAudio, restoreVolume: false });
        }

        try {
            previewAudio.currentTime = offsetMs / 1000;
        } catch (error) {
            // Ignore seek errors.
        }

        if (typeof updateTimelinePlaybackSyncFallback === 'function') {
            updateTimelinePlaybackSyncFallback(audioEntry.start + offsetMs);
        }

        previewAudio.play().catch((error) => {
            console.warn('Unable to start audio clip playback.', error);
        });
    } else {
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

        if (typeof updateTimelinePlaybackSyncFallback === 'function') {
            updateTimelinePlaybackSyncFallback(audioEntry.start + offsetMs);
        }
    }

    if (typeof registerOverlayAudioElement === 'function' && previewAudio) {
        registerOverlayAudioElement(audioEntry.item, previewAudio);
    }

    applyAudioSyncSource();

    syncSupplementalOverlayPlayers(additionalEntries, {
        normalizedSegmentTime,
        mix,
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

    assignTimelineInstanceId(timelineItem);

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
    if (objectURL) {
        incrementTimelineObjectUrlUsage(objectURL);
    }
    initializeTimelineItem(timelineItem);
    updateTimelineEmptyState();

    markExportPlaybackContextDirty({ refreshSummary: true });

    registerTimelineItemInteractions(timelineItem, removeButton);

    pushTimelineUndoEntry({
        type: 'add-item',
        undo: () => {
            if (timelineItem && timelineItem.isConnected) {
                removeTimelineItem(timelineItem, { recordUndo: false });
            }
        },
    });

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
            removeTimelineItem(targetItem);
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
const DEFAULT_TEXT_TEMPLATE_BASE_WIDTH_PX = DEFAULT_TEXT_TEMPLATE_CANVAS_WIDTH * DEFAULT_TEXT_TEMPLATE_WIDTH;
const DEFAULT_TEXT_TEMPLATE_BASE_HEIGHT_PX = DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT * DEFAULT_TEXT_TEMPLATE_HEIGHT;
const MAX_TEXT_TEMPLATE_DIMENSION = 0.95;

let defaultTextMeasurementContext = null;

function getDefaultTextMeasurementContext() {
    if (defaultTextMeasurementContext) {
        return defaultTextMeasurementContext;
    }
    if (typeof document === 'undefined') {
        return null;
    }
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
        return null;
    }
    defaultTextMeasurementContext = context;
    return defaultTextMeasurementContext;
}

function applyTextTransformToContent(content, transform) {
    const raw = String(content || '');
    switch ((transform || 'none').toLowerCase()) {
    case 'uppercase':
        return raw.toUpperCase();
    case 'lowercase':
        return raw.toLowerCase();
    case 'capitalize':
        return raw.replace(/\b\w/g, (char) => char.toUpperCase());
    default:
        return raw;
    }
}

function resolveTextTemplateStyle(styleOverrides = {}) {
    const base = (styleOverrides && typeof styleOverrides === 'object') ? styleOverrides : {};
    const fontFamily = base.fontFamily || (DEFAULT_TEXT_STYLE?.fontFamily || "Inter, 'Segoe UI', system-ui, sans-serif");
    const fontWeightCandidate = Number(base.fontWeight);
    const fontWeight = Number.isFinite(fontWeightCandidate)
        ? fontWeightCandidate
        : (DEFAULT_TEXT_STYLE?.fontWeight || 600);
    const fontStyleCandidate = typeof base.fontStyle === 'string'
        ? base.fontStyle.toLowerCase()
        : '';
    const fontStyle = TEXT_FONT_STYLE_OPTIONS?.has?.(fontStyleCandidate)
        ? fontStyleCandidate
        : (DEFAULT_TEXT_STYLE?.fontStyle || 'normal');
    const letterSpacingCandidate = Number(base.letterSpacingScale);
    const letterSpacingScale = Number.isFinite(letterSpacingCandidate)
        ? (typeof clampTextLetterSpacing === 'function'
            ? clampTextLetterSpacing(letterSpacingCandidate)
            : letterSpacingCandidate)
        : (DEFAULT_TEXT_STYLE?.letterSpacingScale || 0.04);
    const fontSizeCandidate = Number(base.fontSize);
    const fontSize = Number.isFinite(fontSizeCandidate)
        ? clampTextFontSize(fontSizeCandidate)
        : DEFAULT_TEXT_TEMPLATE_FONT_SIZE;
    const color = typeof normalizeTextColor === 'function'
        ? normalizeTextColor(base.color || DEFAULT_TEXT_STYLE?.color || '#F8FAFC')
        : '#F8FAFC';
    const alignCandidate = base.align;
    const align = TEXT_ALIGNMENT_OPTIONS?.has?.(alignCandidate)
        ? alignCandidate
        : (DEFAULT_TEXT_STYLE?.align || 'center');
    const transformCandidate = base.transform;
    const transform = TEXT_TRANSFORM_OPTIONS?.has?.(transformCandidate)
        ? transformCandidate
        : (DEFAULT_TEXT_STYLE?.transform || 'none');
    const decorationCandidate = typeof base.textDecoration === 'string'
        ? base.textDecoration.toLowerCase()
        : '';
    const textDecoration = TEXT_DECORATION_OPTIONS?.has?.(decorationCandidate)
        ? decorationCandidate
        : (DEFAULT_TEXT_STYLE?.textDecoration || 'none');
    const paddingInlineCandidate = Number(base.paddingInline);
    const paddingInline = Number.isFinite(paddingInlineCandidate)
        ? paddingInlineCandidate
        : DEFAULT_TEXT_TEMPLATE_HORIZONTAL_PADDING;
    const paddingBlockCandidate = Number(base.paddingBlock);
    const paddingBlock = Number.isFinite(paddingBlockCandidate)
        ? paddingBlockCandidate
        : DEFAULT_TEXT_TEMPLATE_VERTICAL_PADDING;

    return {
        fontFamily,
        fontWeight,
        fontStyle,
        letterSpacingScale,
        fontSize,
        color,
        align,
        transform,
        textDecoration,
        paddingInline,
        paddingBlock,
    };
}

function calculateDefaultTextTemplateTransform(textContent = DEFAULT_TEXT_TEMPLATE_LABEL, styleOverrides = {}) {
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

    const style = resolveTextTemplateStyle(styleOverrides);
    const context = getDefaultTextMeasurementContext();

    if (!context) {
        return fallback;
    }

    const measuredText = applyTextTransformToContent(textContent || DEFAULT_TEXT_TEMPLATE_LABEL, style.transform);
    const fontStyle = style.fontStyle === 'italic' ? 'italic' : 'normal';
    const fontDescriptor = `${fontStyle} ${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
    context.font = fontDescriptor;
    context.textBaseline = 'alphabetic';
    context.textAlign = 'left';

    const metrics = context.measureText(measuredText);
    const baseWidth = Number.isFinite(metrics.width) ? metrics.width : 0;
    const letterSpacing = style.fontSize * style.letterSpacingScale;
    const totalLetterSpacing = Math.max(0, measuredText.length - 1) * letterSpacing;
    const measuredWidth = Math.max(0, baseWidth + totalLetterSpacing);

    const ascent = Number.isFinite(metrics.actualBoundingBoxAscent)
        ? metrics.actualBoundingBoxAscent
        : style.fontSize * 0.82;
    const descent = Number.isFinite(metrics.actualBoundingBoxDescent)
        ? metrics.actualBoundingBoxDescent
        : style.fontSize * 0.18;
    const measuredHeight = Math.max(0, ascent + descent);

    const totalWidthPx = measuredWidth + (style.paddingInline * 2);
    const totalHeightPx = measuredHeight + (style.paddingBlock * 2);

    if (!Number.isFinite(totalWidthPx) || !Number.isFinite(totalHeightPx) || totalWidthPx <= 0 || totalHeightPx <= 0) {
        return fallback;
    }

    const fontScale = Number.isFinite(style.fontSize) && style.fontSize > 0
        ? style.fontSize / DEFAULT_TEXT_TEMPLATE_FONT_SIZE
        : 1;
    const scaledBaseWidthPx = DEFAULT_TEXT_TEMPLATE_BASE_WIDTH_PX * Math.max(fontScale, 0.1);
    const scaledBaseHeightPx = DEFAULT_TEXT_TEMPLATE_BASE_HEIGHT_PX * Math.max(fontScale, 0.1);

    const desiredWidthPx = Math.max(totalWidthPx, scaledBaseWidthPx);
    const desiredHeightPx = Math.max(totalHeightPx, scaledBaseHeightPx);

    const normalizedWidth = desiredWidthPx / DEFAULT_TEXT_TEMPLATE_CANVAS_WIDTH;
    const normalizedHeight = desiredHeightPx / DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT;

    if (!Number.isFinite(normalizedWidth) || !Number.isFinite(normalizedHeight)
        || normalizedWidth <= 0 || normalizedHeight <= 0) {
        return fallback;
    }

    const aspectRatio = desiredWidthPx > 0 && desiredHeightPx > 0
        ? desiredWidthPx / desiredHeightPx
        : DEFAULT_TEXT_TEMPLATE_ASPECT_RATIO;

    let width = normalizedWidth;
    let height = normalizedHeight;

    if (width < DEFAULT_TEXT_TEMPLATE_MIN_WIDTH) {
        const scale = DEFAULT_TEXT_TEMPLATE_MIN_WIDTH / width;
        width = DEFAULT_TEXT_TEMPLATE_MIN_WIDTH;
        height *= scale;
    }

    const maxScale = Math.min(
        width > 0 ? MAX_TEXT_TEMPLATE_DIMENSION / width : 1,
        height > 0 ? MAX_TEXT_TEMPLATE_DIMENSION / height : 1,
        1,
    );
    if (maxScale < 1) {
        width *= maxScale;
        height *= maxScale;
    }

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return fallback;
    }

    const top = (1 - height) / 2;
    const left = (1 - width) / 2;

    const resolvedAspectRatio = width > 0 && height > 0 ? width / height : aspectRatio;

    const round = (value) => Math.round(value * 10000) / 10000;

    return {
        left: round(left),
        top: round(top),
        width: round(width),
        height: round(height),
        aspectRatio: round(resolvedAspectRatio),
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

function createDefaultTextOverlayObjectURL(textContent = DEFAULT_TEXT_TEMPLATE_LABEL, styleOverrides = {}) {
    const style = resolveTextTemplateStyle(styleOverrides);
    const transformedText = applyTextTransformToContent(textContent, style.transform);
    const safeText = escapeSvgTextContent(transformedText);
    const sanitizedFontFamily = style.fontFamily.replace(/"/g, '\\"');
    const anchor = style.align === 'left'
        ? 'start'
        : (style.align === 'right' ? 'end' : 'middle');
    let xPosition = DEFAULT_TEXT_TEMPLATE_CANVAS_WIDTH / 2;
    if (style.align === 'left') {
        xPosition = style.paddingInline;
    } else if (style.align === 'right') {
        xPosition = DEFAULT_TEXT_TEMPLATE_CANVAS_WIDTH - style.paddingInline;
    }
    const letterSpacingScale = typeof clampTextLetterSpacing === 'function'
        ? clampTextLetterSpacing(style.letterSpacingScale)
        : style.letterSpacingScale;
    const letterSpacingPx = style.fontSize * letterSpacingScale;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${DEFAULT_TEXT_TEMPLATE_CANVAS_WIDTH}" height="${DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT}" viewBox="0 0 ${DEFAULT_TEXT_TEMPLATE_CANVAS_WIDTH} ${DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT}">
    <style>
        text { font-family: ${sanitizedFontFamily}; font-weight: ${style.fontWeight}; font-style: ${style.fontStyle}; text-decoration: ${style.textDecoration}; }
    </style>
    <rect width="${DEFAULT_TEXT_TEMPLATE_CANVAS_WIDTH}" height="${DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT}" fill="rgba(15,23,42,0.0)" />
    <text x="${xPosition}" y="${DEFAULT_TEXT_TEMPLATE_CANVAS_HEIGHT / 2}" fill="${style.color}" font-size="${style.fontSize}" font-weight="${style.fontWeight}" font-style="${style.fontStyle}" text-decoration="${style.textDecoration}" text-anchor="${anchor}" dominant-baseline="middle" letter-spacing="${letterSpacingPx}">
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

    const timelineItem = document.createElement('div');
    timelineItem.className = 'timeline-item timeline-item--text';
    timelineItem.setAttribute('role', 'listitem');
    timelineItem.tabIndex = 0;
    timelineItem.dataset.fileType = 'image/svg+xml';
    timelineItem.dataset.displayName = DEFAULT_TEXT_TEMPLATE_LABEL;
    timelineItem.dataset.templateId = DEFAULT_TEXT_TEMPLATE_ID;
    timelineItem.dataset.textContent = DEFAULT_TEXT_TEMPLATE_LABEL;
    timelineItem.dataset.startOffsetMs = String(Math.max(0, Math.round(startTime)));
    initializeDefaultTextStyleForTimelineItem(timelineItem);
    const initialStyle = getTimelineTextStyle ? getTimelineTextStyle(timelineItem) : null;
    const objectURL = createDefaultTextOverlayObjectURL(DEFAULT_TEXT_TEMPLATE_LABEL, initialStyle || undefined);
    timelineItem.dataset.objectUrl = objectURL;
    const initialTransform = calculateDefaultTextTemplateTransform(
        DEFAULT_TEXT_TEMPLATE_LABEL,
        initialStyle || undefined,
    );
    timelineItem.dataset.previewImageTransform = JSON.stringify(initialTransform);
    timelineItem.dataset.autoFitText = 'true';

    assignTimelineInstanceId(timelineItem);

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

    if (objectURL) {
        incrementTimelineObjectUrlUsage(objectURL);
    }

    initializeTimelineItem(timelineItem);
    registerTimelineItemInteractions(timelineItem, removeButton);
    preloadTimelineImage(objectURL).catch((error) => {
        console.warn('Failed to warm text overlay image for playback.', error);
    });

    pushTimelineUndoEntry({
        type: 'add-item',
        undo: () => {
            if (timelineItem && timelineItem.isConnected) {
                removeTimelineItem(timelineItem, { recordUndo: false });
            }
        },
    });

    scheduleTimelineLaneReflow(overlayLane);
    scrollTimelineItemIntoView(timelineItem);
    updateTimelineEmptyState();
    updateActiveTimelineIndicators();
    markExportPlaybackContextDirty({ refreshSummary: true });
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

document.addEventListener('keydown', handleTimelineKeyboardShortcuts);

refreshTimelineObjectUrlUsage();

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

    const laneCache = (typeof getTimelineLaneEntryCache === 'function')
        ? getTimelineLaneEntryCache()
        : null;
    const overlayEntries = getOverlayEntriesForTimelineItem(
        timelineItem,
        overlayEntriesOverride,
        laneCache,
    );
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
        previewVideo.hidden = true;
        previewVideo.classList.add('is-buffering');
        if (previewArea) {
            previewArea.classList.add('is-buffering');
        }
        const placeholderState = previewPlaceholder
            ? { hidden: previewPlaceholder.hidden, text: previewPlaceholder.textContent }
            : null;
        if (previewPlaceholder) {
            previewPlaceholder.hidden = false;
            previewPlaceholder.textContent = 'Preparing video preview…';
        }
        applyMasterVolumeToPreview(audioSettings.volumePercent, { mediaElement: previewVideo });
        if (typeof refreshPreviewAudioMix === 'function') {
            refreshPreviewAudioMix({
                entries: overlayEntries,
                activeItem: timelineItem,
            });
        }
        preloadTimelineVideo(objectURL).catch(() => {});

        await new Promise((resolve) => {
            let resolved = false;
            let timeoutId = 0;
            let onEnded = null;
            let onError = null;
            const abortController = new AbortController();
            let playbackStarted = false;

            const clearBufferingState = () => {
                previewVideo.classList.remove('is-buffering');
                if (previewArea) {
                    previewArea.classList.remove('is-buffering');
                }
            };

            const restorePlaceholder = () => {
                if (!previewPlaceholder) {
                    return;
                }
                if (placeholderState && typeof placeholderState.text === 'string') {
                    previewPlaceholder.textContent = placeholderState.text;
                } else if (defaultPreviewPlaceholderText) {
                    previewPlaceholder.textContent = defaultPreviewPlaceholderText;
                }
                previewPlaceholder.hidden = true;
            };

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
                clearBufferingState();
                restorePlaceholder();
                cancelPreviewAudioEnvelope({ restoreVolume: true });
            };

            let playbackSyncSource = null;
            const clipTimelineStart = Math.max(
                0,
                Math.round(Number(getTimelineItemStartTime(timelineItem, laneCache)) || 0),
            );

            const finalize = () => {
                if (resolved) {
                    return;
                }
                resolved = true;
                window.clearTimeout(timeoutId);
                cleanup();
                previewVideo.pause();
                previewVideo.loop = false;
                if (!isTimelinePaused) {
                    previewVideo.currentTime = 0;
                }
                if (timelinePlaybackAbort === abortPlayback) {
                    timelinePlaybackAbort = null;
                }
                if (playbackSyncSource) {
                    clearTimelinePlaybackSyncSource(playbackSyncSource);
                    playbackSyncSource = null;
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
                const maximumSeekDuration = intrinsicDuration > 0
                    ? intrinsicDuration
                    : targetDuration;
                const safeStartOffset = Math.min(
                    startOffsetMs,
                    Math.max(0, maximumSeekDuration),
                );
                const startOffsetSeconds = safeStartOffset / 1000;
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

                previewVideo.muted = false;
                let mixGain = clampVolume(audioSettings.volumePercent / 100);
                if (typeof refreshPreviewAudioMix === 'function') {
                    const mix = refreshPreviewAudioMix({ activeItem: timelineItem });
                    if (mix?.gainsByItem instanceof Map && mix.gainsByItem.has(timelineItem)) {
                        mixGain = clampVolume(mix.gainsByItem.get(timelineItem));
                    }
                }
                const previewState = getMediaEnvelopeState(previewVideo);
                if (previewState) {
                    previewState.baseVolume = mixGain;
                }
                if (audioSettings.fadeInMs > 0 && mixGain > 0) {
                    previewVideo.volume = 0;
                } else {
                    previewVideo.volume = mixGain;
                }

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

                clearBufferingState();
                restorePlaceholder();
                previewVideo.hidden = false;

                const seekToStartOffset = () => new Promise((resolveSeek) => {
                    if (safeStartOffset <= 0) {
                        previewVideo.currentTime = 0;
                        resolveSeek();
                        return;
                    }

                    let settled = false;
                    const cleanupSeek = () => {
                        if (settled) {
                            return;
                        }
                        settled = true;
                        previewVideo.removeEventListener('seeked', handleSeeked);
                        previewVideo.removeEventListener('error', handleError);
                        if (abortController) {
                            abortController.signal.removeEventListener('abort', handleAbort);
                        }
                        resolveSeek();
                    };
                    const handleSeeked = () => {
                        cleanupSeek();
                    };
                    const handleError = () => {
                        cleanupSeek();
                    };
                    const handleAbort = () => {
                        cleanupSeek();
                    };

                    previewVideo.addEventListener('seeked', handleSeeked);
                    previewVideo.addEventListener('error', handleError);
                    if (abortController) {
                        abortController.signal.addEventListener('abort', handleAbort);
                    }

                    try {
                        previewVideo.currentTime = startOffsetSeconds;
                        if (previewVideo.readyState >= 2
                            && Math.abs(previewVideo.currentTime - startOffsetSeconds) < 0.05
                        ) {
                            cleanupSeek();
                        }
                    } catch (error) {
                        cleanupSeek();
                    }
                });

                await seekToStartOffset();

                await ensurePreviewFrameSettled({ signal: abortController.signal });

                if (typeof updateTimelinePlaybackSyncFallback === 'function') {
                    updateTimelinePlaybackSyncFallback(resumeTimelineTime);
                }

                try {
                    const playPromise = previewVideo.play();
                    if (playPromise && typeof playPromise.then === 'function') {
                        await playPromise;
                    }
                    applyPreviewAudioEnvelope(audioSettings, effectiveDuration, {
                        mixGain,
                        clipOffsetMs: safeStartOffset,
                        clipTotalDurationMs: targetDuration,
                    });
                    if (isTimelinePlaying) {
                        if (playbackSyncSource) {
                            clearTimelinePlaybackSyncSource(playbackSyncSource);
                        }
                        const syncSource = {
                            priority: 10,
                            getTimelineTime: () => {
                                if (!previewVideo) {
                                    return Number.NaN;
                                }
                                const mediaTimeSeconds = Number(previewVideo.currentTime) || 0;
                                const mediaTimeMs = Math.max(0, Math.round(mediaTimeSeconds * 1000));
                                return clipTimelineStart + mediaTimeMs;
                            },
                        };
                        playbackSyncSource = syncSource;
                        setTimelinePlaybackSyncSource(syncSource);
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
    } else if (fileType.startsWith('audio/')) {
        cancelPreviewExitAnimation({ forceRestore: true });
        setPreviewMode(null);
        previewVideo.pause();
        previewVideo.hidden = true;
        previewVideo.removeAttribute('src');
        if (previewPlaceholder) {
            previewPlaceholder.hidden = false;
            previewPlaceholder.textContent = 'Audio clip ready — press Play Back to hear it';
        }

        preloadTimelineAudio(objectURL).catch(() => {});

        const clipDuration = Math.max(0, getTimelineItemPlaybackDuration(timelineItem));
        const remainingClipDuration = Math.max(0, clipDuration - startOffsetMs);
        const playbackWindowMs = Number.isFinite(playbackWindow)
            ? Math.max(0, Math.round(playbackWindow))
            : null;
        const effectiveDuration = playbackWindowMs === null
            ? remainingClipDuration
            : Math.min(remainingClipDuration, playbackWindowMs);
        const baseSegmentStart = Math.max(
            0,
            Math.round(Number(getTimelineItemStartTime(timelineItem, laneCache)) || 0),
        );
        const segmentStartTime = baseSegmentStart + startOffsetMs;

        syncPreviewAudioOverlay(overlayEntries, segmentStartTime);
        playVideoButton.textContent = 'Play Back';
        applyImageBlurToPreview(0);
        await waitForGapDuration(effectiveDuration);
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
        const initialElapsed = Math.min(startOffsetMs, clipDuration);
        const totalElapsed = initialElapsed + safeEffectiveDuration;
        const clipPlaysToEnd = clipDuration === 0 || totalElapsed >= clipDuration;
        const animationClipDuration = clipDuration > 0 ? clipDuration : safeEffectiveDuration;
        const skipEntranceAnimation = startOffsetMs > 0;
        const initialProgress = clipDuration > 0
            ? clampProgress(initialElapsed / clipDuration)
            : 0;
        const animationSettings = getTimelineItemAnimationSettings(timelineItem);
        const entranceConfigOverride = getPreviewImageEntranceConfig({
            clipDurationMs: animationClipDuration,
            settingsOverride: animationSettings,
        });
        const exitConfig = getPreviewImageExitConfig({
            clipDurationMs: animationClipDuration,
            settingsOverride: animationSettings,
        });
        const exitWindow = exitConfig
            ? Math.min(animationClipDuration, Math.max(0, exitConfig.totalDuration))
            : 0;
        setPreviewMode('has-image');
        previewVideo.pause();
        previewVideo.hidden = true;
        previewVideo.removeAttribute('src');
        setPreviewImageVisibility(true);
        previewPlaceholder.hidden = true;
        const imageBlurAmount = getTimelineItemImageBlur(timelineItem, initialProgress);
        applyImageBlurToPreview(imageBlurAmount);
        await revealPreviewImageSource(objectURL, {
            clipDurationMs: animationClipDuration,
            entranceConfigOverride,
            immediate: skipEntranceAnimation,
        });
        resetPreviewScroll();
        setActiveClipProgress(initialProgress, { source: 'image-playback' });

        await new Promise((resolve) => {
            let resolved = false;
            const clipTimelineStart = Math.max(
                0,
                Math.round(Number(getTimelineItemStartTime(timelineItem, laneCache)) || 0),
            );
            const resumeClipElapsed = initialElapsed;
            const resumeTimelineTime = clipTimelineStart + resumeClipElapsed;
            const playbackStartTimestamp = performance.now();
            if (typeof updateTimelinePlaybackSyncFallback === 'function') {
                updateTimelinePlaybackSyncFallback(resumeTimelineTime);
            }
            let animationFrameId = 0;
            let exitAnimationRequested = false;
            let exitAnimationStarted = false;
            let exitAnimationCompleteResolve = null;
            const exitAnimationCompletePromise = exitConfig
                ? new Promise((promiseResolve) => {
                    exitAnimationCompleteResolve = promiseResolve;
                })
                : Promise.resolve();

            const markExitAnimationComplete = () => {
                if (exitAnimationCompleteResolve) {
                    exitAnimationCompleteResolve();
                    exitAnimationCompleteResolve = null;
                }
            };

            const stopAnimation = () => {
                if (animationFrameId) {
                    window.cancelAnimationFrame(animationFrameId);
                    animationFrameId = 0;
                }
            };

            const startExitAnimation = (options = {}) => {
                if (!exitConfig) {
                    return false;
                }

                const force = options.force === true;
                if (!force && exitAnimationRequested) {
                    return exitAnimationStarted;
                }

                exitAnimationRequested = true;

                const didAnimate = runPreviewImageExitAnimation({
                    restoreOnComplete: false,
                    onComplete: () => {
                        markExitAnimationComplete();
                    },
                }, exitConfig);

                if (didAnimate) {
                    exitAnimationStarted = true;
                    const cleanup = previewExitAnimationState?.cleanup;
                    if (typeof cleanup === 'function') {
                        previewExitAnimationState.cleanup = (...cleanupArgs) => {
                            try {
                                cleanup(...cleanupArgs);
                            } finally {
                                markExitAnimationComplete();
                            }
                        };
                    }
                } else {
                    markExitAnimationComplete();
                    exitAnimationRequested = false;
                }

                return didAnimate;
            };

            const exitStartTime = exitConfig
                ? Math.max(0, clipDuration - exitWindow)
                : Number.POSITIVE_INFINITY;

            const step = () => {
                if (resolved || !isTimelinePlaying) {
                    return;
                }

                const now = performance.now();
                const wallElapsed = Math.max(0, now - playbackStartTimestamp);
                const fallbackTimelineTime = resumeTimelineTime + wallElapsed;
                const syncedTimelineTime = typeof getTimelinePlaybackSyncedElapsed === 'function'
                    ? getTimelinePlaybackSyncedElapsed(fallbackTimelineTime, now)
                    : fallbackTimelineTime;
                const clipElapsed = Math.max(
                    0,
                    Math.min(clipDuration, syncedTimelineTime - clipTimelineStart),
                );
                const elapsedSinceResume = Math.max(0, clipElapsed - resumeClipElapsed);
                const playbackProgress = clipDuration > 0
                    ? clampProgress(clipElapsed / clipDuration)
                    : 0;

                setActiveClipProgress(playbackProgress, { source: 'image-playback' });

                if (exitConfig && !exitAnimationRequested) {
                    const shouldStartExit = clipPlaysToEnd
                        && (safeEffectiveDuration === 0 || clipElapsed >= exitStartTime);
                    if (shouldStartExit) {
                        startExitAnimation();
                    }
                }

                if (elapsedSinceResume < safeEffectiveDuration && isTimelinePlaying) {
                    animationFrameId = window.requestAnimationFrame(step);
                }
            };

            animationFrameId = window.requestAnimationFrame(step);

            if (exitConfig && clipPlaysToEnd && safeEffectiveDuration === 0) {
                // When there is no playback window remaining we previously forced
                // the exit animation to run which removed the current frame before
                // the next clip had a chance to render. That caused a brief flash
                // at clip boundaries. Instead, skip triggering the exit animation
                // and resolve the completion promise immediately so the existing
                // frame stays visible until the next clip is ready.
                markExitAnimationComplete();
            }

            let timeoutId = 0;

            const finalize = async () => {
                if (resolved) {
                    return;
                }
                resolved = true;
                window.clearTimeout(timeoutId);
                stopAnimation();

                if (!exitAnimationRequested || !exitConfig || !exitAnimationStarted) {
                    markExitAnimationComplete();
                }

                try {
                    await exitAnimationCompletePromise;
                } catch (error) {
                    // Ignore exit animation timing errors during playback finalization.
                }

                const finalElapsed = Math.min(
                    clipDuration,
                    initialElapsed + safeEffectiveDuration,
                );
                const finalProgress = clipDuration > 0
                    ? clampProgress(finalElapsed / clipDuration)
                    : 1;
                setActiveClipProgress(finalProgress, { source: 'image-playback-end', updatePreview: false });
                if (timelinePlaybackAbort === abortPlayback) {
                    timelinePlaybackAbort = null;
                }
                resolve();
            };

            timeoutId = window.setTimeout(() => {
                if (resolved) {
                    return;
                }
                if (clipPlaysToEnd) {
                    startExitAnimation({ force: true });
                }
                finalize();
            }, Math.max(0, Math.round(safeEffectiveDuration)));

            const abortPlayback = () => {
                if (resolved) {
                    return;
                }
                cancelPreviewExitAnimation({ forceRestore: true });
                finalize();
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

async function playTimelineSequence(startIndex = 0, resumeOptions = null, playbackContext = null) {
    const timelineItems = Array.isArray(playbackContext?.timelineItems)
        ? playbackContext.timelineItems
        : getTimelineItems();
    if (!timelineItems.length) {
        alert('Upload an image or video to build your timeline.');
        return false;
    }

    const playbackState = playbackContext?.playbackState || getTimelinePlaybackSegments();
    const laneCache = playbackState?.laneCache || null;
    const segments = Array.isArray(playbackState?.segments)
        ? playbackState.segments
        : [];
    const totalDuration = Number.isFinite(playbackState?.totalDuration)
        ? playbackState.totalDuration
        : 0;
    if (!segments.length || totalDuration <= 0) {
        alert('Upload an image or video to build your timeline.');
        return false;
    }

    const resumeTimeMs = Number.isFinite(resumeOptions?.timeMs)
        ? Math.max(0, Math.round(resumeOptions.timeMs))
        : null;

    const boundedIndex = Math.min(
        Math.max(0, startIndex),
        Math.max(timelineItems.length - 1, 0),
    );
    const initialItem = timelineItems[boundedIndex] || null;
    let initialSegmentIndex = 0;
    if (resumeTimeMs !== null) {
        const resumeSegmentIndex = segments.findIndex(
            (segment) => resumeTimeMs >= segment.start && resumeTimeMs < segment.end,
        );
        if (resumeSegmentIndex >= 0) {
            initialSegmentIndex = resumeSegmentIndex;
        } else if (resumeTimeMs >= totalDuration) {
            initialSegmentIndex = segments.length ? segments.length - 1 : 0;
        }
    } else if (initialItem) {
        const foundSegmentIndex = segments.findIndex(
            (segment) => segment.item === initialItem,
        );
        if (foundSegmentIndex >= 0) {
            initialSegmentIndex = foundSegmentIndex;
        }
    }
    const startSegment = segments[initialSegmentIndex] || null;
    const startElapsed = resumeTimeMs !== null
        ? Math.min(resumeTimeMs, totalDuration)
        : (startSegment ? startSegment.start : 0);

    isTimelinePaused = false;
    timelinePauseState = null;
    isTimelinePlaying = true;
    playVideoButton.textContent = 'Pause playback';
    updateKeyframeControlsState();
    resetTimelineProgressLine(getTimelineFractionForTime(startElapsed, laneCache));
    updatePlaybackTimeDisplay(startElapsed, totalDuration);
    startPlaybackClock(startElapsed, totalDuration);

    let completedNaturally = true;
    let pendingResumeTime = resumeTimeMs;

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
            if (pendingResumeTime !== null && pendingResumeTime >= end) {
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
            let segmentStartTime = start;
            
            if (pendingResumeTime !== null) {
                if (pendingResumeTime <= start) {
                    segmentStartTime = start;
                    
                } else if (pendingResumeTime < end) {
                    segmentStartTime = pendingResumeTime;
                    
                } else {
                    continue;
                }
            }

            let segmentStartOffset = 0;
            if (item) {
                const clipStartTime = Math.max(
                    0,
                    Math.round(Number(getTimelineItemStartTime(item, laneCache)) || 0),
                );
                const clipDuration = Math.max(
                    0,
                    Math.round(Number(getTimelineItemPlaybackDuration(item)) || 0),
                );
                const offsetFromClipStart = Number.isFinite(segmentStartTime)
                    ? Math.round(segmentStartTime - clipStartTime)
                    : 0;
                segmentStartOffset = Math.max(0, offsetFromClipStart);
                if (clipDuration > 0) {
                    segmentStartOffset = Math.min(segmentStartOffset, clipDuration);
                }
            }
            
            syncPreviewAudioOverlay(segment.items || [], segmentStartTime);
            if (typeof updateTimelinePlaybackSyncFallback === 'function') {
                updateTimelinePlaybackSyncFallback(segmentStartTime);
            }
            const startFraction = getTimelineFractionForTime(segmentStartTime, laneCache);
            const endFraction = getTimelineFractionForTime(end, laneCache);
            const remainingDuration = pendingResumeTime !== null
                ? Math.max(0, Math.round(end - segmentStartTime))
                : duration;
            animateTimelineProgress(startFraction, endFraction, remainingDuration);
            if (item) {
                // eslint-disable-next-line no-await-in-loop
                await playTimelineItem(item, remainingDuration, segment.items || null, {
                    startOffsetMs: segmentStartOffset,
                });
            } else {
                // eslint-disable-next-line no-await-in-loop
                await waitForGapDuration(remainingDuration);
            }
            pendingResumeTime = null;
        }
    } finally {
        const preservePause = isTimelinePaused;
        stopTimelinePlayback(!preservePause, !preservePause, { preservePauseState: preservePause });
        if (completedNaturally && !isTimelinePaused) {
            resetTimelineProgressLine(totalDuration > 0 ? 1 : 0);
            updatePlaybackTimeDisplay(totalDuration, totalDuration);
        } else if (!isTimelinePaused) {
            updateActiveTimelineIndicators();
        }
    }

    if (typeof renderExportSummary === 'function') {
        renderExportSummary(timelineItems, completedNaturally, playbackState);
    }

    return completedNaturally;
}

function pauseTimelinePlayback() {
    if (!isTimelinePlaying || isTimelinePaused) {
        return;
    }

    const { segments, totalDuration } = getTimelinePlaybackSegments();
    if (!segments.length || totalDuration <= 0) {
        return;
    }

    const timelineItems = getTimelineItems();
    const clampedTime = Math.max(
        0,
        Math.min(Number(playbackDisplayCurrentMs) || 0, totalDuration),
    );

    const segmentIndex = segments.findIndex(
        (segment) => clampedTime >= segment.start && clampedTime < segment.end,
    );
    const activeIndex = activeTimelineItem ? timelineItems.indexOf(activeTimelineItem) : -1;
    const fallbackIndex = segmentIndex >= 0 && segments[segmentIndex].item
        ? timelineItems.indexOf(segments[segmentIndex].item)
        : -1;
    const resumeItemIndex = activeIndex >= 0
        ? activeIndex
        : (fallbackIndex >= 0 ? fallbackIndex : 0);

    const pauseState = {
        resumeItemIndex,
        resumeTimeMs: clampedTime,
    };

    isTimelinePaused = true;
    timelinePauseState = pauseState;

    stopTimelinePlayback(false, false, { preservePauseState: true });

    const pausedFraction = totalDuration > 0
        ? clampProgress(clampedTime / totalDuration)
        : 0;
    applyTimelineProgressGeometry();
    setTimelineProgressVisuals(pausedFraction, { forceGeometryUpdate: true });
    updatePlaybackTimeDisplay(clampedTime, totalDuration);
    playVideoButton.textContent = 'Resume playback';
}

function resumeTimelinePlayback() {
    if (!isTimelinePaused || !timelinePauseState) {
        return;
    }

    const timelineItems = getTimelineItems();
    if (!timelineItems.length) {
        isTimelinePaused = false;
        timelinePauseState = null;
        playVideoButton.textContent = 'Play Back';
        return;
    }

    const { resumeItemIndex, resumeTimeMs } = timelinePauseState;
    const { totalDuration } = getTimelinePlaybackSegments();
    const clampedResumeTime = Math.max(
        0,
        Math.min(Number(resumeTimeMs) || 0, totalDuration),
    );

    if (clampedResumeTime >= totalDuration) {
        isTimelinePaused = false;
        timelinePauseState = null;
        resetTimelineProgressLine(totalDuration > 0 ? 1 : 0);
        updatePlaybackTimeDisplay(totalDuration, totalDuration);
        playVideoButton.textContent = 'Play Back';
        return;
    }

    const boundedIndex = Math.min(
        Math.max(0, Number(resumeItemIndex) || 0),
        Math.max(timelineItems.length - 1, 0),
    );

    isTimelinePaused = false;
    timelinePauseState = null;

    playTimelineSequence(boundedIndex, { timeMs: clampedResumeTime }).catch((error) => {
        console.error('Timeline playback failed.', error);
    });
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
            const exportContext = prepareExportPlaybackContext(timelineItems);
            renderExportSummary(
                exportContext.timelineItems,
                null,
                exportContext.playbackState,
            );
        } finally {
            exportButton.disabled = false;
            exportButton.textContent = originalLabel || 'Export video';
        }

        openExportDialog();
    });
}

let exportAbortController = null;

function abortActiveExport(reason = null) {
    if (!exportAbortController) {
        return;
    }

    const { signal } = exportAbortController;
    if (signal.aborted) {
        return;
    }

    const abortReason = reason
        || new DOMException('Export aborted by user.', 'AbortError');
    try {
        exportAbortController.abort(abortReason);
    } catch (error) {
        // Ignore abort errors caused by invalid controller state.
    }
}

function getAbortSignal(options) {
    if (!options) {
        return null;
    }

    if (typeof AbortSignal !== 'undefined' && options instanceof AbortSignal) {
        return options;
    }

    if (typeof options === 'object' && options !== null) {
        const { signal } = options;
        if (typeof AbortSignal !== 'undefined' && signal instanceof AbortSignal) {
            return signal;
        }
    }

    return null;
}

if (cancelExportButton) {
    cancelExportButton.addEventListener('click', () => {
        if (isExportingTimeline) {
            if (exportDialogStatus) {
                exportDialogStatus.dataset.state = 'progress';
                exportDialogStatus.textContent = 'Cancelling export…';
            }
            abortActiveExport(new DOMException('Export cancelled by user.', 'AbortError'));
            return;
        }
        closeExportDialog();
        resetExportPlaybackContext();
    });
}

let sharedExportAudioContext = null;
let sharedExportAudioSources = new WeakMap();
let pendingExportPlaybackContext = null;

function stabilizeAudioTrack(track) {
    if (!track) {
        return;
    }

    track.enabled = true;

    if (typeof track.applyConstraints === 'function') {
        const stabilityConstraints = {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
        };
        track.applyConstraints(stabilityConstraints).catch(() => {});
    }
}

function createSilentAudioKeepAlive(audioContext, destinationNode) {
    if (!audioContext || !destinationNode) {
        return null;
    }

    try {
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0;

        let sourceNode = null;
        if (typeof audioContext.createConstantSource === 'function') {
            sourceNode = audioContext.createConstantSource();
            sourceNode.offset.value = 0;
        } else if (typeof audioContext.createOscillator === 'function') {
            sourceNode = audioContext.createOscillator();
            sourceNode.frequency.value = 0;
        }

        if (!sourceNode) {
            return null;
        }

        sourceNode.connect(gainNode);
        gainNode.connect(destinationNode);

        if (typeof sourceNode.start === 'function') {
            sourceNode.start();
        }

        return {
            stop: () => {
                try {
                    if (typeof sourceNode.stop === 'function') {
                        sourceNode.stop();
                    }
                } catch (stopError) {
                    // Ignore stop errors when tearing down the keep-alive node.
                }
                try {
                    gainNode.disconnect();
                } catch (disconnectError) {
                    // Ignore disconnect errors when tearing down the keep-alive node.
                }
            },
        };
    } catch (error) {
        return null;
    }
}

function waitForDuration(durationMs, options = {}) {
    const safeDuration = Math.max(0, Math.round(Number(durationMs) || 0));
    if (safeDuration <= 0) {
        return Promise.resolve();
    }

    const signal = getAbortSignal(options);

    return new Promise((resolve) => {
        if (signal?.aborted) {
            resolve();
            return;
        }

        let timeoutId = 0;
        const finalize = () => {
            if (timeoutId) {
                window.clearTimeout(timeoutId);
                timeoutId = 0;
            }
            if (signal) {
                signal.removeEventListener('abort', handleAbort);
            }
            resolve();
        };
        const handleAbort = () => {
            finalize();
        };

        timeoutId = window.setTimeout(finalize, safeDuration);

        if (signal) {
            signal.addEventListener('abort', handleAbort, { once: true });
        }
    });
}

function waitForPreviewImageReady(timeoutMs = 1200) {
    if (!previewImage || previewImage.hidden) {
        return Promise.resolve();
    }

    if (previewImage.complete && previewImage.naturalWidth > 0) {
        return Promise.resolve();
    }

    const safeTimeout = Math.max(0, Math.round(Number(timeoutMs) || 0));

    return new Promise((resolve) => {
        let settled = false;
        let safeTimeoutHandle = 0;

        const finalize = () => {
            if (settled) {
                return;
            }
            settled = true;
            if (safeTimeoutHandle) {
                window.clearTimeout(safeTimeoutHandle);
            }
            previewImage.removeEventListener('load', finalize);
            previewImage.removeEventListener('error', finalize);
            resolve();
        };

        previewImage.addEventListener('load', finalize, { once: true });
        previewImage.addEventListener('error', finalize, { once: true });
        if (safeTimeout > 0) {
            safeTimeoutHandle = window.setTimeout(finalize, safeTimeout);
        }

        if (previewImage.complete && previewImage.naturalWidth > 0) {
            finalize();
        }
    });
}

function seekMediaElementTo(mediaElement, timeSeconds, options = {}) {
    if (!mediaElement || !Number.isFinite(timeSeconds)) {
        return Promise.resolve();
    }

    const timeoutMs = Math.max(0, Math.round(Number(options.timeoutMs) || 0));
    const signal = getAbortSignal(options);

    return new Promise((resolve) => {
        if (signal?.aborted) {
            resolve();
            return;
        }

        let settled = false;
        let timeoutId = 0;

        const cleanup = () => {
            mediaElement.removeEventListener('seeked', handleSeeked);
            mediaElement.removeEventListener('error', handleError);
            mediaElement.removeEventListener('loadeddata', handleLoadedData);
            if (timeoutId) {
                window.clearTimeout(timeoutId);
            }
            if (signal) {
                signal.removeEventListener('abort', handleAbort);
            }
        };

        const finalize = () => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            resolve();
        };

        const handleSeeked = () => {
            finalize();
        };

        const handleError = () => {
            finalize();
        };

        const handleLoadedData = () => {
            finalize();
        };

        const handleAbort = () => {
            finalize();
        };

        mediaElement.addEventListener('seeked', handleSeeked);
        mediaElement.addEventListener('error', handleError);
        mediaElement.addEventListener('loadeddata', handleLoadedData);

        if (timeoutMs > 0) {
            timeoutId = window.setTimeout(finalize, timeoutMs);
        }

        if (signal) {
            signal.addEventListener('abort', handleAbort, { once: true });
        }

        try {
            mediaElement.currentTime = timeSeconds;
            if (Math.abs((mediaElement.currentTime || 0) - timeSeconds) < 0.01) {
                finalize();
            }
        } catch (error) {
            finalize();
        }
    });
}

async function primeExportStartFrame(playbackContext, options = {}) {
    const signal = getAbortSignal(options);
    const playbackState = playbackContext?.playbackState || getTimelinePlaybackSegments();
    const segments = Array.isArray(playbackState?.segments) ? playbackState.segments : [];
    const frameRate = Math.max(1, Math.min(60, Math.round(options.frameRate) || 30));

    seekTimelineToFraction(0);

    if (signal?.aborted) {
        return;
    }

    const firstPlayableSegment = segments.find((segment) => segment && Number(segment.duration) > 0)
        || segments[0]
        || null;

    const activeItem = firstPlayableSegment?.item || activeTimelineItem || null;

    if (!activeItem) {
        await waitForNextFrame({ signal });
        return;
    }

    const fileType = activeItem.dataset.fileType || '';
    const laneCache = playbackState?.laneCache || null;
    const clipStartTime = Number.isFinite(firstPlayableSegment?.start)
        ? getTimelineItemStartTime(activeItem, laneCache)
        : 0;
    const segmentStart = Number.isFinite(firstPlayableSegment?.start)
        ? firstPlayableSegment.start
        : (clipStartTime || 0);
    const startOffsetMs = Math.max(0, Math.round(segmentStart - (clipStartTime || 0)));

    if (fileType.startsWith('video/')) {
        const objectUrl = activeItem.dataset.objectUrl || '';
        const targetTimeSeconds = startOffsetMs / 1000;
        const placeholderSnapshot = previewPlaceholder
            ? { hidden: previewPlaceholder.hidden, text: previewPlaceholder.textContent }
            : null;
        let bufferingActive = false;
        const enterBuffering = (message) => {
            bufferingActive = true;
            previewVideo.classList.add('is-buffering');
            previewVideo.hidden = true;
            if (previewArea) {
                previewArea.classList.add('is-buffering');
            }
            if (previewPlaceholder) {
                previewPlaceholder.hidden = false;
                previewPlaceholder.textContent = message;
            }
        };
        const exitBuffering = (options = {}) => {
            if (!bufferingActive) {
                return;
            }
            bufferingActive = false;
            previewVideo.classList.remove('is-buffering');
            if (previewArea) {
                previewArea.classList.remove('is-buffering');
            }
            if (previewPlaceholder) {
                if (options.keepPlaceholderHidden) {
                    previewPlaceholder.hidden = true;
                } else if (placeholderSnapshot) {
                    previewPlaceholder.hidden = placeholderSnapshot.hidden;
                } else {
                    previewPlaceholder.hidden = true;
                }
                if (placeholderSnapshot && typeof placeholderSnapshot.text === 'string') {
                    previewPlaceholder.textContent = placeholderSnapshot.text;
                } else if (!previewPlaceholder.hidden && defaultPreviewPlaceholderText) {
                    previewPlaceholder.textContent = defaultPreviewPlaceholderText;
                }
            }
        };

        enterBuffering('Preparing export preview…');
        previewVideo.pause();

        if (objectUrl) {
            try {
                await preloadTimelineVideo(objectUrl);
            } catch (warmupError) {
                if (!signal?.aborted) {
                    console.warn('First clip video could not buffer before export.', warmupError);
                }
            }
            if (signal?.aborted) {
                exitBuffering();
                return;
            }
            if (previewVideo.src !== objectUrl) {
                try {
                    previewVideo.src = objectUrl;
                    previewVideo.load();
                } catch (setSourceError) {
                    console.warn('Unable to prime export preview video source.', setSourceError);
                }
            }
        }

        try {
            await waitForMediaReady(previewVideo, { signal });
            if (signal?.aborted) {
                exitBuffering();
                return;
            }
        } catch (error) {
            exitBuffering();
            if (signal?.aborted) {
                return;
            }
            console.warn('First clip video could not buffer before export.', error);
        }

        await seekMediaElementTo(previewVideo, targetTimeSeconds, { timeoutMs: 900, signal });
        if (signal?.aborted) {
            exitBuffering();
            return;
        }

        previewVideo.pause();
        previewVideo.hidden = false;
        exitBuffering({ keepPlaceholderHidden: true });
        await ensurePreviewFrameSettled({
            signal,
            frameCount: Math.max(2, Math.round(frameRate / 24)),
        });
    } else if (fileType.startsWith('image/')) {
        await waitForPreviewImageReady(1500);
        if (signal?.aborted) {
            return;
        }
        applyActiveImageKeyframe({ reason: 'export-pre-roll' });
        applyActiveImageBlurKeyframe({ reason: 'export-pre-roll' });
    } else {
        refreshActiveOverlayLayers();
        const objectUrl = activeItem.dataset.objectUrl || '';
        if (objectUrl) {
            try {
                await preloadTimelineAudio(objectUrl);
            } catch (error) {
                if (!signal?.aborted) {
                    console.warn('First clip audio could not buffer before export.', error);
                }
            }
        }
    }

    const warmupFrames = Math.max(1, Math.min(4, Math.round(frameRate / 24)));
    for (let index = 0; index < warmupFrames; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        await waitForNextFrame({ signal });
        if (signal?.aborted) {
            return;
        }
    }
}

async function runExportPreRoll(preRollMs, frameRate, options = {}) {
    const signal = getAbortSignal(options);
    const safePreRoll = Math.max(0, Math.round(Number(preRollMs) || 0));
    const warmupFrames = Math.max(2, Math.round((Math.max(1, frameRate) / 1000) * Math.max(safePreRoll, 16)));
    const delayPromise = waitForDuration(safePreRoll, { signal });
    for (let index = 0; index < warmupFrames; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        await waitForNextFrame({ signal });
        if (signal?.aborted) {
            break;
        }
    }
    await delayPromise;
}

const EXPORT_PRE_ROLL_MS = 80;

function ensurePreviewFrameSettled(options = {}) {
    const frameCount = Math.max(1, Math.round(Number(options?.frameCount) || 2));
    const signal = getAbortSignal(options);

    let sequence = Promise.resolve();
    for (let index = 0; index < frameCount; index += 1) {
        sequence = sequence.then(() => waitForNextFrame({ signal }));
    }

    return sequence;
}

function waitForNextFrame(options = null) {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
        return Promise.resolve();
    }

    const signal = getAbortSignal(options);

    return new Promise((resolve) => {
        if (signal?.aborted) {
            resolve();
            return;
        }

        let rafId = 0;
        const finalize = () => {
            if (signal) {
                signal.removeEventListener('abort', handleAbort);
            }
            if (rafId) {
                window.cancelAnimationFrame(rafId);
            }
            resolve();
        };

        const handleAbort = () => {
            finalize();
        };

        rafId = window.requestAnimationFrame(() => {
            if (signal) {
                signal.removeEventListener('abort', handleAbort);
            }
            resolve();
        });

        if (signal) {
            signal.addEventListener('abort', handleAbort, { once: true });
        }
    });
}

function waitForMediaStreamTracks(stream, options = {}) {
    if (!stream || typeof window === 'undefined') {
        return Promise.resolve();
    }

    const { kind = 'audio', timeoutMs = 1500 } = options || {};
    const signal = getAbortSignal(options);
    let tracks = [];
    if (kind === 'audio') {
        tracks = stream.getAudioTracks();
    } else if (kind === 'video') {
        tracks = stream.getVideoTracks();
    } else {
        tracks = stream.getTracks();
    }

    if (!tracks.length) {
        return Promise.resolve();
    }

    const waiters = tracks.map((track) => new Promise((resolve) => {
        if (signal?.aborted) {
            resolve();
            return;
        }

        let settled = false;
        let timeoutId = 0;
        const finalize = () => {
            if (settled) {
                return;
            }
            settled = true;
            track.removeEventListener('unmute', handleUnmute);
            track.removeEventListener('ended', handleEnded);
            if (signal) {
                signal.removeEventListener('abort', handleAbort);
            }
            if (timeoutId) {
                window.clearTimeout(timeoutId);
            }
            resolve();
        };
        const handleUnmute = () => {
            if (track.readyState === 'live') {
                finalize();
            }
        };
        const handleEnded = () => {
            finalize();
        };
        const handleAbort = () => {
            finalize();
        };

        if (track.readyState === 'live') {
            finalize();
            return;
        }

        track.addEventListener('unmute', handleUnmute);
        track.addEventListener('ended', handleEnded);

        if (timeoutMs > 0) {
            timeoutId = window.setTimeout(finalize, timeoutMs);
        }

        if (signal) {
            signal.addEventListener('abort', handleAbort, { once: true });
        }
    }));

    return Promise.all(waiters).then(() => waitForNextFrame({ signal }));
}

function withTimeout(promise, timeoutMs, fallbackError = new Error('Operation timed out.')) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return promise;
    }

    return new Promise((resolve, reject) => {
        let settled = false;
        const timerId = window.setTimeout(() => {
            if (settled) {
                return;
            }
            settled = true;
            reject(fallbackError);
        }, Math.max(0, Math.round(timeoutMs)));

        promise.then((value) => {
            if (settled) {
                return;
            }
            settled = true;
            window.clearTimeout(timerId);
            resolve(value);
        }).catch((error) => {
            if (settled) {
                return;
            }
            settled = true;
            window.clearTimeout(timerId);
            reject(error);
        });
    });
}

function collectTimelineExportMedia(timelineItems) {
    const items = Array.isArray(timelineItems) ? timelineItems : [];
    const descriptors = [];
    const seen = new Set();

    items.forEach((item) => {
        if (!item || !item.dataset) {
            return;
        }
        const objectUrl = item.dataset.objectUrl || '';
        if (!objectUrl || seen.has(objectUrl)) {
            return;
        }
        seen.add(objectUrl);
        descriptors.push({
            objectUrl,
            fileType: item.dataset.fileType || '',
            element: item,
        });
    });

    return descriptors;
}

async function warmupExportPlaybackContext(playbackContext, options = {}) {
    const { timeoutMs = 4500 } = options || {};
    const signal = getAbortSignal(options);
    if (!playbackContext) {
        return { total: 0, succeeded: 0, failed: 0 };
    }

    const descriptors = Array.isArray(playbackContext.mediaDescriptors)
        ? playbackContext.mediaDescriptors
        : collectTimelineExportMedia(playbackContext.timelineItems);

    if (!playbackContext.mediaDescriptors) {
        playbackContext.mediaDescriptors = descriptors;
    }

    if (!descriptors.length) {
        const emptySummary = { total: 0, succeeded: 0, failed: 0 };
        playbackContext.warmupSummary = emptySummary;
        return emptySummary;
    }

    const runDescriptor = async (descriptor) => {
        const { objectUrl, fileType } = descriptor;
        if (!objectUrl) {
            return { ok: true, descriptor };
        }

        if (signal?.aborted) {
            const abortReason = signal.reason || new DOMException('Export warmup aborted.', 'AbortError');
            return { ok: false, descriptor, error: abortReason };
        }

        let basePromise = Promise.resolve();
        if (fileType.startsWith('image/')) {
            basePromise = preloadTimelineImage(objectUrl);
        } else if (fileType.startsWith('video/')) {
            basePromise = preloadTimelineVideo(objectUrl);
        } else if (fileType.startsWith('audio/')) {
            basePromise = preloadTimelineAudio(objectUrl);
        }

        return withTimeout(
            basePromise,
            timeoutMs,
            new Error('Timed out while preparing media for export.'),
        ).then(() => ({ ok: true, descriptor }))
            .catch((error) => ({ ok: false, descriptor, error }));
    };

    const maxConcurrentPreloads = 4;
    const workerCount = Math.min(maxConcurrentPreloads, descriptors.length);
    const results = new Array(descriptors.length);
    let nextIndex = 0;

    const workers = [];
    const getNextIndex = () => {
        if (nextIndex >= descriptors.length) {
            return null;
        }
        const currentIndex = nextIndex;
        nextIndex += 1;
        return currentIndex;
    };

    for (let i = 0; i < workerCount; i += 1) {
        workers.push((async () => {
            while (true) {
                const currentIndex = getNextIndex();
                if (currentIndex === null) {
                    return;
                }

                if (signal?.aborted) {
                    return;
                }

                const descriptor = descriptors[currentIndex];
                results[currentIndex] = await runDescriptor(descriptor);

                if (signal?.aborted) {
                    return;
                }
            }
        })());
    }

    await Promise.all(workers);
    const succeeded = results.filter((result) => result.ok).length;
    const failed = results.length - succeeded;
    const summary = { total: results.length, succeeded, failed };
    if (failed > 0) {
        summary.failures = results.filter((result) => !result.ok);
    }

    playbackContext.warmupSummary = summary;
    return summary;
}

function estimateVideoBitrate(resolution, frameRate) {
    const width = Math.max(1, Math.round(resolution?.width || 0));
    const height = Math.max(1, Math.round(resolution?.height || 0));
    const effectiveFrameRate = Math.max(1, Math.min(60, Math.round(frameRate) || 30));
    const pixelsPerSecond = width * height * effectiveFrameRate;
    if (!Number.isFinite(pixelsPerSecond) || pixelsPerSecond <= 0) {
        return 3_000_000;
    }

    const baseBitrate = Math.round(pixelsPerSecond * 0.07);
    const ceiling = (width >= 1920 || height >= 1080) ? 18_000_000 : 12_000_000;
    return Math.max(2_500_000, Math.min(ceiling, baseBitrate));
}

function estimateAudioBitrate(resolution) {
    const width = Math.max(1, Math.round(resolution?.width || 0));
    const height = Math.max(1, Math.round(resolution?.height || 0));
    const pixelCount = width * height;
    if (pixelCount >= 1920 * 1080) {
        return 256_000;
    }
    if (pixelCount >= 1280 * 720) {
        return 224_000;
    }
    return 160_000;
}

function deriveAudioContentType(videoMimeType) {
    if (typeof videoMimeType !== 'string') {
        return '';
    }
    if (videoMimeType.startsWith('video/mp4')) {
        return 'audio/mp4';
    }
    if (videoMimeType.startsWith('video/webm')) {
        return 'audio/webm';
    }
    if (videoMimeType.startsWith('video/')) {
        return `audio/${videoMimeType.slice('video/'.length)}`;
    }
    return videoMimeType;
}

async function resolveExportEncodingConfig(exportFormat, resolution, options = {}) {
    const frameRate = Math.max(1, Math.min(60, Math.round(options.frameRate) || 30));
    const config = {
        mimeType: exportFormat?.mimeType || 'video/webm',
        frameRate,
        videoBitsPerSecond: estimateVideoBitrate(resolution, frameRate),
        audioBitsPerSecond: estimateAudioBitrate(resolution),
        timesliceMs: null,
    };

    const mediaCapabilities = typeof navigator !== 'undefined'
        ? navigator.mediaCapabilities
        : null;
    if (!mediaCapabilities || typeof mediaCapabilities.encodingInfo !== 'function') {
        return config;
    }

    try {
        const encodingQuery = {
            type: 'record',
            video: {
                contentType: config.mimeType,
                width: Math.max(1, Math.round(resolution?.width || 0)),
                height: Math.max(1, Math.round(resolution?.height || 0)),
                bitrate: config.videoBitsPerSecond,
                framerate: frameRate,
            },
        };
        const audioContentType = deriveAudioContentType(config.mimeType);
        if (audioContentType) {
            encodingQuery.audio = {
                contentType: audioContentType,
                bitrate: config.audioBitsPerSecond,
                samplerate: 48000,
                channels: 2,
            };
        }

        const info = await mediaCapabilities.encodingInfo(encodingQuery);
        if (info?.supported) {
            if (info.powerEfficient === false) {
                config.videoBitsPerSecond = Math.min(
                    Math.round(config.videoBitsPerSecond * 1.15),
                    24_000_000,
                );
            } else if (info.powerEfficient === true) {
                config.videoBitsPerSecond = Math.max(
                    Math.round(config.videoBitsPerSecond * 0.9),
                    3_000_000,
                );
            }

            if (info.smooth === false) {
                config.timesliceMs = 500;
            }
        }
    } catch (error) {
        // Ignore capability detection errors and fall back to defaults.
    }

    return config;
}

function prepareExportPlaybackContext(existingItems = null) {
    const timelineItems = Array.isArray(existingItems)
        ? existingItems
        : getTimelineItems();
    const playbackState = getTimelinePlaybackSegments();
    const mutationVersion = (typeof getTimelinePlaybackMutationVersion === 'function')
        ? getTimelinePlaybackMutationVersion()
        : 0;
    const mediaDescriptors = collectTimelineExportMedia(timelineItems);
    pendingExportPlaybackContext = {
        timelineItems,
        playbackState,
        version: mutationVersion,
        mediaDescriptors,
        warmupSummary: null,
        encodingConfig: null,
    };
    return pendingExportPlaybackContext;
}

function resetExportPlaybackContext() {
    pendingExportPlaybackContext = null;
}

function getOrCreateSharedExportAudioContext() {
    if (sharedExportAudioContext && sharedExportAudioContext.state === 'closed') {
        sharedExportAudioContext = null;
        sharedExportAudioSources = new WeakMap();
    }

    if (!sharedExportAudioContext) {
        const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextConstructor) {
            return null;
        }

        try {
            sharedExportAudioContext = new AudioContextConstructor();
        } catch (error) {
            return null;
        }
    }

    return sharedExportAudioContext;
}

function getOrCreateExportAudioSourceNode(element, audioContext) {
    if (!element || !audioContext) {
        return null;
    }

    let sourceNode = sharedExportAudioSources.get(element);
    if (sourceNode) {
        return sourceNode;
    }

    try {
        sourceNode = audioContext.createMediaElementSource(element);
        sourceNode.connect(audioContext.destination);
        sharedExportAudioSources.set(element, sourceNode);
        return sourceNode;
    } catch (error) {
        return null;
    }
}

function attachPreviewAudioToStream(mediaElements, combinedStream) {
    const elements = Array.isArray(mediaElements)
        ? mediaElements.filter(Boolean)
        : [mediaElements].filter(Boolean);
    if (!elements.length || !combinedStream) {
        return {
            audioContext: null,
            success: false,
            error: new Error('Missing media elements or combined stream.'),
            cleanup: () => {},
        };
    }

    let lastError = null;

    let previewDestination = null;
    if (typeof getOrCreatePreviewAudioDestination === 'function') {
        previewDestination = getOrCreatePreviewAudioDestination();
    }

    if (previewDestination?.stream) {
        let previewKeepAlive = null;
        if (previewDestination.context) {
            previewKeepAlive = createSilentAudioKeepAlive(
                previewDestination.context,
                previewDestination,
            );
        }
        const primePreviewAudioGraph = () => {
            if (typeof ensureMediaElementGainNode !== 'function') {
                return;
            }
            elements.forEach((element) => {
                try {
                    ensureMediaElementGainNode(element);
                } catch (error) {
                    // Ignore failures when priming the preview audio graph.
                }
            });
        };

        primePreviewAudioGraph();

        let previewTracks = previewDestination.stream
            .getAudioTracks()
            .filter((track) => track && track.readyState !== 'ended');

        if (!previewTracks.length) {
            primePreviewAudioGraph();
            previewTracks = previewDestination.stream
                .getAudioTracks()
                .filter((track) => track && track.readyState !== 'ended');
        }
        
        const attachments = previewTracks
            .map((track) => {
                if (!track) {
                    return null;
                }
                const cloned = typeof track.clone === 'function' ? track.clone() : track;
                return cloned
                    ? {
                        original: track,
                        attached: cloned,
                        isClone: cloned !== track,
                    }
                    : null;
            })
            .filter(Boolean);

        if (attachments.length) {
            const previewContext = previewDestination.context
                || (typeof getOrCreatePreviewAudioContext === 'function'
                    ? getOrCreatePreviewAudioContext()
                    : null);
            if (previewContext && previewContext.state === 'suspended') {
                previewContext.resume().catch(() => {});
            }
            attachments.forEach(({ attached }) => {
                stabilizeAudioTrack(attached);
                combinedStream.addTrack(attached);
            });
            return {
                audioContext: previewContext,
                success: true,
                error: null,
                cleanup: () => {
                    attachments.forEach(({ attached, isClone }) => {
                        try {
                            if (typeof combinedStream.removeTrack === 'function') {
                                combinedStream.removeTrack(attached);
                            }
                        } catch (removeError) {
                            // Ignore removal errors during cleanup.
                        }
                        if (isClone && typeof attached.stop === 'function') {
                            attached.stop();
                        }
                    });
                    if (previewKeepAlive && typeof previewKeepAlive.stop === 'function') {
                        previewKeepAlive.stop();
                    }
                },
            };
        }

        if (previewKeepAlive && typeof previewKeepAlive.stop === 'function') {
            previewKeepAlive.stop();
        }
    }

    const directTracks = [];
    let missingDirectCapture = false;
    const pendingTracks = [];
    elements.forEach((element) => {
        if (typeof element?.captureStream === 'function') {
            try {
                const audioStream = element.captureStream();
                if (audioStream) {
                    const tracks = audioStream.getAudioTracks();
                    if (tracks.length) {
                        tracks.forEach((track) => {
                            pendingTracks.push(track);
                            directTracks.push(track);
                        });
                    } else {
                        missingDirectCapture = true;
                    }
                } else {
                    missingDirectCapture = true;
                }
            } catch (error) {
                lastError = error;
                missingDirectCapture = true;
            }
        } else {
            missingDirectCapture = true;
        }
    });
    const canUseDirectCapture = directTracks.length
        && !missingDirectCapture
        && elements.length === 1;
    // Prefer AudioContext mixing whenever more than one element contributes audio
    // to avoid drift between independently captured MediaStream tracks.
    if (canUseDirectCapture) {
        pendingTracks.forEach((track) => {
            stabilizeAudioTrack(track);
            combinedStream.addTrack(track);
        });
        return {
            audioContext: null,
            success: true,
            error: null,
            cleanup: () => {},
        };
    }

    pendingTracks.forEach((track) => {
        try {
            track.stop();
        } catch (error) {
            // Ignore track stop errors when falling back to AudioContext.
        }
    });

    const audioContext = getOrCreateSharedExportAudioContext();
    if (!audioContext) {
        return {
            audioContext: null,
            success: false,
            error: lastError || new Error('AudioContext is not supported in this browser.'),
            cleanup: () => {},
        };
    }

    if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
    }

    const destination = audioContext.createMediaStreamDestination();
    const keepAlive = createSilentAudioKeepAlive(audioContext, destination);
    const connectedSourceNodes = [];
    let hasSource = false;
    elements.forEach((element) => {
        try {
            const sourceNode = getOrCreateExportAudioSourceNode(element, audioContext);
            if (!sourceNode) {
                return;
            }
            sourceNode.connect(destination);
            connectedSourceNodes.push({ node: sourceNode, destination });
            hasSource = true;
        } catch (error) {
            lastError = error;
        }
    });

    const cleanupConnections = () => {
        connectedSourceNodes.forEach(({ node, destination: dest }) => {
            try {
                node.disconnect(dest);
            } catch (disconnectError) {
                // Ignore disconnection errors when cleaning up export routing.
            }
        });
        try {
            destination.stream.getAudioTracks().forEach((track) => {
                if (typeof track.stop === 'function') {
                    track.stop();
                }
            });
        } catch (error) {
            // Ignore destination cleanup errors.
        }
    };

    if (!hasSource) {
        cleanupConnections();
        return {
            audioContext: null,
            success: false,
            error: lastError || new Error('Unable to create audio sources for export.'),
            cleanup: () => {},
        };
    }

    const audioTracks = destination.stream.getAudioTracks();
    audioTracks.forEach((track) => {
        stabilizeAudioTrack(track);
        combinedStream.addTrack(track);
    });
    if (!audioTracks.length) {
        cleanupConnections();
        if (keepAlive && typeof keepAlive.stop === 'function') {
            keepAlive.stop();
        }
        return {
            audioContext: null,
            success: false,
            error: lastError || new Error('No audio tracks available from preview video.'),
            cleanup: () => {},
        };
    }

    return {
        audioContext,
        success: true,
        error: null,
        cleanup: () => {
            cleanupConnections();
            if (keepAlive && typeof keepAlive.stop === 'function') {
                keepAlive.stop();
            }
        },
    };
}

async function handleConfirmExport() {
    if (isExportingTimeline) {
        return;
    }

    const mutationVersion = (typeof getTimelinePlaybackMutationVersion === 'function')
        ? getTimelinePlaybackMutationVersion()
        : null;
    const pendingContextVersion = Number.isFinite(pendingExportPlaybackContext?.version)
        ? pendingExportPlaybackContext.version
        : null;
    let playbackContext = pendingExportPlaybackContext;
    if (!playbackContext || (mutationVersion !== null && mutationVersion !== pendingContextVersion)) {
        playbackContext = prepareExportPlaybackContext();
    }
    const timelineItems = Array.isArray(playbackContext?.timelineItems)
        ? playbackContext.timelineItems
        : getTimelineItems();
    if (!timelineItems.length) {
        alert('Upload an image or video to build your timeline.');
        return;
    }

    const playbackState = playbackContext?.playbackState || getTimelinePlaybackSegments();
    if (!playbackContext?.playbackState) {
        playbackContext.playbackState = playbackState;
    }
    const playbackSegments = Array.isArray(playbackState?.segments)
        ? playbackState.segments
        : [];
    const playbackDuration = Number.isFinite(playbackState?.totalDuration)
        ? playbackState.totalDuration
        : 0;
    if (!playbackSegments.length || playbackDuration <= 0) {
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
        exportDialogStatus.textContent = 'Preparing media for export…';
    }

    stopTimelinePlayback();

    if (exportAbortController?.signal && !exportAbortController.signal.aborted) {
        abortActiveExport(new DOMException('Cancelling previous export.', 'AbortError'));
    }

    const abortController = new AbortController();
    exportAbortController = abortController;
    const { signal } = abortController;
    const abortCleanups = [];

    const registerAbortHandler = (handler) => {
        if (typeof handler !== 'function') {
            return () => {};
        }

        const wrapped = () => {
            try {
                handler();
            } catch (error) {
                // Ignore abort handler errors.
            }
        };

        if (signal.aborted) {
            wrapped();
            return () => {};
        }

        signal.addEventListener('abort', wrapped);
        return () => {
            signal.removeEventListener('abort', wrapped);
        };
    };

    const throwIfAborted = () => {
        if (signal.aborted) {
            throw signal.reason || new DOMException('Export aborted.', 'AbortError');
        }
    };

    abortCleanups.push(registerAbortHandler(() => {
        stopTimelinePlayback(false, true);
    }));

    let encodingConfig = playbackContext?.encodingConfig || null;
    let warmupSummary = null;
    try {
        warmupSummary = await warmupExportPlaybackContext(playbackContext, { timeoutMs: 4500, signal });
        throwIfAborted();
        if (warmupSummary?.failed > 0) {
            console.warn('Some media items could not be prepared before export.', warmupSummary.failures);
        } else if (warmupSummary?.total) {
            console.info(`Prepared ${warmupSummary.succeeded}/${warmupSummary.total} media items for export.`);
        }
    } catch (warmupError) {
        if (signal.aborted) {
            throw warmupError;
        }
        console.warn('Export warmup encountered an error.', warmupError);
    }

    throwIfAborted();

    try {
        encodingConfig = await resolveExportEncodingConfig(exportFormat, resolution, {
            frameRate: encodingConfig?.frameRate || 30,
        });
    } catch (encodingError) {
        console.warn('Falling back to default export encoding configuration.', encodingError);
        encodingConfig = {
            mimeType: exportFormat.mimeType,
            frameRate: 30,
            videoBitsPerSecond: 6_000_000,
            audioBitsPerSecond: 192_000,
            timesliceMs: null,
        };
    }

    throwIfAborted();

    playbackContext.encodingConfig = encodingConfig;

    const captureFrameRate = Math.max(1, Math.min(60, Math.round(encodingConfig.frameRate) || 30));
    const readinessTimeout = captureFrameRate > 30 ? 1200 : 1500;

    await primeExportStartFrame(playbackContext, { frameRate: captureFrameRate, signal });
    throwIfAborted();

    if (exportDialogStatus) {
        exportDialogStatus.dataset.state = 'progress';
        exportDialogStatus.innerHTML = `
            <span class="visually-hidden" role="status">Exporting timeline preview to ${exportFormat.label}…</span>
            <div class="export-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuetext="Exporting timeline preview" aria-live="off">
                <div class="export-progress__bar"></div>
            </div>
        `.trim();
    }

    let stopMirroring = () => {};
    let recorder = null;
    let combinedStream = null;
    const recordedChunks = [];
    let exportAudioContext = null;
    let audioAttachmentCleanup = null;
    let recordingPromise = null;

    try {
        stopMirroring = startPreviewMirroring(resolution.width, resolution.height, {
            frameRate: captureFrameRate,
        });
        abortCleanups.push(registerAbortHandler(() => {
            stopMirroring();
        }));
        throwIfAborted();

        await runExportPreRoll(EXPORT_PRE_ROLL_MS, captureFrameRate, { signal });
        throwIfAborted();
        if (typeof exportMirrorCanvas.captureStream !== 'function') {
            throw new Error('Canvas captureStream is not supported in this browser.');
        }
        const canvasStream = exportMirrorCanvas.captureStream(captureFrameRate);
        if (!canvasStream) {
            throw new Error('Unable to access canvas capture stream.');
        }
        combinedStream = new MediaStream();
        abortCleanups.push(registerAbortHandler(() => {
            if (combinedStream) {
                combinedStream.getTracks().forEach((track) => {
                    try {
                        track.stop();
                    } catch (trackError) {
                        // Ignore track stop errors triggered during abort.
                    }
                });
            }
        }));
        canvasStream.getVideoTracks().forEach((track) => {
            combinedStream.addTrack(track);
            if (typeof track.applyConstraints === 'function') {
                track.applyConstraints({ frameRate: captureFrameRate }).catch(() => {});
            }
        });

        const overlayElements = typeof getActiveOverlayAudioElements === 'function'
            ? getActiveOverlayAudioElements()
            : [];
        const audioElementCandidates = [previewVideo]
            .concat(overlayElements.length ? overlayElements : [previewAudio].filter(Boolean));
        const uniqueAudioElements = Array.from(new Set(audioElementCandidates.filter(Boolean)));
        const audioAttachment = attachPreviewAudioToStream(uniqueAudioElements, combinedStream);
        exportAudioContext = audioAttachment.audioContext;
        if (typeof audioAttachment.cleanup === 'function') {
            audioAttachmentCleanup = audioAttachment.cleanup;
        }
        if (!audioAttachment.success) {
            console.warn('Unable to capture audio from preview video.', audioAttachment.error);
        }
        abortCleanups.push(registerAbortHandler(() => {
            if (typeof audioAttachmentCleanup === 'function') {
                try {
                    audioAttachmentCleanup();
                } catch (cleanupError) {
                    // Ignore cleanup errors triggered during abort.
                }
            }
        }));

        throwIfAborted();

        await waitForMediaStreamTracks(combinedStream, { kind: 'audio', timeoutMs: readinessTimeout, signal });
        throwIfAborted();
        await waitForMediaStreamTracks(combinedStream, { kind: 'video', timeoutMs: readinessTimeout, signal });
        throwIfAborted();

        const recorderOptions = { mimeType: exportFormat.mimeType };
        if (Number.isFinite(encodingConfig.videoBitsPerSecond)) {
            recorderOptions.videoBitsPerSecond = encodingConfig.videoBitsPerSecond;
        }
        if (Number.isFinite(encodingConfig.audioBitsPerSecond)) {
            recorderOptions.audioBitsPerSecond = encodingConfig.audioBitsPerSecond;
        }

        recorder = new MediaRecorder(combinedStream, recorderOptions);
        abortCleanups.push(registerAbortHandler(() => {
            if (recorder && recorder.state !== 'inactive') {
                try {
                    recorder.stop();
                } catch (stopError) {
                    // Ignore recorder stop errors triggered during abort.
                }
            }
        }));

        const recorderStarted = new Promise((resolve) => {
            recorder.addEventListener('start', () => {
                resolve();
            }, { once: true });
        });

        recordingPromise = new Promise((resolve, reject) => {
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

        const timesliceMs = Number.isFinite(encodingConfig.timesliceMs)
            && encodingConfig.timesliceMs > 0
            ? Math.max(0, Math.round(encodingConfig.timesliceMs))
            : null;
        if (timesliceMs) {
            recorder.start(timesliceMs);
        } else {
            recorder.start();
        }
        await recorderStarted;
        throwIfAborted();
        await waitForNextFrame({ signal });
        throwIfAborted();
        const playbackCompleted = await playTimelineSequence(0, null, playbackContext);
        if (recorder.state !== 'inactive') {
            recorder.stop();
        }

        const exportBlob = await recordingPromise;
        recordedChunks.length = 0;

        throwIfAborted();

        if (!playbackCompleted) {
            if (signal.aborted) {
                throw signal.reason || new DOMException('Export aborted.', 'AbortError');
            }
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
        const aborted = error?.name === 'AbortError' || signal.aborted;
        if (aborted) {
            console.info('Export cancelled.', error);
            if (exportDialogStatus) {
                exportDialogStatus.textContent = 'Export cancelled.';
                exportDialogStatus.dataset.state = 'idle';
            }
            closeExportDialog();
        } else {
            console.error('Failed to export timeline preview.', error);
            alert(`Export failed: ${error?.message || error}`);
            if (exportDialogStatus) {
                exportDialogStatus.textContent = 'Export failed. Please try again.';
                exportDialogStatus.dataset.state = 'warning';
            }
        }
    } finally {
        resetExportPlaybackContext();
        if (typeof audioAttachmentCleanup === 'function') {
            try {
                audioAttachmentCleanup();
            } catch (error) {
                // Ignore cleanup errors.
            }
        }
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
        recorder = null;
        combinedStream = null;
        exportAudioContext = null;
        stopMirroring();
        confirmExportButton.disabled = false;
        confirmExportButton.textContent = originalLabel || 'Confirm export';
        isExportingTimeline = false;
        abortCleanups.forEach((cleanup) => {
            if (typeof cleanup === 'function') {
                try {
                    cleanup();
                } catch (cleanupError) {
                    // Ignore abort cleanup errors.
                }
            }
        });
        if (exportAbortController === abortController) {
            exportAbortController = null;
        }
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
            resetExportPlaybackContext();
        }
    });
}

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') {
        return;
    }

    if (isPreviewFullscreen) {
        event.preventDefault();
        setPreviewFullscreenState(false, { restoreFocus: previewFullscreenToggle || true });
        return;
    }

    if (isExportDialogOpen()) {
        event.preventDefault();
        closeExportDialog();
        resetExportPlaybackContext();
    }
});

playVideoButton.addEventListener('click', () => {
    if (isTimelinePlaying) {
        pauseTimelinePlayback();
        return;
    }

    if (isTimelinePaused && timelinePauseState) {
        resumeTimelinePlayback();
        return;
    }

    const timelineItems = getTimelineItems();
    if (!timelineItems.length) {
        alert('Upload an image or video to build your timeline.');
        return;
    }

    const playbackState = getTimelinePlaybackSegments();
    const { totalDuration } = playbackState;
    const progressSource = (typeof getTimelineProgressFraction === 'function')
        ? getTimelineProgressFraction()
        : clampProgress(timelineProgressCurrentFraction || 0);
    const startTimeMs = totalDuration > 0
        ? Math.min(
            Math.max(Math.round(progressSource * totalDuration), 0),
            Math.max(totalDuration - 1, 0),
        )
        : 0;
    const resumeOptions = totalDuration > 0 ? { timeMs: startTimeMs } : null;

    const startIndex = activeTimelineItem ? timelineItems.indexOf(activeTimelineItem) : 0;
    playTimelineSequence(startIndex >= 0 ? startIndex : 0, resumeOptions).catch((error) => {
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
