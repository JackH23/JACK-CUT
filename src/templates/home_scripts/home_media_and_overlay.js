const uploadInput = document.getElementById('video-upload');
const uploadButton = document.getElementById('upload-button');
const uploadMetaStatus = document.querySelector('.upload-meta__status');
const uploadMetaHint = document.querySelector('.upload-meta__hint');
const uploadGallery = document.getElementById('upload-gallery');
const uploadGalleryList = document.getElementById('upload-gallery-list');
const uploadGalleryEmptyState = document.getElementById('upload-gallery-empty');
const previewArea = document.querySelector('.preview-area');
const previewViewport = document.querySelector('.preview-viewport');
const previewVideo = document.getElementById('preview-video');
const previewAudio = document.getElementById('preview-audio');
let activeAudioOverlayEntry = null;
const overlayAudioElementRegistry = new Map();

function updateUploadGalleryEmptyState() {
    if (!uploadGallery || !uploadGalleryList) {
        return;
    }

    const hasItems = uploadGalleryList.children.length > 0;
    if (uploadGalleryEmptyState) {
        uploadGalleryEmptyState.hidden = hasItems;
    }

    if (uploadGallery.classList) {
        uploadGallery.classList.toggle('upload-gallery--has-items', hasItems);
    }
}

updateUploadGalleryEmptyState();

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
const navBar = document.querySelector('.nav-bar');
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
    const waveformOverlay = timelineItem.querySelector('.timeline-waveform__overlay');
    if (waveformOverlay) {
        summary.classList.add('timeline-waveform__summary');
        const waveformTitle = waveformOverlay.querySelector('.timeline-waveform__title');
        if (waveformTitle && waveformTitle.parentNode === waveformOverlay) {
            waveformOverlay.insertBefore(summary, waveformTitle.nextSibling);
        } else {
            waveformOverlay.appendChild(summary);
        }
        return summary;
    }
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
    const itemRect = item.getBoundingClientRect();
    const relativeX = clientX - rect.left - paddingLeft;
    const pointerOffset = timelineDragPointerOffsets.get(item);
    const fallbackOffset = itemRect && Number.isFinite(itemRect.width)
        ? itemRect.width / 2
        : 0;
    const offsetX = pointerOffset && Number.isFinite(pointerOffset.x)
        ? Math.max(0, Math.min(pointerOffset.x, itemRect?.width || fallbackOffset))
        : fallbackOffset;
    const adjustedRelativeX = relativeX - offsetX;
    const perPixel = getTimelineDurationPerPixel();
    const desiredStartMs = Math.max(0, Math.round(Math.max(adjustedRelativeX, 0) * perPixel));
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
