export type ExportJob = {
  id: string;
  status: "processing" | "completed" | "failed";

  // FFmpeg rendering progress (0–100)
  progress?: number | null;

  error?: string | null;
  downloadUrl?: string | null;
  statusUrl?: string;
};