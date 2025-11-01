                expandedWindowEnd,
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

        const recentOverlayHoldThreshold = OVERLAY_TIMELINE_WINDOW_SLACK_MS * 6;
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
            entry.handles = Array.from(layer.querySelectorAll('.preview-resize-handle'));
            entry = {
                layer,
                content,
                image,
                objectURL: '',
                frame: null,
                isVisible: false,
                layerGroup: null,
                zIndex: 0,
                borderRadius: 0,
                opacity: 1,
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
        entry.opacity = 1;
        entry.frame = null;
        entry.lastTimelineTime = null;
        entry.renderedFrame = null;
        entry.renderedOpacity = null;
        entry.renderedZIndex = null;
        entry.renderedRotation = null;
        resetOverlayAnimationState(entry);

        if (entry.layer) {
            entry.layer.classList.remove('is-active', 'is-dragging', 'is-resizing');
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
            if (age > (OVERLAY_TIMELINE_WINDOW_SLACK_MS * 2)) {
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

if (imageBlurAddKeyframeButton) {
    imageBlurAddKeyframeButton.addEventListener('click', () => {
        if (!isImageTimelineItem(activeTimelineItem)) {
            showImageBlurKeyframeStatus('Select an image clip to add keyframes.');
            return;
        }
        if (!imageBlurInput || imageBlurInput.disabled || imageBlurControls?.hidden) {
            showImageBlurKeyframeStatus('Enable image blur to add keyframes.');
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