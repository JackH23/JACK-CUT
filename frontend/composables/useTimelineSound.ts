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

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const sourceTime = Math.max(
      0,
      playheadSeconds - item.startTime + item.sourceStart,
    );

    if (Math.abs(audio.currentTime - sourceTime) > 0.5) {
      audio.currentTime = sourceTime;
    }
  }, [item, playheadSeconds]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      void audio.play().catch(console.error);
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  return { audioRef };
}