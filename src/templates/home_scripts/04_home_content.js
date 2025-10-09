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
    } else {
        hideTimelineSnapLine();
    }
}

function hideTimelineSnapLine() {
    if (!timelineSnapLine) {
        return;
    }
    timelineSnapLine.removeAttribute('data-visible');
    timelineSnapLine.style.removeProperty('left');
    delete timelineSnapLine.dataset.align;
}

function setTimelineSnapLinePosition(positionPx, alignType = '') {
    if (!timelineSnapLine) {
        return;
    }
    timelineSnapLine.style.left = `${Number(positionPx).toFixed(2)}px`;
    if (alignType) {
        timelineSnapLine.dataset.align = alignType;
    } else {
        delete timelineSnapLine.dataset.align;
    }
    timelineSnapLine.setAttribute('data-visible', 'true');
}

function updateTimelineSnapLineForItem(timelineItem) {
    if (!timelineSnapLine || !timelineLaneList) {
        return;
    }

    const isDragging = activeTimelineDragItem === timelineItem;
    const isResizing = activeTimelineResizeItem === timelineItem;
    if (!isDragging && !isResizing) {
        hideTimelineSnapLine();
        return;
    }

    if (!timelineItem || !timelineItem.isConnected) {
        hideTimelineSnapLine();
        return;
    }

    const lane = timelineItem.closest('.timeline-lane');
    if (!lane) {
        hideTimelineSnapLine();
        return;
    }

    const startMs = Number(timelineItem.dataset.startOffsetMs);
    if (!Number.isFinite(startMs)) {
        hideTimelineSnapLine();
        return;
    }

    const duration = Math.max(0, getTimelineItemPlaybackDuration(timelineItem));
    const endMs = startMs + duration;
    const toleranceMs = Math.max(1, Math.round(TIMELINE_SNAP_TOLERANCE_MS));
    const lanes = getTimelineLanes();

    const considerMatch = (timeMs, alignType, deltaMs) => {
        if (!Number.isFinite(timeMs) || deltaMs > toleranceMs) {
            return null;
        }
        return { timeMs, alignType, deltaMs };
    };

    let bestMatch = null;

    lanes.forEach((candidateLane) => {
        const items = candidateLane.querySelectorAll('.timeline-item');
        items.forEach((candidate) => {
            if (candidate === timelineItem) {
                return;
            }
            if (!candidate.isConnected) {
                return;
            }
            const candidateStart = Number(candidate.dataset.startOffsetMs);
            if (!Number.isFinite(candidateStart)) {
                return;
            }
            const candidateDuration = Math.max(0, getTimelineItemPlaybackDuration(candidate));
            const candidateEnd = candidateStart + candidateDuration;

            [
                considerMatch(startMs, 'start-start', Math.abs(startMs - candidateStart)),
                considerMatch(startMs, 'start-end', Math.abs(startMs - candidateEnd)),
                considerMatch(endMs, 'end-start', Math.abs(endMs - candidateStart)),
                considerMatch(endMs, 'end-end', Math.abs(endMs - candidateEnd)),
            ].forEach((match) => {
                if (!match) {
                    return;
                }
                if (!bestMatch || match.deltaMs < bestMatch.deltaMs) {
                    bestMatch = match;
                }
            });
        });
    });

    if (!bestMatch) {
        hideTimelineSnapLine();
        return;
    }

    const perPixel = getTimelineDurationPerPixel();
    if (!Number.isFinite(perPixel) || perPixel <= 0) {
        hideTimelineSnapLine();
        return;
    }

    const listRect = timelineLaneList.getBoundingClientRect();
    const laneRect = lane.getBoundingClientRect();
    const laneStyles = window.getComputedStyle(lane);
    const paddingLeft = Number.parseFloat(laneStyles.paddingLeft) || 0;
    const laneOffsetLeft = laneRect.left - listRect.left;
    const relativeLeft = laneOffsetLeft + paddingLeft + (Math.max(0, bestMatch.timeMs) / perPixel);

    setTimelineSnapLinePosition(relativeLeft, bestMatch.alignType);
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
        const nextDuration = widthToDuration(tentativeWidth);
        const previousDuration = Number(timelineItem.dataset[durationKey]);
        if (Number.isFinite(previousDuration) && previousDuration === nextDuration) {
            updateTimelineSnapLineForItem(timelineItem);
            return;
        }
        setTimelineItemDuration(timelineItem, durationKey, nextDuration, { markCustom: true });
        updateTimelineSnapLineForItem(timelineItem);
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
        hideTimelineSnapLine();
        updateActiveTimelineIndicators();
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
        hideTimelineSnapLine();
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
    if (fileType.startsWith('video/') || fileType.startsWith('audio/')) {
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
            hideTimelineSnapLine();
            return;
        }
        event.preventDefault();
        const lane = getTimelineLaneFromEvent(event);
        if (!lane) {
            timelineDragOverState.lane = null;
            timelineDragOverState.item = null;
            hideTimelineSnapLine();
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
        hideTimelineSnapLine();
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
                    const horizontalDelta = movingX - anchorX;