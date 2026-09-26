import type { MediaFile } from "@/lib/media";

export type AddTimelineItemInput = {
  projectId: string;
  mediaId: string;
  trackId: string;
  startTime: number;
  duration: number;
};

export type TimelineItemUpdateInput = {
  startTime: number;
  duration: number;
  trackId: string;
};

export type AddTimelineItemResponse = {
  message: string;
  item: {
    id: string;
    project_id: string;
    media_id: string;
    track_id: string;
    start_time: number;
    duration: number;
  };
};

export type SavedTimelineItem = {
  id: string;
  mediaId: string;
  trackId: string;
  startTime: number;
  duration: number;
  media: MediaFile | null;
};

export type GetTimelineItemsResponse = {
  total: number;
  items: SavedTimelineItem[];
};

export type SavedTimelineTrack = {
  id: string;
  name: string;
  type: "video" | "audio";
  color: string;
  sort_order: number;
};

export type GetTimelineTracksResponse = {
  total: number;
  tracks: SavedTimelineTrack[];
};

export type RemoveTimelineItemResponse = {
  message: string;
  id: string;
};

export type GetTimelineDurationResponse = {
  duration: number;
};