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

import { useTimelinePlayhead } from "@/composables/useTimelinePlayhead";
import { useTimelineResize } from "@/composables/useTimelineResize";
import { useTimelineDrag } from "@/composables/useTimelineDrag";

import type { TimelineItem } from "@/types/timeline";

type UseScrollableTracksOptions = {
  items: TimelineItem[];
  timelineDuration: number;
  playheadTime: number;
  isPlaying: boolean;
  onItemsChange: Dispatch<SetStateAction<TimelineItem[]>>;
  onRemoveItem: (itemId: string) => void;
  onPlayheadTimeChange: (position: number) => void;
};

export function useScrollableTracks({
  items: rawItems,
  timelineDuration,
  playheadTime,
  isPlaying,
  onItemsChange,
  onRemoveItem,
  onPlayheadTimeChange,
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
    resizeSnapLinePosition,
    handleResizeStart,
    handleResizeMove,
    handleResizeEnd,
  } = useTimelineResize({
    items,
    displayDuration,
    onItemsChange,
  });

  const {
    timelineRef,
    isDraggingPlayhead,
    handleTimelineClick,
    handlePlayheadPointerDown,
    handlePlayheadPointerMove,
    handlePlayheadPointerUp,
  } = useTimelinePlayhead({
    duration: displayDuration,
    onTimeChange: onPlayheadTimeChange,
  });

  const {
    dragSnapLinePosition,
    startClipDrag,
    endClipDrag,
    handleDragStart,
    handleTrackDragOver,
    handleDrop,
    handleClipDragEnd,
  } = useTimelineDrag({
    items,
    displayDuration,
    timelineRef,
    onItemsChange,
    onDragExtensionChange: setDragExtension,
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPlaying) return;

    const container = scrollContainerRef.current;
    const timeline = timelineRef.current;
    if (!container || !timeline) return;

    const playheadX = (playheadTime / displayDuration) * timeline.clientWidth;
    const viewportCenter = container.clientWidth / 2;
    const playheadInViewport = playheadX - container.scrollLeft;

    if (playheadInViewport >= viewportCenter) {
      container.scrollLeft = playheadX - viewportCenter;
    }
  }, [isPlaying, playheadTime, displayDuration, timelineRef]);

  const visibleSnapLinePosition =
    resizeSnapLinePosition ??
    dragSnapLinePosition;

  const handleRemovePointerDown = (
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
  };

  const handleRemoveDragStart = (
    event: DragEvent<HTMLButtonElement>,
  ) => {
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

    displayPlayheadPosition:
      (playheadTime / displayDuration) * 100,

    positionedItems: items,

    snapLinePosition:
      visibleSnapLinePosition,

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

    handleTimelineClick,
    handlePlayheadPointerDown,
    handlePlayheadPointerMove,
    handlePlayheadPointerUp,
  };
}
