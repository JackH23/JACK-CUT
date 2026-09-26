import { useMemo } from "react";
import type { TimelineItem } from "@/types/timeline";

export function useTimelineDuration(items: TimelineItem[]): number {
  return useMemo(
    () =>
      items.reduce(
        (latestEnd, item) =>
          Math.max(latestEnd, item.startTime + item.duration),
        0,
      ),
    [items],
  );
}