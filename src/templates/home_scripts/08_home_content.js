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

async function playTimelineSequence(startIndex = 0, resumeOptions = null, playbackContext = null) {
    const timelineItems = Array.isArray(playbackContext?.timelineItems)
        ? playbackContext.timelineItems
        : getTimelineItems();
    if (!timelineItems.length) {
        alert('Upload an image or video to build your timeline.');
        return false;
    }

    const playbackState = playbackContext?.playbackState || getTimelinePlaybackSegments();
    const segments = Array.isArray(playbackState?.segments)
        ? playbackState.segments
        : [];
    const totalDuration = Number.isFinite(playbackState?.totalDuration)
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

    isTimelinePaused = false;
    timelinePauseState = null;
    isTimelinePlaying = true;
    playVideoButton.textContent = 'Pause playback';
    updateKeyframeControlsState();
    resetTimelineProgressLine(getTimelineFractionForTime(startElapsed));
    updatePlaybackTimeDisplay(startElapsed, totalDuration);
    startPlaybackClock(startElapsed, totalDuration);

    let completedNaturally = true;
    let pendingResumeTime = resumeTimeMs;

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
        const preservePause = isTimelinePaused;
        stopTimelinePlayback(!preservePause, !preservePause, { preservePauseState: preservePause });
        if (completedNaturally && !isTimelinePaused) {
            resetTimelineProgressLine(totalDuration > 0 ? 1 : 0);
            updatePlaybackTimeDisplay(totalDuration, totalDuration);
        } else if (!isTimelinePaused) {
            updateActiveTimelineIndicators();
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
            const exportContext = prepareExportPlaybackContext(timelineItems);
            renderExportSummary(
                exportContext.timelineItems,
                null,
                exportContext.playbackState,
            );
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
        resetExportPlaybackContext();
    });
}

const exportAudioConfig = (() => {
    const fallbackConfig = {
        sampleRate: 48000,
        codec: 'mp4a.40.2',
        audioBitsPerSecond: 192000,
        primingDurationMs: 250,
    };
    if (typeof window !== 'undefined' && window.EXPORT_AUDIO_CONFIG) {
        return {
            ...fallbackConfig,
            ...window.EXPORT_AUDIO_CONFIG,
        };
    }
    return fallbackConfig;
})();

const EXPORT_AUDIO_MONITOR_POLL_INTERVAL_MS = 50;

function nowForExport() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
}

function delayForExport(ms) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, Math.max(0, ms));
    });
}

async function primeMediaElementsForExport(elements, options = {}) {
    const { timeoutMs = 3000 } = options;
    const validElements = (Array.isArray(elements) ? elements : [elements])
        .filter((element) => element && typeof element.readyState === 'number');
    if (!validElements.length) {
        return;
    }
    const abortController = typeof AbortController === 'function'
        ? new AbortController()
        : null;
    let timeoutId = null;
    try {
        if (abortController && Number.isFinite(timeoutMs) && timeoutMs > 0) {
            timeoutId = window.setTimeout(() => {
                try {
                    abortController.abort();
                } catch (error) {
                    // Ignore abort errors
                }
            }, timeoutMs);
        }
        await Promise.all(validElements.map((element) => (
            typeof waitForMediaReady === 'function'
                ? waitForMediaReady(element, { signal: abortController?.signal })
                : Promise.resolve()
        )));
    } finally {
        if (timeoutId) {
            window.clearTimeout(timeoutId);
        }
    }
}

function monitorAudioTracksForExport(tracks, onError) {
    const audioTracks = Array.isArray(tracks) ? tracks.filter(Boolean) : [];
    if (!audioTracks.length) {
        return null;
    }
    let reported = false;
    const normalizeError = (value) => {
        if (value instanceof Error) {
            return value;
        }
        if (value && typeof value === 'object' && value.type) {
            return new Error(`Audio track ${value.type} during export.`);
        }
        return new Error('Audio track issue detected during export.');
    };
    const handleIssue = (event) => {
        if (reported) {
            return;
        }
        reported = true;
        if (typeof onError === 'function') {
            try {
                onError(normalizeError(event));
            } catch (error) {
                // Ignore errors raised from error handlers.
            }
        }
    };
    const handleUnmute = () => {
        reported = false;
    };
    audioTracks.forEach((track) => {
        try {
            track.addEventListener('ended', handleIssue);
            track.addEventListener('mute', handleIssue);
            track.addEventListener('unmute', handleUnmute);
        } catch (error) {
            // Ignore listener attachment errors.
        }
    });
    return () => {
        audioTracks.forEach((track) => {
            try {
                track.removeEventListener('ended', handleIssue);
                track.removeEventListener('mute', handleIssue);
                track.removeEventListener('unmute', handleUnmute);
            } catch (error) {
                // Ignore cleanup failures.
            }
        });
    };
}

async function ensureTracksActive(tracks, options = {}) {
    const { timeoutMs = 1500 } = options;
    const audioTracks = Array.isArray(tracks) ? tracks.filter(Boolean) : [];
    if (!audioTracks.length) {
        return;
    }
    const start = nowForExport();
    while (nowForExport() - start < timeoutMs) {
        const inactive = audioTracks.find((track) => track.readyState !== 'live');
        if (!inactive) {
            return;
        }
        await delayForExport(EXPORT_AUDIO_MONITOR_POLL_INTERVAL_MS);
    }
    throw new Error('Audio track failed to become active for export.');
}

async function waitForAudioContextStable(audioContext, options = {}) {
    if (!audioContext) {
        return;
    }
    const { timeoutMs = 1500 } = options;
    const start = nowForExport();
    let lastTime = audioContext.currentTime;
    while (nowForExport() - start < timeoutMs) {
        await delayForExport(EXPORT_AUDIO_MONITOR_POLL_INTERVAL_MS);
        const currentTime = audioContext.currentTime;
        if (Number.isFinite(currentTime) && currentTime > 0 && currentTime !== lastTime) {
            return;
        }
        lastTime = currentTime;
    }
    throw new Error('Audio rendering graph did not start within the expected time.');
}

async function waitForExportAudioPrimed(audioContext, stream, options = {}) {
    const timeoutMs = options?.timeoutMs ?? Math.max(1000, exportAudioConfig.primingDurationMs + 500);
    const audioTracks = stream?.getAudioTracks ? stream.getAudioTracks().filter(Boolean) : [];
    await Promise.all([
        ensureTracksActive(audioTracks, { timeoutMs }).catch((error) => { throw error; }),
        waitForAudioContextStable(audioContext, { timeoutMs }).catch((error) => { throw error; }),
    ]);
}

function ensureAudioTracksNotMuted(tracks) {
    const audioTracks = Array.isArray(tracks) ? tracks.filter(Boolean) : [];
    const mutedTrack = audioTracks.find((track) => track.muted === true);
    if (mutedTrack) {
        throw new Error('Detected muted audio track before export.');
    }
}

let sharedExportAudioContext = null;
let sharedExportAudioSources = new WeakMap();
let pendingExportPlaybackContext = null;

function prepareExportPlaybackContext(existingItems = null) {
    const timelineItems = Array.isArray(existingItems)
        ? existingItems
        : getTimelineItems();
    const playbackState = getTimelinePlaybackSegments();
    pendingExportPlaybackContext = {
        timelineItems,
        playbackState,
    };
    return pendingExportPlaybackContext;
}

function resetExportPlaybackContext() {
    pendingExportPlaybackContext = null;
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
            const options = {};
            if (Number.isFinite(exportAudioConfig.sampleRate) && exportAudioConfig.sampleRate > 0) {
                options.sampleRate = exportAudioConfig.sampleRate;
            }
            options.latencyHint = 'playback';
            sharedExportAudioContext = new AudioContextConstructor(options);
        } catch (primaryError) {
            try {
                sharedExportAudioContext = new AudioContextConstructor();
            } catch (error) {
                return null;
            }
        }
    }

    if (sharedExportAudioContext && Number.isFinite(sharedExportAudioContext.sampleRate)) {
        const expectedSampleRate = Number.isFinite(exportAudioConfig.sampleRate)
            ? exportAudioConfig.sampleRate
            : null;
        if (Number.isFinite(expectedSampleRate)
            && Math.abs(sharedExportAudioContext.sampleRate - expectedSampleRate) > 1
        ) {
            console.warn(
                `Export audio context sample rate mismatch (expected ${expectedSampleRate}Hz, got ${sharedExportAudioContext.sampleRate}Hz).`,
            );
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
        sharedExportAudioSources.set(element, sourceNode);
        return sourceNode;
    } catch (error) {
        return null;
    }
}

async function attachPreviewAudioToStream(mediaElements, combinedStream) {
    const elements = Array.isArray(mediaElements)
        ? mediaElements.filter(Boolean)
        : [mediaElements].filter(Boolean);
    if (!elements.length || !combinedStream) {
        const missingError = new Error('Missing media elements or combined stream.');
        return {
            audioContext: null,
            success: false,
            error: missingError,
            cleanup: () => {},
            getTrackError: () => missingError,
        };
    }

    const monitorState = { error: null };
    const trackMonitors = [];
    const transientTracks = [];

    const recordTrackIssue = (error) => {
        if (monitorState.error) {
            return;
        }
        monitorState.error = error instanceof Error
            ? error
            : new Error(String(error || 'Unknown audio track issue.'));
    };

    const removeMonitorCleanup = (cleanupFn) => {
        if (!cleanupFn) {
            return;
        }
        const index = trackMonitors.indexOf(cleanupFn);
        if (index >= 0) {
            trackMonitors.splice(index, 1);
        }
        try {
            cleanupFn();
        } catch (error) {
            // Ignore cleanup failures.
        }
    };

    const cleanupTrackMonitors = () => {
        while (trackMonitors.length) {
            const cleanupFn = trackMonitors.pop();
            removeMonitorCleanup(cleanupFn);
        }
    };

    const removeTracksFromCombinedStream = (tracksToRemove) => {
        tracksToRemove.forEach((track) => {
            if (!track) {
                return;
            }
            const index = transientTracks.indexOf(track);
            if (index >= 0) {
                transientTracks.splice(index, 1);
            }
            try {
                if (typeof combinedStream.removeTrack === 'function') {
                    combinedStream.removeTrack(track);
                }
            } catch (error) {
                // Ignore removal failures.
            }
            try {
                if (track.readyState === 'live' && typeof track.stop === 'function') {
                    track.stop();
                }
            } catch (error) {
                // Ignore stop failures.
            }
        });
    };

    const cleanupTransientTracks = () => {
        removeTracksFromCombinedStream([...transientTracks]);
    };

    const finalizeCleanup = () => {
        cleanupTrackMonitors();
        cleanupTransientTracks();
    };

    let lastError = null;

    try {
        await primeMediaElementsForExport(elements, {
            timeoutMs: Math.max(2000, exportAudioConfig.primingDurationMs + 500),
        });
    } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
    }

    const attachTracks = async (tracks, options = {}) => {
        const exportTracks = Array.isArray(tracks) ? tracks.filter(Boolean) : [];
        if (!exportTracks.length) {
            return false;
        }
        exportTracks.forEach((track) => {
            combinedStream.addTrack(track);
            transientTracks.push(track);
        });
        const monitorCleanup = monitorAudioTracksForExport(exportTracks, recordTrackIssue);
        if (monitorCleanup) {
            trackMonitors.push(monitorCleanup);
        }
        try {
            const timeoutMs = Math.max(1000, exportAudioConfig.primingDurationMs + 500);
            await ensureTracksActive(exportTracks, { timeoutMs });
            ensureAudioTracksNotMuted(exportTracks);
            if (options?.audioContext) {
                await waitForAudioContextStable(options.audioContext, { timeoutMs });
            }
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            removeMonitorCleanup(monitorCleanup);
            removeTracksFromCombinedStream(exportTracks);
            return false;
        }
        if (monitorState.error) {
            removeMonitorCleanup(monitorCleanup);
            removeTracksFromCombinedStream(exportTracks);
            lastError = monitorState.error;
            return false;
        }
        return true;
    };

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

        const filteredTracks = previewTracks.filter((track) => {
            if (!track) {
                return false;
            }
            const settings = typeof track.getSettings === 'function' ? track.getSettings() : null;
            if (Number.isFinite(settings?.sampleRate)) {
                return Math.abs(settings.sampleRate - exportAudioConfig.sampleRate) <= 1;
            }
            return true;
        });

        const attachments = filteredTracks
            .map((track) => (typeof track.clone === 'function' ? track.clone() : track))
            .filter(Boolean);

        if (attachments.length) {
            const previewContext = previewDestination.context
                || (typeof getOrCreatePreviewAudioContext === 'function'
                    ? getOrCreatePreviewAudioContext()
                    : null);
            if (previewContext && previewContext.state === 'suspended') {
                previewContext.resume().catch(() => {});
            }
            const attached = await attachTracks(attachments, { audioContext: previewContext });
            if (attached) {
                return {
                    audioContext: previewContext,
                    success: true,
                    error: null,
                    cleanup: finalizeCleanup,
                    getTrackError: () => monitorState.error,
                };
            }
        }
    }

    const directTracks = [];
    let missingDirectCapture = false;
    elements.forEach((element) => {
        if (typeof element?.captureStream !== 'function') {
            missingDirectCapture = true;
            return;
        }
        try {
            const audioStream = element.captureStream();
            if (!audioStream) {
                missingDirectCapture = true;
                return;
            }
            const tracks = audioStream.getAudioTracks();
            if (!tracks.length) {
                missingDirectCapture = true;
                return;
            }
            tracks.forEach((track) => {
                if (!track) {
                    missingDirectCapture = true;
                    return;
                }
                const settings = typeof track.getSettings === 'function' ? track.getSettings() : null;
                if (!Number.isFinite(settings?.sampleRate)
                    || Math.abs(settings.sampleRate - exportAudioConfig.sampleRate) > 1
                ) {
                    missingDirectCapture = true;
                    return;
                }
                const cloned = typeof track.clone === 'function' ? track.clone() : track;
                if (cloned) {
                    directTracks.push(cloned);
                } else {
                    missingDirectCapture = true;
                }
            });
        } catch (error) {
            missingDirectCapture = true;
            if (!lastError) {
                lastError = error instanceof Error ? error : new Error(String(error));
            }
        }
    });

    if (directTracks.length && !missingDirectCapture) {
        const attachedDirect = await attachTracks(directTracks);
        if (attachedDirect) {
            return {
                audioContext: null,
                success: true,
                error: null,
                cleanup: finalizeCleanup,
                getTrackError: () => monitorState.error,
            };
        }
    }

    const audioContext = getOrCreateSharedExportAudioContext();
    if (!audioContext) {
        cleanupTrackMonitors();
        cleanupTransientTracks();
        const error = lastError || new Error('AudioContext is not supported in this browser.');
        return {
            audioContext: null,
            success: false,
            error,
            cleanup: () => {},
            getTrackError: () => monitorState.error || error,
        };
    }

    if (audioContext.state === 'suspended') {
        try {
            await audioContext.resume();
        } catch (error) {
            // Ignore resume failures; the graph may still produce audio.
        }
    }

    const destination = audioContext.createMediaStreamDestination();
    const connectedNodes = [];
    let hasSource = false;

    elements.forEach((element) => {
        try {
            const sourceNode = getOrCreateExportAudioSourceNode(element, audioContext);
            if (!sourceNode) {
                return;
            }
            const gainNode = audioContext.createGain();
            gainNode.gain.value = 1;
            sourceNode.connect(gainNode);
            gainNode.connect(destination);
            connectedNodes.push({ sourceNode, gainNode, destination });
            hasSource = true;
        } catch (error) {
            if (!lastError) {
                lastError = error instanceof Error ? error : new Error(String(error));
            }
        }
    });

    const cleanupConnections = () => {
        connectedNodes.forEach(({ sourceNode, gainNode, destination: dest }) => {
            try {
                sourceNode.disconnect(gainNode);
            } catch (error) {
                // Ignore disconnect errors.
            }
            try {
                gainNode.disconnect(dest);
            } catch (error) {
                // Ignore disconnect errors.
            }
        });
        finalizeCleanup();
    };

    if (!hasSource) {
        cleanupConnections();
        const error = lastError || new Error('Unable to create audio sources for export.');
        return {
            audioContext: null,
            success: false,
            error,
            cleanup: () => {},
            getTrackError: () => monitorState.error || error,
        };
    }

    const contextTracks = destination.stream.getAudioTracks().filter(Boolean);
    if (!contextTracks.length) {
        cleanupConnections();
        const error = lastError || new Error('No audio tracks available from preview video.');
        return {
            audioContext: null,
            success: false,
            error,
            cleanup: () => {},
            getTrackError: () => monitorState.error || error,
        };
    }

    const attachedContextTracks = await attachTracks(contextTracks, { audioContext });
    if (!attachedContextTracks) {
        cleanupConnections();
        const error = lastError || monitorState.error || new Error('Unable to prepare export audio tracks.');
        return {
            audioContext: null,
            success: false,
            error,
            cleanup: () => {},
            getTrackError: () => monitorState.error || error,
        };
    }

    return {
        audioContext,
        success: true,
        error: null,
        cleanup: cleanupConnections,
        getTrackError: () => monitorState.error,
    };
}

async function handleConfirmExport() {
    if (isExportingTimeline) {
        return;
    }

    const playbackContext = pendingExportPlaybackContext || prepareExportPlaybackContext();
    const timelineItems = Array.isArray(playbackContext?.timelineItems)
        ? playbackContext.timelineItems
        : getTimelineItems();
    if (!timelineItems.length) {
        alert('Upload an image or video to build your timeline.');
        return;
    }

    const playbackState = playbackContext?.playbackState || getTimelinePlaybackSegments();
    if (!playbackContext?.playbackState) {
        playbackContext.playbackState = playbackState;
    }
    const playbackSegments = Array.isArray(playbackState?.segments)
        ? playbackState.segments
        : [];
    const playbackDuration = Number.isFinite(playbackState?.totalDuration)
        ? playbackState.totalDuration
        : 0;
    if (!playbackSegments.length || playbackDuration <= 0) {
        alert('Upload an image or video to build your timeline.');
        return;
    }

    if (!window.MediaRecorder) {
        alert('Export is not supported in this browser.');
        return;
    }

    const exportFormat = getSupportedExportFormat({ preferValidatedAudio: true });
    if (!exportFormat) {
        alert('Export is not supported by this browser. Try using a browser with MediaRecorder support for MP4 or WebM.');
        return;
    }

    const expectedAudioCodec = exportAudioConfig.codec;
    if (exportFormat.audioCodec
        && expectedAudioCodec
        && exportFormat.audioCodec !== expectedAudioCodec
    ) {
        alert(`Export requires ${expectedAudioCodec.toUpperCase()} audio support at ${exportAudioConfig.sampleRate}Hz. Try a different browser or update your current one.`);
        return;
    }

    const expectedSampleRate = Number.isFinite(exportAudioConfig.sampleRate)
        ? exportAudioConfig.sampleRate
        : null;
    if (Number.isFinite(expectedSampleRate)
        && Number.isFinite(exportFormat.audioSampleRate)
        && Math.abs(exportFormat.audioSampleRate - expectedSampleRate) > 1
    ) {
        alert(`Export requires an audio sample rate of ${expectedSampleRate}Hz. Your browser reported ${exportFormat.audioSampleRate}Hz.`);
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

        const audioAttachment = await attachPreviewAudioToStream([previewVideo, previewAudio], combinedStream);
        exportAudioContext = audioAttachment.audioContext || null;
        if (typeof audioAttachment.cleanup === 'function') {
            audioAttachmentCleanup = audioAttachment.cleanup;
        }
        if (!audioAttachment.success) {
            throw (audioAttachment.error || new Error('Unable to attach audio to export stream.'));
        }

        const initialTrackError = typeof audioAttachment.getTrackError === 'function'
            ? audioAttachment.getTrackError()
            : null;
        if (initialTrackError) {
            throw initialTrackError;
        }

        await waitForExportAudioPrimed(exportAudioContext, combinedStream, {
            timeoutMs: Math.max(1500, exportAudioConfig.primingDurationMs + 750),
        });

        const audioTracksForValidation = combinedStream
            .getAudioTracks()
            .filter((track) => track && track.kind === 'audio');
        if (!audioTracksForValidation.length) {
            throw new Error('Export stream does not include audio.');
        }
        ensureAudioTracksNotMuted(audioTracksForValidation);
        const audioTrackSettings = typeof audioTracksForValidation[0].getSettings === 'function'
            ? audioTracksForValidation[0].getSettings()
            : null;
        if (Number.isFinite(audioTrackSettings?.sampleRate)
            && Math.abs(audioTrackSettings.sampleRate - exportAudioConfig.sampleRate) > 1
        ) {
            throw new Error(`Audio track sample rate mismatch. Expected ${exportAudioConfig.sampleRate}Hz, received ${audioTrackSettings.sampleRate}Hz.`);
        }

        const recorderOptions = {
            mimeType: exportFormat.mimeType,
            videoBitsPerSecond: 6_000_000,
        };
        if (Number.isFinite(exportFormat.audioBitsPerSecond)) {
            recorderOptions.audioBitsPerSecond = exportFormat.audioBitsPerSecond;
        } else if (Number.isFinite(exportAudioConfig.audioBitsPerSecond)) {
            recorderOptions.audioBitsPerSecond = exportAudioConfig.audioBitsPerSecond;
        }

        recorder = new MediaRecorder(combinedStream, recorderOptions);

        let recorderError = null;
        let droppedAudioChunks = 0;

        const recordingPromise = new Promise((resolve, reject) => {
            recorder.addEventListener('dataavailable', (event) => {
                if (event.data && event.data.size > 0) {
                    recordedChunks.push(event.data);
                } else {
                    droppedAudioChunks += 1;
                }
            });
            recorder.addEventListener('stop', () => {
                if (recorderError) {
                    reject(recorderError);
                    return;
                }
                if (droppedAudioChunks > 0) {
                    reject(new Error('Audio frames were dropped during export. Please try again.'));
                    return;
                }
                if (!recordedChunks.length) {
                    reject(new Error('No media was recorded during export.'));
                    return;
                }
                resolve(new Blob(recordedChunks, { type: exportFormat.mimeType }));
            }, { once: true });
            recorder.addEventListener('error', (event) => {
                recorderError = event.error || new Error('Recording error.');
                reject(recorderError);
            }, { once: true });
            try {
                recorder.addEventListener('warning', (event) => {
                    if (!recorderError) {
                        recorderError = event?.error || new Error('Recording warning.');
                    }
                });
            } catch (error) {
                // Ignore browsers without MediaRecorder warning support.
            }
        });

        recorder.start();
        const playbackCompleted = await playTimelineSequence(0, null, playbackContext);
        if (recorder.state !== 'inactive') {
            recorder.stop();
        }

        const exportBlob = await recordingPromise;

        const finalTrackError = typeof audioAttachment.getTrackError === 'function'
            ? audioAttachment.getTrackError()
            : null;
        if (finalTrackError) {
            throw finalTrackError;
        }

        if (!exportBlob || exportBlob.size <= 0) {
            throw new Error('Exported file is empty.');
        }

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
        resetExportPlaybackContext();
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
            resetExportPlaybackContext();
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
        resetExportPlaybackContext();
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
