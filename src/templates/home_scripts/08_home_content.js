                if (onEnded) {
                    previewVideo.removeEventListener('ended', onEnded);
                }
                if (onError) {
                    previewVideo.removeEventListener('error', onError);
                }
                if (!abortController.signal.aborted) {
                    abortController.abort();
                }
                cancelPreviewAudioEnvelope({ restoreVolume: true });
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
                if (!isTimelinePaused) {
                    previewVideo.currentTime = 0;
                }
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
                const maximumSeekDuration = intrinsicDuration > 0
                    ? intrinsicDuration
                    : targetDuration;
                const safeStartOffset = Math.min(
                    startOffsetMs,
                    Math.max(0, maximumSeekDuration),
                );
                const startOffsetSeconds = safeStartOffset / 1000;
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

                previewVideo.muted = false;
                const baseVolume = clampVolume(audioSettings.volumePercent / 100);
                const previewState = getMediaEnvelopeState(previewVideo);
                if (previewState) {
                    previewState.baseVolume = baseVolume;
                }
                if (audioSettings.fadeInMs > 0 && baseVolume > 0) {
                    previewVideo.volume = 0;
                } else {
                    previewVideo.volume = baseVolume;
                }

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

                const seekToStartOffset = () => new Promise((resolveSeek) => {
                    if (safeStartOffset <= 0) {
                        previewVideo.currentTime = 0;
                        resolveSeek();
                        return;
                    }

                    let settled = false;
                    const cleanupSeek = () => {
                        if (settled) {
                            return;
                        }
                        settled = true;
                        previewVideo.removeEventListener('seeked', handleSeeked);
                        previewVideo.removeEventListener('error', handleError);
                        if (abortController) {
                            abortController.signal.removeEventListener('abort', handleAbort);
                        }
                        resolveSeek();
                    };
                    const handleSeeked = () => {
                        cleanupSeek();
                    };
                    const handleError = () => {
                        cleanupSeek();
                    };
                    const handleAbort = () => {
                        cleanupSeek();
                    };

                    previewVideo.addEventListener('seeked', handleSeeked);
                    previewVideo.addEventListener('error', handleError);
                    if (abortController) {
                        abortController.signal.addEventListener('abort', handleAbort);
                    }

                    try {
                        previewVideo.currentTime = startOffsetSeconds;
                        if (previewVideo.readyState >= 2
                            && Math.abs(previewVideo.currentTime - startOffsetSeconds) < 0.05
                        ) {
                            cleanupSeek();
                        }
                    } catch (error) {
                        cleanupSeek();
                    }
                });

                await seekToStartOffset();

                try {
                    const playPromise = previewVideo.play();
                    if (playPromise && typeof playPromise.then === 'function') {
                        await playPromise;
                    }
                    applyPreviewAudioEnvelope(audioSettings, effectiveDuration);
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
    } else if (fileType.startsWith('audio/')) {
        cancelPreviewExitAnimation({ forceRestore: true });
        setPreviewMode(null);
        previewVideo.pause();
        previewVideo.hidden = true;
        previewVideo.removeAttribute('src');
        if (previewPlaceholder) {
            previewPlaceholder.hidden = false;
            previewPlaceholder.textContent = 'Audio clip ready — press Play Back to hear it';
        }

        const clipDuration = Math.max(0, getTimelineItemPlaybackDuration(timelineItem));
        const remainingClipDuration = Math.max(0, clipDuration - startOffsetMs);
        const playbackWindowMs = Number.isFinite(playbackWindow)
            ? Math.max(0, Math.round(playbackWindow))
            : null;
        const effectiveDuration = playbackWindowMs === null
            ? remainingClipDuration
            : Math.min(remainingClipDuration, playbackWindowMs);
        const baseSegmentStart = Math.max(
            0,
            Math.round(Number(getTimelineItemStartTime(timelineItem)) || 0),
        );
        const segmentStartTime = baseSegmentStart + startOffsetMs;

        syncPreviewAudioOverlay(overlayEntries, segmentStartTime);
        playVideoButton.textContent = 'Play Back';
        await waitForGapDuration(effectiveDuration);
    } else if (fileType.startsWith('image/')) {
        const rawClipDuration = Number(timelineItem.dataset.imageDuration);
        const clipDuration = Number.isFinite(rawClipDuration) && rawClipDuration > 0
            ? Math.round(rawClipDuration)
            : IMAGE_FRAME_DURATION;
        const playbackWindowMs = Number.isFinite(playbackWindow)
            ? Math.max(0, Math.round(playbackWindow))
            : null;
        const effectiveDuration = playbackWindowMs === null
            ? clipDuration
            : Math.min(clipDuration, playbackWindowMs);
        const safeEffectiveDuration = Math.max(0, effectiveDuration);
        const initialElapsed = Math.min(startOffsetMs, clipDuration);
        const totalElapsed = initialElapsed + safeEffectiveDuration;
        const clipPlaysToEnd = clipDuration === 0 || totalElapsed >= clipDuration;
        const animationClipDuration = clipDuration > 0 ? clipDuration : safeEffectiveDuration;
        const skipEntranceAnimation = startOffsetMs > 0;
        const initialProgress = clipDuration > 0
            ? clampProgress(initialElapsed / clipDuration)
            : 0;
        const animationSettings = getTimelineItemAnimationSettings(timelineItem);
        const entranceConfigOverride = getPreviewImageEntranceConfig({
            clipDurationMs: animationClipDuration,
            settingsOverride: animationSettings,
        });
        const exitConfig = getPreviewImageExitConfig({
            clipDurationMs: animationClipDuration,
            settingsOverride: animationSettings,
        });
        const exitWindow = exitConfig
            ? Math.min(animationClipDuration, Math.max(0, exitConfig.totalDuration))
            : 0;
        setPreviewMode('has-image');
        previewVideo.pause();
        previewVideo.hidden = true;
        previewVideo.removeAttribute('src');
        setPreviewImageVisibility(true);
        previewPlaceholder.hidden = true;
        await revealPreviewImageSource(objectURL, {
            clipDurationMs: animationClipDuration,
            entranceConfigOverride,
            immediate: skipEntranceAnimation,
        });
        resetPreviewScroll();
        setActiveClipProgress(initialProgress, { source: 'image-playback' });

        await new Promise((resolve) => {
            let resolved = false;
            const startTimestamp = performance.now() - initialElapsed;
            let animationFrameId = 0;
            let exitAnimationRequested = false;
            let exitAnimationStarted = false;

            const stopAnimation = () => {
                if (animationFrameId) {
                    window.cancelAnimationFrame(animationFrameId);
                    animationFrameId = 0;
                }
            };

            const startExitAnimation = (options = {}) => {
                if (!exitConfig) {
                    return false;
                }

                const force = options.force === true;
                if (!force && exitAnimationRequested) {
                    return exitAnimationStarted;
                }

                exitAnimationRequested = true;
                const didAnimate = runPreviewImageExitAnimation({ restoreOnComplete: false }, exitConfig);

                if (!didAnimate && !force) {
                    exitAnimationRequested = false;
                }

                exitAnimationStarted = exitAnimationStarted || didAnimate;
                return didAnimate;
            };

            const exitStartTime = exitConfig
                ? Math.max(0, clipDuration - exitWindow)
                : Number.POSITIVE_INFINITY;

            const step = () => {
                if (resolved || !isTimelinePlaying) {
                    return;
                }

                const now = performance.now();
                const elapsed = Math.max(0, Math.min(now - startTimestamp, clipDuration));
                const elapsedSinceResume = Math.max(0, elapsed - initialElapsed);
                const playbackProgress = clipDuration > 0
                    ? clampProgress(elapsed / clipDuration)
                    : 0;

                setActiveClipProgress(playbackProgress, { source: 'image-playback' });

                if (exitConfig && !exitAnimationRequested) {
                    const shouldStartExit = clipPlaysToEnd
                        && (safeEffectiveDuration === 0 || elapsed >= exitStartTime);
                    if (shouldStartExit) {
                        startExitAnimation();
                    }
                }

                if (elapsedSinceResume < safeEffectiveDuration && isTimelinePlaying) {
                    animationFrameId = window.requestAnimationFrame(step);
                }
            };

            animationFrameId = window.requestAnimationFrame(step);

            if (exitConfig && clipPlaysToEnd && safeEffectiveDuration === 0) {
                startExitAnimation({ force: true });
            }

            const timeoutId = window.setTimeout(() => {
                if (resolved) {
                    return;
                }
                resolved = true;
                if (clipPlaysToEnd) {
                    startExitAnimation({ force: true });
                }
                stopAnimation();
                const finalElapsed = Math.min(
                    clipDuration,
                    initialElapsed + safeEffectiveDuration,
                );
                const finalProgress = clipDuration > 0
                    ? clampProgress(finalElapsed / clipDuration)
                    : 1;
                setActiveClipProgress(finalProgress, { source: 'image-playback-end', updatePreview: false });
                if (timelinePlaybackAbort === abortPlayback) {
                    timelinePlaybackAbort = null;
                }
                resolve();
            }, Math.max(0, Math.round(safeEffectiveDuration)));

            const abortPlayback = () => {
                if (resolved) {
                    return;
                }
                resolved = true;
                window.clearTimeout(timeoutId);
                stopAnimation();
                cancelPreviewExitAnimation({ forceRestore: true });
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

async function playTimelineSequence(startIndex = 0, resumeOptions = null, playbackOptions = null) {
    const options = playbackOptions || {};
    const isExportMode = options.mode === 'export';
    const precomputed = options.precomputedSegments || null;
    const timelineItems = getTimelineItems();
    if (!timelineItems.length) {
        alert('Upload an image or video to build your timeline.');
        return false;
    }

    const playbackState = precomputed && Array.isArray(precomputed.segments)
        ? {
            segments: precomputed.segments,
            totalDuration: Number.isFinite(precomputed.totalDuration)
                ? precomputed.totalDuration
                : getTimelinePlaybackSegments().totalDuration,
        }
        : getTimelinePlaybackSegments();
    const segments = playbackState.segments;
    const totalDuration = Number.isFinite(playbackState.totalDuration)
        ? playbackState.totalDuration
        : 0;
    if (!segments.length || totalDuration <= 0) {
        alert('Upload an image or video to build your timeline.');
        return false;
    }

    const resumeTimeMs = Number.isFinite(resumeOptions?.timeMs)
        ? Math.max(0, Math.round(resumeOptions.timeMs))
        : null;

    const boundedIndex = Math.min(
        Math.max(0, startIndex),
        Math.max(timelineItems.length - 1, 0),
    );
    const initialItem = timelineItems[boundedIndex] || null;
    let initialSegmentIndex = 0;
    if (resumeTimeMs !== null) {
        const resumeSegmentIndex = segments.findIndex(
            (segment) => resumeTimeMs >= segment.start && resumeTimeMs < segment.end,
        );
        if (resumeSegmentIndex >= 0) {
            initialSegmentIndex = resumeSegmentIndex;
        } else if (resumeTimeMs >= totalDuration) {
            initialSegmentIndex = segments.length ? segments.length - 1 : 0;
        }
    } else if (initialItem) {
        const foundSegmentIndex = segments.findIndex(
            (segment) => segment.item === initialItem,
        );
        if (foundSegmentIndex >= 0) {
            initialSegmentIndex = foundSegmentIndex;
        }
    }
    const startSegment = segments[initialSegmentIndex] || null;
    const startElapsed = resumeTimeMs !== null
        ? Math.min(resumeTimeMs, totalDuration)
        : (startSegment ? startSegment.start : 0);

    const previousPlaybackState = isExportMode
        ? {
            isPlaying: isTimelinePlaying,
            isPaused: isTimelinePaused,
            pauseState: timelinePauseState ? { ...timelinePauseState } : null,
            buttonLabel: playVideoButton ? playVideoButton.textContent : null,
        }
        : null;

    isTimelinePaused = false;
    timelinePauseState = null;
    isTimelinePlaying = true;
    if (!isExportMode) {
        playVideoButton.textContent = 'Pause playback';
        updateKeyframeControlsState();
        resetTimelineProgressLine(getTimelineFractionForTime(startElapsed));
        startPlaybackClock(startElapsed, totalDuration);
    }
    updatePlaybackTimeDisplay(startElapsed, totalDuration);

    let completedNaturally = true;
    let pendingResumeTime = resumeTimeMs;

    try {
        for (let index = initialSegmentIndex; index < segments.length; index += 1) {
            if (!isTimelinePlaying && !isExportMode) {
                completedNaturally = false;
                break;
            }
            const segment = segments[index];
            const { item, start, end, duration } = segment;
            if (duration <= 0) {
                continue;
            }
            if (pendingResumeTime !== null && pendingResumeTime >= end) {
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
            let segmentStartTime = start;
            
            if (pendingResumeTime !== null) {
                if (pendingResumeTime <= start) {
                    segmentStartTime = start;
                    
                } else if (pendingResumeTime < end) {
                    segmentStartTime = pendingResumeTime;
                    
                } else {
                    continue;
                }
            }

            let segmentStartOffset = 0;
            if (item) {
                const clipStartTime = Math.max(
                    0,
                    Math.round(Number(getTimelineItemStartTime(item)) || 0),
                );
                const clipDuration = Math.max(
                    0,
                    Math.round(Number(getTimelineItemPlaybackDuration(item)) || 0),
                );
                const offsetFromClipStart = Number.isFinite(segmentStartTime)
                    ? Math.round(segmentStartTime - clipStartTime)
                    : 0;
                segmentStartOffset = Math.max(0, offsetFromClipStart);
                if (clipDuration > 0) {
                    segmentStartOffset = Math.min(segmentStartOffset, clipDuration);
                }
            }
            
            syncPreviewAudioOverlay(segment.items || [], segmentStartTime);
            const startFraction = getTimelineFractionForTime(segmentStartTime);
            const endFraction = getTimelineFractionForTime(end);
            const remainingDuration = pendingResumeTime !== null
                ? Math.max(0, Math.round(end - segmentStartTime))
                : duration;
            animateTimelineProgress(startFraction, endFraction, remainingDuration);
            if (item) {
                // eslint-disable-next-line no-await-in-loop
                await playTimelineItem(item, remainingDuration, segment.items || null, {
                    startOffsetMs: segmentStartOffset,
                });
            } else {
                // eslint-disable-next-line no-await-in-loop
                await waitForGapDuration(remainingDuration);
            }
            pendingResumeTime = null;
        }
    } finally {
        if (isExportMode) {
            const abort = timelinePlaybackAbort;
            timelinePlaybackAbort = null;
            if (typeof abort === 'function') {
                abort();
            }
            cancelTimelineProgressAnimation();
            isTimelinePlaying = previousPlaybackState?.isPlaying || false;
            isTimelinePaused = previousPlaybackState?.isPaused || false;
            timelinePauseState = previousPlaybackState?.pauseState || null;
            if (playVideoButton && typeof previousPlaybackState?.buttonLabel === 'string') {
                playVideoButton.textContent = previousPlaybackState.buttonLabel;
            }
            if (!isTimelinePaused) {
                updateActiveTimelineIndicators();
            }
            if (!isTimelinePlaying) {
                stopPlaybackClock(false);
            }
            updateKeyframeControlsState();
            refreshActiveOverlayLayers();
        } else {
            const preservePause = isTimelinePaused;
            stopTimelinePlayback(!preservePause, !preservePause, { preservePauseState: preservePause });
            if (completedNaturally && !isTimelinePaused) {
                resetTimelineProgressLine(totalDuration > 0 ? 1 : 0);
                updatePlaybackTimeDisplay(totalDuration, totalDuration);
            } else if (!isTimelinePaused) {
                updateActiveTimelineIndicators();
            }
        }
    }

    return completedNaturally;
}

function pauseTimelinePlayback() {
    if (!isTimelinePlaying || isTimelinePaused) {
        return;
    }

    const { segments, totalDuration } = getTimelinePlaybackSegments();
    if (!segments.length || totalDuration <= 0) {
        return;
    }

    const timelineItems = getTimelineItems();
    const clampedTime = Math.max(
        0,
        Math.min(Number(playbackDisplayCurrentMs) || 0, totalDuration),
    );

    const segmentIndex = segments.findIndex(
        (segment) => clampedTime >= segment.start && clampedTime < segment.end,
    );
    const activeIndex = activeTimelineItem ? timelineItems.indexOf(activeTimelineItem) : -1;
    const fallbackIndex = segmentIndex >= 0 && segments[segmentIndex].item
        ? timelineItems.indexOf(segments[segmentIndex].item)
        : -1;
    const resumeItemIndex = activeIndex >= 0
        ? activeIndex
        : (fallbackIndex >= 0 ? fallbackIndex : 0);

    const pauseState = {
        resumeItemIndex,
        resumeTimeMs: clampedTime,
    };

    isTimelinePaused = true;
    timelinePauseState = pauseState;

    stopTimelinePlayback(false, false, { preservePauseState: true });

    const pausedFraction = totalDuration > 0
        ? clampProgress(clampedTime / totalDuration)
        : 0;
    applyTimelineProgressGeometry();
    setTimelineProgressVisuals(pausedFraction, { forceGeometryUpdate: true });
    updatePlaybackTimeDisplay(clampedTime, totalDuration);
    playVideoButton.textContent = 'Resume playback';
}

function resumeTimelinePlayback() {
    if (!isTimelinePaused || !timelinePauseState) {
        return;
    }

    const timelineItems = getTimelineItems();
    if (!timelineItems.length) {
        isTimelinePaused = false;
        timelinePauseState = null;
        playVideoButton.textContent = 'Play Back';
        return;
    }

    const { resumeItemIndex, resumeTimeMs } = timelinePauseState;
    const { totalDuration } = getTimelinePlaybackSegments();
    const clampedResumeTime = Math.max(
        0,
        Math.min(Number(resumeTimeMs) || 0, totalDuration),
    );

    if (clampedResumeTime >= totalDuration) {
        isTimelinePaused = false;
        timelinePauseState = null;
        resetTimelineProgressLine(totalDuration > 0 ? 1 : 0);
        updatePlaybackTimeDisplay(totalDuration, totalDuration);
        playVideoButton.textContent = 'Play Back';
        return;
    }

    const boundedIndex = Math.min(
        Math.max(0, Number(resumeItemIndex) || 0),
        Math.max(timelineItems.length - 1, 0),
    );

    isTimelinePaused = false;
    timelinePauseState = null;

    playTimelineSequence(boundedIndex, { timeMs: clampedResumeTime }).catch((error) => {
        console.error('Timeline playback failed.', error);
    });
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
            scheduleExportPreparation(refreshedTimelineItems);
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

let sharedExportAudioContext = null;
let sharedExportAudioSources = new WeakMap();

let preparedExportPlan = null;
let exportPreparationPromise = null;
const exportMediaWarmups = new Map();
let lastExportPreviewUrl = null;

function computeTimelineSignature(timelineItems) {
    return timelineItems
        .map((item, index) => {
            if (!item) {
                return `missing:${index}`;
            }
            const objectUrl = item.dataset?.objectUrl || '';
            const fileType = item.dataset?.fileType || '';
            const laneIndex = item.dataset?.laneIndex || '';
            const imageDuration = item.dataset?.imageDuration || '';
            const videoDuration = item.dataset?.videoDuration || '';
            const audioDuration = item.dataset?.audioDuration || '';
            const start = getTimelineItemStartTime(item);
            const duration = getTimelineItemPlaybackDuration(item);
            return [
                index,
                objectUrl,
                fileType,
                laneIndex,
                imageDuration,
                videoDuration,
                audioDuration,
                start,
                duration,
            ].join(':');
        })
        .join('|');
}

function warmMediaElementForExport(element, objectURL, readyEventName) {
    if (!objectURL) {
        return null;
    }

    if (exportMediaWarmups.has(objectURL)) {
        return exportMediaWarmups.get(objectURL);
    }

    const warmupPromise = new Promise((resolve) => {
        let settled = false;
        const cleanup = () => {
            if (settled) {
                return;
            }
            settled = true;
            element.removeEventListener(readyEventName, handleReady);
            element.removeEventListener('error', handleError);
            window.setTimeout(() => {
                try {
                    element.removeAttribute('src');
                    element.load();
                } catch (error) {
                    // Ignore cleanup errors during warmup.
                }
            }, 0);
            resolve();
        };
        const handleReady = () => cleanup();
        const handleError = () => cleanup();
        element.addEventListener(readyEventName, handleReady, { once: true });
        element.addEventListener('error', handleError, { once: true });
        try {
            element.src = objectURL;
            element.load();
        } catch (error) {
            cleanup();
        }
    }).catch(() => {});

    exportMediaWarmups.set(objectURL, warmupPromise);
    return warmupPromise;
}

function warmVideoForExport(objectURL) {
    const element = document.createElement('video');
    element.preload = 'auto';
    element.crossOrigin = 'anonymous';
    element.muted = true;
    element.playsInline = true;
    return warmMediaElementForExport(element, objectURL, 'loadeddata');
}

function warmAudioForExport(objectURL) {
    const element = document.createElement('audio');
    element.preload = 'auto';
    element.crossOrigin = 'anonymous';
    return warmMediaElementForExport(element, objectURL, 'canplaythrough');
}

function warmTimelineMediaForExport(timelineItems) {
    const warmups = [];
    timelineItems.forEach((timelineItem) => {
        if (!timelineItem) {
            return;
        }
        const objectURL = timelineItem.dataset?.objectUrl;
        const fileType = timelineItem.dataset?.fileType || '';
        if (!objectURL) {
            return;
        }

        if (fileType.startsWith('image/')) {
            warmups.push(preloadTimelineImage(objectURL).catch(() => {}));
        } else if (fileType.startsWith('video/')) {
            const warmup = warmVideoForExport(objectURL);
            if (warmup) {
                warmups.push(warmup);
            }
        } else if (fileType.startsWith('audio/')) {
            const warmup = warmAudioForExport(objectURL);
            if (warmup) {
                warmups.push(warmup);
            }
        }
    });
    return warmups;
}

function prepareExportPlan(timelineItemsSnapshot) {
    const snapshot = Array.from(timelineItemsSnapshot || []);
    const playbackState = getTimelinePlaybackSegments();
    const segmentsClone = playbackState.segments.map((segment) => ({
        start: segment.start,
        end: segment.end,
        duration: segment.duration,
        item: segment.item,
        items: Array.isArray(segment.items) ? segment.items.slice() : [],
    }));

    const timelineSignature = computeTimelineSignature(snapshot);
    const mediaWarmups = warmTimelineMediaForExport(snapshot).filter(Boolean);

    const plan = {
        segments: segmentsClone,
        totalDuration: playbackState.totalDuration,
        timelineSignature,
        mediaWarmups,
        preparedAt: performance.now(),
    };

    preparedExportPlan = plan;
    return plan;
}

function scheduleExportPreparation(timelineItems) {
    const snapshot = Array.isArray(timelineItems)
        ? timelineItems.slice()
        : Array.from(timelineItems || []);

    const promise = Promise.resolve().then(() => prepareExportPlan(snapshot));
    exportPreparationPromise = promise.catch((error) => {
        console.warn('Failed to prepare export plan.', error);
        return null;
    });
    return exportPreparationPromise;
}

async function ensurePreparedExportPlan(timelineItems) {
    const snapshot = Array.from(timelineItems || []);
    const expectedSignature = computeTimelineSignature(snapshot);

    if (preparedExportPlan && preparedExportPlan.timelineSignature === expectedSignature) {
        return preparedExportPlan;
    }

    if (exportPreparationPromise) {
        try {
            const existing = await exportPreparationPromise;
            if (existing && existing.timelineSignature === expectedSignature) {
                preparedExportPlan = existing;
                return existing;
            }
        } catch (error) {
            console.warn('Unable to reuse cached export preparation.', error);
        }
    }

    const plan = prepareExportPlan(snapshot);
    exportPreparationPromise = Promise.resolve(plan);
    return plan;
}

function resetPreparedExportPlan() {
    preparedExportPlan = null;
    exportPreparationPromise = null;
}

function displayExportPlaybackResult(exportBlob, exportFormat) {
    if (!previewVideo) {
        return;
    }

    const playbackUrl = URL.createObjectURL(exportBlob);

    if (lastExportPreviewUrl) {
        try {
            URL.revokeObjectURL(lastExportPreviewUrl);
        } catch (error) {
            // Ignore revocation errors.
        }
    }

    lastExportPreviewUrl = playbackUrl;

    setPreviewMode('has-video');
    if (previewPlaceholder) {
        previewPlaceholder.hidden = true;
    }
    previewVideo.hidden = false;
    previewVideo.src = playbackUrl;
    try {
        previewVideo.load();
    } catch (error) {
        // Ignore load errors when preparing preview playback.
    }
    previewVideo.currentTime = 0;
    if (typeof stopPreviewAudio === 'function') {
        stopPreviewAudio({ resetTime: true });
    }

    const autoplayPromises = [];
    autoplayPromises.push(previewVideo.play().catch(() => {}));
    Promise.all(autoplayPromises).catch(() => {});

    if (exportDialogStatus) {
        exportDialogStatus.dataset.state = 'ready';
        exportDialogStatus.textContent = `Export complete! Previewing ${exportFormat?.fileExtension?.toUpperCase() || 'MP4'} version.`;
    }
}

function getOrCreateSharedExportAudioContext() {
    if (sharedExportAudioContext && sharedExportAudioContext.state === 'closed') {
        sharedExportAudioContext = null;
        sharedExportAudioSources = new WeakMap();
    }

    if (!sharedExportAudioContext) {
        const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextConstructor) {
            return null;
        }

        try {
            sharedExportAudioContext = new AudioContextConstructor();
        } catch (error) {
            return null;
        }
    }

    return sharedExportAudioContext;
}

function getOrCreateExportAudioSourceNode(element, audioContext) {
    if (!element || !audioContext) {
        return null;
    }

    let sourceNode = sharedExportAudioSources.get(element);
    if (sourceNode) {
        return sourceNode;
    }

    try {
        sourceNode = audioContext.createMediaElementSource(element);
        sourceNode.connect(audioContext.destination);
        sharedExportAudioSources.set(element, sourceNode);
        return sourceNode;
    } catch (error) {
        return null;
    }
}

function attachPreviewAudioToStream(mediaElements, combinedStream) {
    const elements = Array.isArray(mediaElements)
        ? mediaElements.filter(Boolean)
        : [mediaElements].filter(Boolean);
    if (!elements.length || !combinedStream) {
        return {
            audioContext: null,
            success: false,
            error: new Error('Missing media elements or combined stream.'),
            cleanup: () => {},
        };
    }

    let lastError = null;

    let previewDestination = null;
    if (typeof getOrCreatePreviewAudioDestination === 'function') {
        previewDestination = getOrCreatePreviewAudioDestination();
    }

    if (previewDestination?.stream) {
        const primePreviewAudioGraph = () => {
            if (typeof ensureMediaElementGainNode !== 'function') {
                return;
            }
            elements.forEach((element) => {
                try {
                    ensureMediaElementGainNode(element);
                } catch (error) {
                    // Ignore failures when priming the preview audio graph.
                }
            });
        };

        primePreviewAudioGraph();

        let previewTracks = previewDestination.stream
            .getAudioTracks()
            .filter((track) => track && track.readyState !== 'ended');

        if (!previewTracks.length) {
            primePreviewAudioGraph();
            previewTracks = previewDestination.stream
                .getAudioTracks()
                .filter((track) => track && track.readyState !== 'ended');
        }
        
        const attachments = previewTracks
            .map((track) => {
                if (!track) {
                    return null;
                }
                const cloned = typeof track.clone === 'function' ? track.clone() : track;
                return cloned
                    ? {
                        original: track,
                        attached: cloned,
                        isClone: cloned !== track,
                    }
                    : null;
            })
            .filter(Boolean);

        if (attachments.length) {
            const previewContext = previewDestination.context
                || (typeof getOrCreatePreviewAudioContext === 'function'
                    ? getOrCreatePreviewAudioContext()
                    : null);
            if (previewContext && previewContext.state === 'suspended') {
                previewContext.resume().catch(() => {});
            }
            attachments.forEach(({ attached }) => {
                combinedStream.addTrack(attached);
            });
            return {
                audioContext: previewContext,
                success: true,
                error: null,
                cleanup: () => {
                    attachments.forEach(({ attached, isClone }) => {
                        try {
                            if (typeof combinedStream.removeTrack === 'function') {
                                combinedStream.removeTrack(attached);
                            }
                        } catch (removeError) {
                            // Ignore removal errors during cleanup.
                        }
                        if (isClone && typeof attached.stop === 'function') {
                            attached.stop();
                        }
                    });
                },
            };
        }
    }

    const directTracks = [];
    let missingDirectCapture = false;
    const pendingTracks = [];
    elements.forEach((element) => {
        if (typeof element?.captureStream === 'function') {
            try {
                const audioStream = element.captureStream();
                if (audioStream) {
                    const tracks = audioStream.getAudioTracks();
                    if (tracks.length) {
                        tracks.forEach((track) => {
                            pendingTracks.push(track);
                            directTracks.push(track);
                        });
                    } else {
                        missingDirectCapture = true;
                    }
                } else {
                    missingDirectCapture = true;
                }
            } catch (error) {
                lastError = error;
                missingDirectCapture = true;
            }
        } else {
            missingDirectCapture = true;
        }
    });
    if (directTracks.length && !missingDirectCapture) {
        pendingTracks.forEach((track) => {
            combinedStream.addTrack(track);
        });
        return {
            audioContext: null,
            success: true,
            error: null,
            cleanup: () => {},
        };
    }

    pendingTracks.forEach((track) => {
        try {
            track.stop();
        } catch (error) {
            // Ignore track stop errors when falling back to AudioContext.
        }
    });

    const audioContext = getOrCreateSharedExportAudioContext();
    if (!audioContext) {
        return {
            audioContext: null,
            success: false,
            error: lastError || new Error('AudioContext is not supported in this browser.'),
            cleanup: () => {},
        };
    }

    if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
    }

    const destination = audioContext.createMediaStreamDestination();
    const connectedSourceNodes = [];
    let hasSource = false;
    elements.forEach((element) => {
        try {
            const sourceNode = getOrCreateExportAudioSourceNode(element, audioContext);
            if (!sourceNode) {
                return;
            }
            sourceNode.connect(destination);
            connectedSourceNodes.push({ node: sourceNode, destination });
            hasSource = true;
        } catch (error) {
            lastError = error;
        }
    });

    const cleanupConnections = () => {
        connectedSourceNodes.forEach(({ node, destination: dest }) => {
            try {
                node.disconnect(dest);
            } catch (disconnectError) {
                // Ignore disconnection errors when cleaning up export routing.
            }
        });
        try {
            destination.stream.getAudioTracks().forEach((track) => {
                if (typeof track.stop === 'function') {
                    track.stop();
                }
            });
        } catch (error) {
            // Ignore destination cleanup errors.
        }
    };

    if (!hasSource) {
        cleanupConnections();
        return {
            audioContext: null,
            success: false,
            error: lastError || new Error('Unable to create audio sources for export.'),
            cleanup: () => {},
        };
    }

    const audioTracks = destination.stream.getAudioTracks();
    audioTracks.forEach((track) => combinedStream.addTrack(track));
    if (!audioTracks.length) {
        cleanupConnections();
        return {
            audioContext: null,
            success: false,
            error: lastError || new Error('No audio tracks available from preview video.'),
            cleanup: () => {},
        };
    }

    return {
        audioContext,
        success: true,
        error: null,
        cleanup: cleanupConnections,
    };
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

    const exportPlan = await ensurePreparedExportPlan(timelineItems);
    if (!exportPlan || !Array.isArray(exportPlan.segments) || !exportPlan.segments.length) {
        alert('Unable to prepare export because the timeline has no playable segments.');
        return;
    }

    const warmups = Array.isArray(exportPlan.mediaWarmups)
        ? exportPlan.mediaWarmups.filter(Boolean)
        : [];
    if (warmups.length) {
        await Promise.all(warmups.map((promise) => promise.catch(() => {})));
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
        DEFAULT_EXPORT_QUALITY,
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
    let audioAttachmentCleanup = null;

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

        const audioAttachment = attachPreviewAudioToStream([previewVideo, previewAudio], combinedStream);
        exportAudioContext = audioAttachment.audioContext;
        if (typeof audioAttachment.cleanup === 'function') {
            audioAttachmentCleanup = audioAttachment.cleanup;
        }
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
        const playbackCompleted = await playTimelineSequence(0, null, {
            mode: 'export',
            precomputedSegments: {
                segments: exportPlan.segments,
                totalDuration: exportPlan.totalDuration,
            },
        });
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

        displayExportPlaybackResult(exportBlob, exportFormat);
        renderExportSummary(timelineItems, playbackCompleted);

        closeExportDialog();
    } catch (error) {
        console.error('Failed to export timeline preview.', error);
        alert(`Export failed: ${error?.message || error}`);
        if (exportDialogStatus) {
            exportDialogStatus.textContent = 'Export failed. Please try again.';
            exportDialogStatus.dataset.state = 'warning';
        }
    } finally {
        if (typeof audioAttachmentCleanup === 'function') {
            try {
                audioAttachmentCleanup();
            } catch (error) {
                // Ignore cleanup errors.
            }
        }
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
        exportAudioContext = null;
        stopMirroring();
        confirmExportButton.disabled = false;
        confirmExportButton.textContent = originalLabel || 'Confirm export';
        isExportingTimeline = false;
        resetPreparedExportPlan();
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
    if (event.key !== 'Escape') {
        return;
    }

    if (isPreviewFullscreen) {
        event.preventDefault();
        setPreviewFullscreenState(false, { restoreFocus: previewFullscreenToggle || true });
        return;
    }

    if (isExportDialogOpen()) {
        event.preventDefault();
        closeExportDialog();
    }
});

playVideoButton.addEventListener('click', () => {
    if (isTimelinePlaying) {
        pauseTimelinePlayback();
        return;
    }

    if (isTimelinePaused && timelinePauseState) {
        resumeTimelinePlayback();
        return;
    }

    const timelineItems = getTimelineItems();
    if (!timelineItems.length) {
        alert('Upload an image or video to build your timeline.');
        return;
    }

    const playbackState = getTimelinePlaybackSegments();
    const { totalDuration } = playbackState;
    const progressSource = (typeof getTimelineProgressFraction === 'function')
        ? getTimelineProgressFraction()
        : clampProgress(timelineProgressCurrentFraction || 0);
    const startTimeMs = totalDuration > 0
        ? Math.min(
            Math.max(Math.round(progressSource * totalDuration), 0),
            Math.max(totalDuration - 1, 0),
        )
        : 0;
    const resumeOptions = totalDuration > 0 ? { timeMs: startTimeMs } : null;

    const startIndex = activeTimelineItem ? timelineItems.indexOf(activeTimelineItem) : 0;
    playTimelineSequence(startIndex >= 0 ? startIndex : 0, resumeOptions).catch((error) => {
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
