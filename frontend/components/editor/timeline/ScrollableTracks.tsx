"use client";

import type { Dispatch, SetStateAction } from "react";
import TimelineTracks from "./track/TimelineTracks";
import { useScrollableTracks } from "@/composables/useScrollableTracks";
import type { TimelineItem, TimelineTrack } from "@/types/timeline";

type ScrollableTracksProps = {
  items: TimelineItem[];
  tracks: TimelineTrack[];
  timelineTimes: string[];
  playheadPosition: number;
  onItemsChange: Dispatch<SetStateAction<TimelineItem[]>>;
  onRemoveItem: (itemId: string) => void;
  onPlayheadPositionChange: (position: number) => void;
};

export default function ScrollableTracks({
  items,
  tracks,
  timelineTimes,
  playheadPosition,
  onItemsChange,
  onRemoveItem,
  onPlayheadPositionChange,
}: ScrollableTracksProps) {
  const {
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
  } = useScrollableTracks({
    items,
    onItemsChange,
    onRemoveItem,
    onPlayheadPositionChange,
  });

  return (
    <div className="min-w-0 flex-1 self-stretch overflow-x-auto">
      <div ref={timelineRef} className="relative min-h-full w-[4200px]">
        {/* Time ruler */}
        <div className="sticky top-0 z-20 flex h-7 border-b border-white/10 bg-[#15171e] font-mono text-[10px] text-zinc-400">
          {timelineTimes.map((time) => (
            <div
              key={time}
              className="relative min-w-40 flex-1 border-l border-white/10 px-2 pt-1"
            >
              {time}
            </div>
          ))}
        </div>

        {/* Default and user-created tracks */}
        <TimelineTracks
          items={items}
          tracks={tracks}
          onTrackDragOver={handleTrackDragOver}
          onTrackDrop={handleDrop}
          onClipDragStart={handleDragStart}
          onClipDragEnd={handleClipDragEnd}
          onResizeStart={handleResizeStart}
          onResizeMove={handleResizeMove}
          onResizeEnd={handleResizeEnd}
          onRemovePointerDown={handleRemovePointerDown}
          onRemoveDragStart={handleRemoveDragStart}
          onRemoveClick={handleRemoveClick}
        />

        {/* Clip snap line */}
        {snapLinePosition !== null && (
          <div
            style={{
              left: `${snapLinePosition}%`,
            }}
            className="pointer-events-none absolute bottom-0 top-7 z-40 w-0.5 -translate-x-1/2 bg-cyan-300 shadow-[0_0_10px_#67e8f9]"
          >
            <div className="absolute -left-1 top-0 h-2 w-2 rotate-45 bg-cyan-300" />
          </div>
        )}

        {/* Draggable playhead */}
        <div
          style={{ left: `${playheadPosition}%` }}
          onPointerDown={handlePlayheadPointerDown}
          onPointerMove={handlePlayheadPointerMove}
          onPointerUp={handlePlayheadPointerUp}
          onPointerCancel={handlePlayheadPointerUp}
          className={`absolute bottom-0 top-0 z-30 w-0.5 -translate-x-1/2 touch-none cursor-ew-resize bg-orange-300 shadow-[0_0_8px_#fdba74] ${
            isDraggingPlayhead ? "shadow-[0_0_14px_#fdba74]" : ""
          }`}
        >
          <div className="absolute -left-2 top-0 rounded-b bg-orange-300 px-1 py-0.5 text-[10px] font-bold text-black">
            ▶
          </div>

          <div className="absolute -left-3 bottom-0 top-0 w-6" />
        </div>
      </div>
    </div>
  );
}
