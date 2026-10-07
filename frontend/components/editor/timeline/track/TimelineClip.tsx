import { X } from "lucide-react";
import type { TimelineItem } from "@/types/timeline";
import type { TimelineTracksProps } from "@/lib/types";
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
  onSelectItem: (id: string) => void;
  onEditText: (item: TimelineItem) => void;
};

export default function TimelineClip({
  item,
  selected,
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
      data-timeline-clip
      draggable
      tabIndex={0}
      aria-label={clipName}
      onFocus={() => onSelectItem(item.id)}
      onPointerDown={() => onSelectItem(item.id)}
      onDragStart={(event) =>
        onClipDragStart(
          event,
          item.id,
        )
      }

      onClick={(event) => {
        event.stopPropagation();
        onSelectItem(item.id);
      }}
      onDoubleClick={(event) => {
        if (!isText) return;
        event.stopPropagation();
        onEditText(item);
      }}

      onDragEnd={onClipDragEnd}
      style={{
        left: `${item.startPosition}%`,
        width: `${item.width}%`,
      }}
      className={`${selected ? "ring-2 ring-white ring-inset" : ""} group absolute inset-y-1 cursor-grab select-none overflow-hidden rounded border active:cursor-grabbing ${clipType === "audio"
        ? "border-cyan-600 bg-cyan-950"
        : clipType === "text"
          ? "border-amber-500 bg-amber-950"
          : "border-purple-500 bg-indigo-950"
        }`}
    >
      <ClipResizeHandle
        item={item}
        clipName={clipName}
        edge="left"
        onResizeStart={onResizeStart}
        onResizeMove={onResizeMove}
        onResizeEnd={onResizeEnd}
      />

      <ClipResizeHandle
        item={item}
        clipName={clipName}
        edge="right"
        onResizeStart={onResizeStart}
        onResizeMove={onResizeMove}
        onResizeEnd={onResizeEnd}
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
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();

          onRemoveClick(
            event,
            item.id,
          );
        }}
        className="absolute right-1 top-1 z-30 flex h-5 w-5 items-center justify-center rounded bg-black/75 text-white opacity-0 transition hover:bg-red-500 group-hover:opacity-100"
      >
        <X size={13} />
      </button>

      <ClipMediaPreview item={item} />

      <TimelineAnimationRegions
        item={item}
        onDurationChange={
          onAnimationDurationChange
        }
      />

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
}
