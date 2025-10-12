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

    const computeOverlayLayerGroup = (descriptor) => {
        if (!descriptor) {
            return 'above';
        }
        if (descriptor?.item && isTextTimelineItem(descriptor.item)) {
            return 'text';
        }
        return descriptor.laneIndex > primaryLaneIndex ? 'below' : 'above';
    };

    const computeOverlayLayerZIndex = (descriptor) => {
        if (!descriptor) {
            return OVERLAY_ABOVE_Z_BASE + 1;
        }

        if (descriptor?.item && isTextTimelineItem(descriptor.item)) {
            return OVERLAY_ABOVE_Z_MAX + 20;
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

    const parseTextShadow = (shadowValue) => {
        if (typeof shadowValue !== 'string' || !shadowValue.length || shadowValue === 'none') {
            return null;
        }

        const numericMatches = shadowValue.match(/-?\d+(?:\.\d+)?px/g) || [];
        const [offsetXRaw, offsetYRaw, blurRaw] = numericMatches;

        const offsetX = Number.parseFloat(offsetXRaw || '0');
        const offsetY = Number.parseFloat(offsetYRaw || '0');
        const blur = Number.parseFloat(blurRaw || '0');

        const color = shadowValue.replace(/-?\d+(?:\.\d+)?px/g, '').trim() || 'rgba(0, 0, 0, 0.35)';

        return {
            offsetX: Number.isFinite(offsetX) ? offsetX : 0,
            offsetY: Number.isFinite(offsetY) ? offsetY : 0,
            blur: Number.isFinite(blur) ? blur : 0,
            color,
        };
    };

    const renderTextOverlayCanvas = (entry, viewportWidth, viewportHeight) => {
        if (!entry || !entry.textCanvas || viewportWidth <= 0 || viewportHeight <= 0) {
            return;
        }

        const canvas = entry.textCanvas;
        const context = entry.textCanvasContext || canvas.getContext('2d');
        if (!context) {
            return;
        }

        const devicePixelRatio = Math.max(window.devicePixelRatio || 1, 1);
        const cssWidth = Math.max(1, Math.round(viewportWidth));
        const cssHeight = Math.max(1, Math.round(viewportHeight));
        const targetWidth = Math.max(1, Math.round(cssWidth * devicePixelRatio));
        const targetHeight = Math.max(1, Math.round(cssHeight * devicePixelRatio));

        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            entry.textCanvasSignature = null;
        }

        if (canvas.style.width !== `${cssWidth}px`) {
            canvas.style.width = `${cssWidth}px`;
        }
        if (canvas.style.height !== `${cssHeight}px`) {
            canvas.style.height = `${cssHeight}px`;
        }

        const textElement = entry.textElement;
        const rawContent = textElement ? (textElement.textContent || '') : '';
        const normalizedContent = rawContent.replace(/\r\n?/g, '\n');
        const trimmedContent = normalizedContent.trim();
        const hasContent = trimmedContent.length > 0;

        const style = (textElement && window.getComputedStyle)
            ? window.getComputedStyle(textElement)
            : null;

        const fallbackFontFamily = 'Inter, "Segoe UI", sans-serif';
        const fallbackFontSize = Math.max(24, cssHeight / 6);
        const computedFont = style && style.font && style.font !== 'normal'
            ? style.font
            : null;
        const fontWeight = style?.fontWeight || '600';
        const fontStyle = style?.fontStyle && style.fontStyle !== 'normal'
            ? `${style.fontStyle} `
            : '';
        const fontSize = Number.parseFloat(style?.fontSize || '');
        const resolvedFontSize = Number.isFinite(fontSize) ? fontSize : fallbackFontSize;
        const fontFamily = style?.fontFamily || fallbackFontFamily;
        const font = computedFont
            || `${fontStyle}${fontWeight} ${resolvedFontSize}px ${fontFamily}`;

        const textAlign = style?.textAlign || 'center';
        const fillStyle = style?.color || '#f8fafc';
        const letterSpacing = style?.letterSpacing || '';
        const lineHeightRaw = style?.lineHeight || '';
        let lineHeight = Number.parseFloat(lineHeightRaw);
        if (!Number.isFinite(lineHeight)) {
            lineHeight = resolvedFontSize * 1.2;
        }

        const paddingLeft = Number.parseFloat(style?.paddingLeft || '0') || 0;
        const paddingRight = Number.parseFloat(style?.paddingRight || '0') || 0;
        const paddingTop = Number.parseFloat(style?.paddingTop || '0') || 0;
        const paddingBottom = Number.parseFloat(style?.paddingBottom || '0') || 0;
        const availableWidth = Math.max(cssWidth - (paddingLeft + paddingRight), 0);
        const availableHeight = Math.max(cssHeight - (paddingTop + paddingBottom), 0);
        const textShadow = style?.textShadow || 'none';

        const signature = [
            normalizedContent,
            cssWidth,
            cssHeight,
            font,
            fillStyle,
            textAlign,
            lineHeight,
            paddingLeft,
            paddingRight,
            paddingTop,
            paddingBottom,
            letterSpacing,
            textShadow,
            devicePixelRatio,
        ].join('|');

        if (entry.textCanvasSignature === signature) {
            return;
        }

        entry.textCanvasSignature = signature;

        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);

        if (!hasContent) {
            context.restore();
            return;
        }

        context.scale(devicePixelRatio, devicePixelRatio);
        context.imageSmoothingEnabled = true;
        if (typeof context.imageSmoothingQuality === 'string') {
            context.imageSmoothingQuality = 'high';
        }
        if (typeof context.fontKerning === 'string') {
            context.fontKerning = 'normal';
        }

        context.font = font;
        context.fillStyle = fillStyle;
        context.textAlign = textAlign;
        context.textBaseline = 'middle';

        if (typeof context.letterSpacing === 'string' && letterSpacing) {
            context.letterSpacing = letterSpacing;
        }

        const parsedShadow = parseTextShadow(textShadow);
        if (parsedShadow) {
            context.shadowColor = parsedShadow.color;
            context.shadowBlur = parsedShadow.blur;
            context.shadowOffsetX = parsedShadow.offsetX;
            context.shadowOffsetY = parsedShadow.offsetY;
        } else {
            context.shadowColor = 'transparent';
            context.shadowBlur = 0;
            context.shadowOffsetX = 0;
            context.shadowOffsetY = 0;
        }

        const lines = normalizedContent.split('\n');
        const effectiveLineCount = lines.length || 1;
        const totalHeight = lineHeight * Math.max(effectiveLineCount - 1, 0);
        const centerX = (() => {
            if (textAlign === 'left' || textAlign === 'start') {
                return paddingLeft;
            }
            if (textAlign === 'right' || textAlign === 'end') {
                return cssWidth - paddingRight;
            }
            return paddingLeft + (availableWidth / 2);
        })();

        const baseY = paddingTop + (availableHeight / 2) - (totalHeight / 2);

        lines.forEach((line, index) => {
            const drawY = baseY + (index * lineHeight);
            context.fillText(line, centerX, drawY);
        });

        context.restore();
    };

    const textEditorState = {
        timelineItem: null,
        entry: null,
        editorContainer: null,
        editorContent: null,
        originalText: '',
        pendingValue: '',
        isEditing: false,
    };

    const resolveDefaultTextLayerContent = () => {
        if (typeof DEFAULT_TEXT_LAYER_CONTENT === 'string' && DEFAULT_TEXT_LAYER_CONTENT.length) {
            return DEFAULT_TEXT_LAYER_CONTENT;
        }
        return 'Default Text';
    };

    const sanitizeEditorValue = (value) => {
        if (typeof value !== 'string') {
            return '';
        }

        const normalized = value
            .replace(/\r\n?/g, '\n')
            .replace(/[\u00a0\t]/g, ' ');

        const collapsed = normalized
            .split('\n')
            .map((line) => line.replace(/\s+$/g, ''))
            .join('\n')
            .replace(/\n{3,}/g, '\n\n');

        return collapsed.trimEnd();
    };

    const formatTextLayerDisplayName = (value) => {
        const fallback = resolveDefaultTextLayerContent();
        if (typeof value !== 'string' || !value.trim()) {
            return fallback;
        }
        const normalized = sanitizeEditorValue(value);
        const primaryLine = normalized
            .split('\n')
            .map((line) => line.trim())
            .find((line) => line.length > 0)
            || normalized.trim()
            || fallback;
        if (primaryLine.length <= 42) {
            return primaryLine;
        }
        return `${primaryLine.slice(0, 39)}…`;
    };

    const applyEditorStylesFromMeasure = (entry) => {
        const { textEditorContent, textElement } = entry;
        if (!textEditorContent || !textElement || typeof window.getComputedStyle !== 'function') {
            return;
        }

        const style = window.getComputedStyle(textElement);
        if (!style) {
            return;
        }

        textEditorContent.style.font = style.font || '';
        textEditorContent.style.fontSize = style.fontSize || '';
        textEditorContent.style.fontWeight = style.fontWeight || '';
        textEditorContent.style.fontStyle = style.fontStyle || '';
        textEditorContent.style.fontFamily = style.fontFamily || '';
        textEditorContent.style.lineHeight = style.lineHeight || '';
        textEditorContent.style.letterSpacing = style.letterSpacing || '';
        textEditorContent.style.textAlign = style.textAlign || 'center';
        textEditorContent.style.color = style.color || '';
        textEditorContent.style.textTransform = style.textTransform || '';
        textEditorContent.style.textDecoration = style.textDecoration || '';
        textEditorContent.style.textShadow = style.textShadow || '';
        textEditorContent.style.paddingTop = style.paddingTop || '';
        textEditorContent.style.paddingRight = style.paddingRight || '';
        textEditorContent.style.paddingBottom = style.paddingBottom || '';
        textEditorContent.style.paddingLeft = style.paddingLeft || '';
        textEditorContent.dataset.placeholder = resolveDefaultTextLayerContent();
    };

    const extractEditorValue = (editorContent) => {
        if (!editorContent) {
            return '';
        }
        const innerText = typeof editorContent.innerText === 'string'
            ? editorContent.innerText
            : editorContent.textContent;
        return sanitizeEditorValue(innerText || '');
    };

    const applyEditorValueToTimeline = (timelineItem, entry, rawValue, options = {}) => {
        if (!timelineItem || !entry) {
            return;
        }

        const { updateMeasurement = true } = options;
        const fallback = resolveDefaultTextLayerContent();
        const normalized = sanitizeEditorValue(rawValue);
        const hasContent = normalized.trim().length > 0;
        const finalValue = hasContent ? normalized : fallback;
        const displayName = formatTextLayerDisplayName(finalValue);

        timelineItem.dataset.textContent = finalValue;
        timelineItem.dataset.displayName = displayName;

        const label = timelineItem.querySelector('span');
        if (label) {
            label.textContent = displayName;
        }

        if (updateMeasurement && entry.textElement) {
            entry.textElement.textContent = finalValue;
        }

        entry.textCanvasSignature = null;
        const viewportSize = getPreviewViewportSize();
        renderTextOverlayCanvas(entry, viewportSize.width, viewportSize.height);

        textEditorState.pendingValue = finalValue;
    };

    const finishActiveTextEditor = ({ commit }) => {
        if (!textEditorState.isEditing) {
            return;
        }

        const {
            timelineItem,
            entry,
            editorContent,
            originalText,
        } = textEditorState;

        const nextValue = commit ? extractEditorValue(editorContent) : originalText;
        applyEditorValueToTimeline(timelineItem, entry, nextValue);

        if (editorContent) {
            editorContent.setAttribute('contenteditable', 'false');
            editorContent.tabIndex = -1;
            editorContent.textContent = textEditorState.pendingValue;
            editorContent.classList.toggle(
                'is-empty',
                !sanitizeEditorValue(textEditorState.pendingValue).trim().length,
            );
        }

        if (entry && entry.textEditorContainer) {
            entry.textEditorContainer.hidden = true;
            entry.textEditorContainer.classList.remove('is-editing');
        }

        renderExportSummary(getTimelineItems(), null);

        textEditorState.timelineItem = null;
        textEditorState.entry = null;
        textEditorState.editorContainer = null;
        textEditorState.editorContent = null;
        textEditorState.originalText = '';
        textEditorState.pendingValue = '';
        textEditorState.isEditing = false;
    };

    const cancelActiveTextEditor = (options = {}) => {
        if (!textEditorState.isEditing) {
            return;
        }

        const { commit = true, preserveFor = null, targetItem = null } = options;

        if (preserveFor && textEditorState.timelineItem === preserveFor) {
            return;
        }

        if (targetItem && textEditorState.timelineItem !== targetItem) {
            return;
        }

        finishActiveTextEditor({ commit });
    };

    const refreshTextEditorVisibilityForEntry = (entry, descriptorItem) => {
        if (!entry || !entry.textEditorContainer || !entry.textEditorContent) {
            return;
        }

        const isEditingActive = textEditorState.isEditing && textEditorState.entry === entry;

        entry.textEditorContainer.hidden = !isEditingActive;
        entry.textEditorContainer.classList.toggle('is-editing', Boolean(isEditingActive));

        if (!isEditingActive) {
            entry.textEditorContent.setAttribute('contenteditable', 'false');
            entry.textEditorContent.tabIndex = -1;
        }

        applyEditorStylesFromMeasure(entry);

        if (!isEditingActive) {
            const timelineItem = descriptorItem || null;
            if (timelineItem) {
                const stored = timelineItem.dataset?.textContent
                    || timelineItem.dataset?.displayName
                    || resolveDefaultTextLayerContent();
                entry.textEditorContent.textContent = stored;
                entry.textEditorContent.classList.toggle(
                    'is-empty',
                    !sanitizeEditorValue(stored).trim().length,
                );
            }
        }
    };

    const beginTextEditorForTimelineItem = (timelineItem) => {
        if (!timelineItem || !isTextTimelineItem(timelineItem)) {
            return;
        }

        const entry = activeOverlayLayers.get(timelineItem) || null;
        if (!entry || !entry.textEditorContent || !entry.textEditorContainer) {
            refreshActiveOverlayLayers();
            return;
        }

        if (textEditorState.isEditing) {
            if (textEditorState.timelineItem === timelineItem) {
                if (textEditorState.editorContent) {
                    window.requestAnimationFrame(() => {
                        try {
                            textEditorState.editorContent.focus({ preventScroll: true });
                        } catch (error) {
                            // Ignore focus errors.
                        }
                    });
                }
                return;
            }
            cancelActiveTextEditor({ commit: true });
        }

        const defaultText = resolveDefaultTextLayerContent();
        const stored = timelineItem.dataset?.textContent
            || timelineItem.dataset?.displayName
            || defaultText;

        applyEditorStylesFromMeasure(entry);

        entry.textEditorContainer.hidden = false;
        entry.textEditorContainer.classList.add('is-editing');
        entry.textEditorContent.setAttribute('contenteditable', 'true');
        entry.textEditorContent.tabIndex = 0;
        entry.textEditorContent.textContent = stored;
        entry.textEditorContent.classList.toggle('is-empty', !sanitizeEditorValue(stored).trim().length);

        textEditorState.timelineItem = timelineItem;
        textEditorState.entry = entry;
        textEditorState.editorContainer = entry.textEditorContainer;
        textEditorState.editorContent = entry.textEditorContent;
        textEditorState.originalText = stored;
        textEditorState.pendingValue = stored;
        textEditorState.isEditing = true;

        window.requestAnimationFrame(() => {
            try {
                entry.textEditorContent.focus({ preventScroll: true });
                if (window.getSelection && document.createRange) {
                    const selection = window.getSelection();
                    if (selection) {
                        const range = document.createRange();
                        range.selectNodeContents(entry.textEditorContent);
                        selection.removeAllRanges();
                        selection.addRange(range);
                    }
                }
            } catch (error) {
                // Ignore focus errors when activating the editor.
            }
        });
    };

    const onTextEditorInput = (event) => {
        const editorContent = event.currentTarget;
        if (!editorContent || textEditorState.editorContent !== editorContent) {
            return;
        }

        const entry = textEditorState.entry;
        const timelineItem = textEditorState.timelineItem;
        if (!entry || !timelineItem) {
            return;
        }

        const nextValue = extractEditorValue(editorContent);
        applyEditorValueToTimeline(timelineItem, entry, nextValue);

        editorContent.classList.toggle('is-empty', !nextValue.trim().length);
    };

    const onTextEditorBlur = (event) => {
        if (!textEditorState.isEditing || textEditorState.editorContent !== event.currentTarget) {
            return;
        }
        finishActiveTextEditor({ commit: true });
    };

    const onTextEditorKeyDown = (event) => {
        if (!textEditorState.isEditing || textEditorState.editorContent !== event.currentTarget) {
            return;
        }

        const { key, metaKey, ctrlKey } = event;
        if (key === 'Escape') {
            event.preventDefault();
            cancelActiveTextEditor({ commit: false });
            return;
        }

        if (key === 'Enter' && (metaKey || ctrlKey)) {
            event.preventDefault();
            finishActiveTextEditor({ commit: true });
        }
    };

    const onTextEditorPointerDown = (event) => {
        event.stopPropagation();
    };

    const getDescriptorLayerGroup = (descriptor) => {
        if (!descriptor) {
            return 'above';
        }
        if (descriptor.layerGroup === 'text') {
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

    const { below, above, text } = previewOverlayGroups;

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

        const timelineItem = descriptor.item;
        const isTextOverlay = isTextTimelineItem(timelineItem);

        let entry = activeOverlayLayers.get(timelineItem);

        if (isTextOverlay) {
            if (!entry || !entry.layer || entry.type !== 'text') {
                const layer = document.createElement('div');
                layer.className = 'preview-overlay-layer preview-overlay-layer--text';
                const textCanvas = document.createElement('canvas');
                textCanvas.className = 'preview-overlay-text-canvas';
                textCanvas.setAttribute('aria-hidden', 'true');
                textCanvas.style.pointerEvents = 'none';
                const textElement = document.createElement('div');
                textElement.className = 'preview-overlay-text preview-overlay-text--measure';
                textElement.setAttribute('aria-hidden', 'true');
                textElement.style.position = 'absolute';
                textElement.style.left = '-9999px';
                textElement.style.top = '-9999px';
                textElement.style.pointerEvents = 'none';
                textElement.style.userSelect = 'none';
                textElement.style.whiteSpace = 'pre-wrap';
                const editorContainer = document.createElement('div');
                editorContainer.className = 'preview-overlay-text-editor';
                editorContainer.hidden = true;
                const editorWrap = document.createElement('div');
                editorWrap.className = 'preview-overlay-text-editor__wrap';
                const editorContent = document.createElement('div');
                editorContent.className = 'preview-overlay-text-editor__content';
                editorContent.setAttribute('role', 'textbox');
                editorContent.setAttribute('aria-multiline', 'true');
                editorContent.tabIndex = -1;
                editorContent.spellcheck = true;
                editorWrap.appendChild(editorContent);
                editorContainer.appendChild(editorWrap);
                layer.appendChild(textCanvas);
                layer.appendChild(textElement);
                layer.appendChild(editorContainer);
                let textCanvasContext = null;
                try {
                    textCanvasContext = textCanvas.getContext('2d', { alpha: true, desynchronized: true });
                } catch (error) {
                    textCanvasContext = textCanvas.getContext('2d');
                }
                entry = {
                    type: 'text',
                    layer,
                    image: textCanvas,
                    textElement,
                    textCanvas,
                    textCanvasContext,
                    textEditorContainer: editorContainer,
                    textEditorContent: editorContent,
                    textCanvasSignature: null,
                    objectURL: '',
                    frame: null,
                    isVisible: false,
                    layerGroup: null,
                    zIndex: 0,
                    borderRadius: 0,
                    opacity: 1,
                    lastTimelineTime: null,
                };
                editorContent.addEventListener('input', onTextEditorInput);
                editorContent.addEventListener('blur', onTextEditorBlur);
                editorContent.addEventListener('keydown', onTextEditorKeyDown);
                editorContent.addEventListener('pointerdown', onTextEditorPointerDown);
                if (!layer.dataset.textEditorBound) {
                    layer.addEventListener('dblclick', (event) => {
                        const timelineItemRef = overlayLayerToTimelineItem.get(layer);
                        if (!timelineItemRef || !isTextTimelineItem(timelineItemRef)) {
                            return;
                        }
                        const target = event.target;
                        if (target && target.closest('.preview-overlay-text-editor__content')) {
                            return;
                        }
                        event.preventDefault();
                        event.stopPropagation();
                        stopTimelinePlayback();
                        setActiveTimelineItem(timelineItemRef);
                        beginTextEditorForTimelineItem(timelineItemRef);
                    });
                    layer.dataset.textEditorBound = 'true';
                }
                activeOverlayLayers.set(timelineItem, entry);
            }

            const { layer, textElement, textCanvas } = entry;
            layer.className = 'preview-overlay-layer preview-overlay-layer--text';
            layer.dataset.laneIndex = String(descriptor.laneIndex);
            if (textElement) {
                const content = timelineItem.dataset.textContent
                    || timelineItem.dataset.displayName
                    || timelineItem.querySelector('span')?.textContent
                    || 'Default Text';
                textElement.textContent = content;
            }
            if (textCanvas) {
                textCanvas.hidden = false;
            }
            layer.title = timelineItem.dataset.displayName || 'Text overlay';
            return entry;
        }

        const objectURL = timelineItem.dataset.objectUrl || '';
        if (!objectURL) {
            return null;
        }

        if (!entry || !entry.layer || !entry.image || entry.type !== 'image') {
            const layer = document.createElement('div');
            layer.className = 'preview-overlay-layer';
            const image = document.createElement('img');
            try {
                image.decoding = 'async';
            } catch (error) {
                // Ignore unsupported decoding hint.
            }
            image.loading = 'eager';
            image.draggable = false;
            layer.appendChild(image);
            entry = {
                type: 'image',
                layer,
                image,
                objectURL: '',
                frame: null,
                isVisible: false,
                layerGroup: null,
                zIndex: 0,
                borderRadius: 0,
                opacity: 1,
                lastTimelineTime: null,
            };
            activeOverlayLayers.set(timelineItem, entry);
        }

        const { layer, image } = entry;

        layer.className = 'preview-overlay-layer';
        layer.dataset.laneIndex = String(descriptor.laneIndex);

        if (borderRadius > 0) {
            layer.style.borderRadius = `${borderRadius}px`;
        } else {
            layer.style.removeProperty('border-radius');
        }

        if (entry.objectURL !== objectURL || !image.src) {
            image.src = objectURL;
            entry.objectURL = objectURL;
        }

        image.alt = timelineItem.dataset.displayName
            || timelineItem.querySelector('span')?.textContent
            || 'Overlay layer';
        layer.title = image.alt;

        return entry;
    };

    const hideOverlayLayerEntry = (entry) => {
        if (!entry) {
            return;
        }

        if (textEditorState.isEditing && textEditorState.entry === entry) {
            cancelActiveTextEditor({ commit: true });
        }

        entry.isVisible = false;
        entry.layerGroup = null;
        entry.zIndex = 0;
        entry.borderRadius = 0;
        entry.opacity = 1;
        entry.frame = null;
        entry.lastTimelineTime = null;

        if (entry.textCanvas) {
            const context = entry.textCanvasContext || entry.textCanvas.getContext('2d');
            if (context) {
                context.setTransform(1, 0, 0, 1, 0, 0);
                context.clearRect(0, 0, entry.textCanvas.width, entry.textCanvas.height);
            }
            entry.textCanvasSignature = null;
        }

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

        const { layer, image } = entry;

        const targetZIndex = Number.isFinite(zIndex) ? zIndex : getDescriptorZIndex(descriptor);
        layer.style.zIndex = String(targetZIndex);

        if (isTextTimelineItem(descriptor.item)) {
            layer.className = 'preview-overlay-layer preview-overlay-layer--text';
            layer.style.left = '0px';
            layer.style.top = '0px';
            layer.style.width = `${viewportWidth}px`;
            layer.style.height = `${viewportHeight}px`;
            layer.style.removeProperty('--preview-overlay-rotation');
            layer.style.removeProperty('border-radius');
            let textContent = 'Default Text';
            if (entry.textElement) {
                textContent = descriptor.item.dataset.textContent
                    || descriptor.item.dataset.displayName
                    || descriptor.item.querySelector('span')?.textContent
                    || 'Default Text';
                entry.textElement.textContent = textContent;
            }

            refreshTextEditorVisibilityForEntry(entry, descriptor.item);

            if (layer.parentElement !== container) {
                container.appendChild(layer);
            } else {
                container.appendChild(layer);
            }

            overlayLayerToTimelineItem.set(layer, descriptor.item);

            const descriptorOpacity = computeOverlayDescriptorOpacity(descriptor);
            const clampedOpacity = clamp(descriptorOpacity, 0, 1);
            layer.style.opacity = clampedOpacity >= 1 ? '1' : String(clampedOpacity);

            renderTextOverlayCanvas(entry, viewportWidth, viewportHeight);

            entry.frame = {
                left: 0,
                top: 0,
                width: viewportWidth,
                height: viewportHeight,
                rotation: 0,
            };
            entry.isVisible = true;
            entry.layerGroup = 'text';
            entry.zIndex = targetZIndex;
            entry.borderRadius = 0;
            entry.opacity = computeOverlayEntryOpacity(entry);
            entry.lastTimelineTime = safeTimelineNow;
            return true;
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

        if (frame) {
            layer.style.left = `${frame.left}px`;
            layer.style.top = `${frame.top}px`;
            layer.style.width = `${frame.width}px`;
            layer.style.height = `${frame.height}px`;
            const rotationValue = Number.isFinite(frame.rotation) ? frame.rotation : 0;
            image.style.setProperty('--preview-overlay-rotation', `${rotationValue}deg`);
        } else {
            layer.style.left = '0px';
            layer.style.top = '0px';
            layer.style.width = '100%';
            layer.style.height = '100%';
            image.style.setProperty('--preview-overlay-rotation', '0deg');
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
        if (image) {
            image.style.opacity = '1';
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

    const hasLayers = Boolean(
        (below && below.childElementCount)
        || (above && above.childElementCount)
        || (text && text.childElementCount),
    );

    if (hasLayers) {
        previewOverlayStack.removeAttribute('hidden');
        previewOverlayStack.setAttribute('aria-hidden', 'false');
    } else {
        previewOverlayStack.setAttribute('hidden', '');
        previewOverlayStack.setAttribute('aria-hidden', 'true');
    }

    lastOverlayRenderTimestamp = safeTimelineNow;
}

function getActiveOverlayLayerSnapshots() {
    const snapshots = [];
    const groupPriority = { below: 0, above: 1 };

    activeOverlayLayers.forEach((entry) => {
        if (!entry || !entry.isVisible || !entry.frame) {
            return;
        }

        if (entry.type === 'text') {
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

        const liveOpacity = computeOverlayEntryOpacity(entry);
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

    if (target.closest('.preview-overlay-text-editor__content')) {
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

function isAudioTimelineItem(timelineItem) {
    if (!timelineItem || !timelineItem.dataset) {
        return false;
    }
    const fileType = timelineItem.dataset.fileType || '';
    return fileType.startsWith('audio/');
}

function isTextTimelineItem(timelineItem) {
    if (!timelineItem || !timelineItem.dataset) {
        return false;
    }
    const fileType = timelineItem.dataset.fileType || '';
    return fileType.startsWith('text/');
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