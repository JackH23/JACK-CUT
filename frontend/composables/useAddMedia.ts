"use client";

import {
  useCallback,
  useRef,
  type Dispatch,
} from "react";

import type { MediaFile } from "@/lib/media";
import type { TimelineItem } from "@/types/timeline";

import { timelineService } from "@/services/timelineService";

const TIMELINE_DURATION = 210;

type TimelineAction =
  | { type: "ADD_ITEM_START" }
  | { type: "ADD_ITEM_SUCCESS"; payload: TimelineItem }
  | { type: "ADD_ITEM_ERROR"; payload: string };

type UseAddMediaProps = {
  projectId: string;
  timelineItems: TimelineItem[];
  dispatch: Dispatch<TimelineAction>;
};

function getMediaDuration(
  file: MediaFile,
): Promise<number> {
  if (file.type === "image") {
    return Promise.resolve(5);
  }

  return new Promise((resolve, reject) => {
    const media =
      file.type === "video"
        ? document.createElement("video")
        : document.createElement("audio");

    media.preload = "metadata";
    media.src = file.url;

    media.onloadedmetadata = () => {
      resolve(
        Number.isFinite(media.duration)
          ? media.duration
          : 0,
      );
    };

    media.onerror = () => {
      reject(
        new Error(
          `Could not load duration for ${file.name}`,
        ),
      );
    };
  });
}

export function useAddMedia({
  projectId,
  timelineItems,
  dispatch,
}: UseAddMediaProps) {
  const pendingMediaIds = useRef(
    new Set<string>(),
  );

  const handleSelectMedia = useCallback(
    async (file: MediaFile) => {
      if (
        pendingMediaIds.current.has(file.id) ||
        timelineItems.some(
          (item) =>
            item.type === "media" &&
            item.file?.id === file.id,
        )
      ) {
        return;
      }

      pendingMediaIds.current.add(file.id);

      dispatch({
        type: "ADD_ITEM_START",
      });

      try {
        const mediaDuration =
          await getMediaDuration(file);

        if (mediaDuration <= 0) {
          throw new Error(
            `Could not read duration for ${file.name}`,
          );
        }

        const targetTrackId =
          file.type === "audio"
            ? "voice"
            : "main-video";

        const startTime = timelineItems
          .filter(
            (item) =>
              item.trackId === targetTrackId,
          )
          .reduce(
            (latestEnd, item) =>
              Math.max(
                latestEnd,
                item.startTime + item.duration,
              ),
            0,
          );

        const response =
          await timelineService.addItem({
            projectId,
            itemType: "MEDIA",
            mediaId: file.id,
            trackId: targetTrackId,
            startTime,
            duration: mediaDuration,
          });

        const savedItem = response.item;

        const newItem: TimelineItem = {
          id: savedItem.id,
          type: "media",
          file,

          trackId: savedItem.track_id,
          startTime: savedItem.start_time,
          duration: savedItem.duration,

          startPosition:
            (savedItem.start_time /
              TIMELINE_DURATION) *
            100,

          width:
            (savedItem.duration /
              TIMELINE_DURATION) *
            100,

          sourceStart: 0,
        };

        dispatch({
          type: "ADD_ITEM_SUCCESS",
          payload: newItem,
        });
      } catch (error) {
        dispatch({
          type: "ADD_ITEM_ERROR",
          payload:
            error instanceof Error
              ? error.message
              : "Could not add media to the timeline.",
        });
      } finally {
        pendingMediaIds.current.delete(
          file.id,
        );
      }
    },
    [
      projectId,
      timelineItems,
      dispatch,
    ],
  );

  return {
    handleSelectMedia,
  };
}