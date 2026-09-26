"use client";

import { useEffect, useRef } from "react";
import type { TimelineItem } from "@/types/timeline";

import { usePreviewPlayback } from "@/composables/usePreviewPlayback";
import PreviewHeader from "./PreviewHeader";
import VideoCanvas from "./VideoCanvas";
import PlaybackControls from "./PlaybackControls";
import type { MediaFile } from "@/lib/media";

type PreviewMonitorProps = {
  file: MediaFile | null;
  activeItem: TimelineItem | null;
  duration: number;
  playheadPosition: number;
  onPlayheadPositionChange: (position: number) => void;
};

export default function PreviewMonitor({
  file,
  activeItem,
  duration,
  playheadPosition,
  onPlayheadPositionChange,
}: PreviewMonitorProps) {
  const {
    isPlaying,
    isMuted,
    currentTime,
    totalTime,
    handlePlayPause,
    handleMuteToggle,
  } = usePreviewPlayback({
    duration,
    playheadPosition,
    onPlayheadPositionChange,
  });

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeItem || file?.type !== "video") return;

    // usePreviewPlayback defines 100% as 210 seconds.
    const playheadSeconds = (playheadPosition / 100) * 210;

    const sourceTime = Math.max(
      0,
      playheadSeconds - activeItem.startTime + activeItem.sourceStart,
    );

    if (Math.abs(video.currentTime - sourceTime) > 0.15) {
      video.currentTime = sourceTime;
    }
  }, [activeItem, file, playheadPosition]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      void video.play().catch(console.error);
    } else {
      video.pause();
    }
  }, [isPlaying, file]);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[#0b0c11] text-white">
      {/* Preview header */}
      <PreviewHeader
        title="Program Monitor"
        colorSpace="REC.709-A"
        resolution="3840 × 2160 (16:9)"
        zoomLabel="Fit to Window (48%)"
      />

      {/* Video canvas */}
      <VideoCanvas>
        {!file && (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            Select an uploaded file to preview
          </div>
        )}

        {file?.type === "image" && (
          <img
            src={file.url}
            alt={file.name}
            className="h-full w-full object-contain"
          />
        )}

        {file?.type === "video" && (
          <video
            ref={videoRef}
            key={file.id}
            src={file.url}
            muted={isMuted}
            playsInline
            className="h-full w-full object-contain"
          />
        )}

        {file?.type === "audio" && (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <p className="text-sm text-white">{file.name}</p>

            <audio key={file.id} src={file.url} controls muted={isMuted} />
          </div>
        )}

        {file && (
          <span className="absolute bottom-3 right-3 rounded bg-black/70 px-2 py-1 text-xs">
            {file.name}
          </span>
        )}
      </VideoCanvas>

      {/* Playback controls */}
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
