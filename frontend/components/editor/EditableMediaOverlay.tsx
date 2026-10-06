"use client";

import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { TimelineItem } from "@/types/timeline";
import { getMediaAnimationState } from "@/lib/mediaAnimation";
import PreviewSnapGuides from "./PreviewSnapGuides";
import { getPreviewSnapThreshold, getPreviewSnapResult, getPreviewResizeSnapResult, type Guides } from "@/lib/previewSnapping";
import layout from "@/lib/textLayout.json";

import { getMediaResizeProposal, mediaResizeHandles, type MediaResizeHandle, type MediaTransform as Transform } from "@/lib/previewMediaResize";
type Props = { item: TimelineItem; selected: boolean; time: number; children: ReactNode; onSelect: () => void; onTransform: (id: string, values: Transform, persist?: boolean) => void };
const handlePositions: Record<MediaResizeHandle, string> = {
  "top-left": "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
  top: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize",
  "top-right": "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
  right: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
  "bottom-right": "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
  bottom: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize",
  "bottom-left": "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
  left: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
};

export default function EditableMediaOverlay({ item, selected, time, children, onSelect, onTransform }: Props) {
  const [activeHandle, setActiveHandle] = useState<MediaResizeHandle | null>(null);
  const [guides, setGuides] = useState<Guides>({ vertical: [], horizontal: [] });
  const root = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ width: 1, height: 1, ratio: 16 / 9, host: null as HTMLElement | null, canvas: null as HTMLElement | null });
  const interaction = useRef<{ pointer: number; x: number; y: number; handle?: MediaResizeHandle; baseWidth: number; baseHeight: number; width: number; height: number; frameWidth: number; frameHeight: number; animationOffset: number; initial: Transform; latest: Transform; drag: boolean } | null>(null);
  useEffect(() => {
    const node = root.current;
    const parent = node?.parentElement;
    if (!node || !parent) return;
    const measure = () => {
      const rect = parent.getBoundingClientRect();
      const media = node.querySelector("img,video") as HTMLImageElement | HTMLVideoElement | null;
      const width = media instanceof HTMLImageElement ? media.naturalWidth : media?.videoWidth;
      const height = media instanceof HTMLImageElement ? media.naturalHeight : media?.videoHeight;
      setFrame({ width: rect.width, height: rect.height, ratio: width && height ? width / height : 16 / 9, host: parent.parentElement, canvas: parent.closest<HTMLElement>("[data-preview-video-canvas]") });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    node.addEventListener("load", measure, true);
    node.addEventListener("loadedmetadata", measure, true);
    return () => { observer.disconnect(); node.removeEventListener("load", measure, true); node.removeEventListener("loadedmetadata", measure, true); interaction.current = null; };
  }, [item.id]);

  const scale = item.mediaScale ?? 1, x = item.mediaX ?? 0, y = item.mediaY ?? 0;
  const animation = getMediaAnimationState(item, time - item.startTime);
  const fittedWidth = Math.min(frame.width, frame.height * frame.ratio);
  const fittedHeight = fittedWidth / frame.ratio;
  const width = fittedWidth * scale * animation.scale;
  const height = fittedHeight * scale * animation.scale;
  const centerX = frame.width / 2 + x * frame.width / layout.referenceWidth + scale * frame.width * animation.offset / 100;
  const centerY = frame.height / 2 + y * frame.height / layout.referenceHeight;

  const start = (event: PointerEvent<HTMLElement>, handle?: MediaResizeHandle) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); onSelect(); setActiveHandle(handle ?? null); setGuides({ vertical: [], horizontal: [] });
    const initial = { mediaScale: scale, mediaX: x, mediaY: y };
    interaction.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, handle, baseWidth: fittedWidth * layout.referenceWidth / frame.width, baseHeight: fittedHeight * layout.referenceHeight / frame.height, width, height, frameWidth: frame.width, frameHeight: frame.height, animationOffset: animation.offset, initial, latest: initial, drag: !handle };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const state = interaction.current;
    if (!state || state.pointer !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    // Convert display deltas into the same reference coordinates used by text.
    const dx = (event.clientX - state.x) * layout.referenceWidth / state.frameWidth;
    const dy = (event.clientY - state.y) * layout.referenceHeight / state.frameHeight;
    const canvas = { width: layout.referenceWidth, height: layout.referenceHeight };
    const threshold = getPreviewSnapThreshold(canvas, {width:state.frameWidth,height:state.frameHeight});
    let next: Transform;
    if (state.drag) {
      const bounds = {centerX:canvas.width/2+state.initial.mediaX+dx,centerY:canvas.height/2+state.initial.mediaY+dy,width:state.baseWidth*state.initial.mediaScale,height:state.baseHeight*state.initial.mediaScale};
      const result = getPreviewSnapResult(bounds,canvas,threshold);
      next = {...state.initial,mediaX:result.bounds.centerX-canvas.width/2,mediaY:result.bounds.centerY-canvas.height/2};
      setGuides({vertical:result.vertical,horizontal:result.horizontal});
    } else {
      const proposal = getMediaResizeProposal({initial:state.initial,handle:state.handle!,dx,dy,visualWidth:state.width*canvas.width/state.frameWidth,visualHeight:state.height*canvas.height/state.frameHeight,baseWidth:state.baseWidth,baseHeight:state.baseHeight,animationOffset:state.animationOffset,canvas});
      const result = getPreviewResizeSnapResult(proposal.bounds,canvas,threshold,proposal.transform.mediaScale,proposal.sx,proposal.sy,proposal.derivatives);
      next = {mediaScale:result.scale,mediaX:result.bounds.centerX-canvas.width/2,mediaY:result.bounds.centerY-canvas.height/2};
      setGuides({vertical:result.vertical,horizontal:result.horizontal});
    }
    state.latest = next; onTransform(item.id, next, false);
  };
  const end = (event: PointerEvent<HTMLElement>) => {
    const state = interaction.current;
    if (!state || state.pointer !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation(); interaction.current = null; setActiveHandle(null); setGuides({ vertical: [], horizontal: [] });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    onTransform(item.id, state.latest);
  };

  return <>
    <div ref={root} data-media-transform={item.id} className="absolute inset-0 touch-none select-none" style={{ transform: `translate(${x / layout.referenceWidth * 100}%, ${y / layout.referenceHeight * 100}%) scale(${scale})`, transformOrigin: "center" }} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
      {children}
    </div>
    {selected && frame.canvas && createPortal(<><div data-media-selection-border className="pointer-events-none absolute z-30 border border-purple-300" style={{ left: centerX - width / 2, top: centerY - height / 2, width, height }} /><PreviewSnapGuides {...guides} /></>, frame.canvas)}
    {selected && frame.host && createPortal(
      <div data-media-selection={item.id} className="pointer-events-none absolute" style={{ left: centerX - width / 2, top: centerY - height / 2, width, height }}>
        {mediaResizeHandles.map(handle => <button key={handle} type="button" aria-label={`Resize media from ${handle}`} className={`pointer-events-auto absolute z-50 h-3 w-3 touch-none select-none border-2 border-purple-300 bg-white ${handle.includes("-") ? "rounded-full" : "rounded-sm"} ${handlePositions[handle]} ${activeHandle === handle ? "ring-2 ring-fuchsia-400" : ""}`} onPointerDown={event => start(event, handle)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} />)}
      </div>, frame.host)}
  </>;
}
