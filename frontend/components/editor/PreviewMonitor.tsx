"use client";

import { useEffect } from "react";
import { usePreviewMonitor } from "@/composables/usePreviewMonitor";
import { useTimelineSound } from "@/composables/useTimelineSound";
import type { TimelineItem } from "@/types/timeline";
import type { MediaFile } from "@/lib/media";

import PreviewHeader from "./PreviewHeader";
import VideoCanvas from "./VideoCanvas";
import PlaybackControls from "./PlaybackControls";

type PreviewMonitorProps = {
  file: MediaFile | null;
  activeItem: TimelineItem | null;
  items: TimelineItem[];
  duration: number;
  playheadPosition: number;
  onPlayheadPositionChange: (position: number) => void;
  onPlayingChange: (playing: boolean) => void;
};

export default function PreviewMonitor({
  file,
  activeItem,
  items,
  duration,
  playheadPosition,
  onPlayheadPositionChange,
  onPlayingChange,
}: PreviewMonitorProps) {
  const {
    videoRef,
    previewFile,
    isPlaying,
    isMuted,
    currentTime,
    totalTime,
    playheadSeconds,
    activeSoundItems,
    handleVideoLoadedMetadata,
    handlePlayPause,
    handleMuteToggle,
  } = usePreviewMonitor({
    file,
    activeItem,
    items,
    duration,
    playheadPosition,
    onPlayheadPositionChange,
  });

  useEffect(() => {
    onPlayingChange(isPlaying);
  }, [isPlaying, onPlayingChange]);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[#0b0c11] text-white">
      <PreviewHeader
        title="Program Monitor"
        colorSpace="REC.709-A"
        resolution="3840 × 2160 (16:9)"
        zoomLabel="Fit to Window (48%)"
      />

      <VideoCanvas>
        {!previewFile && (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            Select an uploaded file to preview
          </div>
        )}

        {previewFile?.type === "image" && (
          <img
            src={previewFile.url}
            alt={previewFile.name}
            className="h-full w-full object-contain"
          />
        )}

        {previewFile?.type === "video" && (
          <video
            ref={videoRef}
            key={previewFile.id}
            src={previewFile.url}
            muted={isMuted}
            playsInline
            onLoadedMetadata={handleVideoLoadedMetadata}
            className="h-full w-full object-contain"
          />
        )}

        {previewFile && (
          <span className="absolute bottom-3 right-3 rounded bg-black/70 px-2 py-1 text-xs">
            {previewFile.name}
          </span>
        )}
      </VideoCanvas>

      {activeSoundItems.map((item) => (
        <TimelineSound
          key={item.id}
          item={item}
          playheadSeconds={playheadSeconds}
          isPlaying={isPlaying}
          isMuted={isMuted}
        />
      ))}

      <PlaybackControls
        isPlaying={isPlaying}
        isMuted={isMuted}
        currentTime={currentTime}
        totalTime={totalTime}
        volume={70}
        volumeDb="-6"
        onPlayPause={handlePlayPause}
        onMuteToggle={handleMuteToggle}
      />
    </section>
  );
}

type TimelineSoundProps = {
  item: TimelineItem;
  playheadSeconds: number;
  isPlaying: boolean;
  isMuted: boolean;
};

function TimelineSound({
  item,
  playheadSeconds,
  isPlaying,
  isMuted,
}: TimelineSoundProps) {
  const { audioRef } = useTimelineSound({
    item,
    playheadSeconds,
    isPlaying,
  });

  return (
    <audio ref={audioRef} src={item.file.url} muted={isMuted} preload="auto" />
  );
}
