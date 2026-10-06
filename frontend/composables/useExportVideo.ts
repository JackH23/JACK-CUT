"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import axios from "axios";

import { exportService } from "@/services/exportService";
import {
  exportReducer,
  initialExportState,
} from "@/reducers/exportReducer";

function getExportError(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;

    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return error instanceof Error ? error.message : fallback;
}

export function useExportVideo() {
  const [state, dispatch] = useReducer(exportReducer, initialExportState);
  const startingRef = useRef(false);

  const startExport = useCallback(async (projectId: string) => {
    if (startingRef.current) return;

    startingRef.current = true;
    dispatch({ type: "EXPORT_START" });

    try {
      const job = await exportService.create(projectId);

      dispatch({
        type: "EXPORT_CREATED",
        payload: job,
      });
    } catch (error) {
      dispatch({
        type: "EXPORT_ERROR",
        payload: getExportError(error, "Could not start video export."),
      });
    } finally {
      startingRef.current = false;
    }
  }, []);

  const jobId = state.job?.id;
  const jobStatus = state.job?.status;

  useEffect(() => {
    if (!jobId || jobStatus !== "processing") return;

    let active = true;
    let consecutiveFailures = 0;
    let timer: ReturnType<typeof setTimeout>;

    async function checkStatus() {
      try {
        const job = await exportService.get(jobId!);
        if (!active) return;

        consecutiveFailures = 0;

        dispatch({
          type: "EXPORT_STATUS_UPDATED",
          payload: job,
        });

        if (job.status === "processing") {
          timer = setTimeout(checkStatus, 2000);
        }
      } catch (error) {
        if (!active) return;
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        const transient = axios.isAxiosError(error) &&
          (status === undefined || status === 408 || status === 429 || status >= 500);
        if (transient && consecutiveFailures < 5) {
          consecutiveFailures += 1;
          timer = setTimeout(checkStatus, Math.min(2000 * consecutiveFailures, 10000));
          return;
        }

        dispatch({
          type: "EXPORT_ERROR",
          payload: getExportError(
            error,
            "Could not check export status.",
          ),
        });
      }
    }

    timer = setTimeout(checkStatus, 2000);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [jobId, jobStatus]);

  return {
    startExport,
    exportJob: state.job,
    exporting: state.loading,
    exportError: state.error,
    downloadUrl:
      state.job?.status === "completed"
        ? state.job.downloadUrl
          ? new URL(
              state.job.downloadUrl,
              process.env.NEXT_PUBLIC_API_URL,
            ).toString()
          : exportService.getDownloadUrl(state.job.id)
        : null,
  };
}