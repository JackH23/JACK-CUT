import type { MediaFile } from "@/lib/media";

export type TextStyle =
  | "heading"
  | "subtitle"
  | "title"
  | "caption";

type TimelineItemFields = {
  id: string;


  // Media items
  file?: MediaFile;

  // Text items
  text?: string;
  textStyle?: TextStyle;

  // Text position inside the preview (percentage)
  textX?: number;
  textY?: number;

  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  textColor?: string;
  
  mediaScale?: number;
  mediaX?: number;
  mediaY?: number;

  // Animation
  animationPreset?: string;
  animationAmount?: number;
  animationInPreset?: string | null;
  animationInDuration?: number | null;
  animationInAmount?: number | null;
  animationOutPreset?: string | null;
  animationOutDuration?: number | null;
  animationOutAmount?: number | null;

  trackId: string;

  // Visual percentage values
  startPosition: number;
  width: number;

  // Real time values in seconds
  startTime: number;
  duration: number;
  sourceStart: number;
};

export type TextTimelineItem = TimelineItemFields & {
  type: "text";
};

export type MediaTimelineItem = TimelineItemFields & {
  type: "media";
};

export type TimelineItem = TextTimelineItem | MediaTimelineItem;

export type TimelineTrack = {
  id: string;
  name: string;
  color: string;
  type: "video" | "audio" | "text";
};