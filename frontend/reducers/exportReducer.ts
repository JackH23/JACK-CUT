
import type { ExportJob } from "@/lib/export";

export type ExportState = {
  job: ExportJob | null;
  loading: boolean;
  cancelling: boolean;
  error: string | null;
};

export const initialExportState: ExportState = {
  job: null,
  loading: false,
  cancelling: false,
  error: null,
};

type ExportAction =
  | { type: "EXPORT_START" }
  | { type: "EXPORT_CREATED"; payload: ExportJob }
  | { type: "EXPORT_STATUS_UPDATED"; payload: ExportJob }
  | { type: "EXPORT_CANCEL_START" }
  | { type: "EXPORT_CANCEL_REQUESTED" }
  | { type: "EXPORT_CANCEL_ERROR"; payload: string }
  | { type: "EXPORT_ERROR"; payload: string };

function normalizeProgress(
  incoming: number | null | undefined,
  previous: number | null | undefined = null,
): number | null {
  const previousValue =
    typeof previous === "number" &&
    Number.isFinite(previous)
      ? Math.min(100, Math.max(0, previous))
      : null;

  if (
    typeof incoming !== "number" ||
    !Number.isFinite(incoming)
  ) {
    return previousValue;
  }

  const currentValue = Math.min(
    100,
    Math.max(0, incoming),
  );

  return Math.max(previousValue ?? 0, currentValue);
}

export function exportReducer(
  state: ExportState,
  action: ExportAction,
): ExportState {
  switch (action.type) {
    case "EXPORT_START":
      return {
        job: null,
        loading: true,
        cancelling: false,
        error: null,
      };

    case "EXPORT_CREATED":
      return {
        ...state,
        job: {
          ...action.payload,
          progress: normalizeProgress(
            action.payload.progress,
          ),
        },
      };

    case "EXPORT_STATUS_UPDATED": {
      const previousJob =
        state.job?.id === action.payload.id
          ? state.job
          : null;

      const progress =
        action.payload.status === "completed"
          ? 100
          : normalizeProgress(
              action.payload.progress,
              previousJob?.progress,
            );

      const processing =
        action.payload.status === "processing";

      return {
        ...state,
        job: {
          ...previousJob,
          ...action.payload,
          progress,
        },
        loading: processing,
        cancelling: processing
          ? state.cancelling
          : false,
        error:
          action.payload.status === "failed"
            ? action.payload.error ??
              "Video export failed."
            : null,
      };
    }

    case "EXPORT_CANCEL_START":
      return {
        ...state,
        cancelling: true,
        error: null,
      };

    case "EXPORT_CANCEL_REQUESTED":
      return {
        ...state,
        cancelling: true,
      };

    case "EXPORT_CANCEL_ERROR":
      return {
        ...state,
        cancelling: false,
        error: action.payload,
      };

    case "EXPORT_ERROR":
      return {
        ...state,
        loading: false,
        cancelling: false,
        error: action.payload,
      };

    default:
      return state;
  }
}
