"use client";

import type { Dispatch, SetStateAction } from "react";

import type { TimelineItem } from "@/types/timeline";
import TimelineContent from "./timeline/TimelineContent";
import TimelineToolbar from "./timeline/TimelineToolbar";
import type {
  MediaAnimationSettings,
} from "@/lib/mediaAnimation";

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
    <section className="flex h-[320px] shrink-0 flex-col border-t border-white/10 bg-[#0c0d12] text-white">
      <TimelineToolbar />
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
    </section>
  );
}