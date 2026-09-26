"use client";

import {
  useMemo,
  useRef,
  useState,
  useEffect,
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
  timelineDuration: number;
  playheadPosition: number;
  isPlaying: boolean;
  onItemsChange: Dispatch<SetStateAction<TimelineItem[]>>;
  onRemoveItem: (itemId: string) => void;
  onPlayheadPositionChange: (position: number) => void;
};

type ResizeEdge = "left" | "right";

type ResizeState = {
  itemId: string;
  edge: ResizeEdge;
  startClientX: number;
  startTime: number;
  duration: number;
  sourceStart: number;
  trackItems: {
    id: string;
    startTime: number;
    duration: number;
    trackId: string;
  }[];
  snapEdges: number[];
};

const SNAP_THRESHOLD = 1.5;
const PIXELS_PER_SECOND = 20;
const SNAP_THRESHOLD_SECONDS = 10 / PIXELS_PER_SECOND;
const MINIMUM_CLIP_SECONDS = 0.5;
const MINIMUM_CLIP_WIDTH = 2;

export function useScrollableTracks({
  items: rawItems,
  timelineDuration,
  playheadPosition,
  isPlaying,
  onItemsChange,
  onRemoveItem,
  onPlayheadPositionChange,
}: UseScrollableTracksOptions) {
  const [dragExtension, setDragExtension] = useState(0);
  const displayDuration = Math.max(1, timelineDuration + dragExtension);

  const items = useMemo(
    () =>
      rawItems.map((item) => ({
        ...item,
        startPosition: (item.startTime / displayDuration) * 100,
        width: (item.duration / displayDuration) * 100,
      })),
    [rawItems, displayDuration],
  );

  const {
    timelineRef,
    isDraggingPlayhead,
    handlePlayheadPointerDown,
    handlePlayheadPointerMove,
    handlePlayheadPointerUp,
  } = useTimelinePlayhead({
    onPositionChange: onPlayheadPositionChange,
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPlaying) return;

    const container = scrollContainerRef.current;
    const timeline = timelineRef.current;
    if (!container || !timeline) return;

    const playheadX = (playheadPosition / 100) * timeline.clientWidth;
    const viewportCenter = container.clientWidth / 2;
    const playheadInViewport = playheadX - container.scrollLeft;

    if (playheadInViewport >= viewportCenter) {
      container.scrollLeft = playheadX - viewportCenter;
    }
  }, [isPlaying, playheadPosition]);

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

    const clipBounds = event.currentTarget.getBoundingClientRect();
    const grabOffset = event.clientX - clipBounds.left;

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
    draggedItem: TimelineItem,
  ) => {
    const timeline = timelineRef.current;
    if (!timeline) {
      return {
        startPosition: draggedItem.startPosition,
        snapLine: null as number | null,
      };
    }

    const timelineBounds = timeline.getBoundingClientRect();
    const grabOffset = dragStateRef.current?.grabOffset ?? 0;
    const maxStart = Math.max(0, 100 - draggedItem.width);

    const rawStartPosition = Math.min(
      maxStart,
      Math.max(
        0,
        ((event.clientX - timelineBounds.left - grabOffset) /
          timelineBounds.width) *
          100,
      ),
    );

    let snappedStartPosition = rawStartPosition;
    let snapLine: number | null = null;
    let closestDistance = SNAP_THRESHOLD;

    for (const item of items) {
      if (item.id === draggedItem.id) continue;

      const edges = [item.startPosition, item.startPosition + item.width];

      for (const edge of edges) {
        // Dragged clip's left edge aligns with this edge.
        const leftDistance = Math.abs(rawStartPosition - edge);
        if (leftDistance <= closestDistance && edge <= maxStart) {
          closestDistance = leftDistance;
          snappedStartPosition = edge;
          snapLine = edge;
        }

        // Dragged clip's right edge aligns with this edge.
        const proposedStart = edge - draggedItem.width;
        const rightDistance = Math.abs(
          rawStartPosition + draggedItem.width - edge,
        );

        if (
          rightDistance <= closestDistance &&
          proposedStart >= 0 &&
          proposedStart <= maxStart
        ) {
          closestDistance = rightDistance;
          snappedStartPosition = proposedStart;
          snapLine = edge;
        }
      }
    }

    return {
      startPosition: snappedStartPosition,
      snapLine,
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

    const { snapLine } = calculateSnapPosition(event, draggedItem);

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

    const { startPosition } = calculateSnapPosition(event, draggedItem);

    const endPosition = startPosition + draggedItem.width;

    const hasOverlap = items.some((item) => {
      if (item.id === itemId || item.trackId !== targetTrack.id) return false;

      const itemEnd = item.startPosition + item.width;
      return startPosition < itemEnd && endPosition > item.startPosition;
    });

    setSnapLinePosition(null);
    dragStateRef.current = null;

    if (hasOverlap) return;

    const startTime = (startPosition / 100) * displayDuration;

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

  const startClipDrag = (event: DragEvent<HTMLDivElement>, itemId: string) => {
    const item = items.find((candidate) => candidate.id === itemId);

    handleDragStart(event, itemId);
    setDragExtension(Math.max(10, item?.duration ?? 0));
  };

  const endClipDrag = () => {
    handleClipDragEnd();
    setDragExtension(0);
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
      startTime: item.startTime,
      duration: item.duration,
      sourceStart: item.sourceStart ?? 0,
      trackItems: items
        .filter(
          (other) => other.id !== item.id && other.trackId === item.trackId,
        )
        .map((other) => ({
          id: other.id,
          startTime: other.startTime,
          duration: other.duration,
          trackId: other.trackId,
        })),
      snapEdges: items
        .filter((other) => other.id !== item.id)
        .flatMap((other) => [
          other.startTime,
          other.startTime + other.duration,
        ]),
    };

    setSnapLinePosition(null);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizeMove = (event: PointerEvent<HTMLButtonElement>) => {
    const state = resizeStateRef.current;
    if (!state) return;

    event.preventDefault();
    event.stopPropagation();

    const resizedItem = items.find((item) => item.id === state.itemId);
    if (!resizedItem) return;

    const movementSeconds =
      (event.clientX - state.startClientX) / PIXELS_PER_SECOND;

    const originalStart = state.startTime;
    const originalEnd = state.startTime + state.duration;

    const nearestSnapEdge = (time: number): number | null => {
      let nearest: number | null = null;
      let shortestDistance = SNAP_THRESHOLD_SECONDS;

      for (const edge of state.snapEdges) {
        const distance = Math.abs(time - edge);
        if (distance <= shortestDistance) {
          nearest = edge;
          shortestDistance = distance;
        }
      }

      return nearest;
    };

    let nextStart = originalStart;
    let nextEnd = originalEnd;
    let guideTime: number | null = null;
    const shiftedStarts = new Map<string, number>();

    if (state.edge === "right") {
      const sourceDuration = resizedItem.file.durationSeconds;

      const maximumEnd =
        resizedItem.file.type === "image"
          ? Number.POSITIVE_INFINITY
          : sourceDuration != null && Number.isFinite(sourceDuration)
            ? originalStart + Math.max(0, sourceDuration - state.sourceStart)
            : originalEnd;

      nextEnd = Math.min(
        maximumEnd,
        Math.max(
          originalStart + MINIMUM_CLIP_SECONDS,
          originalEnd + movementSeconds,
        ),
      );

      const snap = nearestSnapEdge(nextEnd);
      if (
        snap !== null &&
        snap >= originalStart + MINIMUM_CLIP_SECONDS &&
        snap <= maximumEnd
      ) {
        nextEnd = snap;
        guideTime = snap;
      }

      // Ripple only clips on this layer. Use their positions from
      // resize start so moving the handle back also moves them back.
      let occupiedUntil = nextEnd;

      for (const other of [...state.trackItems]
        .filter((item) => item.startTime >= originalStart)
        .sort((a, b) => a.startTime - b.startTime)) {
        const shiftedStart = Math.max(other.startTime, occupiedUntil);
        shiftedStarts.set(other.id, shiftedStart);
        occupiedUntil = shiftedStart + other.duration;
      }
    } else {
      const earliestSourceStart =
        resizedItem.file.type === "image"
          ? 0
          : originalStart - state.sourceStart;

      const previousClipEnd = state.trackItems
        .filter((item) => item.startTime + item.duration <= originalStart)
        .reduce(
          (latest, item) => Math.max(latest, item.startTime + item.duration),
          0,
        );

      const minimumStart = Math.max(0, earliestSourceStart, previousClipEnd);
      const maximumStart = originalEnd - MINIMUM_CLIP_SECONDS;

      nextStart = Math.max(
        minimumStart,
        Math.min(maximumStart, originalStart + movementSeconds),
      );

      const snap = nearestSnapEdge(nextStart);
      if (snap !== null && snap >= minimumStart && snap <= maximumStart) {
        nextStart = snap;
        guideTime = snap;
      }
    }

    const nextDuration = nextEnd - nextStart;
    const nextSourceStart =
      state.edge === "left"
        ? Math.max(0, state.sourceStart + nextStart - originalStart)
        : state.sourceStart;

    setSnapLinePosition(
      guideTime === null ? null : (guideTime / displayDuration) * 100,
    );

    const updates = new Map<
      string,
      { startTime: number; duration: number; trackId: string }
    >();

    updates.set(state.itemId, {
      startTime: nextStart,
      duration: nextDuration,
      trackId: resizedItem.trackId,
    });

    for (const other of state.trackItems) {
      updates.set(other.id, {
        startTime: shiftedStarts.get(other.id) ?? other.startTime,
        duration: other.duration,
        trackId: other.trackId,
      });
    }

    resizeUpdatesRef.current = updates;

    onItemsChange((currentItems) =>
      currentItems.map((item) => {
        if (item.id === state.itemId) {
          return {
            ...item,
            startTime: nextStart,
            duration: nextDuration,
            sourceStart: nextSourceStart,
          };
        }

        const original = state.trackItems.find((other) => other.id === item.id);

        if (original) {
          return {
            ...item,
            startTime: shiftedStarts.get(item.id) ?? original.startTime,
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
    scrollContainerRef,
    timelineRef,
    displayDuration,
    positionedItems: items,
    snapLinePosition,
    isDraggingPlayhead,
    startClipDrag,
    endClipDrag,
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
