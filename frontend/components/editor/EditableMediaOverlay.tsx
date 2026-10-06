"use client";

import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { TimelineItem } from "@/types/timeline";
import { getMediaAnimationState } from "@/lib/mediaAnimation";
import PreviewSnapGuides from "./PreviewSnapGuides";
import { getPreviewSnapThreshold, getPreviewSnapResult, getPreviewResizeSnapResult, type Guides } from "@/lib/previewSnapping";
import layout from "@/lib/textLayout.json";

type Transform = { mediaScale: number; mediaX: number; mediaY: number };
type Props = { item: TimelineItem; selected: boolean; time: number; children: ReactNode; onSelect: () => void; onTransform: (id: string, values: Transform, persist?: boolean) => void };
const corners = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

export default function EditableMediaOverlay({ item, selected, time, children, onSelect, onTransform }: Props) {
  const [guides, setGuides] = useState<Guides>({ vertical: [], horizontal: [] });
  const root = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ width: 1, height: 1, ratio: 16 / 9, host: null as HTMLElement | null });
  const interaction = useRef<{ pointer: number; x: number; y: number; sx: number; sy: number; width: number; height: number; frameWidth: number; frameHeight: number; animationOffset: number; initial: Transform; latest: Transform; drag: boolean } | null>(null);
  useEffect(() => {
    const node = root.current;
    const parent = node?.parentElement;
    if (!node || !parent) return;
    const measure = () => {
      const rect = parent.getBoundingClientRect();
      const media = node.querySelector("img,video") as HTMLImageElement | HTMLVideoElement | null;
      const width = media instanceof HTMLImageElement ? media.naturalWidth : media?.videoWidth;
      const height = media instanceof HTMLImageElement ? media.naturalHeight : media?.videoHeight;
      setFrame({ width: rect.width, height: rect.height, ratio: width && height ? width / height : 16 / 9, host: parent.parentElement });
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

  const start = (event: PointerEvent<HTMLElement>, corner?: string) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); onSelect(); setGuides({ vertical: [], horizontal: [] });
    const initial = { mediaScale: scale, mediaX: x, mediaY: y };
    interaction.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, sx: corner?.includes("left") ? -1 : 1, sy: corner?.includes("top") ? -1 : 1, width, height, frameWidth: frame.width, frameHeight: frame.height, animationOffset: animation.offset, initial, latest: initial, drag: !corner };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const state = interaction.current;
    if (!state || state.pointer !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    // Convert display deltas into the same reference coordinates used by text.
    const dx = (event.clientX - state.x) * layout.referenceWidth / state.frameWidth;
    const dy = (event.clientY - state.y) * layout.referenceHeight / state.frameHeight;
    let next: Transform;
    if (state.drag) next = { ...state.initial, mediaX: state.initial.mediaX + dx, mediaY: state.initial.mediaY + dy };
    else {
      const w = state.width * layout.referenceWidth / state.frameWidth;
      const h = state.height * layout.referenceHeight / state.frameHeight;
      const factor = 1 + (state.sx * dx * w + state.sy * dy * h) / (w * w + h * h);
      const mediaScale = Math.min(2, Math.max(0.1, state.initial.mediaScale * factor));
      const applied = mediaScale / state.initial.mediaScale - 1;
      next = { mediaScale, mediaX: state.initial.mediaX + state.sx * w * applied / 2 - (mediaScale - state.initial.mediaScale) * layout.referenceWidth * state.animationOffset / 100, mediaY: state.initial.mediaY + state.sy * h * applied / 2 };
    }
    const canvas = { width: layout.referenceWidth, height: layout.referenceHeight };
    const threshold = getPreviewSnapThreshold(canvas, {width:state.frameWidth,height:state.frameHeight});
    // Bounds deliberately exclude animation scale/slide: guides align the saved base.
    const baseW=fittedWidth*layout.referenceWidth/state.frameWidth;
    const baseH=fittedHeight*layout.referenceHeight/state.frameHeight;
    const bounds={centerX:canvas.width/2+next.mediaX,centerY:canvas.height/2+next.mediaY,width:baseW*next.mediaScale,height:baseH*next.mediaScale};
    if (state.drag) {
      const result=getPreviewSnapResult(bounds,canvas,threshold);
      next={...next,mediaX:next.mediaX+result.x,mediaY:next.mediaY+result.y};
      setGuides({vertical:result.vertical,horizontal:result.horizontal});
    } else {
      const w=state.width*layout.referenceWidth/state.frameWidth;
      const h=state.height*layout.referenceHeight/state.frameHeight;
      const derivatives={centerX:state.sx*w/state.initial.mediaScale/2-layout.referenceWidth*state.animationOffset/100,centerY:state.sy*h/state.initial.mediaScale/2,width:baseW,height:baseH};
      const result=getPreviewResizeSnapResult(bounds,canvas,threshold,next.mediaScale,state.sx,state.sy,derivatives);
      const delta=result.scale-next.mediaScale;
      next={mediaScale:result.scale,mediaX:next.mediaX+derivatives.centerX*delta,mediaY:next.mediaY+derivatives.centerY*delta};
      setGuides({vertical:result.vertical,horizontal:result.horizontal});
    }
    state.latest = next; onTransform(item.id, next, false);
  };
  const end = (event: PointerEvent<HTMLElement>) => {
    const state = interaction.current;
    if (!state || state.pointer !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation(); interaction.current = null; setGuides({ vertical: [], horizontal: [] });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    onTransform(item.id, state.latest);
  };

  return <>
    <div ref={root} data-media-transform={item.id} className="absolute inset-0" style={{ transform: `translate(${x / layout.referenceWidth * 100}%, ${y / layout.referenceHeight * 100}%) scale(${scale})`, transformOrigin: "center" }} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
      {children}
    </div>
    {selected && <PreviewSnapGuides {...guides} />}
    {selected && frame.host && createPortal(
      <div data-media-selection={item.id} className="pointer-events-none absolute z-30 border border-purple-300" style={{ left: centerX - width / 2, top: centerY - height / 2, width, height }}>
        {corners.map(corner => <button key={corner} type="button" aria-label={`Resize media from ${corner}`} className={`pointer-events-auto absolute h-3 w-3 touch-none rounded-full border-2 border-purple-300 bg-white ${corner.includes("left") ? "-left-1.5" : "-right-1.5"} ${corner.includes("top") ? "-top-1.5" : "-bottom-1.5"} ${corner === "top-left" || corner === "bottom-right" ? "cursor-nwse-resize" : "cursor-nesw-resize"}`} onPointerDown={event => start(event, corner)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} />)}
      </div>, frame.host)}
  </>;
}
