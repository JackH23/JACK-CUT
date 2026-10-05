import type { DragEvent, MouseEvent, PointerEvent } from "react";
import type { TimelineItem, TimelineTrack } from "@/types/timeline";

export type ResizeEdge = "left" | "right";

export type TimelineTracksProps = {
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

  onUpdateText: (
    itemId: string,
    text: string,
  ) => void;

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

