
"use client";

import axios from "axios";
import {
  useEffect,
  useReducer,
  useState,
  type ChangeEvent,
} from "react";

import type { MediaFile } from "@/lib/media";
import { mediaService } from "@/services/mediaService";
import {
  initialMediaState,
  mediaReducer,
} from "@/reducers/mediaReducer";

export function useMediaSidebar(
  projectId: string,
  onRemoveMedia: (fileId: string) => void | Promise<void>,
) {
  const [state, dispatch] = useReducer(
    mediaReducer,
    initialMediaState,
  );

  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;

    mediaService
      .getAll(projectId)
      .then((response) => {
        if (active) {
          dispatch({
            type: "LOAD_MEDIA",
            payload: response.media,
          });
        }
      })
      .catch((error) => {
        if (active) {
          dispatch({
            type: "UPLOAD_ERROR",
            payload:
              error instanceof Error
                ? error.message
                : "Failed to load media.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [projectId]);

  const handleFileUpload = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);

    if (files.length === 0) return;

    input.value = "";

    dispatch({ type: "UPLOAD_START" });

    try {
      const response = await mediaService.upload(
        projectId,
        files,
      );

      dispatch({
        type: "UPLOAD_SUCCESS",
        payload: response.media,
      });
    } catch (error) {
      dispatch({
        type: "UPLOAD_ERROR",
        payload:
          error instanceof Error
            ? error.message
            : "Failed to upload media.",
      });
    }
  };

  const handleRemoveMedia = async (
    file: MediaFile,
  ): Promise<void> => {
    try {
      // Wait for backend deletion.
      await mediaService.remove(projectId, file.id);

      // Remove deleted media from sidebar.
      dispatch({
        type: "REMOVE_MEDIA",
        payload: file.id,
      });

      // Synchronize associated timeline clips.
      await onRemoveMedia(file.id);
    } catch (error) {
      const message = axios.isAxiosError<{
        message?: string;
      }>(error)
        ? (error.response?.data?.message ??
          error.message)
        : error instanceof Error
          ? error.message
          : "Failed to remove media.";

      dispatch({
        type: "UPLOAD_ERROR",
        payload: message,
      });

      throw error;
    }
  };

  const filteredFiles = state.files.filter(
    (file) =>
      file.name
        .toLowerCase()
        .includes(search.toLowerCase()),
  );

  return {
    state,
    search,
    setSearch,
    filteredFiles,
    handleFileUpload,
    handleRemoveMedia,
  };
}
