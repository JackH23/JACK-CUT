"use client";

import type { Dispatch, SetStateAction } from "react";

import type { TimelineItem } from "@/types/timeline";
import TimelineContent from "./timeline/TimelineContent";
import TimelineToolbar from "./timeline/TimelineToolbar";

type TimelineProps = {
  items: TimelineItem[];
  onItemsChange: Dispatch<SetStateAction<TimelineItem[]>>;
  onRemoveItem: (itemId: string) => void;
  onUpdateText: (itemId: string, text: string) => void;
  playheadTime: number;
  isPlaying: boolean;
  onPlayheadTimeChange: (position: number) => void;
};

export default function Timeline({
  items,
  onItemsChange,
  onRemoveItem,
  onUpdateText,
  playheadTime,
  isPlaying,
  onPlayheadTimeChange,
}: TimelineProps) {
  return (
    <section className="flex h-[320px] shrink-0 flex-col border-t border-white/10 bg-[#0c0d12] text-white">
      <TimelineToolbar />
        <TimelineContent
          items={items}
          onItemsChange={onItemsChange}
          onRemoveItem={onRemoveItem}
          onUpdateText={onUpdateText}
          playheadTime={playheadTime}
          isPlaying={isPlaying}
          onPlayheadTimeChange={onPlayheadTimeChange}
        />
    </section>
  );
}