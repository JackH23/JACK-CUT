"use client";

import { useState } from "react";
import type { TimelineItem } from "@/types/timeline";
import EditTextModal from "../EditTextModal";
import TimelineRow from "./TimelineRow";
import TimelineClip from "./TimelineClip";
import type { TimelineTracksProps } from "@/lib/types";

export default function TimelineTracks({
  items,
  tracks,
  onTrackDragOver,
  onTrackDrop,
  onClipDragStart,
  onClipDragEnd,
  onUpdateText,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onRemovePointerDown,
  onRemoveDragStart,
  onRemoveClick,
}: TimelineTracksProps) {

  const [editingItem, setEditingItem] =
    useState<TimelineItem | null>(null);
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
            .map((item) => (
              <TimelineClip
                key={item.id}
                item={item}
                onEditText={setEditingItem}
                onClipDragStart={onClipDragStart}
                onClipDragEnd={onClipDragEnd}
                onResizeStart={onResizeStart}
                onResizeMove={onResizeMove}
                onResizeEnd={onResizeEnd}
                onRemovePointerDown={onRemovePointerDown}
                onRemoveDragStart={onRemoveDragStart}
                onRemoveClick={onRemoveClick}
              />
            ))}
        </TimelineRow>
      ))}

      <EditTextModal
        open={editingItem !== null}
        initialText={editingItem?.text || ""}
        onClose={() => setEditingItem(null)}
        onSave={(text) => {
          if (!editingItem) return;

          onUpdateText(
            editingItem.id,
            text,
          );

          setEditingItem(null);
        }}
      />
    </>
  );
}
