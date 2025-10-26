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

let previewViewportRenderSizeCache = null;

function setPreviewViewportRenderSize(width, height) {
    const nextWidth = Math.max(0, Number(width) || 0);
    const nextHeight = Math.max(0, Number(height) || 0);

    if (previewViewportRenderSizeCache
        && previewViewportRenderSizeCache.width === nextWidth
        && previewViewportRenderSizeCache.height === nextHeight) {
        return previewViewportRenderSizeCache;
    }

    previewViewportRenderSizeCache = {
        width: nextWidth,
        height: nextHeight,
    };

    return previewViewportRenderSizeCache;
}

function getPreviewViewportRenderSize() {
    return previewViewportRenderSizeCache;
}

function invalidatePreviewViewportRenderSize() {
    previewViewportRenderSizeCache = null;
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
    if (!previewImageFrame || !previewViewport) {
        return false;
    }

    const viewportWidth = Math.max(0, previewViewport.clientWidth);
    const viewportHeight = Math.max(0, previewViewport.clientHeight);

    if (viewportWidth === 0 || viewportHeight === 0) {
        return false;
    }

    const canvasWidth = Math.max(1, exportMirrorCanvas.width);
    const canvasHeight = Math.max(1, exportMirrorCanvas.height);
    const scaleX = canvasWidth / viewportWidth;
    const scaleY = canvasHeight / viewportHeight;

    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) {
        return false;
    }

    const drawElementSnapshot = (element, transform) => {
        if (!element || element.hidden || !element.complete || !transform) {
            return false;
        }

        const naturalWidth = Math.max(1, element.naturalWidth || 0);
        const naturalHeight = Math.max(1, element.naturalHeight || 0);
        const scale = Math.max(transform.width / naturalWidth, transform.height / naturalHeight);
        if (!Number.isFinite(scale) || scale <= 0) {
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

        if (window.getComputedStyle) {
            const computedStyle = window.getComputedStyle(element);
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

        exportMirrorContext.filter = blurRadius > 0 ? `blur(${blurRadius}px)` : 'none';
        exportMirrorContext.drawImage(element, 0, 0, drawWidth, drawHeight);
        exportMirrorContext.filter = 'none';

        exportMirrorContext.restore();
        exportMirrorContext.restore();
        exportMirrorContext.restore();
        exportMirrorContext.restore();
        exportMirrorContext.setTransform(1, 0, 0, 1, 0, 0);

        return true;
    };

    let drewAny = false;

    if (previewImageTransitionBuffer && !previewImageTransitionBuffer.hidden) {
        let bufferTransform = null;
        const snapshot = previewImageTransitionBuffer.dataset.transitionTransform;
        if (snapshot) {
            try {
                const parsed = JSON.parse(snapshot);
                if (parsed && typeof parsed === 'object') {
                    bufferTransform = {
                        left: Number(parsed.left) || 0,
                        top: Number(parsed.top) || 0,
                        width: Number(parsed.width) || 0,
                        height: Number(parsed.height) || 0,
                        rotation: Number(parsed.rotation) || 0,
                    };
                }
            } catch (error) {
                bufferTransform = null;
            }
        }

        if (drawElementSnapshot(previewImageTransitionBuffer, bufferTransform)) {
            drewAny = true;
        }
    }

    if (previewImage && !previewImage.hidden && previewImage.complete) {
        const activeTransform = getActivePreviewImageTransform(viewportWidth, viewportHeight);
        if (drawElementSnapshot(previewImage, activeTransform)) {
            drewAny = true;
        }
    }

    return drewAny;
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

        let viewportWidth = 0;
        let viewportHeight = 0;

        const cachedViewportSize = getPreviewViewportRenderSize();
        if (cachedViewportSize) {
            viewportWidth = Math.max(0, Number(cachedViewportSize.width) || 0);
            viewportHeight = Math.max(0, Number(cachedViewportSize.height) || 0);
        } else if (previewViewport) {
            viewportWidth = Math.max(0, previewViewport.clientWidth);
            viewportHeight = Math.max(0, previewViewport.clientHeight);
            setPreviewViewportRenderSize(viewportWidth, viewportHeight);
        }

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
        lane.dataset.laneIndex = laneIndex;
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
    if (!timelineEmptyState || !timelineTrack) {