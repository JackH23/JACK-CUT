"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import { usePreviewMonitor } from "@/composables/usePreviewMonitor";
import type { PlaybackCoordinator } from "@/lib/playbackCoordinator";
import { useTimelineSound } from "@/composables/useTimelineSound";
import type { TimelineItem } from "@/types/timeline";
import { getMediaEffectFilter } from "@/lib/mediaEffect";
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
    imageRef,
    previewFile,
    previewItem,

    isPlaying,
    isMuted,
    isBuffering, volume, setVolume, isLooping, handleSeek, handleStep, handleLoopToggle,
    currentTime,
    totalTime,
    playheadSeconds,

    activeTextItems,

    coordinator,
    activeSoundItems,
    playbackError,
    handleRetry,
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

  const monitorRef = useRef<HTMLElement>(null);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const expand = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await monitorRef.current?.requestFullscreen();
      setFullscreenError(null);
    } catch { setFullscreenError("Fullscreen is unavailable in this browser."); }
  };
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume / 100;
  }, [volume, previewFile?.id, videoRef]);

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

  const mediaPreviewStyle = {
    ...mediaAnimationStyle,
    filter: getMediaEffectFilter(
      previewItem?.type === "media"
        ? previewItem.effectPreset
        : "none",
    ),
  };

  return (
    <section ref={monitorRef} data-preview-monitor className="flex min-w-0 flex-1 flex-col bg-[#0b0c11] text-white">
      <PreviewHeader
        title="Program Monitor"
        onFullscreenClick={expand}
        colorSpace="REC.709-A"
        resolution="3840 × 2160 (16:9)"
        zoomLabel="Fit to Window (48%)"
      />

      <VideoCanvas
        showVerticalGuide={showVerticalGuide}
        showHorizontalGuide={
          showHorizontalGuide
        }
      >
        {previewItem && previewFile && ["image", "video"].includes(previewFile.type) && (
          <EditableMediaOverlay key={previewFile.id} item={previewItem} selected={selectedItemId === previewItem.id} time={playheadSeconds} onSelect={() => onSelectItem(previewItem.id)} onTransform={onUpdateMediaTransform}>
            {previewFile?.type === "image" && (
              <img
                ref={imageRef}
                src={previewFile.url}
                alt={previewFile.name}
                style={mediaPreviewStyle}
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
                preload="auto"

                style={mediaPreviewStyle}
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

      {activeSoundItems.map(item => (
        <TimelineSound key={item.id} item={item} coordinator={coordinator} isMuted={isMuted} volume={volume} />
      ))}
      {isBuffering && <div role="status" className="bg-amber-950 px-4 py-1 text-sm">Buffering preview… Playback will resume automatically.</div>}
      {fullscreenError && <div role="status">{fullscreenError}</div>}
      <input type="range" aria-label="Preview seek" min={0} max={duration} step={0.001} value={Math.min(playheadTime, duration)} onChange={event => handleSeek(Number(event.target.value))} className="w-full accent-purple-400" />
      {playbackError && (
        <div role="alert" className="flex items-center justify-between gap-2 bg-red-950 px-4 py-2 text-sm">
          <span>{playbackError}</span>
          <button type="button" onClick={handleRetry} className="rounded bg-white/20 px-3 py-1">Retry playback</button>
        </div>
      )}
      <PlaybackControls
        isPlaying={isPlaying}
        isMuted={isMuted}
        currentTime={currentTime}
        totalTime={totalTime}
        volume={volume}
        volumeDb={volume > 0 ? (20 * Math.log10(volume / 100)).toFixed(1) : "-∞"}
        onVolumeChange={setVolume}
        isLooping={isLooping}
        onLoopToggle={handleLoopToggle}
        onJumpToBeginning={() => handleSeek(0)}
        onJumpToEnd={() => handleSeek(duration)}
        onPreviousFrame={() => handleStep(-1)}
        onNextFrame={() => handleStep(1)}
        onExpand={expand}
        onPlayPause={handlePlayPause}
        onMuteToggle={handleMuteToggle}
      />
    </section>
  );
}

type TimelineSoundProps = { item: TimelineItem; coordinator: PlaybackCoordinator; isMuted: boolean; volume: number };
function TimelineSound({ item, coordinator, isMuted, volume }: TimelineSoundProps) {
  const { audioRef } = useTimelineSound({ item, coordinator });
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume / 100; }, [audioRef, volume]);
  if (item.type !== "media" || item.file?.type !== "audio") return null;
  return <audio ref={audioRef} src={item.file.url} muted={isMuted} preload="auto" />;
}
