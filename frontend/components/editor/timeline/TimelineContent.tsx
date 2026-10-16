"use client";

import type { Dispatch, SetStateAction } from "react";

import type { TimelineItem } from "@/types/timeline";
import type { MediaAnimationSettings } from "@/lib/mediaAnimation";

import { useTimeline } from "@/composables/useTimeline";

import ScrollableTracks from "./ScrollableTracks";

type TimelineContentProps = {
  selectedItemId: string | null;
  onSelectItem: (id: string) => void;
  items: TimelineItem[];
  onItemsChange: Dispatch<SetStateAction<TimelineItem[]>>;
  onRemoveItem: (itemId: string) => void;

  onUpdateText: (
    itemId: string,
    text: string,
  ) => void;

  onUpdateAnimation: (
    itemId: string,
    settings: MediaAnimationSettings,
  ) => void;

  playheadTime: number;
  isPlaying: boolean;
  onPlayheadTimeChange: (position: number) => void;
};

export default function TimelineContent({
  selectedItemId,
  onSelectItem,
  items,
  onItemsChange,
  onUpdateAnimation,
  onRemoveItem,
  onUpdateText,
  playheadTime,
  isPlaying,
  onPlayheadTimeChange,
}: TimelineContentProps) {
  const {
    tracks,
    timelineTimes,
    timelineDuration,
  } = useTimeline(items);

  return (
    <ScrollableTracks
      selectedItemId={selectedItemId} onSelectItem={onSelectItem}
      isPlaying={isPlaying} items={items} tracks={tracks}
      timelineTimes={timelineTimes} timelineDuration={timelineDuration}
      playheadTime={playheadTime} onItemsChange={onItemsChange}
      onRemoveItem={onRemoveItem} onUpdateText={onUpdateText}
      onUpdateAnimation={onUpdateAnimation}
      onPlayheadTimeChange={onPlayheadTimeChange}
    />
  );
}
