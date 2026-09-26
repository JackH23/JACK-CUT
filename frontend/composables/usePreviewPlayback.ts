"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  const onPositionChangeRef = useRef(onPlayheadPositionChange);

  useEffect(() => {
    onPositionChangeRef.current = onPlayheadPositionChange;
  }, [onPlayheadPositionChange]);

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
          100,
          playheadRef.current + (elapsedSeconds / duration) * 100,
        );

        onPositionChangeRef.current(playheadRef.current);

        if (playheadRef.current >= 100) {
          setIsPlaying(false);
          return;
        }
      }

      previousTime = time;
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [duration, isPlaying]);

  const handlePlayPause = useCallback(() => {
    if (duration <= 0) return;

    if (!isPlaying && playheadPosition >= 100) {
      playheadRef.current = 0;
      onPlayheadPositionChange(0);
    } else {
      playheadRef.current = playheadPosition;
    }

    setIsPlaying((current) => !current);
  }, [duration, isPlaying, onPlayheadPositionChange, playheadPosition]);

  const handleMuteToggle = useCallback(() => {
    setIsMuted((current) => !current);
  }, []);

  const elapsed = (playheadPosition / 100) * duration;

  return {
    isPlaying,
    isMuted,
    currentTime: formatTime(Math.min(elapsed, duration)),
    totalTime: formatTime(duration),
    handlePlayPause,
    handleMuteToggle,
  };
}
