"use client";

import {
  useEffect,
  type Dispatch,
} from "react";

import type { TimelineItem } from "@/types/timeline";
import { timelineService } from "@/services/timelineService";

const TIMELINE_DURATION = 210;

type TimelineAction =
  | { type: "LOAD_ITEMS_START" }
  | {
      type: "LOAD_ITEMS_SUCCESS";
      payload: TimelineItem[];
    }
  | {
      type: "LOAD_ITEMS_ERROR";
      payload: string;
    };

type UseLoadTimelineProps = {
  projectId: string;
  dispatch: Dispatch<TimelineAction>;
};

export function useLoadTimeline({
  projectId,
  dispatch,
}: UseLoadTimelineProps) {
  useEffect(() => {
    let active = true;

    dispatch({
      type: "LOAD_ITEMS_START",
    });

    timelineService
      .getAll(projectId)
      .then((response) => {
        if (!active) return;

        const loadedItems: TimelineItem[] =
          response.items.flatMap<TimelineItem>(
            (item) => {
              // MEDIA
              if (
                item.itemType === "MEDIA" &&
                item.media
              ) {
                return [
                  {
                    id: item.id,
                    type: "media" as const,
                    file: item.media,

                    mediaScale: item.mediaScale ?? 1,
                    mediaX: item.mediaX ?? 0,
                    mediaY: item.mediaY ?? 0,
                    animationInPreset: item.animationInPreset,
                    animationInDuration: item.animationInDuration,
                    animationInAmount: item.animationInAmount,
                    animationOutPreset: item.animationOutPreset,
                    animationOutDuration: item.animationOutDuration,
                    animationOutAmount: item.animationOutAmount,
                    // Animation
                    animationPreset:
                      item.animationPreset ??
                      "none",

                    animationAmount:
                      item.animationAmount ??
                      50,

                    trackId: item.trackId,
                    startTime: item.startTime,
                    duration: item.duration,

                    startPosition:
                      (item.startTime /
                        TIMELINE_DURATION) *
                      100,

                    width:
                      (item.duration /
                        TIMELINE_DURATION) *
                      100,

                    sourceStart:
                      item.sourceStart ?? 0,
                  },
                ];
              }

              // TEXT
              if (
                item.itemType === "TEXT" &&
                item.textContent
              ) {
                return [
                  {
                    id: item.id,
                    type: "text" as const,

                    text: item.textContent,

                    textStyle:
                      item.textStyle ??
                      "title",

                    textX:
                      item.textX ?? 50,

                    textY:
                      item.textY ?? 50,

                    fontSize:
                      item.fontSize ??
                      undefined,

                    fontWeight:
                      item.fontWeight ??
                      undefined,

                    fontFamily:
                      item.fontFamily ??
                      undefined,

                    textColor:
                      item.textColor ??
                      undefined,

                    animationInPreset: item.animationInPreset,
                    animationInDuration: item.animationInDuration,
                    animationInAmount: item.animationInAmount,
                    animationOutPreset: item.animationOutPreset,
                    animationOutDuration: item.animationOutDuration,
                    animationOutAmount: item.animationOutAmount,
                    // Animation
                    animationPreset:
                      item.animationPreset ??
                      "none",

                    animationAmount:
                      item.animationAmount ??
                      50,

                    trackId:
                      item.trackId,

                    startTime:
                      item.startTime,

                    duration:
                      item.duration,

                    startPosition:
                      (item.startTime /
                        TIMELINE_DURATION) *
                      100,

                    width:
                      (item.duration /
                        TIMELINE_DURATION) *
                      100,

                    sourceStart:
                      item.sourceStart ?? 0,
                  },
                ];
              }

              return [];
            },
          );

        dispatch({
          type: "LOAD_ITEMS_SUCCESS",
          payload: loadedItems,
        });
      })
      .catch((error) => {
        if (!active) return;

        dispatch({
          type: "LOAD_ITEMS_ERROR",
          payload:
            error instanceof Error
              ? error.message
              : "Could not load timeline items.",
        });
      });

    return () => {
      active = false;
    };
  }, [projectId, dispatch]);
}