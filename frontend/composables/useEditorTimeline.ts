"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { MediaFile } from "@/lib/media";
import type { TimelineItem } from "@/types/timeline";
import { useTimeline } from "@/composables/useTimeline";
import { timelineService } from "@/services/timelineService";
import {
  initialTimelineState,
  timelineReducer,
} from "@/reducers/timelineReducer";

const TIMELINE_DURATION = 210;

function getMediaDuration(file: MediaFile): Promise<number> {
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
      resolve(Number.isFinite(media.duration) ? media.duration : 0);
    };

    media.onerror = () => {
      reject(new Error(`Could not load duration for ${file.name}`));
    };
  });
}

export function useEditorTimeline(projectId: string) {
  const [state, dispatch] = useReducer(timelineReducer, initialTimelineState);
  const [playheadPosition, setPlayheadPosition] = useState(0);
  const pendingMediaIds = useRef(new Set<string>());
  const { tracks } = useTimeline();

  const timelineItems = state.items;

  useEffect(() => {
    let active = true;

    dispatch({ type: "LOAD_ITEMS_START" });

    timelineService
      .getAll(projectId)
      .then((response) => {
        if (!active) return;

        const loadedItems: TimelineItem[] = response.items.flatMap((item) => {
          if (!item.media) return [];

          return [
            {
              id: item.id,
              file: item.media,
              trackId: item.trackId,
              startTime: item.startTime,
              duration: item.duration,
              startPosition: (item.startTime / TIMELINE_DURATION) * 100,
              width: (item.duration / TIMELINE_DURATION) * 100,
              sourceStart: 0,
            },
          ];
        });

        dispatch({
          type: "LOAD_ITEMS_SUCCESS",
          payload: loadedItems,
        });
      })
      .catch((error) => {
        if (!active) return;

        dispatch({
          type: "LOAD_ITEMS_ERROR",
          payload:
            error instanceof Error
              ? error.message
              : "Could not load timeline items.",
        });
      });

    return () => {
      active = false;
    };
  }, [projectId]);

  // Preserves the setter prop expected by TimelineContent/ScrollableTracks.
  const setTimelineItems: Dispatch<SetStateAction<TimelineItem[]>> =
    useCallback((update) => {
      dispatch({ type: "SET_ITEMS", payload: update });
    }, []);

  const handleSelectMedia = useCallback(
    async (file: MediaFile) => {
      if (
        pendingMediaIds.current.has(file.id) ||
        timelineItems.some((item) => item.file.id === file.id)
      ) {
        return;
      }

      pendingMediaIds.current.add(file.id);
      dispatch({ type: "ADD_ITEM_START" });

      try {
        const mediaDuration = await getMediaDuration(file);

        if (mediaDuration <= 0) {
          throw new Error(`Could not read duration for ${file.name}`);
        }

        const targetTrackId = file.type === "audio" ? "voice" : "main-video";

        const startTime = timelineItems
          .filter((item) => item.trackId === targetTrackId)
          .reduce(
            (latestEnd, item) =>
              Math.max(latestEnd, item.startTime + item.duration),
            0,
          );

        const response = await timelineService.addItem({
          projectId,
          mediaId: file.id,
          trackId: targetTrackId,
          startTime,
          duration: mediaDuration,
        });

        const savedItem = response.item;

        const newItem: TimelineItem = {
          id: savedItem.id, // Use the database ID.
          file,
          trackId: savedItem.track_id,
          startTime: savedItem.start_time,
          duration: savedItem.duration,
          startPosition: (savedItem.start_time / TIMELINE_DURATION) * 100,
          width: (savedItem.duration / TIMELINE_DURATION) * 100,
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
        pendingMediaIds.current.delete(file.id);
      }
    },
    [projectId, timelineItems],
  );

  const handleRemoveMedia = useCallback((fileId: string) => {
    dispatch({ type: "REMOVE_MEDIA", payload: fileId });
  }, []);

  const handleRemoveTimelineItem = useCallback(async (itemId: string) => {
    try {
      await timelineService.removeItem(itemId);

      dispatch({
        type: "REMOVE_ITEM",
        payload: itemId,
      });
    } catch (error) {
      dispatch({
        type: "REMOVE_ITEM_ERROR",
        payload:
          error instanceof Error
            ? error.message
            : "Could not remove timeline item.",
      });
    }
  }, []);

  const activePreviewItem = useMemo(() => {
    const trackPriority = new Map(
      tracks.map((track, index) => [track.id, index]),
    );

    return (
      timelineItems
        .filter((item) => {
          const isVisualFile =
            item.file.type === "image" || item.file.type === "video";

          const endPosition = item.startPosition + item.width;

          return (
            isVisualFile &&
            playheadPosition >= item.startPosition &&
            playheadPosition < endPosition
          );
        })
        .sort(
          (firstItem, secondItem) =>
            (trackPriority.get(firstItem.trackId) ?? Number.MAX_SAFE_INTEGER) -
            (trackPriority.get(secondItem.trackId) ?? Number.MAX_SAFE_INTEGER),
        )[0] ?? null
    );
  }, [playheadPosition, timelineItems, tracks]);

  const activePreviewFile = activePreviewItem?.file ?? null;

  const selectedMediaIds = useMemo(
    () => new Set(timelineItems.map((item) => item.file.id)),
    [timelineItems],
  );

  return {
    timelineItems,
    setTimelineItems,
    playheadPosition,
    setPlayheadPosition,
    selectedMediaIds,
    activePreviewItem,
    activePreviewFile,
    handleSelectMedia,
    handleRemoveMedia,
    addingTimelineItem: state.adding,
    timelineError: state.error,
    handleRemoveTimelineItem,
  };
}
