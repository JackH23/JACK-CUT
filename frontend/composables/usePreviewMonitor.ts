"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePreviewPlayback } from "@/composables/usePreviewPlayback";
import type { MediaFile } from "@/lib/media";
import type { TimelineItem } from "@/types/timeline";

type Options = {
  file: MediaFile | null;
  activeItem: TimelineItem | null;
  items: TimelineItem[];
  duration: number;
  playheadPosition: number;
  onPlayheadPositionChange: (position: number) => void;
};

export function usePreviewMonitor({
  items,
  duration,
  playheadPosition,
  onPlayheadPositionChange,
}: Options) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const playback = usePreviewPlayback({
    duration,
    playheadPosition,
    onPlayheadPositionChange,
  });

  const playheadSeconds = (playheadPosition / 100) * duration;

  const previewItem = useMemo(
    () =>
      items.find(
        (item) =>
          (item.file.type === "video" || item.file.type === "image") &&
          playheadSeconds >= item.startTime &&
          playheadSeconds < item.startTime + item.duration,
      ) ?? null,
    [items, playheadSeconds],
  );

  const previewFile = previewItem?.file ?? null;

  // The <video> element plays its own audio. These are separate audio clips.
  const activeSoundItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.file.type === "audio" &&
          playheadSeconds >= item.startTime &&
          playheadSeconds < item.startTime + item.duration,
      ),
    [items, playheadSeconds],
  );

  const syncVideoTime = useCallback(() => {
    const video = videoRef.current;
    if (!video || !previewItem || previewFile?.type !== "video") return;

    const sourceTime = Math.max(
      0,
      playheadSeconds - previewItem.startTime + previewItem.sourceStart,
    );

    if (Math.abs(video.currentTime - sourceTime) > 0.35) {
      video.currentTime = sourceTime;
    }
  }, [previewItem, previewFile, playheadSeconds]);

  useEffect(() => {
    syncVideoTime();
  }, [syncVideoTime]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (playback.isPlaying) {
      void video.play().catch(console.error);
    } else {
      video.pause();
    }
  }, [playback.isPlaying, previewFile]);

  return {
    ...playback,
    videoRef,
    previewFile,
    playheadSeconds,
    activeSoundItems,
    handleVideoLoadedMetadata: syncVideoTime,
  };
}