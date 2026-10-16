"use client";
import { useRef, useState, type PointerEvent, type RefObject, type Dispatch, type SetStateAction } from "react";
import { useParams } from "next/navigation";
import { timelineService } from "@/services/timelineService";
import type { TimelineItem } from "@/types/timeline";
import { pointerTime, snapClipStart, hasOverlap } from "@/lib/timelinePointer";
type Options = {items:TimelineItem[];displayDuration:number;timelineRef:RefObject<HTMLDivElement|null>;onItemsChange:Dispatch<SetStateAction<TimelineItem[]>>;onDragExtensionChange?:(extension:number)=>void};
export function useTimelinePointerMove({items,displayDuration,timelineRef,onItemsChange,onDragExtensionChange}:Options) {
  const {projectId}=useParams<{projectId:string}>();
  const drag=useRef<{pointer:number;original:TimelineItem;latest:TimelineItem;offset:number}|null>(null);
  const [pointerSnapLine,setPointerSnapLine]=useState<number|null>(null);
  const restore=(item:TimelineItem)=>onItemsChange(current=>current.map(other=>other.id===item.id?item:other));
  const handleClipPointerDown=(event:PointerEvent<HTMLButtonElement>,item:TimelineItem)=>{
    event.preventDefault();event.stopPropagation();
    const clip=event.currentTarget.closest<HTMLElement>("[data-timeline-clip]");if(!clip)return;
    drag.current={pointer:event.pointerId,original:item,latest:item,offset:event.clientX-clip.getBoundingClientRect().left};
    onDragExtensionChange?.(Math.max(10,item.duration));
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleClipPointerMove=(event:PointerEvent<HTMLButtonElement>)=>{
    const state=drag.current,canvas=timelineRef.current;if(!state||state.pointer!==event.pointerId||!canvas)return;
    event.preventDefault();event.stopPropagation();
    const raw=pointerTime(event.clientX,canvas.getBoundingClientRect().left,state.offset,displayDuration,state.original.duration);
    const snapped=snapClipStart(raw,state.original,items,displayDuration);
    const row=Array.from(canvas.querySelectorAll<HTMLElement>("[data-track-id]")).find(node=>{const rect=node.getBoundingClientRect();return event.clientY>=rect.top&&event.clientY<rect.bottom;});
    const next={...state.original,startTime:snapped.start,trackId:row?.dataset.trackId??state.latest.trackId};
    if(hasOverlap(next,items)){setPointerSnapLine(null);return;}
    state.latest=next;setPointerSnapLine(snapped.guide===null?null:snapped.guide/displayDuration*100);restore({...next,trackId:state.original.trackId});
  };
  const handleClipPointerUp=(event:PointerEvent<HTMLButtonElement>)=>{
    const state=drag.current;if(!state||state.pointer!==event.pointerId)return;
    event.preventDefault();event.stopPropagation();drag.current=null;setPointerSnapLine(null);onDragExtensionChange?.(0);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    if(event.type!=="pointerup"){restore(state.original);return;}
    if(state.latest.startTime===state.original.startTime&&state.latest.trackId===state.original.trackId)return;
    restore(state.latest);
    void timelineService.updateItem(state.original.id,{startTime:state.latest.startTime,trackId:state.latest.trackId,duration:state.latest.duration},projectId).catch(error=>{restore(state.original);console.error("Could not save clip move",error);window.alert("Could not save the clip move.");});
  };
  return {pointerSnapLine,handleClipPointerDown,handleClipPointerMove,handleClipPointerUp};
}
