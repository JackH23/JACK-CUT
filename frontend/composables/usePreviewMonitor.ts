"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";

import { usePreviewPlayback } from "@/composables/usePreviewPlayback";
import type { MediaFile } from "@/lib/media";
import type { TimelineItem } from "@/types/timeline";

type Options = {
  file: MediaFile | null;
  activeItem: TimelineItem | null;
  items: TimelineItem[];
  duration: number;
  playheadTime: number;
  onPlayheadTimeChange: (position: number) => void;
};

export function usePreviewMonitor({
  activeItem,
  items,
  duration,
  playheadTime,
  onPlayheadTimeChange,
}: Options) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const playback = usePreviewPlayback({
    duration,
    playheadTime,
    onPlayheadTimeChange,
  });

  const playheadSeconds = playheadTime;
  const previewItem = activeItem;

  const previewFile =
    previewItem?.type === "media"
      ? previewItem.file ?? null
      : null;

  /*
   * Find separate audio clips currently
   * underneath the playhead.
   */
  const activeSoundItems = useMemo(
    () =>
      items.filter((item) => {
        if (
          item.type !== "media" ||
          !item.file
        ) {
          return false;
        }

        return (
          item.file.type === "audio" &&
          playheadSeconds >= item.startTime &&
          playheadSeconds <
            item.startTime + item.duration
        );
      }),
    [items, playheadSeconds],
  );

  /*
   * Find text clips currently underneath
   * the playhead.
   */
  const activeTextItems = useMemo(
    () =>
      items.filter((item) => {
        if (item.type !== "text") {
          return false;
        }

        return (
          playheadSeconds >= item.startTime &&
          playheadSeconds <
            item.startTime + item.duration
        );
      }),
    [items, playheadSeconds],
  );

  const syncVideoTime = useCallback(() => {
    const video = videoRef.current;

    if (
      !video ||
      !previewItem ||
      previewItem.type !== "media" ||
      previewFile?.type !== "video"
    ) {
      return;
    }

    const sourceTime = Math.max(
      0,
      playheadSeconds -
        previewItem.startTime +
        previewItem.sourceStart,
    );

    if (
      Math.abs(
        video.currentTime - sourceTime,
      ) > 0.35
    ) {
      video.currentTime = sourceTime;
    }
  }, [
    previewItem,
    previewFile,
    playheadSeconds,
  ]);

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
  }, [
    playback.isPlaying,
    previewFile,
  ]);

  return {
    ...playback,

    videoRef,
    previewFile,
    previewItem,

    playheadSeconds,

    activeSoundItems,
    activeTextItems,

    handleVideoLoadedMetadata:
      syncVideoTime,
  };
}