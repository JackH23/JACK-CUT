"use client";

import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { TimelineItem } from "@/types/timeline";
import { timelineService } from "@/services/timelineService";

type UseTextEditorProps = {
  projectId: string;
  timelineItems: TimelineItem[];
  setTimelineItems: Dispatch<
    SetStateAction<TimelineItem[]>
  >;
};

export function useTextEditor({
  projectId,
  timelineItems,
  setTimelineItems,
}: UseTextEditorProps) {
  const handleUpdateText = useCallback(
    async (itemId: string, text: string) => {
      const normalizedText = text.trim();

      if (!normalizedText) return;

      const item = timelineItems.find(
        (timelineItem) =>
          timelineItem.id === itemId &&
          timelineItem.type === "text",
      );

      if (!item) return;

      try {
        await timelineService.updateItem(itemId, {
          textContent: normalizedText,
        }, projectId);

        setTimelineItems((currentItems) =>
          currentItems.map((timelineItem) =>
            timelineItem.id === itemId
              ? {
                  ...timelineItem,
                  text: normalizedText,
                }
              : timelineItem,
          ),
        );
      } catch (error) {
        console.error(
          "Could not update timeline text:",
          error,
        );
      }
    },
    [projectId, timelineItems, setTimelineItems],
  );

  const handleUpdateTextPosition = useCallback(
    async (
      itemId: string,
      x: number,
      y: number,
    ) => {
      const item = timelineItems.find(
        (timelineItem) =>
          timelineItem.id === itemId &&
          timelineItem.type === "text",
      );

      if (!item) return;

      const normalizedX = Math.max(
        0,
        Math.min(100, x),
      );

      const normalizedY = Math.max(
        0,
        Math.min(100, y),
      );

      setTimelineItems((currentItems) =>
        currentItems.map((timelineItem) =>
          timelineItem.id === itemId
            ? {
                ...timelineItem,
                textX: normalizedX,
                textY: normalizedY,
              }
            : timelineItem,
        ),
      );

      try {
        await timelineService.updateItem(
          itemId,
          {
            textX: normalizedX,
            textY: normalizedY,
          },
          projectId,
        );
      } catch (error) {
        console.error(
          "Could not update text position:",
          error,
        );
      }
    },
    [timelineItems, setTimelineItems],
  );

  const handleUpdateTextFontSize = useCallback(
    async (
      itemId: string,
      fontSize: number,
    ) => {
      const item = timelineItems.find(
        (timelineItem) =>
          timelineItem.id === itemId &&
          timelineItem.type === "text",
      );

      if (!item) return;

      const normalizedFontSize = Math.max(
        8,
        Math.min(200, fontSize),
      );

      const previousFontSize = item.fontSize;

      setTimelineItems((currentItems) =>
        currentItems.map((timelineItem) =>
          timelineItem.id === itemId
            ? {
                ...timelineItem,
                fontSize: normalizedFontSize,
              }
            : timelineItem,
        ),
      );

      try {
        await timelineService.updateItem(
          itemId,
          {
            fontSize: normalizedFontSize,
          },
          projectId,
        );
      } catch (error) {
        console.error(
          "Could not update text font size:",
          error,
        );

        setTimelineItems((currentItems) =>
          currentItems.map((timelineItem) =>
            timelineItem.id === itemId
              ? {
                  ...timelineItem,
                  fontSize: previousFontSize,
                }
              : timelineItem,
          ),
        );
      }
    },
    [timelineItems, setTimelineItems],
  );

  const handleUpdateTextFontWeight = useCallback(
    async (
      itemId: string,
      fontWeight: number,
    ) => {
      const item = timelineItems.find(
        (timelineItem) =>
          timelineItem.id === itemId &&
          timelineItem.type === "text",
      );

      if (!item) return;

      const normalizedFontWeight = Math.max(
        100,
        Math.min(900, fontWeight),
      );

      const previousFontWeight = item.fontWeight;

      setTimelineItems((currentItems) =>
        currentItems.map((timelineItem) =>
          timelineItem.id === itemId
            ? {
                ...timelineItem,
                fontWeight:
                  normalizedFontWeight,
              }
            : timelineItem,
        ),
      );

      try {
        await timelineService.updateItem(
          itemId,
          {
            fontWeight:
              normalizedFontWeight,
          },
          projectId,
        );
      } catch (error) {
        console.error(
          "Could not update text font weight:",
          error,
        );

        setTimelineItems((currentItems) =>
          currentItems.map((timelineItem) =>
            timelineItem.id === itemId
              ? {
                  ...timelineItem,
                  fontWeight:
                    previousFontWeight,
                }
              : timelineItem,
          ),
        );
      }
    },
    [timelineItems, setTimelineItems],
  );

  const handleUpdateTextFontFamily = useCallback(
    async (
      itemId: string,
      fontFamily: string,
    ) => {
      const item = timelineItems.find(
        (timelineItem) =>
          timelineItem.id === itemId &&
          timelineItem.type === "text",
      );

      if (!item) return;

      const normalizedFontFamily =
        fontFamily.trim();

      if (!normalizedFontFamily) return;

      const previousFontFamily =
        item.fontFamily;

      setTimelineItems((currentItems) =>
        currentItems.map((timelineItem) =>
          timelineItem.id === itemId
            ? {
                ...timelineItem,
                fontFamily:
                  normalizedFontFamily,
              }
            : timelineItem,
        ),
      );

      try {
        await timelineService.updateItem(
          itemId,
          {
            fontFamily:
              normalizedFontFamily,
          },
          projectId,
        );
      } catch (error) {
        console.error(
          "Could not update text font family:",
          error,
        );

        setTimelineItems((currentItems) =>
          currentItems.map((timelineItem) =>
            timelineItem.id === itemId
              ? {
                  ...timelineItem,
                  fontFamily:
                    previousFontFamily,
                }
              : timelineItem,
          ),
        );
      }
    },
    [timelineItems, setTimelineItems],
  );

  const handleUpdateTextColor = useCallback(
    async (
      itemId: string,
      textColor: string,
    ) => {
      const item = timelineItems.find(
        (timelineItem) =>
          timelineItem.id === itemId &&
          timelineItem.type === "text",
      );

      if (!item) return;

      const normalizedTextColor =
        textColor.trim();

      if (!normalizedTextColor) return;

      const previousTextColor =
        item.textColor;

      setTimelineItems((currentItems) =>
        currentItems.map((timelineItem) =>
          timelineItem.id === itemId
            ? {
                ...timelineItem,
                textColor:
                  normalizedTextColor,
              }
            : timelineItem,
        ),
      );

      try {
        await timelineService.updateItem(
          itemId,
          {
            textColor:
              normalizedTextColor,
          },
          projectId,
        );
      } catch (error) {
        console.error(
          "Could not update text color:",
          error,
        );

        setTimelineItems((currentItems) =>
          currentItems.map((timelineItem) =>
            timelineItem.id === itemId
              ? {
                  ...timelineItem,
                  textColor:
                    previousTextColor,
                }
              : timelineItem,
          ),
        );
      }
    },
    [timelineItems, setTimelineItems],
  );

  return {
    handleUpdateText,
    handleUpdateTextPosition,
    handleUpdateTextFontSize,
    handleUpdateTextFontWeight,
    handleUpdateTextFontFamily,
    handleUpdateTextColor,
  };
}