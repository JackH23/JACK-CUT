"use client";

import type { Dispatch, SetStateAction } from "react";

import type { TimelineItem } from "@/types/timeline";
import { Plus } from "lucide-react";
import ScrollableTracks from "./ScrollableTracks";
import TrackHeader from "./track/TrackHeader";
import { useTimeline } from "@/composables/useTimeline";

type TimelineContentProps = {
  items: TimelineItem[];
  onItemsChange: Dispatch<SetStateAction<TimelineItem[]>>;
  onRemoveItem: (itemId: string) => void;
  playheadPosition: number;
  isPlaying: boolean;
  onPlayheadPositionChange: (position: number) => void;
};

export default function TimelineContent({
  items,
  onItemsChange,
  onRemoveItem,
  playheadPosition,
  isPlaying,
  onPlayheadPositionChange,
}: TimelineContentProps) {
  const { tracks, timelineTimes, timelineDuration } = useTimeline(items);

  return (
    <div className="media-scrollbar min-h-0 flex-1 overflow-y-auto">
      <div className="flex h-full min-w-0 items-stretch">
        {/* Track headers */}
        <aside className="w-52 shrink-0 border-r border-white/10 bg-[#111218]">
          <div className="flex h-7 items-center justify-between border-b border-white/10 px-3">
            <span className="text-[10px] font-semibold text-zinc-400">
              TRACK HEADERS
            </span>

            <Plus size={14} />
          </div>

          {tracks.map((track) => (
            <TrackHeader
              key={track.id}
              name={track.name}
              color={track.color}
              isAudio={track.type === "audio"}
            />
          ))}

          <button
            type="button"
            className="m-2 mt-6 flex w-[calc(100%-1rem)] items-center justify-center gap-2 rounded bg-[#24262e] py-2 text-xs text-zinc-300 hover:bg-[#30323c]"
          >
            <Plus size={14} />
            Add Audio/Video Track
          </button>
        </aside>

        {/* Scrollable tracks */}
        <ScrollableTracks
          isPlaying={isPlaying}
          items={items}
          tracks={tracks}
          timelineTimes={timelineTimes}
          timelineDuration={timelineDuration}
          playheadPosition={playheadPosition}
          onItemsChange={onItemsChange}
          onRemoveItem={onRemoveItem}
          onPlayheadPositionChange={onPlayheadPositionChange}
        />
      </div>
    </div>
  );
}
