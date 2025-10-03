const uploadInput = document.getElementById('video-upload');
const uploadButton = document.getElementById('upload-button');
const uploadMetaStatus = document.querySelector('.upload-meta__status');
const uploadMetaHint = document.querySelector('.upload-meta__hint');
const mediaLibraryList = document.getElementById('media-library-list');
const mediaLibraryEmptyMessage = document.getElementById('media-library-empty');
const mediaLibraryCountLabel = document.getElementById('media-library-count');
const MEDIA_LIBRARY_DRAG_TYPE = 'application/x-media-library-item';
const mediaLibraryItems = new Map();
let mediaLibrarySequence = 0;
const objectUrlUsage = new Map();
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
const videoQualitySelect = document.getElementById('video-quality');
const settingsTabs = Array.from(document.querySelectorAll('.settings-tab'));
const settingsSections = Array.from(document.querySelectorAll('.settings-section'));
const exportMirrorCanvas = document.createElement('canvas');
const exportMirrorContext = exportMirrorCanvas.getContext('2d');
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

function retainObjectUrl(objectURL) {
    if (!objectURL) {
        return;
    }
    const current = objectUrlUsage.get(objectURL) || 0;
    objectUrlUsage.set(objectURL, current + 1);
}

function releaseObjectUrl(objectURL) {
    if (!objectURL) {
        return;
    }
    const current = objectUrlUsage.get(objectURL) || 0;
    if (current <= 1) {
        objectUrlUsage.delete(objectURL);
        try {
            URL.revokeObjectURL(objectURL);
        } catch (error) {
            console.warn('Failed to revoke object URL.', error);
        }
    } else {
        objectUrlUsage.set(objectURL, current - 1);
    }
}

function describeMediaKind(fileType) {
    if (fileType.startsWith('video/')) {
        return 'Video';
    }
    if (fileType.startsWith('image/')) {
        return 'Image';
    }
    return 'Media';
}

function formatMediaLibraryCount(count) {
    if (!Number.isFinite(count) || count <= 0) {
        return '0 items';
    }
    return count === 1 ? '1 item' : `${count} items`;
}

function truncateFileName(name, limit = 42) {
    if (typeof name !== 'string') {
        return '';
    }
    if (name.length <= limit) {
        return name;
    }
    return `${name.slice(0, Math.max(0, limit - 1))}…`;
}

function updateMediaLibraryState() {
    if (!mediaLibraryList) {
        return;
    }
    const count = mediaLibraryList.children.length;
    if (mediaLibraryCountLabel) {
        mediaLibraryCountLabel.textContent = formatMediaLibraryCount(count);
    }
    if (mediaLibraryEmptyMessage) {
        mediaLibraryEmptyMessage.hidden = count > 0;
    }
    mediaLibraryList.hidden = count === 0;
}

function isMediaLibraryDrag(event) {
    const transfer = event?.dataTransfer;
    if (!transfer) {
        return false;
    }
    const types = Array.from(transfer.types || []);
    return types.includes(MEDIA_LIBRARY_DRAG_TYPE);
}

function createMediaLibraryItemElement(entry) {
    if (!entry || !mediaLibraryList) {
        return null;
    }

    const item = document.createElement('li');
    item.className = 'media-library-item';
    item.dataset.mediaLibraryId = entry.id;
    item.dataset.fileType = entry.type;
    item.dataset.objectUrl = entry.objectURL;
    item.setAttribute('role', 'button');
    item.tabIndex = 0;

    const thumb = document.createElement('div');
    thumb.className = 'media-library-item__thumb';
    item.appendChild(thumb);

    const badge = document.createElement('span');
    badge.className = 'media-library-item__type';
    badge.textContent = describeMediaKind(entry.type);
    thumb.appendChild(badge);

    if (entry.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = entry.objectURL;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.autoplay = true;
        video.preload = 'metadata';
        thumb.appendChild(video);
    } else {
        const image = document.createElement('img');
        image.src = entry.thumbnailUrl || entry.objectURL;
        image.alt = entry.name;
        thumb.appendChild(image);
    }

    const label = document.createElement('p');
    label.className = 'media-library-item__label';
    label.textContent = entry.name;
    label.title = entry.name;
    item.appendChild(label);

    item.addEventListener('dragstart', (event) => {
        item.classList.add('is-dragging');
        const transfer = event.dataTransfer;
        if (transfer) {
            transfer.effectAllowed = 'copy';
            transfer.setData(MEDIA_LIBRARY_DRAG_TYPE, entry.id);
            transfer.setData('text/plain', entry.name);
        }
    });

    item.addEventListener('dragend', () => {
        item.classList.remove('is-dragging');
    });

    item.addEventListener('dblclick', () => {
        addLibraryMediaToTimeline(entry.id).catch((error) => {
            console.error('Failed to add media from library to timeline.', error);
        });
    });

    item.addEventListener('keydown', (event) => {
        if (event.defaultPrevented) {
            return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            addLibraryMediaToTimeline(entry.id).catch((error) => {
                console.error('Failed to add media from library to timeline.', error);
            });
        }
    });

    return item;
}

async function addFileToMediaLibrary(file) {
    if (!file || !mediaLibraryList) {
        return null;
    }

    const fileType = file.type || '';
    const isVideo = fileType.startsWith('video/');
    const isImage = fileType.startsWith('image/');

    if (!isVideo && !isImage) {
        alert('Unsupported file type. Please upload an image or video file.');
        return null;
    }

    const objectURL = URL.createObjectURL(file);
    const entry = {
        id: `media-${Date.now()}-${mediaLibrarySequence++}`,
        name: file.name || `${describeMediaKind(fileType)} clip`,
        type: fileType,
        objectURL,
        thumbnailUrl: null,
    };

    retainObjectUrl(objectURL);
    mediaLibraryItems.set(entry.id, entry);

    if (isImage) {
        try {
            entry.thumbnailUrl = await generateImageThumbnail(objectURL, 160, 110);
        } catch (error) {
            entry.thumbnailUrl = objectURL;
        }
    }

    const element = createMediaLibraryItemElement(entry);
    if (element) {
        mediaLibraryList.appendChild(element);
    }
    updateMediaLibraryState();
    return entry;
}

async function revealPreviewImageSource(objectURL, options = {}) {
    const { immediate = false } = options;

    if (!previewImage || !objectURL) {
        return;
    }

    if (!previewImage.hidden && previewImage.src === objectURL) {
        previewImage.classList.add('is-visible');
        return;
    }

    try {
        await preloadTimelineImage(objectURL);
    } catch (error) {
        console.warn('Unable to preload timeline image before preview.', error);
    }

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
                    previewImage.classList.add('is-visible');
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

const IMAGE_FRAME_DURATION = 1000;
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
        : '720p';
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

    return {
        left: storedTransform.left * viewportWidth,
        top: storedTransform.top * viewportHeight,
        width: storedTransform.width * viewportWidth,
        height: storedTransform.height * viewportHeight,
    };
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
    const drawX = transform.left + (transform.width - drawWidth) / 2;
    const drawY = transform.top + (transform.height - drawHeight) / 2;

    exportMirrorContext.drawImage(
        previewImage,
        drawX,
        drawY,
        drawWidth,
        drawHeight,
    );

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

    const selectedQuality = videoQualitySelect?.value || '720p';
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
    setActiveTimelineItem(activeItem);
    loadPreviewFromTimeline(activeItem, activeSegment?.items || null);

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
        const total = getTotalTimelineDuration();
        resetTimelineProgressLine(getTimelineFractionForTime(startTime));
        updatePlaybackTimeDisplay(startTime, total);
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
        if (draggingItem || isMediaLibraryDrag(event)) {
            event.preventDefault();
        }
    });

    timelineTrack.addEventListener('dragover', (event) => {
        const draggingItem = timelineTrack.querySelector('.timeline-item.dragging');
        const libraryDrag = isMediaLibraryDrag(event);
        if (!draggingItem && !libraryDrag) {
            return;
        }
        event.preventDefault();
        const lane = getTimelineLaneFromEvent(event);
        if (!lane) {
            return;
        }
        setActiveDropLane(lane);
        const transfer = event.dataTransfer;
        if (transfer) {
            transfer.dropEffect = draggingItem ? 'move' : 'copy';
        }
        if (draggingItem) {
            const afterElement = getDragAfterElement(lane, event.clientX);
            if (!afterElement) {
                lane.appendChild(draggingItem);
            } else if (afterElement !== draggingItem) {
                lane.insertBefore(draggingItem, afterElement);
            }
            draggingItem.dataset.laneIndex = lane.dataset.laneIndex || '0';
        }
    });

    timelineTrack.addEventListener('drop', async (event) => {
        event.preventDefault();
        const draggingItem = timelineTrack.querySelector('.timeline-item.dragging');
        const libraryDrag = isMediaLibraryDrag(event);
        const lane = getTimelineLaneFromEvent(event) || ensureTimelineLane(0);
        const afterElement = lane ? getDragAfterElement(lane, event.clientX) : null;
        if (draggingItem) {
            draggingItem.classList.remove('dragging');
            draggingItem.draggable = true;
            if (lane) {
                draggingItem.dataset.laneIndex = lane.dataset.laneIndex || '0';
                if (afterElement && afterElement !== draggingItem && afterElement.parentElement === lane) {
                    lane.insertBefore(draggingItem, afterElement);
                }
            }
        } else if (libraryDrag) {
            const transfer = event.dataTransfer;
            const mediaId = transfer?.getData(MEDIA_LIBRARY_DRAG_TYPE) || '';
            if (mediaId) {
                try {
                    await addLibraryMediaToTimeline(mediaId, {
                        lane,
                        beforeElement: afterElement,
                    });
                } catch (error) {
                    console.error('Failed to add media from library to timeline.', error);
                }
            }
        }
        setActiveDropLane(null);
        cleanupEmptyTimelineLanes();
        updateTimelineEmptyState();
        updateActiveTimelineIndicators();
    });
}

ensureTimelineLane(0);
updateTimelineEmptyState();
updateMediaLibraryState();

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
        const keys = ['left', 'top', 'width', 'height'];
        const hasAll = keys.every((key) => Number.isFinite(parsed[key]));

        if (!hasAll) {
            return null;
        }

        const aspectRatio = Number.isFinite(parsed.aspectRatio) && parsed.aspectRatio > 0
            ? parsed.aspectRatio
            : null;

        return {
            left: parsed.left,
            top: parsed.top,
            width: parsed.width,
            height: parsed.height,
            aspectRatio,
        };
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
    const viewportWidth = Math.max(0, viewportSize.width || 0);
    const viewportHeight = Math.max(0, viewportSize.height || 0);

    if (viewportWidth <= 0 || viewportHeight <= 0) {
        return false;
    }

    const nextWidth = storedTransform.width * viewportWidth;
    const nextHeight = storedTransform.height * viewportHeight;
    const nextAspectRatio = storedTransform.aspectRatio && storedTransform.aspectRatio > 0
        ? storedTransform.aspectRatio
        : ((nextWidth > 0 && nextHeight > 0) ? nextWidth / nextHeight : 1);

    if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight)) {
        return false;
    }

    previewImageTransform = {
        left: storedTransform.left * viewportWidth,
        top: storedTransform.top * viewportHeight,
        width: nextWidth,
        height: nextHeight,
        aspectRatio: nextAspectRatio > 0 ? nextAspectRatio : 1,
    };

    lastPreviewViewportSize = { width: viewportWidth, height: viewportHeight };
    applyPreviewImageTransform();
    return true;
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

function persistPreviewImageTransformForActiveTimelineItem() {
    if (!activeTimelineItem || !previewImageTransform || !previewViewport) {
        return;
    }

    const fileType = activeTimelineItem.dataset.fileType || '';

    if (!fileType.startsWith('image/')) {
        return;
    }

    const viewportSize = getPreviewViewportSize();
    const viewportWidth = Math.max(0, viewportSize.width || 0);
    const viewportHeight = Math.max(0, viewportSize.height || 0);

    if (viewportWidth <= 0 || viewportHeight <= 0) {
        return;
    }

    const normalized = {
        left: previewImageTransform.left / viewportWidth,
        top: previewImageTransform.top / viewportHeight,
        width: previewImageTransform.width / viewportWidth,
        height: previewImageTransform.height / viewportHeight,
        aspectRatio: previewImageTransform.aspectRatio && previewImageTransform.aspectRatio > 0
            ? previewImageTransform.aspectRatio
            : ((previewImageTransform.width > 0 && previewImageTransform.height > 0)
                ? previewImageTransform.width / previewImageTransform.height
                : 1),
    };

    const values = [normalized.left, normalized.top, normalized.width, normalized.height, normalized.aspectRatio];

    if (!values.every((value) => Number.isFinite(value))) {
        return;
    }

    activeTimelineItem.dataset.previewImageTransform = JSON.stringify(normalized);
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

    const alignment = alignmentOverride
        || evaluatePreviewImageAlignment(previewImageTransform, getPreviewViewportSize());
    updatePreviewViewportAlignmentState(alignment);
    updatePreviewOutsideOutline();
    updatePreviewGuides(previewImageTransform, alignment);
}

function clearPreviewImageTransform() {
    previewImageTransform = null;
    if (previewImageFrame) {
        previewImageFrame.style.removeProperty('transform');
        previewImageFrame.style.removeProperty('width');
        previewImageFrame.style.removeProperty('height');
        previewImageFrame.classList.remove('is-dragging', 'is-resizing');
    }
    resetPreviewViewportAlignmentState();
    hidePreviewOutsideOutline();
    setPreviewGuidesVisible(false);
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
    renderExportSummary(getTimelineItems(), null);
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

if (videoQualitySelect) {
    videoQualitySelect.addEventListener('change', () => {
        if (isExportDialogOpen()) {
            renderExportSummary(getTimelineItems(), null);
        }
    });
}

function clampProgress(value) {
    return Math.min(Math.max(value, 0), 1);
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

function stopTimelinePlayback(resetButton = true, resetProgress = true) {
    const abort = timelinePlaybackAbort;
    timelinePlaybackAbort = null;

    if (typeof abort === 'function') {
        abort();
    }

    const wasPlaying = isTimelinePlaying;
    isTimelinePlaying = false;

    stopPlaybackClock(resetProgress);

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
    if (item !== activeTimelineItem) {
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
        setPreviewMode('has-image');
        previewVideo.pause();
        previewVideo.hidden = true;
        previewVideo.removeAttribute('src');
        setPreviewImageVisibility(true);
        void revealPreviewImageSource(objectURL, { immediate: true });
        resetPreviewScroll();
        playVideoButton.textContent = 'Play Back';
    }
}

async function registerUploadedFile(file) {
    if (!file) {
        return null;
    }
    return addFileToMediaLibrary(file);
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

async function addToTimeline(file, objectURL, options = {}) {
    const targetLane = options.lane || ensureTimelineLane(0);
    const beforeElement = options.beforeElement instanceof HTMLElement
        ? options.beforeElement
        : null;
    if (timelineEmptyState) {
        timelineEmptyState.hidden = true;
    }

    retainObjectUrl(objectURL);

    const timelineItem = document.createElement('div');
    timelineItem.className = 'timeline-item';
    timelineItem.setAttribute('role', 'listitem');
    timelineItem.tabIndex = 0;
    const mediaLibraryId = options.mediaLibraryId || file.mediaLibraryId;
    timelineItem.dataset.fileType = file.type;
    timelineItem.dataset.objectUrl = objectURL;
    timelineItem.dataset.displayName = file.name;
    if (mediaLibraryId) {
        timelineItem.dataset.mediaLibraryId = mediaLibraryId;
    }

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
        const providedThumbnail = options.thumbnailUrl || file.thumbnailUrl;
        imageThumb.src = providedThumbnail || await generateImageThumbnail(objectURL);
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

    if (targetLane) {
        timelineItem.dataset.laneIndex = targetLane.dataset.laneIndex || '0';
        if (beforeElement && beforeElement.parentElement === targetLane) {
            targetLane.insertBefore(timelineItem, beforeElement);
        } else {
            targetLane.appendChild(timelineItem);
        }
    } else if (timelineTrack) {
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
            if (fileType.startsWith('image/')) {
                releaseTimelineImage(url);
            }
            releaseObjectUrl(url);
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
    renderExportSummary(getTimelineItems(), null);
}

async function addLibraryMediaToTimeline(mediaId, options = {}) {
    if (!mediaId) {
        return null;
    }

    const entry = mediaLibraryItems.get(mediaId);
    if (!entry) {
        return null;
    }

    const laneIndex = typeof options.laneIndex === 'number'
        ? Number(options.laneIndex)
        : null;
    let lane = options.lane instanceof HTMLElement ? options.lane : null;
    if (!lane && laneIndex !== null) {
        lane = ensureTimelineLane(laneIndex);
    }
    if (!lane) {
        lane = ensureTimelineLane(0);
    }

    if (!lane) {
        return null;
    }

    const beforeElement = options.beforeElement instanceof HTMLElement
        ? options.beforeElement
        : null;

    const descriptor = {
        type: entry.type,
        name: entry.name,
        thumbnailUrl: entry.thumbnailUrl,
        mediaLibraryId: entry.id,
    };

    try {
        return await addToTimeline(descriptor, entry.objectURL, {
            lane,
            beforeElement,
            mediaLibraryId: entry.id,
            thumbnailUrl: entry.thumbnailUrl,
        });
    } catch (error) {
        releaseObjectUrl(entry.objectURL);
        throw error;
    }
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

    const supportedFiles = files.filter((file) => {
        const type = file?.type || '';
        return type.startsWith('image/') || type.startsWith('video/');
    });

    if (uploadMetaStatus) {
        if (supportedFiles.length) {
            const clipLabel = supportedFiles.length === 1 ? 'item' : 'items';
            uploadMetaStatus.textContent = `${supportedFiles.length} ${clipLabel} added to your library`;
        } else {
            uploadMetaStatus.textContent = 'No compatible clips were added';
        }
    }

    if (uploadMetaHint) {
        const latestFile = supportedFiles[supportedFiles.length - 1];
        if (latestFile?.name) {
            const truncatedName = truncateFileName(latestFile.name, 48);
            uploadMetaHint.textContent = supportedFiles.length === 1
                ? `Drag ${truncatedName} into the timeline to begin editing.`
                : `${truncatedName} and ${supportedFiles.length - 1} more ready in the library.`;
        } else {
            uploadMetaHint.textContent = 'Drag media from the library into the timeline to start editing.';
        }
    }

    for (const file of files) {
        // eslint-disable-next-line no-await-in-loop
        await registerUploadedFile(file);
    }

    if (event.target instanceof HTMLInputElement) {
        event.target.value = '';
    }
});

uploadButton.addEventListener('click', () => uploadInput.click());

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
        setPreviewMode('has-image');
        previewVideo.pause();
        previewVideo.hidden = true;
        previewVideo.removeAttribute('src');
        setPreviewImageVisibility(true);
        previewPlaceholder.hidden = true;
        await revealPreviewImageSource(objectURL);
        resetPreviewScroll();

        await new Promise((resolve) => {
            let resolved = false;
            const clipDuration = Number(timelineItem.dataset.imageDuration)
                || IMAGE_FRAME_DURATION;
            const effectiveDuration = playbackWindow === null
                ? clipDuration
                : Math.min(clipDuration, playbackWindow);
            const timeoutId = window.setTimeout(() => {
                if (resolved) {
                    return;
                }
                resolved = true;
                if (timelinePlaybackAbort === abortPlayback) {
                    timelinePlaybackAbort = null;
                }
                resolve();
            }, Math.max(0, Math.round(effectiveDuration)));

            const abortPlayback = () => {
                if (resolved) {
                    return;
                }
                resolved = true;
                window.clearTimeout(timeoutId);
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
        videoQualitySelect?.value,
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

