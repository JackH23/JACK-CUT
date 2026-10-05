import type { TimelineItem } from "@/types/timeline";
import type { ResizeEdge, TimelineTracksProps } from "@/lib/types";

type ClipResizeHandleProps = Pick<
  TimelineTracksProps,
  | "onResizeStart"
  | "onResizeMove"
  | "onResizeEnd"
> & {
  item: TimelineItem;
  clipName: string;
  edge: ResizeEdge;
};

export default function ClipResizeHandle({
  item,
  clipName,
  edge,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
}: ClipResizeHandleProps) {
  return (
    <button
      type="button"
      draggable={false}
      aria-label={`Resize ${edge === "left" ? "start" : "end"} of ${clipName}`}
      title={`Resize clip ${edge === "left" ? "start" : "end"}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={(event) =>
        onResizeStart(
          event,
          item,
          edge,
        )
      }
      onPointerMove={onResizeMove}
      onPointerUp={onResizeEnd}
      onPointerCancel={onResizeEnd}
      onDragStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      className={`absolute inset-y-0 ${edge === "left" ? "left-0" : "right-0"} z-20 w-2 touch-none cursor-ew-resize bg-purple-300/0 transition-colors hover:bg-purple-300/70`}
    />
  );
}
