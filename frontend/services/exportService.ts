import axios from "axios";
import type { ExportJob } from "@/lib/export";

const EXPORT_URL = `${process.env.NEXT_PUBLIC_API_URL}/api/exports`;

export const exportService = {
  async create(projectId: string): Promise<ExportJob> {
    const { data } = await axios.post<ExportJob>(EXPORT_URL, { projectId });
    return data;
  },

  async get(id: string): Promise<ExportJob> {
    const { data } = await axios.get<ExportJob>(
      `${EXPORT_URL}/${encodeURIComponent(id)}`,
      { timeout: 10000 },
    );

    return data;
  },

  getDownloadUrl(id: string): string {
    return `${EXPORT_URL}/${encodeURIComponent(id)}/download`;
  },
};