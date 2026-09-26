export type ExportJob = {
  id: string;
  status: "processing" | "completed" | "failed";
  error?: string | null;
  downloadUrl?: string | null;
  statusUrl?: string;
};