import type { TimelineItem } from "@/types/timeline";
export function pointerTime(clientX:number,canvasLeft:number,grabOffset:number,duration:number,clipDuration?:number):number;
export function snapClipStart(start:number,clip:TimelineItem,items:TimelineItem[],duration:number):{start:number;guide:number|null};
export function hasOverlap(clip:TimelineItem,items:TimelineItem[]):boolean;
