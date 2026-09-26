"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const TIMELINE_DURATION = 210;
const FRAME_RATE = 30;

type UsePreviewPlaybackOptions = {
  duration: number;
  playheadPosition: number;
  onPlayheadPositionChange: (position: number) => void;
};

function formatTime(value: number) {
  const safeValue = Math.max(0, value);

  const hours = Math.floor(safeValue / 3600);
  const minutes = Math.floor((safeValue % 3600) / 60);
  const seconds = Math.floor(safeValue % 60);
  const frames = Math.floor((safeValue % 1) * FRAME_RATE);

  return [hours, minutes, seconds, frames]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function usePreviewPlayback({
  duration,
  playheadPosition,
  onPlayheadPositionChange,
}: UsePreviewPlaybackOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const playheadRef = useRef(playheadPosition);

  const endPosition = Math.min(
    100,
    (duration / TIMELINE_DURATION) * 100,
  );

  useEffect(() => {
    if (!isPlaying) {
      playheadRef.current = playheadPosition;
    }
  }, [isPlaying, playheadPosition]);

  useEffect(() => {
    if (!isPlaying || duration <= 0) return;

    let frameId: number;
    let previousTime: number | null = null;

    const tick = (time: number) => {
      if (previousTime !== null) {
        const elapsedSeconds = (time - previousTime) / 1000;

        playheadRef.current = Math.min(
          endPosition,
          playheadRef.current +
            (elapsedSeconds / TIMELINE_DURATION) * 100,
        );

        onPlayheadPositionChange(playheadRef.current);

        if (playheadRef.current >= endPosition) {
          setIsPlaying(false);
          return;
        }
      }

      previousTime = time;
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [
    duration,
    endPosition,
    isPlaying,
    onPlayheadPositionChange,
  ]);

  const handlePlayPause = useCallback(() => {
    if (duration <= 0) return;

    if (!isPlaying && playheadPosition >= endPosition) {
      playheadRef.current = 0;
      onPlayheadPositionChange(0);
    } else {
      playheadRef.current = playheadPosition;
    }

    setIsPlaying((current) => !current);
  }, [
    duration,
    endPosition,
    isPlaying,
    onPlayheadPositionChange,
    playheadPosition,
  ]);

  const handleMuteToggle = useCallback(() => {
    setIsMuted((current) => !current);
  }, []);

  const elapsed =
    (playheadPosition / 100) * TIMELINE_DURATION;

  return {
    isPlaying,
    isMuted,
    currentTime: formatTime(Math.min(elapsed, duration)),
    totalTime: formatTime(duration),
    handlePlayPause,
    handleMuteToggle,
  };
}