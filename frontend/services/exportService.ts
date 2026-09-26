import axios from "axios";

export type ExportJob = {
  id: string;
  status: "processing" | "completed" | "failed";
  error?: string | null;
  downloadUrl?: string | null;
  statusUrl?: string;
};

const EXPORT_URL = `${process.env.NEXT_PUBLIC_API_URL}/api/exports`;

export const exportService = {
  async create(projectId: string): Promise<ExportJob> {
    const { data } = await axios.post<ExportJob>(EXPORT_URL, { projectId });
    return data;
  },

  async get(id: string): Promise<ExportJob> {
    const { data } = await axios.get<ExportJob>(
      `${EXPORT_URL}/${encodeURIComponent(id)}`,
    );
    return data;
  },

  getDownloadUrl(id: string): string {
    return `${EXPORT_URL}/${encodeURIComponent(id)}/download`;
  },
};