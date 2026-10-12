import { tracePlayback, mediaSnapshot, labelPlaybackMedia } from "./playbackTrace";
export type PlaybackMedia = Pick<HTMLMediaElement, "playbackRate" | "currentTime" | "duration" | "readyState" | "seeking" | "paused" | "ended" | "error" | "play" | "pause" | "load"> & Partial<Pick<HTMLMediaElement, "addEventListener" | "removeEventListener">>;
type Track = {
    media: PlaybackMedia;
    offset: number;
    end: number;
    label: string;
    target: number | null;
    pending: boolean;
    generation: number;
    held: boolean;
    waiting: boolean;
    waitingAhead: number;
};
/** Owns all seeks and play/pause calls; the timeline follows decoded media. */
export class PlaybackCoordinator {
    position = 0;
    playing = false;
    suspended = false;
    error: string | null = null;
    private bufferTimeout = false;
    private buffering = true;
    private phase = "paused";
    private state(phase: string, reason: string) {
        if (phase === this.phase) return;
        this.phase = phase;
        tracePlayback("coordinator:state", { phase, reason, timeline: this.position, tracks: Array.from(this.tracks, track => ({ label: track.label, ...mediaSnapshot(track.media as HTMLMediaElement, track.offset) })) });
    }
    private tracks = new Set<Track>();
    private previous: number | null = null;
    private waitingSince: number | null = null;
    private movingSince: number | null = null;
    register(media: PlaybackMedia, offset: number, end: number, label: string) {
        labelPlaybackMedia(media as HTMLMediaElement, offset, label);
        const track: Track = { media, offset, end, label, target: Math.max(0, this.position + offset), pending: false, generation: 0, held: false, waiting: false, waitingAhead: 0 };
        this.buffering = true;
        this.pauseAll("registration");
        const waiting = () => {
            if (!media.paused && !media.seeking) {
                track.waiting = true;
                track.waitingAhead = mediaSnapshot(media as HTMLMediaElement).ahead;
            }
        };
        const canplay = () => { track.waiting = false; };
        media.addEventListener?.("waiting", waiting);
        media.addEventListener?.("canplay", canplay);
        this.tracks.add(track);
        this.waitingSince = null;
        return () => {
            media.removeEventListener?.("waiting", waiting);
            media.removeEventListener?.("canplay", canplay);
            track.generation++;
            tracePlayback("coordinator:pause", { reason: "unregister", label, timeline: this.position, ...mediaSnapshot(media as HTMLMediaElement, offset) });
            media.pause();
            media.playbackRate = 1;
            this.tracks.delete(track);
            this.waitingSince = null;
        };
    }
    seek(position: number) {
        this.position = Math.max(0, position);
        this.buffering = true;
        this.pauseAll("seek");
        tracePlayback("coordinator:seek", { timeline: this.position });
        for (const track of this.tracks)
            track.target = Math.max(0, this.position + track.offset);
        this.error = null;
        this.bufferTimeout = false;
        this.previous = null;
        this.waitingSince = null;
        this.movingSince = null;
    }
    setPlaying(playing: boolean) {
        this.playing = playing;
        this.state(playing ? "starting" : "paused", "user");
        this.previous = null;
        this.movingSince = null;
        if (!playing)
            this.pauseAll("user-pause");
    }
    setSuspended(suspended: boolean) {
        this.suspended = suspended;
        if (suspended) this.state("suspended", "hidden");
        this.previous = null;
        this.waitingSince = null;
        this.movingSince = null;
        if (suspended)
            this.pauseAll("hidden");
    }
    retry() {
        for (const track of this.tracks)
            if (track.media.error)
                track.media.load();
        this.seek(this.position);
    }
    private pauseAll(reason: string) {
        for (const track of this.tracks) {
            track.generation++;
            track.pending = false;
            if (!track.media.paused) {
                tracePlayback("coordinator:pause", { reason, label: track.label, timeline: this.position, ...mediaSnapshot(track.media as HTMLMediaElement, track.offset) });
                track.media.pause();
            }
        }
    }
    private fail(message: string) {
        this.state("error", "media-failure");
        this.error = message;
        this.bufferTimeout = false;
        this.pauseAll("error");
    }
    tick(now: number, duration: number, boundary = duration) {
        const elapsed = this.previous === null ? 0 : Math.min(.1, Math.max(0, (now - this.previous) / 1000));
        this.previous = now;
        if (this.suspended)
            return this.position;
        // Keep processing metadata and pending seeks after a buffer timeout.
        // A late response must not require a reload or leave a permanent deadlock.
        if (this.error && !this.bufferTimeout)
            return this.position;

        let ready = true;
        for (const track of this.tracks) {
            const media = track.media;
            if (media.error) {
                this.fail(`Unable to play ${track.label} (media error ${media.error.code}). Retry, or refresh if access has expired.`);
                return this.position;
            }
            if (track.target !== null && media.readyState >= 1 && !media.seeking) {
                const target = Number.isFinite(media.duration) ? Math.min(track.target, Math.max(0, media.duration - .001)) : track.target;
                track.target = null;
                if (Math.abs(media.currentTime - target) > .025) {
                    try { media.currentTime = target; }
                    catch { this.fail(`Unable to seek ${track.label}. Retry playback.`); return this.position; }
                }
            }
            const atEnd = media.ended && Math.abs(media.currentTime - track.offset - track.end) < .15;
            if (media.ended && !atEnd && track.target === null) {
                this.fail(`${track.label} ended before its timeline interval. Retry playback.`);
                return this.position;
            }
            const ranges = (media as HTMLMediaElement).buffered;
            const ahead = ranges ? mediaSnapshot(media as HTMLMediaElement).ahead : Infinity;
            const remaining = Math.max(0, Math.min(track.end - this.position, media.duration - media.currentTime));
            // HAVE_CURRENT_DATA can recover while paused without a canplay event.
            // Resume with headroom; tolerate a short decoder readiness dip while running.
            const threshold = Math.min(this.buffering ? 5 : .2, remaining);
            if (track.waiting && (media.readyState >= 3 || ahead >= track.waitingAhead + Math.min(5, remaining))) track.waiting = false;
            if (track.target !== null || media.seeking || track.waiting || (!atEnd && (media.readyState < 2 || (this.playing && ahead < threshold))))
                ready = false;
        }
        if (!ready) {
            this.buffering = true;
            if (!this.bufferTimeout) this.state("buffering", "media-not-ready");
            this.pauseAll("not-ready");
            this.movingSince = null;
            this.waitingSince ??= now;
            if (this.playing && !this.bufferTimeout && now - this.waitingSince > 30000) {
                this.fail("Media is taking too long to buffer. Retry playback or refresh to renew access.");
                this.bufferTimeout = true;
            }
            return this.position;
        }
        this.waitingSince = null;
        this.bufferTimeout = false;
        this.error = null;
        if (!this.playing)
            return this.position;
        this.buffering = false;
        this.state("running", "buffer-headroom-restored");
        const slowest = this.tracks.size ? Math.min(...Array.from(this.tracks, track => track.media.currentTime - track.offset)) : this.position;
        for (const track of this.tracks) {
            // Hold a leading decoder until the slower decoder catches up, without seeks.
            const lead = track.media.currentTime - track.offset - slowest;
            const rate = lead > .05 ? Math.max(.95, 1 - lead * .2) : 1;
            if (Math.abs(track.media.playbackRate - rate) > .005) track.media.playbackRate = rate;
            // Small drift uses rate correction. Large drift holds with distinct release threshold.
            if (lead > .35 || (track.held && lead > .06)) {
                track.held = true;
                if (!track.media.paused) {
                    tracePlayback("coordinator:pause", { reason: "drift-hold", label: track.label, timeline: this.position, ...mediaSnapshot(track.media as HTMLMediaElement, track.offset) });
                    track.media.pause();
                }
                continue;
            }
            track.held = false;
            if (!track.media.paused || track.pending || track.media.ended)
                continue;
            const generation = track.generation;
            track.pending = true;
            tracePlayback("coordinator:resume", { reason: "ready", label: track.label, timeline: this.position, ...mediaSnapshot(track.media as HTMLMediaElement, track.offset) });
            void track.media.play().then(() => {
                if (!this.tracks.has(track) || !this.playing || this.suspended || generation !== track.generation) {
                    if (!this.tracks.has(track) || !this.playing || this.suspended)
                        track.media.pause();
                }
            }).catch((error: unknown) => {
                tracePlayback("coordinator:play-rejection", { label: track.label, name: error instanceof Error ? error.name : "unknown", stale: generation !== track.generation });
                if (generation !== track.generation || !this.tracks.has(track))
                    return;
                if (error instanceof Error && error.name === "AbortError")
                    return;
                this.fail(`Playback of ${track.label} was blocked. Press Retry to start again.`);
            }).finally(() => { if (generation === track.generation)
                track.pending = false; });
        }
        let next = this.position + elapsed;
        if (this.tracks.size)
            next = Math.min(...Array.from(this.tracks, track => track.media.currentTime - track.offset));
        next = Math.min(duration, boundary, ...Array.from(this.tracks, track => track.end), Math.max(this.position, next));
        if (next > this.position)
            this.movingSince = now;
        else {
            this.movingSince ??= now;
            if (now - this.movingSince > 30000)
                this.fail("Playback stopped advancing. Retry to resume from this position.");
        }
        this.position = next;
        if (next >= duration)
            this.setPlaying(false);
        return this.position;
    }
}
