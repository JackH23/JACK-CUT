"use client";
import { useLayoutEffect, useMemo, useRef } from "react";
import { usePreviewPlayback } from "@/composables/usePreviewPlayback";
import type { MediaFile } from "@/lib/media";
import type { TimelineItem } from "@/types/timeline";
type Options = {
    file: MediaFile | null;
    activeItem: TimelineItem | null;
    items: TimelineItem[];
    duration: number;
    playheadTime: number;
    onPlayheadTimeChange: (position: number) => void;
};
export function usePreviewMonitor({ activeItem, items, duration, playheadTime, onPlayheadTimeChange }: Options) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const boundary = Math.min(duration, ...items.flatMap(item => [item.startTime, item.startTime + item.duration]).filter(time => time > playheadTime + .000001));
    const playback = usePreviewPlayback({ duration, playheadTime, boundary, onPlayheadTimeChange });
    const previewFile = activeItem?.type === "media" ? activeItem.file ?? null : null;
    const itemId = activeItem?.id;
    const fileId = previewFile?.id;
    const url = previewFile?.url;
    const type = previewFile?.type;
    const label = previewFile?.name ?? "video";
    const offset = (activeItem?.sourceStart ?? 0) - (activeItem?.startTime ?? 0);
    const end = (activeItem?.startTime ?? 0) + (activeItem?.duration ?? 0);
    const coordinator = playback.coordinator;
    useLayoutEffect(() => {
        if (videoRef.current && type === "video")
            return coordinator.register(videoRef.current, offset, end, label);
    }, [coordinator, itemId, fileId, url, type, offset, end, label]);
    const activeSoundItems = useMemo(() => items.filter(item => item.type === "media" && item.file?.type === "audio" && playheadTime >= item.startTime && playheadTime < item.startTime + item.duration), [items, playheadTime]);
    const activeTextItems = useMemo(() => items.filter(item => item.type === "text" && playheadTime >= item.startTime && playheadTime < item.startTime + item.duration), [items, playheadTime]);
    return { ...playback, videoRef, previewFile, previewItem: activeItem, playheadSeconds: playheadTime, activeSoundItems, activeTextItems };
}
