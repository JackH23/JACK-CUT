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
        const initialProgress = clipDuration > 0
            ? clampProgress(initialElapsed / clipDuration)
            : 0;
        const animationSettings = getTimelineItemAnimationSettings(timelineItem);
        const entranceConfigOverride = getPreviewImageEntranceConfig({
            clipDurationMs: safeEffectiveDuration,
            settingsOverride: animationSettings,
        });
        const exitConfig = getPreviewImageExitConfig({
            clipDurationMs: safeEffectiveDuration,
            settingsOverride: animationSettings,
        });
        const exitWindow = exitConfig ? Math.max(0, exitConfig.totalDuration) : 0;
        setPreviewMode('has-image');
        previewVideo.pause();
        previewVideo.hidden = true;
        previewVideo.removeAttribute('src');
        setPreviewImageVisibility(true);
        previewPlaceholder.hidden = true;
        await revealPreviewImageSource(objectURL, {
            clipDurationMs: safeEffectiveDuration,
            entranceConfigOverride,
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

            const exitStartOffset = exitConfig
                ? Math.max(0, safeEffectiveDuration - exitWindow)
                : 0;

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
                    const shouldStartExit = safeEffectiveDuration === 0
                        || elapsedSinceResume >= exitStartOffset;
                    if (shouldStartExit) {
                        startExitAnimation();
                    }
                }

                if (elapsedSinceResume < safeEffectiveDuration && isTimelinePlaying) {
                    animationFrameId = window.requestAnimationFrame(step);
                }
            };

            animationFrameId = window.requestAnimationFrame(step);

            if (exitConfig && safeEffectiveDuration === 0) {
                startExitAnimation({ force: true });
            }

            const timeoutId = window.setTimeout(() => {
                if (resolved) {
                    return;
                }
                resolved = true;
                startExitAnimation({ force: true });
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

async function playTimelineSequence(startIndex = 0, resumeOptions = null) {
    const timelineItems = getTimelineItems();
    if (!timelineItems.length) {
        alert('Upload an image or video to build your timeline.');
        return false;
    }

    const { segments, totalDuration } = getTimelinePlaybackSegments();
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
            const refreshedTimelineItems = getTimelineItems();
            renderExportSummary(refreshedTimelineItems, null);
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

async function resumeAudioContextIfNeeded(audioContext) {
    if (!audioContext) {
        return;
    }

    if (audioContext.state === 'suspended') {
        try {
            await audioContext.resume();
        } catch (error) {
            // Ignore resume failures; the browser may require a new user gesture.
        }
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
            sharedExportAudioContext = new AudioContextConstructor({
                latencyHint: 'interactive',
            });
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

async function attachPreviewAudioToStream(mediaElements, combinedStream) {
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
    const directTracks = [];
    const fallbackElements = [];

    elements.forEach((element) => {
        if (!element) {
            return;
        }

        const captureFn = typeof element.captureStream === 'function'
            ? element.captureStream.bind(element)
            : (typeof element.mozCaptureStream === 'function'
                ? element.mozCaptureStream.bind(element)
                : null);

        if (!captureFn) {
            fallbackElements.push(element);
            return;
        }

        try {
            const audioStream = captureFn();
            if (!audioStream) {
                fallbackElements.push(element);
                return;
            }

            const tracks = audioStream.getAudioTracks();
            if (!tracks.length) {
                fallbackElements.push(element);
                return;
            }

            tracks.forEach((track) => {
                combinedStream.addTrack(track);
                directTracks.push(track);
            });
        } catch (error) {
            lastError = error;
            fallbackElements.push(element);
        }
    });

    if (!fallbackElements.length) {
        return {
            audioContext: null,
            success: directTracks.length > 0,
            error: directTracks.length
                ? null
                : lastError || new Error('No audio tracks available from media elements.'),
            cleanup: () => {},
        };
    }

    const audioContext = getOrCreateSharedExportAudioContext();
    if (!audioContext) {
        return {
            audioContext: null,
            success: directTracks.length > 0,
            error: lastError || new Error('AudioContext is not supported in this browser.'),
            cleanup: () => {},
        };
    }

    await resumeAudioContextIfNeeded(audioContext);

    const destination = audioContext.createMediaStreamDestination();
    const connectedSourceNodes = [];
    let hasSource = false;

    fallbackElements.forEach((element) => {
        if (!element) {
            return;
        }

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
            success: directTracks.length > 0,
            error: lastError || new Error('Unable to create audio sources for export.'),
            cleanup: () => {},
        };
    }

    const audioTracks = destination.stream.getAudioTracks();
    audioTracks.forEach((track) => combinedStream.addTrack(track));

    if (!audioTracks.length && !directTracks.length) {
        cleanupConnections();
        return {
            audioContext: null,
            success: false,
            error: lastError || new Error('No audio tracks available from preview video.'),
            cleanup: () => {},
        };
    }

    if (!audioTracks.length && directTracks.length) {
        cleanupConnections();
        return {
            audioContext: null,
            success: true,
            error: null,
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

function waitForMediaElementReady(element) {
    if (!element || typeof element.readyState !== 'number') {
        return Promise.resolve();
    }

    const HAVE_CURRENT_DATA = typeof HTMLMediaElement !== 'undefined'
        ? HTMLMediaElement.HAVE_CURRENT_DATA
        : 2;

    if (!element.src && !element.currentSrc) {
        return Promise.resolve();
    }

    if (element.readyState >= HAVE_CURRENT_DATA) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        let resolved = false;
        let timeoutId = 0;

        function cleanup() {
            if (resolved) {
                return;
            }
            resolved = true;
            element.removeEventListener('canplay', onReady);
            element.removeEventListener('loadeddata', onReady);
            element.removeEventListener('loadedmetadata', onReady);
            element.removeEventListener('error', onError);
            element.removeEventListener('stalled', onReady);
            element.removeEventListener('timeupdate', onReady);
            window.clearTimeout(timeoutId);
        }

        function finalize() {
            cleanup();
            resolve();
        }

        function onReady() {
            finalize();
        }

        function onError() {
            finalize();
        }

        timeoutId = window.setTimeout(() => finalize(), 4000);

        element.addEventListener('canplay', onReady, { once: true });
        element.addEventListener('loadeddata', onReady, { once: true });
        element.addEventListener('loadedmetadata', onReady, { once: true });
        element.addEventListener('error', onError, { once: true });
        element.addEventListener('stalled', onReady, { once: true });
        element.addEventListener('timeupdate', onReady, { once: true });
    });
}

async function preparePreviewMediaForExport(mediaElements) {
    const elements = Array.isArray(mediaElements)
        ? mediaElements.filter(Boolean)
        : [mediaElements].filter(Boolean);
    if (!elements.length) {
        return;
    }

    await Promise.all(elements.map((element) => waitForMediaElementReady(element)));
}

function waitForAnimationFrames(count = 1) {
    const totalFrames = Math.max(1, Math.round(Number(count) || 1));
    return new Promise((resolve) => {
        let remaining = totalFrames;
        const step = () => {
            remaining -= 1;
            if (remaining <= 0) {
                resolve();
                return;
            }
            window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
    });
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
    await preparePreviewMediaForExport([previewVideo, previewAudio]);

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

        const audioAttachment = await attachPreviewAudioToStream(
            [previewVideo, previewAudio],
            combinedStream,
        );
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
        await waitForAnimationFrames(2);
        const playbackCompleted = await playTimelineSequence(0);
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

    const startIndex = activeTimelineItem ? timelineItems.indexOf(activeTimelineItem) : 0;
    playTimelineSequence(startIndex >= 0 ? startIndex : 0).catch((error) => {
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
