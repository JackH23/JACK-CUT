"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { installPlaybackTrace } from "@/lib/playbackTrace";
import { PlaybackCoordinator } from "@/lib/playbackCoordinator";
type Options = {
    duration: number;
    playheadTime: number;
    boundary?: number;
    onPlayheadTimeChange: (position: number) => void;
};
function formatTime(value: number) {
    const time = Math.max(0, value);
    return [Math.floor(time / 3600), Math.floor(time % 3600 / 60), Math.floor(time % 60), Math.floor(time % 1 * 30)].map(part => String(part).padStart(2, "0")).join(":");
}
export function usePreviewPlayback({ duration, playheadTime, boundary = duration, onPlayheadTimeChange }: Options) {
    const [coordinator] = useState(() => { const controller = new PlaybackCoordinator(); controller.seek(playheadTime); return controller; });
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [playbackError, setPlaybackError] = useState<string | null>(null);
    const latest = useRef({ duration, boundary, onPlayheadTimeChange });
    const published = useRef(playheadTime);
    useLayoutEffect(() => { latest.current = { duration, boundary, onPlayheadTimeChange }; }, [duration, boundary, onPlayheadTimeChange]);
    useLayoutEffect(() => {
        if (playheadTime !== published.current)
            coordinator.seek(playheadTime);
        published.current = playheadTime;
    }, [coordinator, playheadTime]);
    useEffect(() => {
        const cleanupTrace = installPlaybackTrace(() => coordinator.position);
        let frame = 0;
        const visibility = () => coordinator.setSuspended(document.hidden);
        document.addEventListener("visibilitychange", visibility);
        visibility();
        const tick = (now: number) => {
            const next = coordinator.tick(now, latest.current.duration, latest.current.boundary);
            if (next !== published.current) {
                published.current = next;
                latest.current.onPlayheadTimeChange(next);
            }
            setPlaybackError(current => current === coordinator.error ? current : coordinator.error);
            setIsPlaying(current => current === coordinator.playing ? current : coordinator.playing);
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => { cleanupTrace(); cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", visibility); coordinator.setPlaying(false); };
    }, [coordinator]);
    const handlePlayPause = useCallback(() => {
        if (duration <= 0)
            return;
        if (!coordinator.playing && coordinator.position >= duration) {
            coordinator.seek(0);
            published.current = 0;
            latest.current.onPlayheadTimeChange(0);
        }
        coordinator.setPlaying(!coordinator.playing);
        setIsPlaying(coordinator.playing);
    }, [coordinator, duration]);
    const handleRetry = useCallback(() => { coordinator.retry(); coordinator.setPlaying(true); setIsPlaying(true); setPlaybackError(null); }, [coordinator]);
    return { coordinator, isPlaying, isMuted, playbackError, handleRetry, currentTime: formatTime(playheadTime), totalTime: formatTime(duration), handlePlayPause, handleMuteToggle: () => setIsMuted(current => !current) };
}
