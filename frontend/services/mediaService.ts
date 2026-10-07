import { api as axios } from "./api";
import type { GetMediaResponse, UploadMediaResponse } from "@/lib/media";

const MEDIA_URL = `${process.env.NEXT_PUBLIC_API_URL}/api/media`;

export const mediaService = {
  async upload(
    projectId: string,
    files: File[],
  ): Promise<UploadMediaResponse> {
    const formData = new FormData();
    formData.append("projectId", projectId);

    files.forEach((file) => {
      formData.append("files", file);
    });

    const { data } = await axios.post<UploadMediaResponse>(
      `${MEDIA_URL}/upload`,
      formData,
    );

    return data;
  },

  async getAll(projectId: string): Promise<GetMediaResponse> {
    const { data } = await axios.get<GetMediaResponse>(MEDIA_URL, {
      params: { projectId },
    });

    return data;
  },

  async remove(
    projectId: string,
    id: string,
  ): Promise<{ message: string }> {
    const { data } = await axios.delete<{ message: string }>(
      `${MEDIA_URL}/${encodeURIComponent(id)}`,
      { params: { projectId } },
    );

    return data;
  },
};