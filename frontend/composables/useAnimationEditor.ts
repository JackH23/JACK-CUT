"use client";

import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";

import type {
  TimelineItem,
} from "@/types/timeline";

import {
  timelineService,
} from "@/services/timelineService";

type UseAnimationEditorProps = {
  timelineItems: TimelineItem[];
  setTimelineItems: Dispatch<
    SetStateAction<TimelineItem[]>
  >;
};

export function useAnimationEditor({
  timelineItems,
  setTimelineItems,
}: UseAnimationEditorProps) {
  const handleUpdateAnimationPreset =
    useCallback(
      async (
        itemId: string,
        animationPreset: string,
      ) => {
        const previousItems =
          timelineItems;

        setTimelineItems((current) =>
          current.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  animationPreset,
                }
              : item,
          ),
        );

        try {
          await timelineService.updateItem(
            itemId,
            {
              animationPreset,
            },
          );
        } catch (error) {
          setTimelineItems(previousItems);
          console.error(
            "Could not update animation preset:",
            error,
          );
        }
      },
      [
        timelineItems,
        setTimelineItems,
      ],
    );

  const handleUpdateAnimationAmount =
    useCallback(
      async (
        itemId: string,
        animationAmount: number,
      ) => {
        const previousItems =
          timelineItems;

        setTimelineItems((current) =>
          current.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  animationAmount,
                }
              : item,
          ),
        );

        try {
          await timelineService.updateItem(
            itemId,
            {
              animationAmount,
            },
          );
        } catch (error) {
          setTimelineItems(previousItems);
          console.error(
            "Could not update animation amount:",
            error,
          );
        }
      },
      [
        timelineItems,
        setTimelineItems,
      ],
    );

  return {
    handleUpdateAnimationPreset,
    handleUpdateAnimationAmount,
  };
}