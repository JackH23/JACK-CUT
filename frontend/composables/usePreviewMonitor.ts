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

  const previewItemId = previewItem?.id;
  const previewFileId = previewFile?.id;
  const previewUrl = previewFile?.url;
  const previewType = previewFile?.type;
  const clipStart = previewItem?.startTime ?? 0;
  const sourceStart = previewItem?.sourceStart ?? 0;
  const isPlaying = playback.isPlaying;

  const activeSoundItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.type === "media" &&
          item.file?.type === "audio" &&
          playheadSeconds >= item.startTime &&
          playheadSeconds < item.startTime + item.duration,
      ),
    [items, playheadSeconds],
  );

  const activeTextItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.type === "text" &&
          playheadSeconds >= item.startTime &&
          playheadSeconds < item.startTime + item.duration,
      ),
    [items, playheadSeconds],
  );

  const syncVideoTime = useCallback(() => {
    const video = videoRef.current;

    if (
      !video ||
      previewType !== "video" ||
      video.readyState < 1
    ) {
      return;
    }

    let targetTime = Math.max(
      0,
      playheadSeconds - clipStart + sourceStart,
    );

    if (!Number.isFinite(targetTime)) return;

    if (Number.isFinite(video.duration)) {
      targetTime = Math.min(
        targetTime,
        Math.max(0, video.duration - 0.001),
      );
    }

    const tolerance = isPlaying ? 0.5 : 0.04;

    if (
      !video.seeking &&
      Math.abs(video.currentTime - targetTime) > tolerance
    ) {
      video.currentTime = targetTime;
    }
  }, [
    previewType,
    playheadSeconds,
    clipStart,
    sourceStart,
    isPlaying,
  ]);

  useEffect(() => {
    syncVideoTime();
  }, [syncVideoTime, previewItemId, previewUrl]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || previewType !== "video") return;

    let disposed = false;
    let playPending = false;

    const requestPlayback = () => {
      if (
        disposed ||
        !isPlaying ||
        !video.paused ||
        playPending
      ) {
        return;
      }

      playPending = true;

      void video
        .play()
        .catch((error: unknown) => {
          if (disposed) return;

          if (
            error instanceof DOMException &&
            error.name === "AbortError"
          ) {
            return;
          }

          console.error("Preview playback failed:", error);
        })
        .finally(() => {
          playPending = false;
        });
    };

    video.addEventListener("canplay", requestPlayback);

    if (isPlaying) {
      requestPlayback();
    } else {
      video.pause();
    }

    return () => {
      disposed = true;
      video.removeEventListener("canplay", requestPlayback);
      video.pause();
    };
  }, [
    isPlaying,
    previewItemId,
    previewFileId,
    previewUrl,
    previewType,
  ]);

  return {
    ...playback,
    videoRef,
    previewFile,
    previewItem,
    playheadSeconds,
    activeSoundItems,
    activeTextItems,
    handleVideoLoadedMetadata: syncVideoTime,
  };
}