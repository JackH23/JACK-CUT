import type { ExportJob } from "@/lib/export";

export type ExportState = {
  job: ExportJob | null;
  loading: boolean;
  error: string | null;
};

export const initialExportState: ExportState = {
  job: null,
  loading: false,
  error: null,
};

type ExportAction =
  | { type: "EXPORT_START" }
  | { type: "EXPORT_CREATED"; payload: ExportJob }
  | { type: "EXPORT_STATUS_UPDATED"; payload: ExportJob }
  | { type: "EXPORT_ERROR"; payload: string };

export function exportReducer(
  state: ExportState,
  action: ExportAction,
): ExportState {
  switch (action.type) {
    case "EXPORT_START":
      return {
        job: null,
        loading: true,
        error: null,
      };

    case "EXPORT_CREATED":
      return {
        ...state,
        job: action.payload,
      };

    case "EXPORT_STATUS_UPDATED":
      return {
        ...state,
        job: action.payload,
        loading: action.payload.status === "processing",
        error:
          action.payload.status === "failed"
            ? action.payload.error ?? "Video export failed."
            : null,
      };

    case "EXPORT_ERROR":
      return {
        ...state,
        loading: false,
        error: action.payload,
      };

    default:
      return state;
  }
}