"use client";

import {
  useEffect,
  useState,
} from "react";

import { usePreviewMonitor } from "@/composables/usePreviewMonitor";
import { useTimelineSound } from "@/composables/useTimelineSound";
import type { TimelineItem } from "@/types/timeline";
import type { MediaFile } from "@/lib/media";

import EditableMediaOverlay from "./EditableMediaOverlay";
import EditableTextOverlay from "./EditableTextOverlay";
import { getTextAnimationStyle } from "@/lib/textAnimation";
import PreviewHeader from "./PreviewHeader";
import VideoCanvas from "./VideoCanvas";
import PlaybackControls from "./PlaybackControls";
import {
  getClipAnimationStyle,
} from "@/lib/clipAnimation";

type PreviewMonitorProps = {
  selectedItemId: string | null;
  onSelectItem: (id: string) => void;
  onUpdateMediaTransform: (id: string, values: { mediaScale: number; mediaX: number; mediaY: number }, persist?: boolean) => void;
  file: MediaFile | null;
  activeItem: TimelineItem | null;
  items: TimelineItem[];
  duration: number;
  playheadTime: number;

  onPlayheadTimeChange: (position: number) => void;
  onPlayingChange: (playing: boolean) => void;

  onUpdateText: (
    itemId: string,
    text: string,
  ) => void;

  onUpdateTextPosition: (
    itemId: string,
    x: number,
    y: number,
  ) => void;

  onUpdateTextFontSize: (
    itemId: string,
    fontSize: number,
  ) => void;
};

export default function PreviewMonitor({
  file,
  selectedItemId,
  onSelectItem,
  onUpdateMediaTransform,
  activeItem,
  items,
  duration,
  playheadTime,
  onPlayheadTimeChange,
  onPlayingChange,
  onUpdateText,
  onUpdateTextPosition,
  onUpdateTextFontSize,
}: PreviewMonitorProps) {

  const {
    videoRef,
    previewFile,
    previewItem,

    isPlaying,
    isMuted,
    currentTime,
    totalTime,
    playheadSeconds,

    activeSoundItems,
    activeTextItems,

    handleVideoLoadedMetadata,
    handlePlayPause,
    handleMuteToggle,
  } = usePreviewMonitor({
    file,
    activeItem,
    items,
    duration,
    playheadTime,
    onPlayheadTimeChange,
  });

  // Snap guide state
  const [
    showVerticalGuide,
    setShowVerticalGuide,
  ] = useState(false);

  const [
    showHorizontalGuide,
    setShowHorizontalGuide,
  ] = useState(false);

  const handleSnapGuideChange = (
    vertical: boolean,
    horizontal: boolean,
  ) => {
    setShowVerticalGuide(vertical);
    setShowHorizontalGuide(horizontal);
  };

  useEffect(() => {
    onPlayingChange(isPlaying);
  }, [isPlaying, onPlayingChange]);

  const mediaAnimationStyle =
    previewItem?.type === "media"
      ? getClipAnimationStyle({
        ...previewItem,
        preset:
          previewItem.animationPreset ??
          "none",
        amount:
          previewItem.animationAmount ??
          50,
        playheadTime:
          playheadSeconds,
        startTime:
          previewItem.startTime,
        duration:
          previewItem.duration,
      })
      : {};

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[#0b0c11] text-white">
      <PreviewHeader
        title="Program Monitor"
        colorSpace="REC.709-A"
        resolution="3840 Ã— 2160 (16:9)"
        zoomLabel="Fit to Window (48%)"
      />

      <VideoCanvas
        showVerticalGuide={showVerticalGuide}
        showHorizontalGuide={
          showHorizontalGuide
        }
      >
        {!previewFile && (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            Select an uploaded file to preview
          </div>
        )}

        {previewItem && previewFile && ["image", "video"].includes(previewFile.type) && (
          <EditableMediaOverlay key={previewItem.id} item={previewItem} selected={selectedItemId === previewItem.id} time={playheadSeconds} onSelect={() => onSelectItem(previewItem.id)} onTransform={onUpdateMediaTransform}>
        {previewFile?.type === "image" && (
          <img
            src={previewFile.url}
            alt={previewFile.name}
            style={mediaAnimationStyle}
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
            onLoadedMetadata={
              handleVideoLoadedMetadata
            }
            style={mediaAnimationStyle}
            className="h-full w-full object-contain"
          />
        )}

          </EditableMediaOverlay>
        )}

        {/* Editable text overlays */}
        {activeTextItems.map((item) => {
          if (
            item.type !== "text" ||
            !item.text
          ) {
            return null;
          }

          return (
            <EditableTextOverlay
              key={item.id}

              animationStyle={getTextAnimationStyle(item, playheadSeconds - item.startTime)}
              text={item.text}
              textStyle={item.textStyle}

              x={item.textX ?? 50}
              y={item.textY ?? 50}

              fontSize={item.fontSize}
              fontWeight={item.fontWeight}
              fontFamily={item.fontFamily}
              textColor={item.textColor}

              onTextChange={(text) =>
                onUpdateText(
                  item.id,
                  text,
                )
              }

              onPositionChange={(x, y) =>
                onUpdateTextPosition(
                  item.id,
                  x,
                  y,
                )
              }

              onFontSizeChange={(fontSize) =>
                onUpdateTextFontSize(
                  item.id,
                  fontSize,
                )
              }

              onSnapGuideChange={
                handleSnapGuideChange
              }
            />
          );
        })}

        {previewFile && (
          <span className="pointer-events-none absolute bottom-3 right-3 rounded bg-black/70 px-2 py-1 text-xs">
            {previewFile.name}
          </span>
        )}
      </VideoCanvas>

      {activeSoundItems.map((item) => (
        <TimelineSound
          key={item.id}
          item={item}
          playheadSeconds={
            playheadSeconds
          }
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
  const { audioRef } =
    useTimelineSound({
      item,
      playheadSeconds,
      isPlaying,
    });

  if (
    item.type !== "media" ||
    !item.file ||
    item.file.type !== "audio"
  ) {
    return null;
  }

  return (
    <audio
      ref={audioRef}
      src={item.file.url}
      muted={isMuted}
      preload="auto"
    />
  );
}