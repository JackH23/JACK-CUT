"use client";

import {
  Maximize,
  Pause,
  Play,
  Redo2,
  Settings2,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Volume2,
  VolumeX,
} from "lucide-react";

type PlaybackControlsProps = {
  isPlaying: boolean;
  isMuted: boolean;
  currentTime?: string;
  totalTime?: string;
  volume?: number;
  volumeDb?: string;
  isLooping?: boolean;
  onPlayPause: () => void;
  onMuteToggle: () => void;
  onVolumeChange?: (volume: number) => void;
  onJumpToBeginning?: () => void;
  onPreviousFrame?: () => void;
  onNextFrame?: () => void;
  onJumpToEnd?: () => void;
  onLoopToggle?: () => void;
  onExpand?: () => void;
  onSettings?: () => void;
};

export default function PlaybackControls({
  isPlaying,
  isMuted,
  currentTime = "00:00:00:00",
  totalTime = "00:00:00:00",
  volume = 70,
  volumeDb = "-6",
  isLooping = false,
  onPlayPause,
  onMuteToggle,
  onVolumeChange,
  onJumpToBeginning,
  onPreviousFrame,
  onNextFrame,
  onJumpToEnd,
  onLoopToggle,
  onExpand,
  onSettings,
}: PlaybackControlsProps) {
  return (
    <footer className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-3 border-t border-white/10 bg-[#15171e] px-4">
      <div className="flex items-center gap-2 justify-self-start font-mono text-xs">
        <span className="text-purple-300">{currentTime}</span>

        <span className="hidden text-zinc-500 2xl:inline">/</span>

        <span className="hidden 2xl:inline">{totalTime}</span>

        <button
          type="button"
          aria-label="Expand preview"
          onClick={onExpand}
          className="ml-1 rounded p-1 hover:bg-white/10"
        >
          <Maximize size={16} />
        </button>
      </div>

      <div className="flex items-center gap-1 justify-self-center">
        <button
          type="button"
          aria-label="Jump to beginning"
          onClick={onJumpToBeginning}
          className="rounded p-2 hover:bg-white/10"
        >
          <SkipBack size={18} />
        </button>

        <button
          type="button"
          aria-label="Previous frame"
          onClick={onPreviousFrame}
          className="rounded p-2 hover:bg-white/10"
        >
          <StepBack size={18} />
        </button>

        <button
          type="button"
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={onPlayPause}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-purple-300 text-purple-950 transition hover:scale-105 hover:bg-purple-200"
        >
          {isPlaying ? (
            <Pause size={21} fill="currentColor" />
          ) : (
            <Play size={21} fill="currentColor" className="ml-0.5" />
          )}
        </button>

        <button
          type="button"
          aria-label="Next frame"
          onClick={onNextFrame}
          className="rounded p-2 hover:bg-white/10"
        >
          <StepForward size={18} />
        </button>

        <button
          type="button"
          aria-label="Jump to end"
          onClick={onJumpToEnd}
          className="rounded p-2 hover:bg-white/10"
        >
          <SkipForward size={18} />
        </button>

        <button
          type="button"
          aria-label="Loop playback"
          aria-pressed={isLooping}
          onClick={onLoopToggle}
          className={`rounded p-2 hover:bg-white/10 ${
            isLooping ? "text-purple-300" : "text-zinc-300"
          }`}
        >
          <Redo2 size={18} />
        </button>
      </div>

      <div className="flex items-center gap-2 justify-self-end">
        <button
          type="button"
          aria-label={isMuted ? "Unmute" : "Mute"}
          onClick={onMuteToggle}
          className="rounded p-1 text-sky-400 hover:bg-white/10"
        >
          {isMuted ? <VolumeX size={19} /> : <Volume2 size={19} />}
        </button>

        <div className="hidden items-center gap-2 2xl:flex">
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(event) =>
              onVolumeChange?.(Number(event.target.value))
            }
            aria-label="Preview volume"
            className="h-1 w-20 accent-purple-400"
          />

          <span className="text-xs text-sky-400">
            {isMuted ? "-∞" : volumeDb} dB
          </span>
        </div>

        <button
          type="button"
          aria-label="Preview settings"
          onClick={onSettings}
          className="rounded p-2 hover:bg-white/10"
        >
          <Settings2 size={18} />
        </button>
      </div>
    </footer>
  );
}