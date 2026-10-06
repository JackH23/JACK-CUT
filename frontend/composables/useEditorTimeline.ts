"use client";

import {
  useCallback,
  useMemo,
  useReducer,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { TimelineItem } from "@/types/timeline";

import { useTimeline } from "@/composables/useTimeline";
import { useAddText } from "@/composables/useAddText";
import { useTimelineClipboard } from "@/composables/useTimelineClipboard";
import { useAddMedia } from "@/composables/useAddMedia";
import { useTextEditor } from "@/composables/useTextEditor";
import { useLoadTimeline } from "@/composables/useLoadTimeline";

import { timelineService } from "@/services/timelineService";

import {
  initialTimelineState,
  timelineReducer,
} from "@/reducers/timelineReducer";

export function useEditorTimeline(projectId: string) {
  const [state, dispatch] = useReducer(timelineReducer, initialTimelineState);
  // Timeline seconds are the shared source of truth; percentages are visual only.
  const [playheadTime, setPlayheadTime] = useState(0);
  const { tracks } = useTimeline();

  const timelineItems = state.items;
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const selectedTimelineItem = timelineItems.find(item => item.id === selectedItemId) ?? null;
  const { handleDuplicate, isDuplicating } = useTimelineClipboard({
    projectId, items: timelineItems, selectedItem: selectedTimelineItem,
    playheadTime, onSelectItem: setSelectedItemId, dispatch,
  });

  useLoadTimeline({
    projectId,
    dispatch,
  });

  // Preserves the setter prop expected by TimelineContent/ScrollableTracks.
  const setTimelineItems: Dispatch<SetStateAction<TimelineItem[]>> =
    useCallback((update) => {
      dispatch({ type: "SET_ITEMS", payload: update });
    }, []);

  const { handleSelectMedia } = useAddMedia({
    projectId,
    timelineItems,
    dispatch,
  });

  const { handleAddText } = useAddText({
    projectId,
    tracks,
    timelineItems,
    dispatch,
  });

  const {
    handleUpdateText,
    handleUpdateTextPosition,
    handleUpdateTextFontSize,
    handleUpdateTextFontWeight,
    handleUpdateTextFontFamily,
    handleUpdateTextColor,
  } = useTextEditor({
    timelineItems,
    setTimelineItems,
  });

  const handleRemoveMedia = useCallback((fileId: string) => {
    dispatch({ type: "REMOVE_MEDIA", payload: fileId });
  }, []);

  const handleRemoveTimelineItem = useCallback(
    async (itemId: string) => {
      const item = timelineItems.find(
        (timelineItem) => timelineItem.id === itemId,
      );

      if (!item) return;

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
    },
    [timelineItems],
  );

  const activePreviewItem = useMemo(() => {
    const trackPriority = new Map(
      tracks.map((track, index) => [track.id, index]),
    );

    return (
      timelineItems
        .filter((item) => {
          const isVisualFile =
            item.type === "media" &&
            (item.file?.type === "image" ||
              item.file?.type === "video");

          const endTime = item.startTime + item.duration;

          return (
            isVisualFile &&
            playheadTime >= item.startTime &&
            playheadTime < endTime
          );
        })
        .sort(
          (firstItem, secondItem) =>
            (trackPriority.get(firstItem.trackId) ??
              Number.MAX_SAFE_INTEGER) -
            (trackPriority.get(secondItem.trackId) ??
              Number.MAX_SAFE_INTEGER),
        )[0] ?? null
    );
  }, [playheadTime, timelineItems, tracks]);

  // Active text item at the current playhead position.
  const activeTextItem = useMemo(() => {
    return (
      timelineItems.find((item) => {
        if (item.type !== "text") {
          return false;
        }

        const endTime = item.startTime + item.duration;

        return (
          playheadTime >= item.startTime &&
          playheadTime < endTime
        );
      }) ?? null
    );
  }, [
    playheadTime,
    timelineItems,
  ]);

  const activePreviewFile =
    activePreviewItem?.file ?? null;

  const selectedMediaIds = useMemo(
    () =>
      new Set(
        timelineItems
          .filter(
            (item) =>
              item.type === "media" && item.file,
          )
          .map((item) => item.file!.id),
      ),
    [timelineItems],
  );

  return {
    selectedItemId,
    selectedTimelineItem,
    handleSelectTimelineItem: setSelectedItemId,
    handleDuplicate,
    isDuplicating,
    timelineItems,
    setTimelineItems,
    playheadTime,
    setPlayheadTime,
    selectedMediaIds,
    activePreviewItem,
    activeTextItem,
    activePreviewFile,

    handleSelectMedia,
    handleAddText,
    handleUpdateText,
    handleUpdateTextPosition,

    handleUpdateTextFontSize,
    handleUpdateTextFontWeight,
    handleUpdateTextFontFamily,
    handleUpdateTextColor,

    handleRemoveMedia,

    addingTimelineItem: state.adding,
    timelineError: state.error,
    handleRemoveTimelineItem,
  };
}
