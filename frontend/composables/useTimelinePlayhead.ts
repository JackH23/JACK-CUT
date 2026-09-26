"use client";

import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

type UseTimelinePlayheadOptions = {
  onPositionChange: (position: number) => void;
};

export function useTimelinePlayhead({
  onPositionChange,
}: UseTimelinePlayheadOptions) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] =
    useState(false);

  const updatePlayheadPosition = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const timeline = timelineRef.current;

    if (!timeline) return;

    const bounds = timeline.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;

    const position = Math.min(
      100,
      Math.max(0, (pointerX / bounds.width) * 100),
    );

    onPositionChange(position);
  };

  const handlePlayheadPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    setIsDraggingPlayhead(true);
    updatePlayheadPosition(event);
  };

  const handlePlayheadPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!isDraggingPlayhead) return;

    updatePlayheadPosition(event);
  };

  const handlePlayheadPointerUp = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setIsDraggingPlayhead(false);
  };

  return {
    timelineRef,
    isDraggingPlayhead,
    handlePlayheadPointerDown,
    handlePlayheadPointerMove,
    handlePlayheadPointerUp,
  };
}