
import { api as axios } from "./api";
import type { ExportJob } from "@/lib/export";

const EXPORT_URL = `${process.env.NEXT_PUBLIC_API_URL}/api/exports`;

export const exportService = {
  // Create a new video export
  async create(projectId: string): Promise<ExportJob> {
    const { data } = await axios.post<ExportJob>(
      EXPORT_URL,
      { projectId },
      { timeout: 15000 },
    );

    return data;
  },

  // Get export status and rendering progress
  async get(id: string, signal?: AbortSignal): Promise<ExportJob> {
    const { data } = await axios.get<ExportJob>(
      `${EXPORT_URL}/${encodeURIComponent(id)}`,
      { timeout: 10000, signal },
    );

    return data;
  },

  // Request cancellation of an active export
  async cancel(id: string): Promise<ExportJob> {
    const { data } = await axios.post<ExportJob>(
      `${EXPORT_URL}/${encodeURIComponent(id)}/cancel`,
      {},
      { timeout: 10000 },
    );

    return data;
  },

  // Get download URL for a completed export
  getDownloadUrl(id: string): string {
    return `${EXPORT_URL}/${encodeURIComponent(id)}/download`;
  },
};
