import type { MediaFile } from "@/lib/media";
import type { TextStyle } from "@/types/timeline";

/* =========================================================
   ADD TIMELINE ITEM
========================================================= */

export type AddMediaTimelineItemInput = {
  projectId: string;
  itemType: "MEDIA";
  mediaId: string;
  trackId: string;
  startTime: number;
  duration: number;
};

export type AddTextTimelineItemInput = {
  projectId: string;
  itemType: "TEXT";
  textContent: string;
  textStyle: TextStyle;

  // Text style
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  textColor?: string;

  trackId: string;
  startTime: number;
  duration: number;
};

export type AddTimelineItemInput =
  | AddMediaTimelineItemInput
  | AddTextTimelineItemInput;

/* =========================================================
   UPDATE TIMELINE ITEM
========================================================= */

export type TimelineItemUpdateInput = {
  startTime?: number;
  duration?: number;
  trackId?: string;
  textContent?: string;

  // Text position
  textX?: number;
  textY?: number;

  // Text style
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  textColor?: string;
};

/* =========================================================
   ADD RESPONSE
========================================================= */

export type AddTimelineItemResponse = {
  message: string;

  item: {
    id: string;
    project_id: string;

    item_type: "MEDIA" | "TEXT";

    media_id: string | null;

    text_content: string | null;
    text_style: TextStyle | null;

    // Text position
    text_x: number | null;
    text_y: number | null;

    // Text style
    font_size: number | null;
    font_weight: number | null;
    font_family: string | null;
    text_color: string | null;

    track_id: string;
    start_time: number;
    duration: number;

    created_at?: string;
    updated_at?: string;
  };
};

/* =========================================================
   SAVED TIMELINE ITEM
========================================================= */

export type SavedTimelineItem = {
  id: string;
  projectId: string;

  itemType: "MEDIA" | "TEXT";

  mediaId: string | null;

  textContent: string | null;
  textStyle: TextStyle | null;

  // Text position
  textX: number | null;
  textY: number | null;

  // Text style
  fontSize: number | null;
  fontWeight: number | null;
  fontFamily: string | null;
  textColor: string | null;

  trackId: string;
  startTime: number;
  duration: number;

  media: MediaFile | null;
};

/* =========================================================
   GET TIMELINE ITEMS
========================================================= */

export type GetTimelineItemsResponse = {
  total: number;
  items: SavedTimelineItem[];
};

/* =========================================================
   TIMELINE TRACKS
========================================================= */

export type SavedTimelineTrack = {
  id: string;
  name: string;

  type: "video" | "audio" | "text";

  color: string;
  sort_order: number;
};

export type GetTimelineTracksResponse = {
  total: number;
  tracks: SavedTimelineTrack[];
};

/* =========================================================
   REMOVE ITEM
========================================================= */

export type RemoveTimelineItemResponse = {
  message: string;
  id: string;
};

/* =========================================================
   TIMELINE DURATION
========================================================= */

export type GetTimelineDurationResponse = {
  duration: number;
};