import { api as axios } from "./api";
import type {
  AddTimelineItemInput,
  AddTimelineItemResponse,
  GetTimelineDurationResponse,
  GetTimelineItemsResponse,
  GetTimelineTracksResponse,
  RemoveTimelineItemResponse,
  TimelineItemUpdateInput,
} from "@/lib/timeline";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const TIMELINE_URL = `${API_URL}/api/timeline/items`;

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

  async removeItem(id: string): Promise<RemoveTimelineItemResponse> {
    const { data } = await axios.delete<RemoveTimelineItemResponse>(
      `${TIMELINE_URL}/${encodeURIComponent(id)}`,
    );

    return data;
  },

  async updateItem(
    id: string,
    input: TimelineItemUpdateInput,
  ): Promise<AddTimelineItemResponse> {
    const { data } = await axios.patch<AddTimelineItemResponse>(
      `${TIMELINE_URL}/${encodeURIComponent(id)}`,
      input,
    );

    return data;
  },

  async getDuration(projectId: string): Promise<number> {
    const { data } = await axios.get<GetTimelineDurationResponse>(
      `${API_URL}/api/timeline/duration`,
      { params: { projectId } },
    );

    return data.duration;
  },

  async getTracks(): Promise<GetTimelineTracksResponse> {
    const { data } = await axios.get<GetTimelineTracksResponse>(
      `${API_URL}/api/timeline/tracks`,
    );

    return data;
  },
};