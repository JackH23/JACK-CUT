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
            }
            if ('exitConfig' in entry) {
                descriptor.exitConfig = entry.exitConfig;
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
        .filter((descriptor) => isOverlayTimelineItem(descriptor.item))
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
    const OVERLAY_TEXT_Z_BASE = 150;
    const OVERLAY_TEXT_Z_MAX = 220;

    const computeOverlayLayerGroup = (descriptor) => {
        if (!descriptor) {
            return 'above';
        }
        if (descriptor.layerGroup === 'text' || isTextTimelineItem(descriptor.item)) {
            return 'text';
        }
        return descriptor.laneIndex > primaryLaneIndex ? 'below' : 'above';
    };

    const computeOverlayLayerZIndex = (descriptor) => {
        if (!descriptor) {
            return OVERLAY_ABOVE_Z_BASE + 1;
        }

        if (descriptor.layerGroup === 'text' || isTextTimelineItem(descriptor.item)) {
            const laneDelta = primaryLaneIndex - descriptor.laneIndex;
            const laneOffset = Math.max(0, laneDelta);
            const clampedOffset = Math.min(laneOffset, OVERLAY_TEXT_Z_MAX - OVERLAY_TEXT_Z_BASE);
            return OVERLAY_TEXT_Z_BASE + clampedOffset + 1;
        }

        const laneDelta = descriptor.laneIndex - primaryLaneIndex;
        if (laneDelta > 0) {
            const laneOffset = Math.max(1, laneDelta);
            const clampedOffset = Math.min(laneOffset, OVERLAY_BELOW_Z_MAX - OVERLAY_BELOW_Z_BASE);
            return OVERLAY_BELOW_Z_MAX - clampedOffset + 1;
        }

        const laneOffset = Math.max(0, Math.abs(laneDelta));
        const clampedOffset = Math.min(laneOffset, OVERLAY_ABOVE_Z_MAX - OVERLAY_ABOVE_Z_BASE);
        return OVERLAY_ABOVE_Z_BASE + clampedOffset + 1;
    };

    const getDescriptorLayerGroup = (descriptor) => {
        if (!descriptor) {
            return 'above';
        }
        if (descriptor.layerGroup === 'text' || isTextTimelineItem(descriptor.item)) {
            return 'text';
        }
        return descriptor.layerGroup === 'below' ? 'below' : 'above';
    };
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
        activeOverlayLayers.forEach((entry, item) => {
            if (!entry || !entry.isVisible || !item || knownOverlayItems.has(item)) {
                return;
            }

            if (!isOverlayTimelineItem(item)) {
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
                entry.opacity = computeOverlayEntryOpacity(entry);
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

    const overlayGroups = { below: [], above: [], text: [] };

    overlayEntries.forEach((descriptor) => {
        descriptor.layerGroup = computeOverlayLayerGroup(descriptor);
        descriptor.zIndex = computeOverlayLayerZIndex(descriptor);
        if (descriptor.layerGroup === 'text') {
            overlayGroups.text.push(descriptor);
        } else if (descriptor.layerGroup === 'below') {
            overlayGroups.below.push(descriptor);
        } else {
            overlayGroups.above.push(descriptor);
        }
    });

    overlayGroups.above.sort((a, b) => a.laneIndex - b.laneIndex);
    overlayGroups.below.sort((a, b) => a.laneIndex - b.laneIndex);
    overlayGroups.text.sort((a, b) => a.laneIndex - b.laneIndex);

    const { below, above, text } = previewOverlayGroups || {};

    if (!below && !above && !text) {
        clearPreviewOverlayLayers();
        return;
    }

    const nextActiveItems = new Set();
    const nextKnownItems = new Set();

    const ensureOverlayLayerEntry = (descriptor) => {
        if (!descriptor || !descriptor.item) {
            return null;
        }

        const overlayItem = descriptor.item;
        const isText = isTextTimelineItem(overlayItem);
        const objectURL = isText ? '' : overlayItem.dataset.objectUrl || '';

        if (!isText && !objectURL) {
            return null;
        }

        let entry = activeOverlayLayers.get(overlayItem);
        const needsNewEntry = !entry
            || !entry.layer
            || (isText ? !entry.textElement : !entry.image);

        if (needsNewEntry) {
            const layer = document.createElement('div');
            layer.className = 'preview-overlay-layer';
            let image = null;
            let textElement = null;

            if (isText) {
                textElement = document.createElement('div');
                textElement.className = 'preview-overlay-text';
                layer.appendChild(textElement);
            } else {
                image = document.createElement('img');
                try {
                    image.decoding = 'async';
                } catch (error) {
                    // Ignore unsupported decoding hint.
                }
                image.loading = 'eager';
                image.draggable = false;
                layer.appendChild(image);
            }

            entry = {
                layer,
                image,
                textElement,
                contentKind: isText ? 'text' : 'image',
                objectURL: '',
                textContent: '',
                frame: null,
                isVisible: false,
                layerGroup: null,
                zIndex: 0,
                borderRadius: 0,
                opacity: 1,
                lastTimelineTime: null,
            };
            activeOverlayLayers.set(overlayItem, entry);
        }

        const { layer } = entry;

        layer.className = isText
            ? 'preview-overlay-layer preview-overlay-layer--text'
            : 'preview-overlay-layer';
        layer.dataset.laneIndex = String(descriptor.laneIndex);

        if (borderRadius > 0 && !isText) {
            layer.style.borderRadius = `${borderRadius}px`;
        } else if (!isText) {
            layer.style.removeProperty('border-radius');
        }

        if (isText) {
            const options = getTimelineItemTextOverlayOptions(overlayItem);
            applyTextOverlayOptionsToElement(entry.textElement, options);
            entry.textContent = options?.content || '';
            layer.title = entry.textContent || 'Text overlay';
            entry.objectURL = '';
        } else if (entry.image) {
            if (entry.objectURL !== objectURL || !entry.image.src) {
                entry.image.src = objectURL;
                entry.objectURL = objectURL;
            }

            entry.image.alt = overlayItem.dataset.displayName
                || overlayItem.querySelector('span')?.textContent
                || 'Overlay layer';
            layer.title = entry.image.alt;
        }

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

        if (entry.layer) {
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

        nextKnownItems.add(descriptor.item);

        if (!descriptor.shouldRender) {
            if (entry.isVisible) {
                const liveOpacity = computeOverlayEntryOpacity(entry);
                if (liveOpacity > 0 && liveOpacity < 0.999) {
                    descriptor.shouldRender = true;
                    entry.opacity = liveOpacity;
                    entry.lastTimelineTime = safeTimelineNow;
                    entry.layerGroup = getDescriptorLayerGroup(descriptor);
                    return;
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

        const { layer } = entry;
        const contentElement = entry.textElement || entry.image;

        const targetZIndex = Number.isFinite(zIndex) ? zIndex : getDescriptorZIndex(descriptor);
        layer.style.zIndex = String(targetZIndex);

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

        if (frame) {
            layer.style.left = `${frame.left}px`;
            layer.style.top = `${frame.top}px`;
            layer.style.width = `${frame.width}px`;
            layer.style.height = `${frame.height}px`;
            const rotationValue = Number.isFinite(frame.rotation) ? frame.rotation : 0;
            if (contentElement) {
                contentElement.style.setProperty('--preview-overlay-rotation', `${rotationValue}deg`);
            }
        } else {
            layer.style.left = '0px';
            layer.style.top = '0px';
            layer.style.width = '100%';
            layer.style.height = '100%';
            if (contentElement) {
                contentElement.style.setProperty('--preview-overlay-rotation', '0deg');
            }
        }

        if (layer.parentElement !== container) {
            container.appendChild(layer);
        } else {
            container.appendChild(layer);
        }

        overlayLayerToTimelineItem.set(layer, descriptor.item);

        const descriptorOpacity = computeOverlayDescriptorOpacity(descriptor);
        const clampedOpacity = clamp(descriptorOpacity, 0, 1);
        layer.style.opacity = clampedOpacity >= 1 ? '1' : String(clampedOpacity);
        if (contentElement && entry.contentKind === 'image') {
            contentElement.style.opacity = '1';
        }

        const layerOpacity = computeOverlayEntryOpacity(entry);

        entry.frame = resolvedFrame;
        entry.isVisible = true;
        entry.layerGroup = groupName;
        entry.zIndex = targetZIndex;
        entry.borderRadius = borderRadius > 0 ? borderRadius : 0;
        entry.opacity = layerOpacity;
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
                nextActiveItems.add(descriptor.item);
                return;
            }
            const fallbackEntry = activeOverlayLayers.get(descriptor.item);
            if (fallbackEntry?.isVisible) {
                fallbackEntry.opacity = computeOverlayEntryOpacity(fallbackEntry);
                nextActiveItems.add(descriptor.item);
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
                nextActiveItems.add(descriptor.item);
                return;
            }
            const fallbackEntry = activeOverlayLayers.get(descriptor.item);
            if (fallbackEntry?.isVisible) {
                fallbackEntry.opacity = computeOverlayEntryOpacity(fallbackEntry);
                nextActiveItems.add(descriptor.item);
                fallbackEntry.lastTimelineTime = safeTimelineNow;
                fallbackEntry.layerGroup = getDescriptorLayerGroup(descriptor);
                fallbackEntry.zIndex = zIndex;
            }
        });
    }

    if (overlayGroups.text.length && text) {
        overlayGroups.text.forEach((descriptor) => {
            if (!descriptor.shouldRender) {
                return;
            }
            const zIndex = getDescriptorZIndex(descriptor);
            const rendered = renderDescriptorIntoContainer(descriptor, zIndex, text);
            if (rendered) {
                nextActiveItems.add(descriptor.item);
                return;
            }
            const fallbackEntry = activeOverlayLayers.get(descriptor.item);
            if (fallbackEntry?.isVisible) {
                fallbackEntry.opacity = computeOverlayEntryOpacity(fallbackEntry);
                nextActiveItems.add(descriptor.item);
                fallbackEntry.lastTimelineTime = safeTimelineNow;
                fallbackEntry.layerGroup = getDescriptorLayerGroup(descriptor);
                fallbackEntry.zIndex = zIndex;
            }
        });
    }

    const staleItems = [];
    activeOverlayLayers.forEach((entry, item) => {
        if (!nextKnownItems.has(item)) {
            staleItems.push(item);
            return;
        }
        if (!nextActiveItems.has(item)) {
            hideOverlayLayerEntry(entry);
        }
    });
    staleItems.forEach((item) => {
        const entry = activeOverlayLayers.get(item);
        if (entry && entry.layer) {
            overlayLayerToTimelineItem.delete(entry.layer);
            entry.layer.remove();
        }
        activeOverlayLayers.delete(item);
    });

    const hasStackLayers = Boolean(
        (below && below.childElementCount)
        || (above && above.childElementCount),
    );
    const hasTextLayers = Boolean(text && text.childElementCount);

    if (previewOverlayStack) {
        if (hasStackLayers) {
            previewOverlayStack.removeAttribute('hidden');
            previewOverlayStack.setAttribute('aria-hidden', 'false');
        } else {
            previewOverlayStack.setAttribute('hidden', '');
            previewOverlayStack.setAttribute('aria-hidden', 'true');
        }
    }

    if (text) {
        if (hasTextLayers) {
            text.removeAttribute('hidden');
            text.setAttribute('aria-hidden', 'false');
        } else {
            text.setAttribute('hidden', '');
            text.setAttribute('aria-hidden', 'true');
        }
    }

    lastOverlayRenderTimestamp = safeTimelineNow;
}

function getActiveOverlayLayerSnapshots() {
    const snapshots = [];
    const groupPriority = { below: 0, above: 1, text: 2 };

    activeOverlayLayers.forEach((entry, item) => {
        if (!entry || !entry.isVisible || !entry.frame) {
            return;
        }

        if (Number.isFinite(lastOverlayRenderTimestamp) && Number.isFinite(entry.lastTimelineTime)) {
            const age = Math.abs(lastOverlayRenderTimestamp - entry.lastTimelineTime);
            if (age > (OVERLAY_TIMELINE_WINDOW_SLACK_MS * 2)) {
                return;
            }
        }

        const liveOpacity = computeOverlayEntryOpacity(entry);
        entry.opacity = liveOpacity;
        if (liveOpacity <= 0) {
            return;
        }
        const frameWidth = Math.max(0, entry.frame.width || 0);
        const frameHeight = Math.max(0, entry.frame.height || 0);
        if (frameWidth <= 0 || frameHeight <= 0) {
            return;
        }

        const group = entry.layerGroup === 'below'
            ? 'below'
            : entry.layerGroup === 'text'
                ? 'text'
                : 'above';

        if (entry.contentKind === 'text') {
            const options = getTimelineItemTextOverlayOptions(item);
            snapshots.push({
                kind: 'text',
                text: entry.textContent || options?.content || '',
                textOptions: options,
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
                priority: groupPriority[group] ?? 2,
            });
            return;
        }

        const { image } = entry;
        if (!image || !image.complete) {
            return;
        }

        const naturalWidth = Math.max(0, image.naturalWidth || 0);
        const naturalHeight = Math.max(0, image.naturalHeight || 0);
        if (naturalWidth <= 0 || naturalHeight <= 0) {
            return;
        }

        snapshots.push({
            kind: 'image',
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
            const { frame } = snapshot;
            if (!frame || frame.width <= 0 || frame.height <= 0) {
                return;
            }

            const rotationRadians = Number.isFinite(frame.rotation)
                ? (frame.rotation * Math.PI) / 180
                : 0;

            exportMirrorContext.save();
            exportMirrorContext.setTransform(scaleX, 0, 0, scaleY, 0, 0);
            exportMirrorContext.translate(frame.left + (frame.width / 2), frame.top + (frame.height / 2));
            if (rotationRadians !== 0) {
                exportMirrorContext.rotate(rotationRadians);
            }
            exportMirrorContext.translate(-(frame.width / 2), -(frame.height / 2));

            const radius = Math.max(0, snapshot.borderRadius || 0);
            if (radius > 0) {
                clipRoundRectPath(exportMirrorContext, 0, 0, frame.width, frame.height, radius);
                exportMirrorContext.clip();
            }

            const clampedOpacity = clamp(Number(snapshot.opacity) || 1, 0, 1);
            exportMirrorContext.globalAlpha *= clampedOpacity;

            if (snapshot.kind === 'text') {
                const options = snapshot.textOptions || {};
                const background = options.background || 'rgba(15, 23, 42, 0.55)';
                const color = options.color || '#f8fafc';
                const padding = Math.max(0, Number.parseFloat(options.padding) || 0);
                const fontSize = Math.max(1, Number.parseFloat(options.fontSize) || 40);
                const lineHeightRatio = Math.max(0.5, Number.parseFloat(options.lineHeight) || 1.3);
                const fontWeight = options.fontWeight || '600';
                const fontFamily = options.fontFamily || 'Inter, "Segoe UI", sans-serif';
                const contentWidth = Math.max(0, frame.width - (padding * 2));
                const contentHeight = Math.max(0, frame.height - (padding * 2));

                exportMirrorContext.fillStyle = background;
                exportMirrorContext.fillRect(0, 0, frame.width, frame.height);

                exportMirrorContext.fillStyle = color;
                exportMirrorContext.textAlign = 'center';
                exportMirrorContext.textBaseline = 'middle';
                exportMirrorContext.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
                exportMirrorContext.shadowColor = 'rgba(15, 23, 42, 0.35)';
                exportMirrorContext.shadowBlur = 18;

                const lines = (snapshot.text || '').split(/\r?\n/);
                const computedLineHeight = fontSize * lineHeightRatio;
                const totalHeight = Math.max(computedLineHeight, lines.length * computedLineHeight);
                let cursorY = padding + (contentHeight / 2) - (totalHeight / 2) + (computedLineHeight / 2);
                const centerX = padding + (contentWidth / 2);

                lines.forEach((line) => {
                    const text = line || '';
                    exportMirrorContext.fillText(text, centerX, cursorY);
                    cursorY += computedLineHeight;
                });

                exportMirrorContext.restore();
                return;
            }

            const image = snapshot.image;
            if (!image) {
                exportMirrorContext.restore();
                return;
            }

            const naturalWidth = Math.max(1, image.naturalWidth || 0);
            const naturalHeight = Math.max(1, image.naturalHeight || 0);
            if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight)) {
                exportMirrorContext.restore();
                return;
            }

            const drawScale = Math.max(frame.width / naturalWidth, frame.height / naturalHeight);
            if (!Number.isFinite(drawScale) || drawScale <= 0) {
                exportMirrorContext.restore();
                return;
            }

            const drawWidth = naturalWidth * drawScale;
            const drawHeight = naturalHeight * drawScale;
            const offsetX = (frame.width - drawWidth) / 2;
            const offsetY = (frame.height - drawHeight) / 2;

            exportMirrorContext.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
            exportMirrorContext.restore();
        });
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

if (previewOverlayGroups?.text && previewOverlayGroups.text !== previewOverlayStack) {
    previewOverlayGroups.text.addEventListener('pointerdown', onPreviewOverlayPointerDown);
}

if (window && typeof window.addEventListener === 'function') {
    window.addEventListener('pointermove', onPreviewImagePointerMove, { passive: false });
    window.addEventListener('pointerup', onPreviewImagePointerUp, { passive: true });
    window.addEventListener('pointercancel', onPreviewImagePointerCancel, { passive: true });
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

function isTextTimelineItem(timelineItem) {
    if (!timelineItem || !timelineItem.dataset) {
        return false;
    }
    if (timelineItem.dataset.layerType === 'text') {
        return true;
    }
    const fileType = timelineItem.dataset.fileType || '';
    return fileType.startsWith('text/');
}

function isOverlayTimelineItem(timelineItem) {
    return isImageTimelineItem(timelineItem) || isTextTimelineItem(timelineItem);
}

function isAudioTimelineItem(timelineItem) {
    if (!timelineItem || !timelineItem.dataset) {
        return false;
    }
    const fileType = timelineItem.dataset.fileType || '';
    return fileType.startsWith('audio/');
}

function getTimelineItemTextOverlayOptions(timelineItem) {
    if (!isTextTimelineItem(timelineItem)) {
        return null;
    }

    const content = timelineItem.dataset.textContent
        || timelineItem.querySelector('span')?.textContent
        || 'Text';

    return {
        content,
        color: timelineItem.dataset.textColor || '#f8fafc',
        background: timelineItem.dataset.textBackground || 'rgba(15, 23, 42, 0.55)',
        fontFamily: timelineItem.dataset.textFontFamily || '"Inter", "Segoe UI", sans-serif',
        fontWeight: timelineItem.dataset.textFontWeight || '600',
        fontSize: timelineItem.dataset.textFontSize || '40px',
        lineHeight: timelineItem.dataset.textLineHeight || '1.3',
        padding: timelineItem.dataset.textPadding || '24px',
        radius: timelineItem.dataset.textRadius || '18px',
        letterSpacing: timelineItem.dataset.textLetterSpacing || '0.01em',
    };
}

function applyTextOverlayOptionsToElement(element, options) {
    if (!element || !options) {
        return;
    }

    element.textContent = options.content || '';
    element.style.setProperty('--preview-text-color', options.color || '#f8fafc');
    element.style.setProperty('--preview-text-background', options.background || 'rgba(15, 23, 42, 0.55)');
    const fontValue = `${options.fontWeight || '600'} ${options.fontSize || '40px'}/${options.lineHeight || '1.3'} ${options.fontFamily || '"Inter", "Segoe UI", sans-serif'}`;
    element.style.setProperty('--preview-text-font', fontValue);
    element.style.setProperty('--preview-text-padding', options.padding || '24px');
    element.style.setProperty('--preview-text-radius', options.radius || '18px');
    element.style.setProperty('--preview-text-letter-spacing', options.letterSpacing || '0.01em');
}

function getTimelineItemImageKeyframes(timelineItem) {
    if (!isOverlayTimelineItem(timelineItem)) {
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
    if (!isOverlayTimelineItem(timelineItem)) {
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