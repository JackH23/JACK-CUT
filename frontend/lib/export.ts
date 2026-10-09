
export type ExportJob = {
  id: string;

  status:
    | "processing"
    | "completed"
    | "failed"
    | "cancelled";

  stage?: 'preparing' | 'starting' | 'rendering' | 'uploading' | 'cancelling' | 'completed' | 'failed' | 'cancelled';
  cancelRequested?: boolean;

  // FFmpeg rendering progress (0–100)
  progress?: number | null;

  error?: string | null;
  downloadUrl?: string | null;
  downloadAvailable?: boolean;
  expiresAt?: string | null;
  statusUrl?: string;
};

export function exportStageLabel(stage?: ExportJob['stage']): string {
  return ({ preparing: 'Preparing media', starting: 'Starting renderer', rendering: 'Rendering video', uploading: 'Uploading MP4',
    completed: 'Completed', failed: 'Failed', cancelling: 'Cancelling', cancelled: 'Cancelled' })[stage || 'preparing'];
}
