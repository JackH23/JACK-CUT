"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const FRAME_RATE = 30;

type UsePreviewPlaybackOptions = {
  duration: number;
  playheadTime: number;
  onPlayheadTimeChange: (position: number) => void;
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
  playheadTime,
  onPlayheadTimeChange,
}: UsePreviewPlaybackOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const playheadRef = useRef(playheadTime);
  const onPositionChangeRef = useRef(onPlayheadTimeChange);

  useEffect(() => {
    onPositionChangeRef.current = onPlayheadTimeChange;
  }, [onPlayheadTimeChange]);

  useEffect(() => {
    playheadRef.current = playheadTime;
  }, [isPlaying, playheadTime]);

  useEffect(() => {
    if (!isPlaying || duration <= 0) return;

    let frameId: number;
    let previousTime: number | null = null;

    const tick = (time: number) => {
      if (previousTime !== null) {
        const elapsedSeconds = (time - previousTime) / 1000;

        playheadRef.current = Math.min(
          duration,
          playheadRef.current + elapsedSeconds,
        );

        onPositionChangeRef.current(playheadRef.current);

        if (playheadRef.current >= duration) {
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

    if (!isPlaying && playheadTime >= duration) {
      playheadRef.current = 0;
      onPlayheadTimeChange(0);
    } else {
      playheadRef.current = playheadTime;
    }

    setIsPlaying((current) => !current);
  }, [duration, isPlaying, onPlayheadTimeChange, playheadTime]);

  const handleMuteToggle = useCallback(() => {
    setIsMuted((current) => !current);
  }, []);

  const elapsed = playheadTime;

  return {
    isPlaying,
    isMuted,
    currentTime: formatTime(elapsed),
    totalTime: formatTime(duration),
    handlePlayPause,
    handleMuteToggle,
  };
}
