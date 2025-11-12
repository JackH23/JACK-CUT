async function handleConfirmExport() {
    if (isExportingTimeline) {
        return;
    }

    const mutationVersion = (typeof getTimelinePlaybackMutationVersion === 'function')
        ? getTimelinePlaybackMutationVersion()
        : null;
    const pendingContextVersion = Number.isFinite(pendingExportPlaybackContext?.version)
        ? pendingExportPlaybackContext.version
        : null;
    let playbackContext = pendingExportPlaybackContext;
    if (!playbackContext || (mutationVersion !== null && mutationVersion !== pendingContextVersion)) {
        playbackContext = prepareExportPlaybackContext();
    }
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
        exportDialogStatus.textContent = 'Preparing media for export…';
    }

    stopTimelinePlayback();

    if (exportAbortController?.signal && !exportAbortController.signal.aborted) {
        abortActiveExport(new DOMException('Cancelling previous export.', 'AbortError'));
    }

    const abortController = new AbortController();
    exportAbortController = abortController;
    const { signal } = abortController;
    const abortCleanups = [];

    const registerAbortHandler = (handler) => {
        if (typeof handler !== 'function') {
            return () => {};
        }

        const wrapped = () => {
            try {
                handler();
            } catch (error) {
                // Ignore abort handler errors.
            }
        };

        if (signal.aborted) {
            wrapped();
            return () => {};
        }

        signal.addEventListener('abort', wrapped);
        return () => {
            signal.removeEventListener('abort', wrapped);
        };
    };

    const throwIfAborted = () => {
        if (signal.aborted) {
            throw signal.reason || new DOMException('Export aborted.', 'AbortError');
        }
    };

    abortCleanups.push(registerAbortHandler(() => {
        stopTimelinePlayback(false, true);
    }));

    let encodingConfig = playbackContext?.encodingConfig || null;
    let warmupSummary = null;
    try {
        warmupSummary = await warmupExportPlaybackContext(playbackContext, { timeoutMs: 4500, signal });
        throwIfAborted();
        if (warmupSummary?.failed > 0) {
            console.warn('Some media items could not be prepared before export.', warmupSummary.failures);
        } else if (warmupSummary?.total) {
            console.info(`Prepared ${warmupSummary.succeeded}/${warmupSummary.total} media items for export.`);
        }
    } catch (warmupError) {
        if (signal.aborted) {
            throw warmupError;
        }
        console.warn('Export warmup encountered an error.', warmupError);
    }

    throwIfAborted();

    try {
        encodingConfig = await resolveExportEncodingConfig(exportFormat, resolution, {
            frameRate: encodingConfig?.frameRate || 30,
        });
    } catch (encodingError) {
        console.warn('Falling back to default export encoding configuration.', encodingError);
        encodingConfig = {
            mimeType: exportFormat.mimeType,
            frameRate: 30,
            videoBitsPerSecond: 6_000_000,
            audioBitsPerSecond: 192_000,
            timesliceMs: null,
        };
    }

    throwIfAborted();

    playbackContext.encodingConfig = encodingConfig;

    const captureFrameRate = Math.max(1, Math.min(60, Math.round(encodingConfig.frameRate) || 30));
    const readinessTimeout = captureFrameRate > 30 ? 1200 : 1500;

    await primeExportStartFrame(playbackContext, { frameRate: captureFrameRate, signal });
    throwIfAborted();

    if (exportDialogStatus) {
        exportDialogStatus.dataset.state = 'progress';
        exportDialogStatus.innerHTML = `
            <span class="visually-hidden" role="status">Exporting timeline preview to ${exportFormat.label}…</span>
            <div class="export-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuetext="Exporting timeline preview" aria-live="off">
                <div class="export-progress__bar"></div>
            </div>
        `.trim();
    }

    let stopMirroring = () => {};
    let recorder = null;
    let combinedStream = null;
    const recordedChunks = [];
    let exportAudioContext = null;
    let audioAttachmentCleanup = null;
    let recordingPromise = null;

    try {
        stopMirroring = startPreviewMirroring(resolution.width, resolution.height, {
            frameRate: captureFrameRate,
        });
        abortCleanups.push(registerAbortHandler(() => {
            stopMirroring();
        }));
        throwIfAborted();

        await runExportPreRoll(EXPORT_PRE_ROLL_MS, captureFrameRate, { signal });
        throwIfAborted();
        if (typeof exportMirrorCanvas.captureStream !== 'function') {
            throw new Error('Canvas captureStream is not supported in this browser.');
        }
        const canvasStream = exportMirrorCanvas.captureStream(captureFrameRate);
        if (!canvasStream) {
            throw new Error('Unable to access canvas capture stream.');
        }
        combinedStream = new MediaStream();
        abortCleanups.push(registerAbortHandler(() => {
            if (combinedStream) {
                combinedStream.getTracks().forEach((track) => {
                    try {
                        track.stop();
                    } catch (trackError) {
                        // Ignore track stop errors triggered during abort.
                    }
                });
            }
        }));
        canvasStream.getVideoTracks().forEach((track) => {
            combinedStream.addTrack(track);
            if (typeof track.applyConstraints === 'function') {
                track.applyConstraints({ frameRate: captureFrameRate }).catch(() => {});
            }
        });

        const overlayElements = typeof getActiveOverlayAudioElements === 'function'
            ? getActiveOverlayAudioElements()
            : [];
        const audioElementCandidates = [previewVideo]
            .concat(overlayElements.length ? overlayElements : [previewAudio].filter(Boolean));
        const uniqueAudioElements = Array.from(new Set(audioElementCandidates.filter(Boolean)));
        const audioAttachment = attachPreviewAudioToStream(uniqueAudioElements, combinedStream);
        exportAudioContext = audioAttachment.audioContext;
        if (typeof audioAttachment.cleanup === 'function') {
            audioAttachmentCleanup = audioAttachment.cleanup;
        }
        if (!audioAttachment.success) {
            console.warn('Unable to capture audio from preview video.', audioAttachment.error);
        }
        abortCleanups.push(registerAbortHandler(() => {
            if (typeof audioAttachmentCleanup === 'function') {
                try {
                    audioAttachmentCleanup();
                } catch (cleanupError) {
                    // Ignore cleanup errors triggered during abort.
                }
            }
        }));

        throwIfAborted();

        await waitForMediaStreamTracks(combinedStream, { kind: 'audio', timeoutMs: readinessTimeout, signal });
        throwIfAborted();
        await waitForMediaStreamTracks(combinedStream, { kind: 'video', timeoutMs: readinessTimeout, signal });
        throwIfAborted();

        const recorderOptions = { mimeType: exportFormat.mimeType };
        if (Number.isFinite(encodingConfig.videoBitsPerSecond)) {
            recorderOptions.videoBitsPerSecond = encodingConfig.videoBitsPerSecond;
        }
        if (Number.isFinite(encodingConfig.audioBitsPerSecond)) {
            recorderOptions.audioBitsPerSecond = encodingConfig.audioBitsPerSecond;
        }

        recorder = new MediaRecorder(combinedStream, recorderOptions);
        abortCleanups.push(registerAbortHandler(() => {
            if (recorder && recorder.state !== 'inactive') {
                try {
                    recorder.stop();
                } catch (stopError) {
                    // Ignore recorder stop errors triggered during abort.
                }
            }
        }));

        const recorderStarted = new Promise((resolve) => {
            recorder.addEventListener('start', () => {
                resolve();
            }, { once: true });
        });

        recordingPromise = new Promise((resolve, reject) => {
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

        const timesliceMs = Number.isFinite(encodingConfig.timesliceMs)
            && encodingConfig.timesliceMs > 0
            ? Math.max(0, Math.round(encodingConfig.timesliceMs))
            : null;
        if (timesliceMs) {
            recorder.start(timesliceMs);
        } else {
            recorder.start();
        }
        await recorderStarted;
        throwIfAborted();
        await waitForNextFrame({ signal });
        throwIfAborted();
        const playbackCompleted = await playTimelineSequence(0, null, playbackContext);
        if (recorder.state !== 'inactive') {
            recorder.stop();
        }

        const exportBlob = await recordingPromise;
        recordedChunks.length = 0;

        throwIfAborted();

        if (!playbackCompleted) {
            if (signal.aborted) {
                throw signal.reason || new DOMException('Export aborted.', 'AbortError');
            }
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
        const aborted = error?.name === 'AbortError' || signal.aborted;
        if (aborted) {
            console.info('Export cancelled.', error);
            if (exportDialogStatus) {
                exportDialogStatus.textContent = 'Export cancelled.';
                exportDialogStatus.dataset.state = 'idle';
            }
            closeExportDialog();
        } else {
            console.error('Failed to export timeline preview.', error);
            alert(`Export failed: ${error?.message || error}`);
            if (exportDialogStatus) {
                exportDialogStatus.textContent = 'Export failed. Please try again.';
                exportDialogStatus.dataset.state = 'warning';
            }
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
        recorder = null;
        combinedStream = null;
        exportAudioContext = null;
        stopMirroring();
        confirmExportButton.disabled = false;
        confirmExportButton.textContent = originalLabel || 'Confirm export';
        isExportingTimeline = false;
        abortCleanups.forEach((cleanup) => {
            if (typeof cleanup === 'function') {
                try {
                    cleanup();
                } catch (cleanupError) {
                    // Ignore abort cleanup errors.
                }
            }
        });
        if (exportAbortController === abortController) {
            exportAbortController = null;
        }
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
