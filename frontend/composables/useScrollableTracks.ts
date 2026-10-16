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

import { useTimelinePointerMove } from "@/composables/useTimelinePointerMove";
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
    handleRulerPointerDown, handleRulerPointerMove,
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

  const pointerMove = useTimelinePointerMove({ items, displayDuration, timelineRef, onItemsChange, onDragExtensionChange: setDragExtension });
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPlaying) return;

    const container = scrollContainerRef.current;
    const timeline = timelineRef.current;
    if (!container || !timeline) return;

    const playheadX = (playheadTime / displayDuration) * timeline.clientWidth;
    // The shared scroller includes a sticky header column. Coordinates still
    // come from the exact 20px/s canvas, never from the whole grid width.
    const headerWidth = timeline.getBoundingClientRect().left - container.getBoundingClientRect().left + container.scrollLeft;
    const viewportCenter = (container.clientWidth - headerWidth) / 2;
    const playheadInViewport = playheadX - container.scrollLeft;

    if (playheadInViewport >= viewportCenter) {
      container.scrollLeft = playheadX - viewportCenter;
    }
  }, [isPlaying, playheadTime, displayDuration, timelineRef]);

  const visibleSnapLinePosition =
    pointerMove.pointerSnapLine ?? resizeSnapLinePosition ??
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
    ...pointerMove,
    handleRulerPointerDown, handleRulerPointerMove,
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
