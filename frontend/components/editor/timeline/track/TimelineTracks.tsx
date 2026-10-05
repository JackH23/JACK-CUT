"use client";

import { Type, X } from "lucide-react";
import type {
  DragEvent,
  MouseEvent,
  PointerEvent,
} from "react";

import type {
  TimelineItem,
  TimelineTrack,
} from "@/types/timeline";

import TimelineRow from "./TimelineRow";

type ResizeEdge = "left" | "right";

type TimelineTracksProps = {
  items: TimelineItem[];
  tracks: TimelineTrack[];

  onTrackDragOver: (
    event: DragEvent<HTMLDivElement>,
    track: TimelineTrack,
  ) => void;

  onTrackDrop: (
    event: DragEvent<HTMLDivElement>,
    track: TimelineTrack,
  ) => void;

  onClipDragStart: (
    event: DragEvent<HTMLDivElement>,
    itemId: string,
  ) => void;

  onClipDragEnd: () => void;

  onResizeStart: (
    event: PointerEvent<HTMLButtonElement>,
    item: TimelineItem,
    edge: ResizeEdge,
  ) => void;

  onResizeMove: (
    event: PointerEvent<HTMLButtonElement>,
  ) => void;

  onResizeEnd: (
    event: PointerEvent<HTMLButtonElement>,
  ) => void;

  onRemovePointerDown: (
    event: PointerEvent<HTMLButtonElement>,
  ) => void;

  onRemoveDragStart: (
    event: DragEvent<HTMLButtonElement>,
  ) => void;

  onRemoveClick: (
    event: MouseEvent<HTMLButtonElement>,
    itemId: string,
  ) => void;
};

export default function TimelineTracks({
  items,
  tracks,
  onTrackDragOver,
  onTrackDrop,
  onClipDragStart,
  onClipDragEnd,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onRemovePointerDown,
  onRemoveDragStart,
  onRemoveClick,
}: TimelineTracksProps) {
  return (
    <>
      {tracks.map((track) => (
        <TimelineRow
          key={track.id}
          onDragOver={(event) =>
            onTrackDragOver(event, track)
          }
          onDrop={(event) =>
            onTrackDrop(event, track)
          }
        >
          {items
            .filter(
              (item) => item.trackId === track.id,
            )
            .map((item) => {
              const isText =
                item.type === "text";

              const file =
                item.type === "media"
                  ? item.file
                  : undefined;

              const clipName = isText
                ? item.text || "Text"
                : file?.name || "Media";

              const clipType = isText
                ? "text"
                : file?.type;

              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(event) =>
                    onClipDragStart(
                      event,
                      item.id,
                    )
                  }
                  onDragEnd={onClipDragEnd}
                  style={{
                    left: `${item.startPosition}%`,
                    width: `${item.width}%`,
                  }}
                  className={`group absolute inset-y-1 cursor-grab select-none overflow-hidden rounded border active:cursor-grabbing ${
                    clipType === "audio"
                      ? "border-cyan-600 bg-cyan-950"
                      : clipType === "text"
                        ? "border-amber-500 bg-amber-950"
                        : "border-purple-500 bg-indigo-950"
                  }`}
                >
                  {/* Left resize handle */}
                  <button
                    type="button"
                    draggable={false}
                    aria-label={`Resize start of ${clipName}`}
                    title="Resize clip start"
                    onPointerDown={(event) =>
                      onResizeStart(
                        event,
                        item,
                        "left",
                      )
                    }
                    onPointerMove={onResizeMove}
                    onPointerUp={onResizeEnd}
                    onPointerCancel={onResizeEnd}
                    onDragStart={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    className="absolute inset-y-0 left-0 z-20 w-2 touch-none cursor-ew-resize bg-purple-300/0 transition-colors hover:bg-purple-300/70"
                  />

                  {/* Right resize handle */}
                  <button
                    type="button"
                    draggable={false}
                    aria-label={`Resize end of ${clipName}`}
                    title="Resize clip end"
                    onPointerDown={(event) =>
                      onResizeStart(
                        event,
                        item,
                        "right",
                      )
                    }
                    onPointerMove={onResizeMove}
                    onPointerUp={onResizeEnd}
                    onPointerCancel={onResizeEnd}
                    onDragStart={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    className="absolute inset-y-0 right-0 z-20 w-2 touch-none cursor-ew-resize bg-purple-300/0 transition-colors hover:bg-purple-300/70"
                  />

                  {/* Remove */}
                  <button
                    type="button"
                    draggable={false}
                    title="Remove from timeline"
                    aria-label={`Remove ${clipName} from timeline`}
                    onPointerDown={
                      onRemovePointerDown
                    }
                    onDragStart={
                      onRemoveDragStart
                    }
                    onClick={(event) =>
                      onRemoveClick(
                        event,
                        item.id,
                      )
                    }
                    className="absolute right-1 top-1 z-30 flex h-5 w-5 items-center justify-center rounded bg-black/75 text-white opacity-0 transition hover:bg-red-500 group-hover:opacity-100"
                  >
                    <X size={13} />
                  </button>

                  {/* TEXT */}
                  {isText && (
                    <div className="pointer-events-none flex h-full items-center gap-2 px-3">
                      <Type
                        size={14}
                        className="shrink-0 text-amber-300"
                      />

                      <span className="truncate text-xs font-semibold text-amber-100">
                        {clipName}
                      </span>
                    </div>
                  )}

                  {/* IMAGE */}
                  {clipType === "image" &&
                    file && (
                      <img
                        src={file.url}
                        alt={file.name}
                        draggable={false}
                        className="pointer-events-none h-full w-full select-none object-cover opacity-70"
                      />
                    )}

                  {/* VIDEO */}
                  {clipType === "video" &&
                    file && (
                      <video
                        src={file.url}
                        muted
                        draggable={false}
                        className="pointer-events-none h-full w-full select-none object-cover opacity-70"
                      />
                    )}

                  {/* AUDIO */}
                  {clipType === "audio" &&
                    file && (
                      <div className="pointer-events-none flex h-full items-center gap-0.5 overflow-hidden px-2">
                        {Array.from({
                          length: 32,
                        }).map(
                          (_, barIndex) => (
                            <span
                              key={barIndex}
                              style={{
                                height: `${
                                  25 +
                                  ((barIndex *
                                    17) %
                                    75)
                                }%`,
                              }}
                              className="w-0.5 shrink-0 rounded-full bg-cyan-400"
                            />
                          ),
                        )}
                      </div>
                    )}

                  {/* Media filename */}
                  {!isText && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1">
                      <p className="truncate text-[11px] font-semibold text-white">
                        {clipName}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
        </TimelineRow>
      ))}
    </>
  );
}