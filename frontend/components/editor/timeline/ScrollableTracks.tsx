"use client";

import type { Dispatch, SetStateAction } from "react";
import TimelineTracks from "./track/TimelineTracks";
import { useScrollableTracks } from "@/composables/useScrollableTracks";
import type { TimelineItem, TimelineTrack } from "@/types/timeline";
import type {
  MediaAnimationSettings,
} from "@/lib/mediaAnimation";

type ScrollableTracksProps = {
  selectedItemId: string | null;
  onSelectItem: (id: string) => void;
  onUpdateAnimation: (
    itemId: string,
    settings: MediaAnimationSettings,
  ) => void;
  items: TimelineItem[];
  tracks: TimelineTrack[];
  timelineTimes: string[];
  timelineDuration: number;
  playheadTime: number;
  isPlaying: boolean; // add
  onItemsChange: Dispatch<SetStateAction<TimelineItem[]>>;
  onRemoveItem: (itemId: string) => void;
  onUpdateText: (itemId: string, text: string) => void;
  onPlayheadTimeChange: (position: number) => void;
};

export default function ScrollableTracks({
  selectedItemId,
  onSelectItem,
  items,
  tracks,
  timelineTimes,
  timelineDuration,
  playheadTime,
  onUpdateAnimation,
  isPlaying,
  onItemsChange,
  onRemoveItem,
  onUpdateText,
  onPlayheadTimeChange,
}: ScrollableTracksProps) {

  const {
    timelineRef,
    scrollContainerRef,
    displayDuration,
    displayPlayheadPosition,
    positionedItems,
    snapLinePosition,
    isDraggingPlayhead,
    startClipDrag,
    endClipDrag,
    handleTrackDragOver,
    handleDrop,
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
  } = useScrollableTracks({
    items,
    timelineDuration,
    playheadTime,
    isPlaying,
    onItemsChange,
    onRemoveItem,
    onPlayheadTimeChange,
  });

  const handleAnimationDurationChange = (
    itemId: string,
    phase: "in" | "out",
    duration: number,
    persist: boolean,
  ) => {
    const key =
      phase === "in"
        ? "animationInDuration"
        : "animationOutDuration";

    if (!persist) {
      onItemsChange((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
              ...item,
              [key]: duration,
            }
            : item,
        ),
      );

      return;
    }

    onUpdateAnimation(itemId, {
      [key]: duration,
    });
  };

  return (
    <div
      ref={scrollContainerRef}
      className="min-w-0 flex-1 self-stretch overflow-x-auto"
    >
      <div
        ref={timelineRef}
        onClick={handleTimelineClick}
        style={{ width: `${displayDuration * 20}px` }}
        className="relative min-h-full"
      >
        {/* Time ruler */}
        <div className="sticky top-0 z-20 h-7 border-b border-white/10 bg-[#15171e] font-mono text-[10px] text-zinc-400">
          {timelineTimes.map((time, index) => (
            <div
              key={time}
              style={{ left: `${index * 30 * 20}px` }}
              className="absolute top-0 h-7 border-l border-white/10 px-2 pt-1"
            >
              {time}
            </div>
          ))}
        </div>

        {/* Default and user-created tracks */}
        <TimelineTracks
          selectedItemId={selectedItemId}
          onSelectItem={onSelectItem}
          items={positionedItems}
          tracks={tracks}
          onUpdateText={onUpdateText}
          onTrackDragOver={handleTrackDragOver}
          onTrackDrop={handleDrop}
          onClipDragStart={startClipDrag}
          onClipDragEnd={endClipDrag}
          onResizeStart={handleResizeStart}
          onResizeMove={handleResizeMove}
          onResizeEnd={handleResizeEnd}
          onAnimationDurationChange={
            handleAnimationDurationChange
          }
          onRemovePointerDown={handleRemovePointerDown}
          onRemoveDragStart={handleRemoveDragStart}
          onRemoveClick={handleRemoveClick}
        />

        {/* Clip snap line */}
        {snapLinePosition !== null && (
          <div
            style={{ left: `${snapLinePosition}%` }}
            className="pointer-events-none absolute bottom-0 top-7 z-40 w-0.5 -translate-x-1/2 bg-cyan-300 shadow-[0_0_10px_#67e8f9]"
          >
            <div className="absolute -left-1 top-0 h-2 w-2 rotate-45 bg-cyan-300" />
          </div>
        )}

        {/* Draggable playhead */}
        <div
          style={{ left: `${displayPlayheadPosition}%` }}
          onPointerDown={handlePlayheadPointerDown}
          onPointerMove={handlePlayheadPointerMove}
          onPointerUp={handlePlayheadPointerUp}
          onPointerCancel={handlePlayheadPointerUp}
          className={`absolute bottom-0 top-0 z-30 w-0.5 -translate-x-1/2 touch-none cursor-ew-resize bg-orange-300 shadow-[0_0_8px_#fdba74] ${isDraggingPlayhead ? "shadow-[0_0_14px_#fdba74]" : ""
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