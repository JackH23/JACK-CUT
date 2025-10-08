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
                previewVideo.currentTime = 0;
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

                previewVideo.currentTime = 0;
                previewVideo.muted = false;
                const baseVolume = clampVolume(audioSettings.volumePercent / 100);
                previewAudioEnvelopeState.baseVolume = baseVolume;
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
        setActiveClipProgress(0, { source: 'image-playback' });

        await new Promise((resolve) => {
            let resolved = false;
            const startTimestamp = performance.now();
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
                const playbackProgress = clipDuration > 0
                    ? clampProgress(elapsed / clipDuration)
                    : 0;

                setActiveClipProgress(playbackProgress, { source: 'image-playback' });

                if (exitConfig && !exitAnimationRequested) {
                    const shouldStartExit = safeEffectiveDuration === 0
                        || elapsed >= exitStartOffset;
                    if (shouldStartExit) {
                        startExitAnimation();
                    }
                }

                if (elapsed < safeEffectiveDuration && isTimelinePlaying) {
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
                const finalProgress = clipDuration > 0
                    ? clampProgress(safeEffectiveDuration / clipDuration)
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

async function playTimelineSequence(startIndex = 0) {
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

    const boundedIndex = Math.min(
        Math.max(0, startIndex),
        Math.max(timelineItems.length - 1, 0),
    );
    const initialItem = timelineItems[boundedIndex] || null;
    let initialSegmentIndex = 0;
    if (initialItem) {
        const foundSegmentIndex = segments.findIndex(
            (segment) => segment.item === initialItem,
        );
        if (foundSegmentIndex >= 0) {
            initialSegmentIndex = foundSegmentIndex;
        }
    }
    const startSegment = segments[initialSegmentIndex] || null;
    const startElapsed = startSegment ? startSegment.start : 0;

    isTimelinePlaying = true;
    playVideoButton.textContent = 'Pause playback';
    updateKeyframeControlsState();
    resetTimelineProgressLine(getTimelineFractionForTime(startElapsed));
    updatePlaybackTimeDisplay(startElapsed, totalDuration);
    startPlaybackClock(startElapsed, totalDuration);

    let completedNaturally = true;

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
            const nextSegment = segments[index + 1];
            if (nextSegment?.item) {
                const nextUrl = nextSegment.item.dataset?.objectUrl;
                const nextType = nextSegment.item.dataset?.fileType || '';
                if (nextUrl && nextType.startsWith('image/')) {
                    preloadTimelineImage(nextUrl).catch(() => {});
                }
            }
            const startFraction = getTimelineFractionForTime(start);
            const endFraction = getTimelineFractionForTime(end);
            animateTimelineProgress(startFraction, endFraction, duration);
            if (item) {
                // eslint-disable-next-line no-await-in-loop
                await playTimelineItem(item, duration, segment.items || null);
            } else {
                // eslint-disable-next-line no-await-in-loop
                await waitForGapDuration(duration);
            }
        }
    } finally {
        stopTimelinePlayback(true, false);
        if (completedNaturally) {
            resetTimelineProgressLine(totalDuration > 0 ? 1 : 0);
            updatePlaybackTimeDisplay(totalDuration, totalDuration);
        } else {
            updateActiveTimelineIndicators();
        }
    }

    return completedNaturally;
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

function attachPreviewAudioToStream(previewVideo, combinedStream) {
    if (!previewVideo || !combinedStream) {
        return {
            audioContext: null,
            success: false,
            error: new Error('Missing preview video or combined stream.'),
        };
    }

    let lastError = null;

    if (typeof previewVideo.captureStream === 'function') {
        try {
            const audioStream = previewVideo.captureStream();
            if (audioStream) {
                const audioTracks = audioStream.getAudioTracks();
                audioTracks.forEach((track) => combinedStream.addTrack(track));
                if (audioTracks.length) {
                    return { audioContext: null, success: true, error: null };
                }
            }
        } catch (error) {
            lastError = error;
        }
    }

    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
        return {
            audioContext: null,
            success: false,
            error: lastError || new Error('AudioContext is not supported in this browser.'),
        };
    }

    let audioContext = null;
    try {
        audioContext = new AudioContextConstructor();
        const sourceNode = audioContext.createMediaElementSource(previewVideo);
        const destination = audioContext.createMediaStreamDestination();
        sourceNode.connect(destination);
        sourceNode.connect(audioContext.destination);

        const audioTracks = destination.stream.getAudioTracks();
        audioTracks.forEach((track) => combinedStream.addTrack(track));
        if (!audioTracks.length) {
            const closeResult = audioContext.close();
            if (closeResult && typeof closeResult.catch === 'function') {
                closeResult.catch(() => {});
            }
            return {
                audioContext: null,
                success: false,
                error: lastError || new Error('No audio tracks available from preview video.'),
            };
        }

        return { audioContext, success: true, error: null };
    } catch (error) {
        if (audioContext && typeof audioContext.close === 'function') {
            const closeResult = audioContext.close();
            if (closeResult && typeof closeResult.catch === 'function') {
                closeResult.catch(() => {});
            }
        }
        return {
            audioContext: null,
            success: false,
            error: error || lastError || new Error('Failed to attach audio from preview video.'),
        };
    }
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

    let stopMirroring = () => {};
    let recorder = null;
    let combinedStream = null;
    const recordedChunks = [];
    let exportAudioContext = null;

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

        const audioAttachment = attachPreviewAudioToStream(previewVideo, combinedStream);
        exportAudioContext = audioAttachment.audioContext;
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
        if (exportAudioContext) {
            try {
                const closeResult = exportAudioContext.close();
                if (closeResult && typeof closeResult.catch === 'function') {
                    closeResult.catch(() => {});
                }
            } catch (error) {
                // Ignore
            }
            exportAudioContext = null;
        }
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
        stopTimelinePlayback();
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
