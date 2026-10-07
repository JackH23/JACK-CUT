"use client";

import {
  useRef,
  useState,
  type Dispatch,
  type DragEvent,
  type RefObject,
  type SetStateAction,
} from "react";

import { useParams } from "next/navigation";

import { timelineService } from "@/services/timelineService";

import type {
  TimelineItem,
  TimelineTrack,
} from "@/types/timeline";

const SNAP_THRESHOLD = 1.5;

type UseTimelineDragOptions = {
  items: TimelineItem[];
  displayDuration: number;

  timelineRef: RefObject<HTMLDivElement | null>;

  onItemsChange: Dispatch<
    SetStateAction<TimelineItem[]>
  >;

  onDragExtensionChange: (
    extension: number,
  ) => void;
};

export function useTimelineDrag({
  items,
  displayDuration,
  timelineRef,
  onItemsChange,
  onDragExtensionChange,
}: UseTimelineDragOptions) {
  const { projectId } = useParams<{ projectId: string }>();
  const dragStateRef = useRef<{
    itemId: string;
    grabOffset: number;
  } | null>(null);

  const [
    dragSnapLinePosition,
    setDragSnapLinePosition,
  ] = useState<number | null>(null);

  const handleDragStart = (
    event: DragEvent<HTMLDivElement>,
    itemId: string,
  ) => {
    const timeline = timelineRef.current;

    if (!timeline) return;

    const clipBounds =
      event.currentTarget.getBoundingClientRect();

    const grabOffset =
      event.clientX - clipBounds.left;

    dragStateRef.current = {
      itemId,
      grabOffset,
    };

    setDragSnapLinePosition(null);

    event.dataTransfer.effectAllowed = "move";

    event.dataTransfer.setData(
      "timeline-item-id",
      itemId,
    );
  };

  const calculateSnapPosition = (
    event: DragEvent<HTMLDivElement>,
    draggedItem: TimelineItem,
  ) => {
    const timeline = timelineRef.current;

    if (!timeline) {
      return {
        startPosition:
          draggedItem.startPosition,

        snapLine: null as number | null,
      };
    }

    const timelineBounds =
      timeline.getBoundingClientRect();

    const grabOffset =
      dragStateRef.current?.grabOffset ?? 0;

    const maxStart = Math.max(
      0,
      100 - draggedItem.width,
    );

    const rawStartPosition = Math.min(
      maxStart,
      Math.max(
        0,
        ((event.clientX -
          timelineBounds.left -
          grabOffset) /
          timelineBounds.width) *
          100,
      ),
    );

    let snappedStartPosition =
      rawStartPosition;

    let snapLine: number | null = null;

    let closestDistance =
      SNAP_THRESHOLD;

    for (const item of items) {
      if (item.id === draggedItem.id) {
        continue;
      }

      const edges = [
        item.startPosition,
        item.startPosition + item.width,
      ];

      for (const edge of edges) {
        // Left edge snapping.
        const leftDistance = Math.abs(
          rawStartPosition - edge,
        );

        if (
          leftDistance <= closestDistance &&
          edge <= maxStart
        ) {
          closestDistance = leftDistance;
          snappedStartPosition = edge;
          snapLine = edge;
        }

        // Right edge snapping.
        const proposedStart =
          edge - draggedItem.width;

        const rightDistance = Math.abs(
          rawStartPosition +
            draggedItem.width -
            edge,
        );

        if (
          rightDistance <= closestDistance &&
          proposedStart >= 0 &&
          proposedStart <= maxStart
        ) {
          closestDistance = rightDistance;

          snappedStartPosition =
            proposedStart;

          snapLine = edge;
        }
      }
    }

    return {
      startPosition:
        snappedStartPosition,
      snapLine,
    };
  };

  const handleTrackDragOver = (
    event: DragEvent<HTMLDivElement>,
    targetTrack: TimelineTrack,
  ) => {
    event.preventDefault();

    event.dataTransfer.dropEffect = "move";

    const itemId =
      dragStateRef.current?.itemId;

    if (!itemId) {
      setDragSnapLinePosition(null);
      return;
    }

    const draggedItem = items.find(
      (item) => item.id === itemId,
    );

    if (!draggedItem) {
      setDragSnapLinePosition(null);
      return;
    }

    const { snapLine } =
      calculateSnapPosition(
        event,
        draggedItem,
      );

    setDragSnapLinePosition(snapLine);
  };

  const handleDrop = async (
    event: DragEvent<HTMLDivElement>,
    targetTrack: TimelineTrack,
  ) => {
    event.preventDefault();

    const itemId =
      dragStateRef.current?.itemId ||
      event.dataTransfer.getData(
        "timeline-item-id",
      );

    const draggedItem = items.find(
      (item) => item.id === itemId,
    );

    if (!draggedItem) return;

    const { startPosition } =
      calculateSnapPosition(
        event,
        draggedItem,
      );

    const endPosition =
      startPosition + draggedItem.width;

    const hasOverlap = items.some(
      (item) => {
        if (
          item.id === itemId ||
          item.trackId !== targetTrack.id
        ) {
          return false;
        }

        const itemEnd =
          item.startPosition + item.width;

        return (
          startPosition < itemEnd &&
          endPosition > item.startPosition
        );
      },
    );

    setDragSnapLinePosition(null);

    dragStateRef.current = null;

    if (hasOverlap) return;

    const startTime =
      (startPosition / 100) *
      displayDuration;

    try {
      await timelineService.updateItem(
        itemId,
        {
          trackId: targetTrack.id,
          startTime,
          duration: draggedItem.duration,
        },
        projectId,
      );

      onItemsChange((currentItems) =>
        currentItems.map((item) =>
          item.id === itemId
            ? {
                ...item,
                trackId: targetTrack.id,
                startPosition,
                startTime,
              }
            : item,
        ),
      );
    } catch (error) {
      console.error(
        "Could not move timeline item:",
        error,
      );

      window.alert(
        "Could not save the clip move.",
      );
    }
  };

  const handleClipDragEnd = () => {
    dragStateRef.current = null;

    setDragSnapLinePosition(null);
  };

  const startClipDrag = (
    event: DragEvent<HTMLDivElement>,
    itemId: string,
  ) => {
    const item = items.find(
      (candidate) =>
        candidate.id === itemId,
    );

    handleDragStart(event, itemId);

    onDragExtensionChange(
      Math.max(
        10,
        item?.duration ?? 0,
      ),
    );
  };

  const endClipDrag = () => {
    handleClipDragEnd();

    onDragExtensionChange(0);
  };

  return {
    dragSnapLinePosition,

    startClipDrag,
    endClipDrag,

    handleDragStart,
    handleTrackDragOver,
    handleDrop,
    handleClipDragEnd,
  };
}