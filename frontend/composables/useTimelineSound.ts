
"use client";

import { useEffect, useRef } from "react";
import type { TimelineItem } from "@/types/timeline";

type Options = {
  item: TimelineItem;
  playheadSeconds: number;
  isPlaying: boolean;
};

export function useTimelineSound({
  item,
  playheadSeconds,
  isPlaying,
}: Options) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const pendingPlayRef = useRef(false);
  const desiredPlayingRef = useRef(false);

  const startTime = item.startTime;
  const duration = item.duration;
  const sourceStart = item.sourceStart ?? 0;

  const active =
    playheadSeconds >= startTime &&
    playheadSeconds < startTime + duration;

  const targetTime = Math.max(
    0,
    playheadSeconds - startTime + sourceStart,
  );

  const shouldPlay = isPlaying && active;

  desiredPlayingRef.current = shouldPlay;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const syncTime = () => {
      if (audio.readyState < 1) return;

      const drift = Math.abs(
        audio.currentTime - targetTime,
      );

      // Avoid tiny seeks during normal playback.
      // Correct large drift or paused seeking.
      const threshold = shouldPlay ? 1.0 : 0.05;

      if (drift > threshold) {
        try {
          audio.currentTime = targetTime;
        } catch (error) {
          console.error("Audio seek failed:", error);
        }
      }
    };

    syncTime();

    audio.addEventListener("loadedmetadata", syncTime);

    return () => {
      audio.removeEventListener(
        "loadedmetadata",
        syncTime,
      );
    };
  }, [targetTime, shouldPlay]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!shouldPlay) {
      if (!audio.paused) {
        audio.pause();
      }
      return;
    }

    const requestPlay = () => {
      if (
        !desiredPlayingRef.current ||
        !audio.paused ||
        pendingPlayRef.current ||
        audio.readyState < 2
      ) {
        return;
      }

      pendingPlayRef.current = true;

      void audio.play()
        .then(() => {
          if (!desiredPlayingRef.current) {
            audio.pause();
          }
        })
        .catch((error: unknown) => {
          if (
            error instanceof DOMException &&
            error.name === "AbortError"
          ) {
            return;
          }

          console.error(
            "Audio playback failed:",
            error,
          );
        })
        .finally(() => {
          pendingPlayRef.current = false;
        });
    };

    audio.addEventListener("canplay", requestPlay);
    audio.addEventListener("canplaythrough", requestPlay);

    if (audio.readyState >= 2) {
      requestPlay();
    }

    return () => {
      audio.removeEventListener("canplay", requestPlay);
      audio.removeEventListener("canplaythrough", requestPlay);
    };
  }, [shouldPlay]);

  return { audioRef };
}
