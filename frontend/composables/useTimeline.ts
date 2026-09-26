"use client";

import { useEffect, useMemo, useReducer } from "react";
import { timelineService } from "@/services/timelineService";
import {
  initialTimelineTracksState,
  timelineTracksReducer,
} from "@/reducers/timelineTracksReducer";
import type { TimelineItem } from "@/types/timeline";

export type TimelineTrack = {
  id: string;
  name: string;
  color: string;
  type: "video" | "audio";
};

const RULER_INTERVAL = 30;

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return [hours, minutes, remainingSeconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function useTimeline(items: TimelineItem[] = []) {
  const [state, dispatch] = useReducer(
    timelineTracksReducer,
    initialTimelineTracksState,
  );

  useEffect(() => {
    let active = true;

    dispatch({ type: "TRACKS_LOAD_START" });

    timelineService
      .getTracks()
      .then((response) => {
        if (active) {
          dispatch({
            type: "TRACKS_LOAD_SUCCESS",
            payload: response.tracks,
          });
        }
      })
      .catch(() => {
        if (active) {
          dispatch({
            type: "TRACKS_LOAD_ERROR",
            payload: "Could not load timeline tracks.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const tracks = useMemo<TimelineTrack[]>(
    () =>
      [...state.tracks]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(({ id, name, color, type }) => ({
          id,
          name,
          color,
          type,
        })),
    [state.tracks],
  );

  const lastClipEnd = Math.max(
    0,
    ...items.map((item) => item.startTime + item.duration),
  );

  const timelineDuration = Math.max(1, lastClipEnd);

  const timelineTimes = Array.from(
    { length: Math.floor(timelineDuration / RULER_INTERVAL) + 1 },
    (_, index) => formatTime(index * RULER_INTERVAL),
  );

  return {
    tracks,
    timelineTimes,
    timelineDuration,
    tracksError: state.error,
    tracksLoading: state.loading,
  };
}
