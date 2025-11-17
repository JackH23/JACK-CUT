
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

