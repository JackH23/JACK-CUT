"use client";

import { useCallback, useLayoutEffect, useRef, type Dispatch } from "react";

import type {
  TextStyle,
  TimelineItem,
  TimelineTrack,
} from "@/types/timeline";

import { timelineService } from "@/services/timelineService";

const TIMELINE_DURATION = 210;

type TimelineAction =
  | { type: "ADD_ITEM_START" }
  | { type: "ADD_ITEM_SUCCESS"; payload: TimelineItem }
  | { type: "ADD_ITEM_ERROR"; payload: string };

type UseAddTextProps = {
  projectId: string;
  playheadTime: number;
  ready: boolean;
  onSelectItem: (id: string) => void;
  tracks: TimelineTrack[];
  timelineItems: TimelineItem[];
  dispatch: Dispatch<TimelineAction>;
};

const DEFAULT_TEXT: Record<TextStyle, string> = {
  heading: "Heading",
  subtitle: "Subtitle",
  title: "Title",
  caption: "Caption",
};

const DEFAULT_TEXT_DURATION = 5;

export function useAddText({
  projectId,
  playheadTime,
  ready,
  onSelectItem,
  tracks,
  timelineItems,
  dispatch,
}: UseAddTextProps) {
  const pending = useRef(false);
  const itemsRef = useRef(timelineItems);
  useLayoutEffect(() => {
    itemsRef.current = timelineItems;
  }, [timelineItems]);
  const handleAddText = useCallback(
    async (style: TextStyle) => {
      if (!ready || pending.current) return;
      const titleTrack = tracks.find(
        (track) => track.name === "V3 Titles",
      );

      if (!titleTrack) {
        console.error(
          "V3 Titles track was not found.",
        );
        return;
      }

      let startTime = Math.max(0, playheadTime);
      const occupied = itemsRef.current
        .filter(
          (item) =>
            item.trackId === titleTrack.id,
        )
        .sort((a, b) => a.startTime - b.startTime);

      for (const item of occupied) {
        if (startTime < item.startTime + item.duration &&
            startTime + DEFAULT_TEXT_DURATION > item.startTime) {
          startTime = item.startTime + item.duration;
        }
      }
      pending.current = true;

      dispatch({
        type: "ADD_ITEM_START",
      });

      try {
        const response =
          await timelineService.addItem({
            projectId,
            itemType: "TEXT",
            textContent: DEFAULT_TEXT[style],
            textStyle: style,
            trackId: titleTrack.id,
            startTime,
            duration: DEFAULT_TEXT_DURATION,
          });

        const savedItem = response.item;

        const newItem: TimelineItem = {
          id: savedItem.id,
          type: "text",

          text:
            savedItem.text_content ??
            DEFAULT_TEXT[style],

          textStyle:
            savedItem.text_style ??
            style,

          textX:
            savedItem.text_x ?? 50,

          textY:
            savedItem.text_y ?? 50,

          fontSize:
            savedItem.font_size ?? undefined,

          fontWeight:
            savedItem.font_weight ?? undefined,

          fontFamily:
            savedItem.font_family ?? undefined,

          textColor:
            savedItem.text_color ?? undefined,

          trackId:
            savedItem.track_id,

          startTime:
            Number(savedItem.start_time),

          duration:
            Number(savedItem.duration),

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

        itemsRef.current = [...itemsRef.current, newItem];
        dispatch({
          type: "ADD_ITEM_SUCCESS",
          payload: newItem,
        });
        onSelectItem(newItem.id);
      } catch (error) {
        dispatch({
          type: "ADD_ITEM_ERROR",
          payload:
            error instanceof Error
              ? error.message
              : "Could not add text to the timeline.",
        });
      } finally {
        pending.current = false;
      }
    },
    [
      projectId,
      playheadTime,
      ready,
      onSelectItem,
      tracks,
      dispatch,
    ],
  );

  return {
    handleAddText,
  };
}