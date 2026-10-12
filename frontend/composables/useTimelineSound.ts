"use client";
import { useLayoutEffect, useRef } from "react";
import type { PlaybackCoordinator } from "@/lib/playbackCoordinator";
import type { TimelineItem } from "@/types/timeline";
export function useTimelineSound({ item, coordinator }: {
    item: TimelineItem;
    coordinator: PlaybackCoordinator;
}) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const offset = (item.sourceStart ?? 0) - item.startTime;
    const end = item.startTime + item.duration;
    const url = item.file?.url;
    const label = item.file?.name ?? "audio";
    useLayoutEffect(() => {
        if (audioRef.current)
            return coordinator.register(audioRef.current, offset, end, label);
    }, [coordinator, item.id, offset, end, url, label]);
    return { audioRef };
}
