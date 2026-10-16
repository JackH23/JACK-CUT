"use client";

import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

type UseTimelinePlayheadOptions = {
  duration: number;
  onTimeChange: (time: number) => void;
};

export function useTimelinePlayhead({
  duration,
  onTimeChange,
}: UseTimelinePlayheadOptions) {
  const gesture = useRef<{x:number;y:number;moved:boolean}|null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] =
    useState(false);

  const updatePlayheadTime = (
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    const timeline = timelineRef.current;

    if (!timeline) return;

    const bounds = timeline.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;

    if (bounds.width <= 0) return;

    const time = Math.min(
      duration,
      Math.max(0, (pointerX / bounds.width) * duration),
    );

    onTimeChange(time);
  };

  const handleTimelineClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (gesture.current?.moved) return;
    // Keep clip editing, dragging and controls separate from background seeking.
    if ((event.target as HTMLElement).closest("[draggable], button")) return;
    updatePlayheadTime(event);
  };

  const handlePlayheadPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    setIsDraggingPlayhead(true);
    updatePlayheadTime(event);
  };

  const handlePlayheadPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!isDraggingPlayhead) return;

    updatePlayheadTime(event);
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
    handleRulerPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => { gesture.current={x:event.clientX,y:event.clientY,moved:false}; },
    handleRulerPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => { const start=gesture.current;if(start&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>6)start.moved=true; },
    timelineRef,
    handleTimelineClick,
    isDraggingPlayhead,
    handlePlayheadPointerDown,
    handlePlayheadPointerMove,
    handlePlayheadPointerUp,
  };
}