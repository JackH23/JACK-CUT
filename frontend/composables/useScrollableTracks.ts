"use client";

import {
  useRef,
  useState,
  type Dispatch,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
  type SetStateAction,
} from "react";

import { timelineService } from "@/services/timelineService";
import { useTimelinePlayhead } from "@/composables/useTimelinePlayhead";
import type { TimelineItem, TimelineTrack } from "@/types/timeline";

type UseScrollableTracksOptions = {
  items: TimelineItem[];
  onItemsChange: Dispatch<SetStateAction<TimelineItem[]>>;
  onRemoveItem: (itemId: string) => void;
  onPlayheadPositionChange: (position: number) => void;
};

type ResizeEdge = "left" | "right";

type ResizeState = {
  itemId: string;
  edge: ResizeEdge;
  startClientX: number;
  startPosition: number;
  startWidth: number;
};

const SNAP_THRESHOLD = 1.5;
const MINIMUM_CLIP_WIDTH = 2;
const TIMELINE_DURATION = 210;

export function useScrollableTracks({
  items,
  onItemsChange,
  onRemoveItem,
  onPlayheadPositionChange,
}: UseScrollableTracksOptions) {
  const {
    timelineRef,
    isDraggingPlayhead,
    handlePlayheadPointerDown,
    handlePlayheadPointerMove,
    handlePlayheadPointerUp,
  } = useTimelinePlayhead({
    onPositionChange: onPlayheadPositionChange,
  });

  const dragStateRef = useRef<{
    itemId: string;
    grabOffset: number;
  } | null>(null);

  const resizeStateRef = useRef<ResizeState | null>(null);
  const resizeUpdatesRef = useRef(
    new Map<string, { startTime: number; duration: number; trackId: string }>(),
  );
  const [snapLinePosition, setSnapLinePosition] = useState<number | null>(null);

  const handleDragStart = (
    event: DragEvent<HTMLDivElement>,
    itemId: string,
  ) => {
    const timeline = timelineRef.current;

    if (!timeline) return;

    const timelineBounds = timeline.getBoundingClientRect();

    const clipBounds = event.currentTarget.getBoundingClientRect();

    const grabOffset =
      ((event.clientX - clipBounds.left) / timelineBounds.width) * 100;

    dragStateRef.current = {
      itemId,
      grabOffset,
    };

    setSnapLinePosition(null);

    event.dataTransfer.effectAllowed = "move";

    event.dataTransfer.setData("timeline-item-id", itemId);
  };

  const calculateSnapPosition = (
    event: DragEvent<HTMLDivElement>,
    targetTrack: TimelineTrack,
    draggedItem: TimelineItem,
  ) => {
    const targetBounds = event.currentTarget.getBoundingClientRect();

    const pointerPosition =
      ((event.clientX - targetBounds.left) / targetBounds.width) * 100;

    const grabOffset = dragStateRef.current?.grabOffset ?? 0;

    const rawStartPosition = Math.min(
      100 - draggedItem.width,
      Math.max(0, pointerPosition - grabOffset),
    );

    const rawEndPosition = rawStartPosition + draggedItem.width;

    let snappedStartPosition = rawStartPosition;

    let nextSnapLine: number | null = null;
    let closestDistance = SNAP_THRESHOLD;

    items.forEach((item) => {
      if (item.id === draggedItem.id) return;
      if (item.trackId !== targetTrack.id) return;

      const itemStart = item.startPosition;
      const itemEnd = item.startPosition + item.width;

      const leftEdgeDistance = Math.abs(rawStartPosition - itemEnd);

      if (leftEdgeDistance <= closestDistance) {
        closestDistance = leftEdgeDistance;
        snappedStartPosition = itemEnd;
        nextSnapLine = itemEnd;
      }

      const rightEdgeDistance = Math.abs(rawEndPosition - itemStart);

      if (rightEdgeDistance <= closestDistance) {
        closestDistance = rightEdgeDistance;
        snappedStartPosition = itemStart - draggedItem.width;
        nextSnapLine = itemStart;
      }
    });

    return {
      startPosition: Math.min(
        100 - draggedItem.width,
        Math.max(0, snappedStartPosition),
      ),
      snapLine: nextSnapLine,
    };
  };

  const handleTrackDragOver = (
    event: DragEvent<HTMLDivElement>,
    targetTrack: TimelineTrack,
  ) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    const itemId = dragStateRef.current?.itemId;

    if (!itemId) {
      setSnapLinePosition(null);
      return;
    }

    const draggedItem = items.find((item) => item.id === itemId);

    if (!draggedItem) {
      setSnapLinePosition(null);
      return;
    }

    const { snapLine } = calculateSnapPosition(event, targetTrack, draggedItem);

    setSnapLinePosition(snapLine);
  };

  const handleDrop = async (
    event: DragEvent<HTMLDivElement>,
    targetTrack: TimelineTrack,
  ) => {
    event.preventDefault();

    const itemId =
      dragStateRef.current?.itemId ||
      event.dataTransfer.getData("timeline-item-id");

    const draggedItem = items.find((item) => item.id === itemId);

    if (!draggedItem) return;

    const { startPosition } = calculateSnapPosition(
      event,
      targetTrack,
      draggedItem,
    );

    const endPosition = startPosition + draggedItem.width;

    const hasOverlap = items.some((item) => {
      if (item.id === itemId || item.trackId !== targetTrack.id) return false;

      const itemEnd = item.startPosition + item.width;
      return startPosition < itemEnd && endPosition > item.startPosition;
    });

    setSnapLinePosition(null);
    dragStateRef.current = null;

    if (hasOverlap) return;

    const startTime = (startPosition / 100) * TIMELINE_DURATION;

    try {
      // Save the existing item's new layer and position.
      await timelineService.updateItem(itemId, {
        trackId: targetTrack.id,
        startTime,
        duration: draggedItem.duration,
      });

      onItemsChange((currentItems) =>
        currentItems.map((item) =>
          item.id === itemId
            ? { ...item, trackId: targetTrack.id, startPosition, startTime }
            : item,
        ),
      );
    } catch (error) {
      console.error("Could not move timeline item:", error);
      window.alert("Could not save the clip move.");
    }
  };

  const handleClipDragEnd = () => {
    dragStateRef.current = null;
    setSnapLinePosition(null);
  };

  const handleResizeStart = (
    event: PointerEvent<HTMLButtonElement>,
    item: TimelineItem,
    edge: ResizeEdge,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    resizeUpdatesRef.current.clear();

    resizeStateRef.current = {
      itemId: item.id,
      edge,
      startClientX: event.clientX,
      startPosition: item.startPosition,
      startWidth: item.width,
    };

    setSnapLinePosition(null);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizeMove = (event: PointerEvent<HTMLButtonElement>) => {
    const resizeState = resizeStateRef.current;
    const timeline = timelineRef.current;

    if (!resizeState || !timeline) return;

    event.preventDefault();
    event.stopPropagation();

    const timelineWidth = timeline.getBoundingClientRect().width;

    if (timelineWidth <= 0) return;

    const resizedItem = items.find((item) => item.id === resizeState.itemId);

    if (!resizedItem) return;

    const movement =
      ((event.clientX - resizeState.startClientX) / timelineWidth) * 100;

    const otherTrackItems = items.filter(
      (item) =>
        item.id !== resizedItem.id && item.trackId === resizedItem.trackId,
    );

    const originalStart = resizeState.startPosition;
    const originalEnd = resizeState.startPosition + resizeState.startWidth;
    const shiftedPositions = new Map<string, number>();

    let nextStart = originalStart;
    let nextWidth = resizeState.startWidth;
    let nextSnapLine: number | null = null;

    if (resizeState.edge === "right") {
      const requestedEnd = Math.min(
        100,
        Math.max(originalStart + MINIMUM_CLIP_WIDTH, originalEnd + movement),
      );

      const followingItems = otherTrackItems
        .filter((item) => item.startPosition >= originalStart)
        .sort(
          (firstItem, secondItem) =>
            firstItem.startPosition - secondItem.startPosition,
        );

      const calculateRipplePositions = (resizedEnd: number) => {
        const positions = new Map<string, number>();
        let occupiedUntil = resizedEnd;
        let finalEnd = resizedEnd;

        followingItems.forEach((item) => {
          const nextItemStart = Math.max(item.startPosition, occupiedUntil);

          positions.set(item.id, nextItemStart);

          occupiedUntil = nextItemStart + item.width;
          finalEnd = occupiedUntil;
        });

        return {
          positions,
          finalEnd,
        };
      };

      let nextEnd = requestedEnd;
      let rippleResult = calculateRipplePositions(nextEnd);

      // Keep all pushed clips inside the timeline.
      if (rippleResult.finalEnd > 100) {
        nextEnd = Math.max(
          originalStart + MINIMUM_CLIP_WIDTH,
          nextEnd - (rippleResult.finalEnd - 100),
        );

        rippleResult = calculateRipplePositions(nextEnd);
      }

      rippleResult.positions.forEach((position, itemId) => {
        shiftedPositions.set(itemId, position);
      });

      const closestOriginalStart = followingItems[0]?.startPosition;

      if (
        closestOriginalStart !== undefined &&
        Math.abs(nextEnd - closestOriginalStart) <= SNAP_THRESHOLD
      ) {
        nextSnapLine = closestOriginalStart;
      }

      nextWidth = nextEnd - originalStart;
    } else {
      const requestedStart = originalStart + movement;

      const previousClipEnd = otherTrackItems
        .filter((item) => item.startPosition + item.width <= originalStart)
        .reduce(
          (closest, item) => Math.max(closest, item.startPosition + item.width),
          0,
        );

      nextStart = Math.max(
        previousClipEnd,
        0,
        Math.min(originalEnd - MINIMUM_CLIP_WIDTH, requestedStart),
      );

      if (
        previousClipEnd > 0 &&
        Math.abs(nextStart - previousClipEnd) <= SNAP_THRESHOLD
      ) {
        nextStart = previousClipEnd;
        nextSnapLine = previousClipEnd;
      }

      nextWidth = originalEnd - nextStart;
    }

    // These updates now run directly in the pointer event handler.
    setSnapLinePosition(nextSnapLine);

    const updates = new Map<
      string,
      { startTime: number; duration: number; trackId: string }
    >();

    updates.set(resizedItem.id, {
      startTime: (nextStart / 100) * TIMELINE_DURATION,
      duration: (nextWidth / 100) * TIMELINE_DURATION,
      trackId: resizedItem.trackId,
    });

    for (const item of otherTrackItems) {
      const shiftedPosition = shiftedPositions.get(item.id);

      if (
        shiftedPosition !== undefined &&
        shiftedPosition !== item.startPosition
      ) {
        updates.set(item.id, {
          startTime: (shiftedPosition / 100) * TIMELINE_DURATION,
          duration: item.duration,
          trackId: item.trackId,
        });
      }
    }

    resizeUpdatesRef.current = updates;

    onItemsChange((currentItems) =>
      currentItems.map((item) => {
        // Update the clip being resized.
        if (item.id === resizeState.itemId) {
          const newStartTime = (nextStart / 100) * TIMELINE_DURATION;

          const newDuration = (nextWidth / 100) * TIMELINE_DURATION;

          const trimmedFromStart = newStartTime - item.startTime;

          return {
            ...item,
            startPosition: nextStart,
            width: nextWidth,
            startTime: newStartTime,
            duration: newDuration,
            sourceStart:
              resizeState.edge === "left"
                ? Math.max(0, item.sourceStart + trimmedFromStart)
                : item.sourceStart,
          };
        }

        // Push the following clips forward during ripple resizing.
        const shiftedPosition = shiftedPositions.get(item.id);

        if (shiftedPosition !== undefined) {
          return {
            ...item,
            startPosition: shiftedPosition,
            startTime: (shiftedPosition / 100) * TIMELINE_DURATION,
          };
        }

        return item;
      }),
    );
  };

  const handleResizeEnd = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (!resizeStateRef.current) return;

    resizeStateRef.current = null;
    setSnapLinePosition(null);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const updates = [...resizeUpdatesRef.current.entries()];
    resizeUpdatesRef.current.clear();

    void Promise.all(
      updates.map(([id, values]) => timelineService.updateItem(id, values)),
    ).catch((error) => {
      console.error("Could not save timeline resize:", error);
      window.alert(
        "Could not save the resize. Reload the page to restore saved values.",
      );
    });
  };

  const handleRemoveItem = (itemId: string) => {
    onItemsChange((currentItems) =>
      currentItems.filter((item) => item.id !== itemId),
    );
  };

  const handleRemovePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  const handleRemoveDragStart = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleRemoveClick = (
    event: MouseEvent<HTMLButtonElement>,
    itemId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onRemoveItem(itemId);
  };

  return {
    timelineRef,
    snapLinePosition,
    isDraggingPlayhead,
    handleDragStart,
    handleTrackDragOver,
    handleDrop,
    handleClipDragEnd,
    handleResizeStart,
    handleResizeMove,
    handleResizeEnd,
    handleRemovePointerDown,
    handleRemoveDragStart,
    handleRemoveClick,
    handlePlayheadPointerDown,
    handlePlayheadPointerMove,
    handlePlayheadPointerUp,
  };
}
