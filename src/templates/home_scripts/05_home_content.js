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
    setPreviewViewportRenderSize(viewportWidth, viewportHeight);
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
    invalidatePreviewViewportRenderSize();
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
        setPreviewViewportRenderSize(0, 0);
        hidePreviewOutsideOutline();
        refreshActiveOverlayLayers();
        return;
    }

    const width = Math.max(0, previewViewport.clientWidth);
    const height = Math.max(0, previewViewport.clientHeight);

    setPreviewViewportRenderSize(width, height);

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
        setPreviewViewportRenderSize(width, height);
        hidePreviewOutsideOutline();
        refreshActiveOverlayLayers();
        return;
    }

    if (pendingPreviewImageTransform) {
        const applied = applyStoredPreviewImageTransform(pendingPreviewImageTransform, { width, height });

        if (applied) {
            pendingPreviewImageTransform = null;
            lastPreviewViewportSize = { width, height };
            setPreviewViewportRenderSize(width, height);
            lastNonZeroPreviewViewportSize = { width, height };
            refreshActiveOverlayLayers();
            return;
        }
    }

    if (shouldResetImageFrameOnNextViewportUpdate) {
        shouldResetImageFrameOnNextViewportUpdate = false;
        resetPreviewImageFrameToFit();
        lastPreviewViewportSize = { width, height };
        setPreviewViewportRenderSize(width, height);
        lastNonZeroPreviewViewportSize = { width, height };
        refreshActiveOverlayLayers();
        return;
    }

    if (!previewImageTransform) {
        lastPreviewViewportSize = { width, height };
        setPreviewViewportRenderSize(width, height);
        lastNonZeroPreviewViewportSize = { width, height };
        hidePreviewOutsideOutline();
        refreshActiveOverlayLayers();
        return;
    }

    if (!lastPreviewViewportSize || lastPreviewViewportSize.width === 0) {
        lastPreviewViewportSize = { width, height };
        setPreviewViewportRenderSize(width, height);
        lastNonZeroPreviewViewportSize = { width, height };
        hidePreviewOutsideOutline();
        refreshActiveOverlayLayers();
        return;
    }

    const scale = width / lastPreviewViewportSize.width;

    if (!Number.isFinite(scale) || scale <= 0) {
        lastPreviewViewportSize = { width, height };
        setPreviewViewportRenderSize(width, height);
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
    setPreviewViewportRenderSize(width, height);
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

    const deltaX = event.clientX - previewImagePointerState.origin.pointerX;
    const deltaY = event.clientY - previewImagePointerState.origin.pointerY;

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
        cleanupPreviewTransitionBuffer();
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

    clearActiveOverlaySnapshotCache();
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

    const overshoot = effectiveTimelineNow - descriptorEnd;
    if (overshoot > OVERLAY_EXIT_OVERSHOOT_ALLOWANCE_MS) {
        const activeEntry = activeOverlayLayers.get(descriptor.item);
        const previousOpacity = Number.isFinite(activeEntry?.opacity)
            ? activeEntry.opacity
            : 0;
        if (previousOpacity <= 0) {
            return false;
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

    if (entry.frame) {
        updateOverlaySnapshotEntry(entry);
    } else {
        markActiveOverlaySnapshotsDirty();
    }
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

    if (entry.frame) {
        updateOverlaySnapshotEntry(entry);
    } else {
        markActiveOverlaySnapshotsDirty();
    }
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
    const cachedDescriptorMap = (descriptorCacheInput && descriptorCacheInput.length)
        ? new Map(descriptorCacheInput.map((descriptor) => [descriptor.item, descriptor]))
        : null;
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
            const cached = cachedDescriptorMap?.get(entry.item) || null;
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
                expandedWindowStart,