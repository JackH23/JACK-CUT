"use client";

import { useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { Plus } from "lucide-react";
import TrackHeader from "./track/TrackHeader";
import TimelineTracks from "./track/TimelineTracks";
import { useScrollableTracks } from "@/composables/useScrollableTracks";
import type { TimelineItem, TimelineTrack } from "@/types/timeline";
import type { MediaAnimationSettings } from "@/lib/mediaAnimation";

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
  onRemoveItem: (itemId: string) => void | Promise<void>;
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
  // Timeline item removal loading state
  const [removingItemId, setRemovingItemId] =
    useState<string | null>(null);

  const removingRef = useRef(false);

  // Remove timeline item
  const handleRemoveItem = async (itemId: string) => {
    if (removingRef.current) return;

    removingRef.current = true;
    setRemovingItemId(itemId);

    try {
      await onRemoveItem(itemId);
    } catch (error) {
      console.error(
        "Failed to remove timeline item:",
        error,
      );
    } finally {
      removingRef.current = false;
      setRemovingItemId(null);
    }
  };

  // Timeline interactions
  const {
    timelineRef,
    scrollContainerRef,
    displayDuration,
    displayPlayheadPosition,
    positionedItems,
    snapLinePosition,
    isDraggingPlayhead,
    handleClipPointerDown, handleClipPointerMove, handleClipPointerUp,
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
    handleRulerPointerDown, handleRulerPointerMove,
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
    onRemoveItem: handleRemoveItem,
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
      data-timeline-scroll
      role="region" aria-label="Timeline tracks" tabIndex={0}
      className="timeline-scroll media-scrollbar min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain"
    >
      <div className="grid min-h-full" style={{
        gridTemplateColumns: `var(--timeline-header-width) ${Math.max(1, displayDuration * 20)}px`,
        width: `calc(var(--timeline-header-width) + ${Math.max(1, displayDuration * 20)}px)`,
        minWidth: "100%",
      }}>
        <aside data-track-headers className="sticky left-0 z-[70] border-r border-white/10 bg-[#111218]">
          <div className="sticky top-0 z-[80] flex h-7 items-center justify-between border-b border-white/10 bg-[#111218] px-2 text-[10px] text-zinc-400">
            <span>TRACKS</span><Plus size={14} aria-hidden="true" />
          </div>
          {tracks.map(track => <TrackHeader key={track.id} name={track.name} color={track.color} isAudio={track.type === "audio"} />)}
          <button type="button" aria-label="Add Audio/Video Track" className="m-1 flex min-h-10 items-center gap-1 rounded bg-[#24262e] px-2 text-[10px] text-zinc-300"><Plus size={14} />Add track</button>
        </aside>
      <div
        data-timeline-canvas
        ref={timelineRef}
        style={{
          width: `${Math.max(1, displayDuration * 20)}px`,
        }}
        className="relative min-h-full"
      >
        {/* Time ruler */}
        <div
          data-timeline-ruler
          onPointerDown={handleRulerPointerDown} onPointerMove={handleRulerPointerMove}
          onClick={handleTimelineClick}
          className="sticky top-0 z-50 h-7 border-b border-white/10 bg-[#15171e] font-mono text-[10px] text-zinc-400"
        >
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
          onClipPointerDown={handleClipPointerDown} onClipPointerMove={handleClipPointerMove} onClipPointerUp={handleClipPointerUp}
          onClipDragStart={startClipDrag}
          onClipDragEnd={endClipDrag}
          onResizeStart={handleResizeStart}
          onResizeMove={handleResizeMove}
          onResizeEnd={handleResizeEnd}
          onAnimationDurationChange={handleAnimationDurationChange}
          onRemovePointerDown={handleRemovePointerDown}
          onRemoveDragStart={handleRemoveDragStart}
          onRemoveClick={handleRemoveClick}
          removingItemId={removingItemId}
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
          className={`pointer-events-none absolute bottom-0 top-0 z-[60] w-0.5 -translate-x-1/2 bg-orange-300 ${
            isDraggingPlayhead
              ? "shadow-[0_0_14px_#fdba74]"
              : "shadow-[0_0_8px_#fdba74]"
          }`}
        >
          {/* Larger touch target around the ruler handle. */}
          <div
            data-playhead-handle
            role="slider" tabIndex={0} aria-label="Timeline playhead"
            aria-valuemin={0} aria-valuemax={displayDuration} aria-valuenow={playheadTime}
            onKeyDown={event => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              onPlayheadTimeChange(Math.min(displayDuration, Math.max(0, playheadTime + (event.key === "ArrowRight" ? 1 : -1) / 30)));
            }}
            onPointerDown={handlePlayheadPointerDown}
            onPointerMove={handlePlayheadPointerMove}
            onPointerUp={handlePlayheadPointerUp}
            onPointerCancel={handlePlayheadPointerUp}
            onClick={(event) => event.stopPropagation()}
            className="pointer-events-auto sticky top-0 -ml-4 flex h-7 w-8 touch-none cursor-ew-resize items-start justify-center"
          >
            <span className="rounded-b bg-orange-300 px-1 py-0.5 text-[10px] font-bold text-black">
              ▶
            </span>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}