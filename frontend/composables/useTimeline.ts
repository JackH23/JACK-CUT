"use client";

import { useEffect, useState } from "react";
import { timelineService } from "@/services/timelineService";

export type TimelineTrack = {
  id: string;
  name: string;
  color: string;
  type: "video" | "audio";
};

const timelineTimes = [
  "00:00:00",
  "00:00:30",
  "00:01:00",
  "00:01:30",
  "00:02:00",
  "00:02:30",
  "00:03:00",
];

export function useTimeline() {
  const [tracks, setTracks] = useState<TimelineTrack[]>([]);
  const [tracksError, setTracksError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    timelineService
      .getTracks()
      .then((response) => {
        if (!active) return;

        setTracks(
          [...response.tracks]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(({ id, name, color, type }) => ({
              id,
              name,
              color,
              type,
            })),
        );
      })
      .catch(() => {
        if (active) setTracksError("Could not load timeline tracks.");
      });

    return () => {
      active = false;
    };
  }, []);

  return { tracks, timelineTimes, tracksError };
}