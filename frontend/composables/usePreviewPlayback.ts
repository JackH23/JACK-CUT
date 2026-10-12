
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

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
  const lastPublishedRef = useRef(playheadTime);
  const callbackRef = useRef(onPlayheadTimeChange);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    callbackRef.current = onPlayheadTimeChange;
  }, [onPlayheadTimeChange]);

  // Synchronize external playhead updates while paused.
  // Avoid overwriting the active playback clock.
  useEffect(() => {
    if (!isPlayingRef.current) {
      playheadRef.current = playheadTime;
      lastPublishedRef.current = playheadTime;
    }
  }, [playheadTime]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;

    if (!isPlaying || duration <= 0) return;

    let frameId = 0;
    let previousTime: number | null = null;

    const tick = (timestamp: number) => {
      if (previousTime === null) {
        previousTime = timestamp;
      }

      const elapsedSeconds = Math.max(
        0,
        (timestamp - previousTime) / 1000,
      );

      previousTime = timestamp;

      const nextTime = Math.min(
        duration,
        playheadRef.current + elapsedSeconds,
      );

      playheadRef.current = nextTime;

      if (
        nextTime > lastPublishedRef.current
      ) {
        lastPublishedRef.current = nextTime;
        callbackRef.current(nextTime);
      }

      if (nextTime >= duration) {
        setIsPlaying(false);
        return;
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [duration, isPlaying]);

  const handlePlayPause = useCallback(() => {
    if (duration <= 0) return;

    if (!isPlaying) {
      const startTime =
        playheadTime >= duration
          ? 0
          : playheadTime;

      playheadRef.current = startTime;
      lastPublishedRef.current = startTime;

      if (playheadTime >= duration) {
        callbackRef.current(0);
      }
    }

    setIsPlaying((current) => !current);
  }, [duration, isPlaying, playheadTime]);

  const handleMuteToggle = useCallback(() => {
    setIsMuted((current) => !current);
  }, []);

  return {
    isPlaying,
    isMuted,
    currentTime: formatTime(playheadTime),
    totalTime: formatTime(duration),
    handlePlayPause,
    handleMuteToggle,
  };
}
