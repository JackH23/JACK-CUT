"use client";

import type { Dispatch, SetStateAction } from "react";

import type { TimelineItem } from "@/types/timeline";
import type { MediaAnimationSettings } from "@/lib/mediaAnimation";

import TimelineContent from "./timeline/TimelineContent";
import TimelineToolbar from "./timeline/TimelineToolbar";

type TimelineProps = {
  selectedItemId: string | null;
  onSelectItem: (id: string) => void;
  items: TimelineItem[];
  onItemsChange: Dispatch<SetStateAction<TimelineItem[]>>;
  onRemoveItem: (itemId: string) => void;
  onUpdateText: (itemId: string, text: string) => void;
  onUpdateAnimation: (
    itemId: string,
    settings: MediaAnimationSettings,
  ) => void;
  playheadTime: number;
  isPlaying: boolean;
  onPlayheadTimeChange: (position: number) => void;
};

export default function Timeline({
  selectedItemId,
  onSelectItem,
  items,
  onItemsChange,
  onRemoveItem,
  onUpdateText,
  onUpdateAnimation,
  playheadTime,
  isPlaying,
  onPlayheadTimeChange,
}: TimelineProps) {
  return (
    <section
      aria-label="Timeline"
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-t border-white/10 bg-[#0c0d12] text-white xl:h-[320px] xl:flex-none"
    >
      {/* Keep toolbar accessible without squeezing the tracks. */}
      <div className="min-w-0 shrink-0 overflow-x-auto overscroll-x-contain">
        <TimelineToolbar />
      </div>

      {/* Give the content the remaining available height. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden [&>*]:min-h-0 [&>*]:min-w-0 [&>*]:flex-1">
        <TimelineContent
          selectedItemId={selectedItemId}
          onSelectItem={onSelectItem}
          items={items}
          onItemsChange={onItemsChange}
          onRemoveItem={onRemoveItem}
          onUpdateText={onUpdateText}
          onUpdateAnimation={onUpdateAnimation}
          playheadTime={playheadTime}
          isPlaying={isPlaying}
          onPlayheadTimeChange={onPlayheadTimeChange}
        />
      </div>
    </section>
  );
}