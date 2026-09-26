import axios from "axios";
import type { MediaFile } from "@/lib/media";

type AddTimelineItemInput = {
  projectId: string;
  mediaId: string;
  trackId: string;
  startTime: number;
  duration: number;
};

type AddTimelineItemResponse = {
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

type GetTimelineItemsResponse = {
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

type GetTimelineTracksResponse = {
  total: number;
  tracks: SavedTimelineTrack[];
};

const TIMELINE_URL = `${process.env.NEXT_PUBLIC_API_URL}/api/timeline/items`;

export const timelineService = {
  async addItem(input: AddTimelineItemInput): Promise<AddTimelineItemResponse> {
    const { data } = await axios.post<AddTimelineItemResponse>(
      TIMELINE_URL,
      input,
    );

    return data;
  },

  async getAll(projectId: string): Promise<GetTimelineItemsResponse> {
    const { data } = await axios.get<GetTimelineItemsResponse>(TIMELINE_URL, {
      params: { projectId },
    });

    return data;
  },

  async removeItem(id: string): Promise<{ message: string; id: string }> {
    const { data } = await axios.delete<{ message: string; id: string }>(
      `${TIMELINE_URL}/${encodeURIComponent(id)}`,
    );

    return data;
  },

  async updateItem(
    id: string,
    input: {
      startTime: number;
      duration: number;
      trackId: string;
    },
  ): Promise<AddTimelineItemResponse> {
    const { data } = await axios.patch<AddTimelineItemResponse>(
      `${TIMELINE_URL}/${encodeURIComponent(id)}`,
      input,
    );

    return data;
  },

  async getDuration(): Promise<number> {
    const { data } = await axios.get<{ duration: number }>(
      `${process.env.NEXT_PUBLIC_API_URL}/api/timeline/duration`,
    );

    return data.duration;
  },

  async getTracks(): Promise<GetTimelineTracksResponse> {
    const { data } = await axios.get<GetTimelineTracksResponse>(
      `${process.env.NEXT_PUBLIC_API_URL}/api/timeline/tracks`,
    );

    return data;
  },
};
