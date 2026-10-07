"use client";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { TimelineItem } from '@/types/timeline';
import { timelineService } from '@/services/timelineService';
import { animationFields, getMediaAnimationSettings, type MediaAnimationSettings } from '@/lib/mediaAnimation';
export function useAnimationEditor({ timelineItems, setTimelineItems }: {
    timelineItems: TimelineItem[];
    setTimelineItems: Dispatch<SetStateAction<TimelineItem[]>>;
}) {
    const items = useRef(timelineItems);
    useEffect(() => { items.current = timelineItems; }, [timelineItems]);
    const [animationError, setAnimationError] = useState<string | null>(null);
    const confirmed = useRef(new Map<string, MediaAnimationSettings>());
    const queues = useRef(new Map<string, Promise<void>>());
    const revisions = useRef(new Map<string, number>());
    const handleUpdateAnimation = useCallback((id: string, patch: MediaAnimationSettings) => {
        const item = items.current.find(x => x.id === id);
        if (!item)
            return;
        const { legacy, ...base } = getMediaAnimationSettings(item);
        void legacy;
        if (!confirmed.current.has(id))
            confirmed.current.set(id, base);
        setAnimationError(null);
        const next = { ...base, ...patch };
        for (const phase of ['In', 'Out'] as const) {
            const key = `animation${phase}Duration` as const;
            next[key] = Math.max(0, Math.min(item.duration, next[key] ?? 0));
        }
        const revision = (revisions.current.get(id) ?? 0) + 1;
        revisions.current.set(id, revision);
        items.current = items.current.map(x => x.id === id ? { ...x, ...next } : x);
        setTimelineItems(current => current.map(x => x.id === id ? { ...x, ...next } : x));
        const request = (queues.current.get(id) ?? Promise.resolve()).then(async () => {
            try {
                const { item: saved } = await timelineService.updateItem(id, next);
                const canonical = Object.fromEntries(animationFields.map(key => [key, saved[key.replace(/[A-Z]/g, c => '_' + c.toLowerCase()) as keyof typeof saved]]));
                confirmed.current.set(id, canonical);
                if (revisions.current.get(id) === revision) {
                    setTimelineItems(current => current.map(x => x.id === id ? { ...x, ...canonical } : x));
                }
            }
            catch (error) {
                if (revisions.current.get(id) === revision) {
                    setTimelineItems(current => current.map(x => x.id === id ? { ...x, ...confirmed.current.get(id) } : x));
                    setAnimationError(error instanceof Error ? error.message : 'Could not save clip animation.');
                }
                console.error('Could not save clip animation:', error);
            }
        });
        queues.current.set(id, request);
    }, [setTimelineItems]);
    return { handleUpdateAnimation, animationError };
}
