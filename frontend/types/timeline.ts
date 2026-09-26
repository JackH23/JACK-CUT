import type { MediaFile } from "@/lib/media";

export type TimelineItem = {
  id: string;
  file: MediaFile;
  trackId: string;

  // Visual percentage values used by the timeline UI
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
  type: "video" | "audio";
};