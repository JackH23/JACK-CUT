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
    const shouldPersistKeyframe = Boolean(options.forceKeyframe) || existingKeyframes.length > 0;

    if (!shouldPersistKeyframe) {
        return;
    }

    const targetProgress = Object.prototype.hasOwnProperty.call(options, 'progressOverride')
        ? clampProgress(options.progressOverride)
        : getActiveClipProgress();

    if (!Number.isFinite(targetProgress)) {
        return;
    }

    const updatedKeyframes = upsertTimelineImageKeyframe(existingKeyframes, targetProgress, normalized);
    storeTimelineImageKeyframes(activeTimelineItem, updatedKeyframes);
    renderKeyframeTrack(activeTimelineItem);
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

    if (previewTextEditor) {
        if (!previewTextEditor.hidden) {
            const fontScale = getDefaultTextTemplateFontScale();
            const fontSizeFromHeight = previewImageTransform.height * fontScale;
            const fontSizeFromWidth = previewImageTransform.width * 0.18;
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

    const rotation = clampRotation(previewImageTransform.rotation);
    previewImageTransform.rotation = rotation;
    if (previewImage) {
        previewImage.style.setProperty('--preview-image-rotation', `${rotation}deg`);
    }

    const alignment = alignmentOverride
        || evaluatePreviewImageAlignment(previewImageTransform, getPreviewViewportSize());
    updatePreviewViewportAlignmentState(alignment);
    updatePreviewOutsideOutline();
    updatePreviewGuides(previewImageTransform, alignment);
    updateImageRotationControlState();
}

function clearPreviewImageTransform() {
    previewImageTransform = null;
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

const previewTextEditorState = {
    isEnabled: false,
    currentItem: null,
    lastCommittedValue: '',
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

function getDefaultTextTemplateFontScale() {
    const baseFontSize = (typeof window !== 'undefined'
            && Number.isFinite(window.DEFAULT_TEXT_TEMPLATE_FONT_SIZE))
        ? Number(window.DEFAULT_TEXT_TEMPLATE_FONT_SIZE)
        : DEFAULT_TEXT_TEMPLATE_FONT_SIZE_FALLBACK;
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

function autoFitDefaultTextTimelineItem(timelineItem, textContent) {
    if (!shouldAutoFitDefaultTextTimelineItem(timelineItem)) {
        return;
    }

    if (typeof window === 'undefined'
        || typeof window.calculateDefaultTextTemplateTransform !== 'function') {
        return;
    }

    let transform = null;
    try {
        transform = window.calculateDefaultTextTemplateTransform(textContent);
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
    return String(value || '')
        .replace(/\u00A0/g, ' ')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
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

    const sanitizedValue = normalizedText;
    const displayName = sanitizedValue || getDefaultTextTemplateLabel();

    timelineItem.dataset.textContent = sanitizedValue;
    timelineItem.dataset.displayName = displayName;

    const labelElement = timelineItem.querySelector('span');
    if (labelElement) {
        labelElement.textContent = displayName;
    }

    const previousObjectUrl = timelineItem.dataset.objectUrl || '';
    let nextObjectUrl = previousObjectUrl;

    if (typeof window !== 'undefined' && typeof window.createDefaultTextOverlayObjectURL === 'function') {
        try {
            nextObjectUrl = window.createDefaultTextOverlayObjectURL(displayName);
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
        if (previewImage && previewImage.src !== nextObjectUrl) {
            previewImage.src = nextObjectUrl;
        }
        preloadTimelineImage(nextObjectUrl).catch(() => {});
        refreshActiveOverlayLayers();
        if (previousObjectUrl && previousObjectUrl !== nextObjectUrl) {
            releaseTimelineImage(previousObjectUrl);
            try {
                URL.revokeObjectURL(previousObjectUrl);
            } catch (error) {
                // Ignore revoke failures.
            }
        }
    } else {
        refreshActiveOverlayLayers();
    }

    autoFitDefaultTextTimelineItem(timelineItem, displayName);

    previewTextEditorState.lastCommittedValue = sanitizedValue;
    updatePreviewTextEditorPlaceholderState(previewTextEditor?.textContent || sanitizedValue);
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
    const sanitized = currentValue.replace(/[\r\n]+/g, ' ');
    if (sanitized !== currentValue) {
        previewTextEditor.textContent = sanitized;
        focusPreviewTextEditor();
    }
    updatePreviewTextEditorPlaceholderState(sanitized);
    schedulePreviewTextEditorCommit();
}

function onPreviewTextEditorFocus() {
    if (previewImageFrame) {
        previewImageFrame.classList.add('is-text-editing');
    }
}

function onPreviewTextEditorBlur() {
    if (previewImageFrame) {
        previewImageFrame.classList.remove('is-text-editing');
    }
    commitPreviewTextEditorContent({ force: true });
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

function renderPreviewOverlayLayers(primaryTimelineItem, entries = []) {
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

    const overlayEntries = (Array.isArray(entries) ? entries : [])
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
            
            const explicitClipDuration = Number.isFinite(entry.clipDuration)
                ? Math.max(0, Number(entry.clipDuration) || 0)
                : null;
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