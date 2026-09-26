"use client";

import type { Dispatch, SetStateAction } from "react";

import type { TimelineItem } from "@/types/timeline";
import TimelineContent from "./timeline/TimelineContent";
import TimelineToolbar from "./timeline/TimelineToolbar";

type TimelineProps = {
  items: TimelineItem[];
  onItemsChange: Dispatch<SetStateAction<TimelineItem[]>>;
  onRemoveItem: (itemId: string) => void;
  playheadPosition: number;
  onPlayheadPositionChange: (position: number) => void;
};

export default function Timeline({
  items,
  onItemsChange,
  onRemoveItem,
  playheadPosition,
  onPlayheadPositionChange,
}: TimelineProps) {
  return (
    <section className="flex h-[320px] shrink-0 flex-col border-t border-white/10 bg-[#0c0d12] text-white">
      <TimelineToolbar />
      <TimelineContent
        items={items}
        onItemsChange={onItemsChange}
        onRemoveItem={onRemoveItem}
        playheadPosition={playheadPosition}
        onPlayheadPositionChange={onPlayheadPositionChange}
      />
    </section>
  );
}