"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch } from "react";
import type { TimelineItem } from "@/types/timeline";
import type { AddTimelineItemInput } from "@/lib/timeline";
import { timelineService } from "@/services/timelineService";
import { timelineReducer } from "@/reducers/timelineReducer";

type Options = {
  projectId: string;
  items: TimelineItem[];
  selectedItem: TimelineItem | null;
  playheadTime: number;
  onSelectItem: (id: string) => void;
  dispatch: Dispatch<Parameters<typeof timelineReducer>[1]>;
};

// Same-track intervals must not overlap, as in useTimelineDrag. Touching is allowed.
export function findPasteStart(items: TimelineItem[], source: TimelineItem, preferredStart: number) {
  let start = Math.max(0, preferredStart);
  const trackItems = items.filter(item => item.trackId === source.trackId)
    .sort((a, b) => a.startTime - b.startTime);
  for (const item of trackItems) {
    const end = item.startTime + item.duration;
    if (start < end && start + source.duration > item.startTime) start = end;
  }
  return start;
}

export function useTimelineClipboard({ projectId, items, selectedItem, playheadTime, onSelectItem, dispatch }: Options) {
  const clipboardRef = useRef<{ projectId: string; item: TimelineItem } | null>(null);
  const itemsRef = useRef(items);
  const pendingRef = useRef(false);
  const [isDuplicating, setIsDuplicating] = useState(false);

  useEffect(() => { itemsRef.current = items; }, [items]);

  const handleCopy = useCallback(() => {
    if (!selectedItem) return;
    clipboardRef.current = {
      projectId,
      item: { ...selectedItem, file: selectedItem.file ? { ...selectedItem.file } : undefined },
    };
  }, [projectId, selectedItem]);

  const createCopy = useCallback(async (source: TimelineItem, preferredStart: number) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setIsDuplicating(true);
    dispatch({ type: "ADD_ITEM_START" });
    try {
      const startTime = findPasteStart(itemsRef.current, source, preferredStart);
      const position = { projectId, trackId: source.trackId, startTime, duration: source.duration, sourceStart: source.sourceStart };
      let payload: AddTimelineItemInput;
      if (source.type === "text") {
        payload = {
          ...position, itemType: "TEXT", textContent: source.text ?? "",
          textStyle: source.textStyle ?? "subtitle", textX: source.textX, textY: source.textY,
          fontSize: source.fontSize, fontWeight: source.fontWeight,
          fontFamily: source.fontFamily, textColor: source.textColor,
        };
      } else {
        if (!source.file) throw new Error("This clip has no source media.");
        payload = { ...position, itemType: "MEDIA", mediaId: source.file.id };
      }
      const { item: saved } = await timelineService.addItem(payload);
      await timelineService.updateItem(saved.id, {...(source.type === 'media' && source.file?.type !== 'audio' ? {mediaScale:source.mediaScale??1,mediaX:source.mediaX??0,mediaY:source.mediaY??0} : {}),animationPreset: source.animationPreset ?? 'none', animationAmount: source.animationAmount ?? 50, animationInPreset:source.animationInPreset??undefined,animationInDuration:source.animationInDuration??undefined,animationInAmount:source.animationInAmount??undefined,animationOutPreset:source.animationOutPreset??undefined,animationOutDuration:source.animationOutDuration??undefined,animationOutAmount:source.animationOutAmount??undefined}, projectId);
      if (!saved.id || saved.id === source.id) throw new Error("The API did not return a new clip ID.");
      const newItem: TimelineItem = {
        ...source, id: saved.id, trackId: saved.track_id,
        startTime: saved.start_time, duration: saved.duration,
        sourceStart: saved.source_start ?? source.sourceStart,
        startPosition: saved.start_time / 210 * 100, width: saved.duration / 210 * 100,
        ...(source.type === "text" ? {
          text: saved.text_content ?? source.text, textStyle: saved.text_style ?? source.textStyle,
          textX: saved.text_x ?? source.textX, textY: saved.text_y ?? source.textY,
          fontSize: saved.font_size ?? source.fontSize, fontWeight: saved.font_weight ?? source.fontWeight,
          fontFamily: saved.font_family ?? source.fontFamily, textColor: saved.text_color ?? source.textColor,
        } : {}),
      };
      itemsRef.current = [...itemsRef.current, newItem];
      dispatch({ type: "ADD_ITEM_SUCCESS", payload: newItem });
      onSelectItem(newItem.id);
    } catch (error) {
      dispatch({ type: "ADD_ITEM_ERROR", payload: error instanceof Error ? error.message : "Could not duplicate timeline item." });
    } finally {
      pendingRef.current = false;
      setIsDuplicating(false);
    }
  }, [projectId, dispatch, onSelectItem]);

  const handleDuplicate = useCallback(() => {
    if (selectedItem) void createCopy(selectedItem, selectedItem.startTime + selectedItem.duration);
  }, [selectedItem, createCopy]);

  const handlePaste = useCallback(() => {
    const clipboard = clipboardRef.current;
    if (clipboard?.projectId === projectId) void createCopy(clipboard.item, playheadTime);
  }, [projectId, playheadTime, createCopy]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"))) return;
      const key = event.key.toLowerCase();
      if (key === "c" && selectedItem) {
        event.preventDefault();
        handleCopy();
      } else if (key === "v" && clipboardRef.current?.projectId === projectId) {
        event.preventDefault();
        handlePaste();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [projectId, selectedItem, handleCopy, handlePaste]);

  return { handleCopy, handlePaste, handleDuplicate, isDuplicating };
}
