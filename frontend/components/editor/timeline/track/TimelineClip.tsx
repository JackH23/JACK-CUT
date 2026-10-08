
"use client";

import { X } from "lucide-react";

import type { TimelineItem } from "@/types/timeline";
import type { TimelineTracksProps } from "@/lib/types";

import LoadingState from "@/components/shared/LoadingState";
import ClipResizeHandle from "./ClipResizeHandle";
import ClipMediaPreview from "./ClipMediaPreview";
import TimelineAnimationRegions from "./TimelineAnimationRegions";

type TimelineClipProps = Pick<
  TimelineTracksProps,
  | "onClipDragStart"
  | "onClipDragEnd"
  | "onResizeStart"
  | "onResizeMove"
  | "onResizeEnd"
  | "onRemovePointerDown"
  | "onRemoveDragStart"
  | "onRemoveClick"
  | "onAnimationDurationChange"
> & {
  item: TimelineItem;
  selected: boolean;
  removing?: boolean;
  onSelectItem: (id: string) => void;
  onEditText: (item: TimelineItem) => void;
};

export default function TimelineClip({
  item,
  selected,
  removing = false,
  onSelectItem,
  onEditText,
  onClipDragStart,
  onClipDragEnd,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onRemovePointerDown,
  onRemoveDragStart,
  onRemoveClick,
  onAnimationDurationChange,
}: TimelineClipProps) {
  const isText = item.type === "text";

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
      data-timeline-clip
      draggable={!removing}
      tabIndex={removing ? -1 : 0}
      aria-label={clipName}
      aria-busy={removing}
      onFocus={() => {
        if (!removing) onSelectItem(item.id);
      }}
      onPointerDown={() => {
        if (!removing) onSelectItem(item.id);
      }}
      onDragStart={(event) => {
        if (removing) {
          event.preventDefault();
          return;
        }

        onClipDragStart(event, item.id);
      }}
      onClick={(event) => {
        event.stopPropagation();

        if (!removing) {
          onSelectItem(item.id);
        }
      }}
      onDoubleClick={(event) => {
        if (removing || !isText) return;

        event.stopPropagation();
        onEditText(item);
      }}
      onDragEnd={onClipDragEnd}
      style={{
        left: `${item.startPosition}%`,
        width: `${item.width}%`,
      }}
      className={`${
        selected ? "ring-2 ring-white ring-inset" : ""
      } group absolute inset-y-1 select-none overflow-hidden rounded border ${
        removing
          ? "cursor-wait"
          : "cursor-grab active:cursor-grabbing"
      } ${
        clipType === "audio"
          ? "border-cyan-600 bg-cyan-950"
          : clipType === "text"
            ? "border-amber-500 bg-amber-950"
            : "border-purple-500 bg-indigo-950"
      }`}
    >
      {/* Left resize handle */}
      {!removing && (
        <ClipResizeHandle
          item={item}
          clipName={clipName}
          edge="left"
          onResizeStart={onResizeStart}
          onResizeMove={onResizeMove}
          onResizeEnd={onResizeEnd}
        />
      )}

      {/* Right resize handle */}
      {!removing && (
        <ClipResizeHandle
          item={item}
          clipName={clipName}
          edge="right"
          onResizeStart={onResizeStart}
          onResizeMove={onResizeMove}
          onResizeEnd={onResizeEnd}
        />
      )}

      {/* Remove button */}
      {!removing && (
        <button
          type="button"
          draggable={false}
          title="Remove from timeline"
          aria-label={`Remove ${clipName} from timeline`}
          onPointerDown={onRemovePointerDown}
          onDragStart={onRemoveDragStart}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();

            onRemoveClick(event, item.id);
          }}
          className="absolute right-1 top-1 z-30 flex h-5 w-5 items-center justify-center rounded bg-black/75 text-white opacity-0 transition hover:bg-red-500 group-hover:opacity-100"
        >
          <X size={13} />
        </button>
      )}

      {/* Media preview */}
      <ClipMediaPreview item={item} />

      {/* Animation regions */}
      {!removing && (
        <TimelineAnimationRegions
          item={item}
          onDurationChange={onAnimationDurationChange}
        />
      )}

      {/* Media filename */}
      {!isText && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1">
          <p className="truncate text-[11px] font-semibold text-white">
            {clipName}
          </p>
        </div>
      )}

      {/* Removing overlay */}
      {removing && (
        <div
          role="status"
          aria-label={`Removing ${clipName}`}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/85"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onDragStart={(event) => event.preventDefault()}
        >
          <LoadingState
            message="Removing..."
            size="sm"
            className="!py-0 [&_span]:!text-white [&_svg]:!text-purple-400"
          />
        </div>
      )}
    </div>
  );
}
