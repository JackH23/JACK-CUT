import type { MediaFile } from "@/lib/media";

export type TextStyle =
  | "heading"
  | "subtitle"
  | "title"
  | "caption";

export type TimelineItem = {
  id: string;

  type: "media" | "text";

  // Media items
  file?: MediaFile;

  // Text items
  text?: string;
  textStyle?: TextStyle;

  // Text position inside the preview (percentage)
  textX?: number;
  textY?: number;

  trackId: string;

  // Visual percentage values
  startPosition: number;
  width: number;

  // Real time values in seconds
  startTime: number;
  duration: number;
  sourceStart: number;
};

export type TimelineTrack = {
  id: string;
  name: string;
  color: string;
  type: "video" | "audio" | "text";
};