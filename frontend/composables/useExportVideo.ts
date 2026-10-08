
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
  const cancellingRef = useRef(false);
  const currentJobRef = useRef(state.job);

  useEffect(() => {
    currentJobRef.current = state.job;
  }, [state.job]);

  const startExport = useCallback(async (projectId: string) => {
    if (startingRef.current) return;

    // Do not start another export while one is processing.
    if (currentJobRef.current?.status === "processing") return;

    startingRef.current = true;
    cancellingRef.current = false;

    dispatch({ type: "EXPORT_START" });

    try {
      const job = await exportService.create(projectId);
      currentJobRef.current = job;

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

  const cancelExport = useCallback(async () => {
    const job = currentJobRef.current;

    if (!job || job.status !== "processing") return;
    if (cancellingRef.current) return;

    cancellingRef.current = true;

    dispatch({ type: "EXPORT_CANCEL_START" });

    try {
      await exportService.cancel(job.id);

      // The backend acknowledges the request before FFmpeg fully stops.
      // Continue polling until the status becomes "cancelled".
      dispatch({ type: "EXPORT_CANCEL_REQUESTED" });
    } catch (error) {
      cancellingRef.current = false;

      dispatch({
        type: "EXPORT_CANCEL_ERROR",
        payload: getExportError(
          error,
          "Could not cancel video export.",
        ),
      });
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

        if (job.status !== "processing") {
          cancellingRef.current = false;
        }

        dispatch({
          type: "EXPORT_STATUS_UPDATED",
          payload: job,
        });

        if (job.status === "processing") {
          timer = setTimeout(checkStatus, 2000);
        }
      } catch (error) {
        if (!active) return;

        const status = axios.isAxiosError(error)
          ? error.response?.status
          : undefined;

        const transient =
          axios.isAxiosError(error) &&
          (status === undefined ||
            status === 408 ||
            status === 429 ||
            status >= 500);

        if (transient && consecutiveFailures < 5) {
          consecutiveFailures += 1;

          timer = setTimeout(
            checkStatus,
            Math.min(2000 * consecutiveFailures, 10000),
          );
          return;
        }

        cancellingRef.current = false;

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
    cancelExport,

    exportJob: state.job,
    exporting: state.loading,
    cancelling: state.cancelling,
    exportError: state.error,

    downloadUrl:
      state.job?.status === "completed" &&
      state.job.downloadAvailable !== false &&
      state.job.downloadUrl !== null
        ? state.job.downloadUrl
          ? new URL(
              state.job.downloadUrl,
              process.env.NEXT_PUBLIC_API_URL,
            ).toString()
          : exportService.getDownloadUrl(state.job.id)
        : null,
  };
}
