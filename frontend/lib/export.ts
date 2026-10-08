
export type ExportJob = {
  id: string;

  status:
    | "processing"
    | "completed"
    | "failed"
    | "cancelled";

  // FFmpeg rendering progress (0–100)
  progress?: number | null;

  error?: string | null;
  downloadUrl?: string | null;
  downloadAvailable?: boolean;
  expiresAt?: string | null;
  statusUrl?: string;
};
