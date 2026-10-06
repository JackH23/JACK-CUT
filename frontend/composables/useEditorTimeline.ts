"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { MediaFile } from "@/lib/media";
import type {
  TextStyle,
  TimelineItem,
} from "@/types/timeline";
import { useTimeline } from "@/composables/useTimeline";
import { timelineService } from "@/services/timelineService";
import {
  initialTimelineState,
  timelineReducer,
} from "@/reducers/timelineReducer";

const TIMELINE_DURATION = 210;

function getMediaDuration(file: MediaFile): Promise<number> {
  if (file.type === "image") {
    return Promise.resolve(5);
  }

  return new Promise((resolve, reject) => {
    const media =
      file.type === "video"
        ? document.createElement("video")
        : document.createElement("audio");

    media.preload = "metadata";
    media.src = file.url;

    media.onloadedmetadata = () => {
      resolve(Number.isFinite(media.duration) ? media.duration : 0);
    };

    media.onerror = () => {
      reject(new Error(`Could not load duration for ${file.name}`));
    };
  });
}

export function useEditorTimeline(projectId: string) {
  const [state, dispatch] = useReducer(timelineReducer, initialTimelineState);
  // Timeline seconds are the shared source of truth; percentages are visual only.
  const [playheadTime, setPlayheadTime] = useState(0);
  const pendingMediaIds = useRef(new Set<string>());
  const { tracks } = useTimeline();

  const timelineItems = state.items;

  useEffect(() => {
    let active = true;

    dispatch({ type: "LOAD_ITEMS_START" });

    timelineService
      .getAll(projectId)
      .then((response) => {
        if (!active) return;

        const loadedItems: TimelineItem[] =
          response.items.flatMap<TimelineItem>((item) => {
            if (
              item.itemType === "MEDIA" &&
              item.media
            ) {
              return [
                {
                  id: item.id,
                  type: "media" as const,
                  file: item.media,
                  trackId: item.trackId,
                  startTime: item.startTime,
                  duration: item.duration,
                  startPosition:
                    (item.startTime / TIMELINE_DURATION) * 100,
                  width:
                    (item.duration / TIMELINE_DURATION) * 100,
                  sourceStart: 0,
                },
              ];
            }

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
                    item.textStyle ?? "title",

                  textX: item.textX ?? 50,
                  textY: item.textY ?? 50,

                  fontSize:
                    item.fontSize ?? undefined,

                  fontWeight:
                    item.fontWeight ?? undefined,

                  fontFamily:
                    item.fontFamily ?? undefined,

                  textColor:
                    item.textColor ?? undefined,

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

                  sourceStart: 0,
                },
              ];
            }

            return [];
          });

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
  }, [projectId]);

  // Preserves the setter prop expected by TimelineContent/ScrollableTracks.
  const setTimelineItems: Dispatch<SetStateAction<TimelineItem[]>> =
    useCallback((update) => {
      dispatch({ type: "SET_ITEMS", payload: update });
    }, []);

  const handleSelectMedia = useCallback(
    async (file: MediaFile) => {
      if (
        pendingMediaIds.current.has(file.id) ||
        timelineItems.some(
          (item) =>
            item.type === "media" &&
            item.file?.id === file.id,
        )
      ) {
        return;
      }

      pendingMediaIds.current.add(file.id);
      dispatch({ type: "ADD_ITEM_START" });

      try {
        const mediaDuration = await getMediaDuration(file);

        if (mediaDuration <= 0) {
          throw new Error(`Could not read duration for ${file.name}`);
        }

        const targetTrackId = file.type === "audio" ? "voice" : "main-video";

        const startTime = timelineItems
          .filter((item) => item.trackId === targetTrackId)
          .reduce(
            (latestEnd, item) =>
              Math.max(latestEnd, item.startTime + item.duration),
            0,
          );

        const response = await timelineService.addItem({
          projectId,
          itemType: "MEDIA",
          mediaId: file.id,
          trackId: targetTrackId,
          startTime,
          duration: mediaDuration,
        });

        const savedItem = response.item;

        const newItem: TimelineItem = {
          id: savedItem.id,
          type: "media",
          file,
          trackId: savedItem.track_id,
          startTime: savedItem.start_time,
          duration: savedItem.duration,
          startPosition:
            (savedItem.start_time / TIMELINE_DURATION) * 100,
          width:
            (savedItem.duration / TIMELINE_DURATION) * 100,
          sourceStart: 0,
        };

        dispatch({
          type: "ADD_ITEM_SUCCESS",
          payload: newItem,
        });
      } catch (error) {
        dispatch({
          type: "ADD_ITEM_ERROR",
          payload:
            error instanceof Error
              ? error.message
              : "Could not add media to the timeline.",
        });
      } finally {
        pendingMediaIds.current.delete(file.id);
      }
    },
    [projectId, timelineItems],
  );

  const handleAddText = useCallback(
    async (style: TextStyle) => {
      const titleTrack = tracks.find(
        (track) => track.name === "V3 Titles",
      );

      if (!titleTrack) {
        console.error(
          "V3 Titles track was not found.",
        );
        return;
      }

      const defaultText: Record<
        TextStyle,
        string
      > = {
        heading: "Heading",
        subtitle: "Subtitle",
        title: "Title",
        caption: "Caption",
      };

      const duration = 5;

      // Find the end of the last text clip
      // on the V3 Titles track.
      const lastTextEndTime =
        timelineItems
          .filter(
            (item) =>
              item.type === "text" &&
              item.trackId === titleTrack.id,
          )
          .reduce(
            (latestEnd, item) =>
              Math.max(
                latestEnd,
                item.startTime +
                item.duration,
              ),
            0,
          );

      // Always append the new text directly
      // after the previous text clip.
      const startTime =
        lastTextEndTime;

      dispatch({
        type: "ADD_ITEM_START",
      });

      try {
        const response =
          await timelineService.addItem({
            projectId,
            itemType: "TEXT",
            textContent:
              defaultText[style],
            textStyle: style,
            trackId: titleTrack.id,
            startTime,
            duration,
          });

        const savedItem =
          response.item;

        const newItem: TimelineItem = {
          id: savedItem.id,
          type: "text",

          text:
            savedItem.text_content ??
            defaultText[style],

          textStyle:
            savedItem.text_style ??
            style,

          textX:
            savedItem.text_x ?? 50,

          textY:
            savedItem.text_y ?? 50,

          // Text styling
          fontSize:
            savedItem.font_size ?? undefined,

          fontWeight:
            savedItem.font_weight ?? undefined,

          fontFamily:
            savedItem.font_family ?? undefined,

          textColor:
            savedItem.text_color ?? undefined,

          trackId:
            savedItem.track_id,

          startTime:
            savedItem.start_time,

          duration:
            savedItem.duration,

          startPosition:
            (savedItem.start_time /
              TIMELINE_DURATION) *
            100,

          width:
            (savedItem.duration /
              TIMELINE_DURATION) *
            100,

          sourceStart: 0,
        };

        dispatch({
          type: "ADD_ITEM_SUCCESS",
          payload: newItem,
        });
      } catch (error) {
        dispatch({
          type: "ADD_ITEM_ERROR",
          payload:
            error instanceof Error
              ? error.message
              : "Could not add text to the timeline.",
        });
      }
    },
    [
      projectId,
      tracks,
      timelineItems,
    ],
  );

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
        });

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
    [timelineItems, setTimelineItems],
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

      // Keep text inside the preview.
      const normalizedX = Math.max(
        0,
        Math.min(100, x),
      );

      const normalizedY = Math.max(
        0,
        Math.min(100, y),
      );

      // Update UI immediately while dragging.
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

      // Update preview immediately while resizing.
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
        );
      } catch (error) {
        console.error(
          "Could not update text font size:",
          error,
        );

        // Restore previous value if saving fails.
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

      // Update preview immediately.
      setTimelineItems((currentItems) =>
        currentItems.map((timelineItem) =>
          timelineItem.id === itemId
            ? {
              ...timelineItem,
              fontWeight: normalizedFontWeight,
            }
            : timelineItem,
        ),
      );

      try {
        await timelineService.updateItem(
          itemId,
          {
            fontWeight: normalizedFontWeight,
          },
        );
      } catch (error) {
        console.error(
          "Could not update text font weight:",
          error,
        );

        // Restore previous value if saving fails.
        setTimelineItems((currentItems) =>
          currentItems.map((timelineItem) =>
            timelineItem.id === itemId
              ? {
                ...timelineItem,
                fontWeight: previousFontWeight,
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

      // Update preview immediately.
      setTimelineItems((currentItems) =>
        currentItems.map((timelineItem) =>
          timelineItem.id === itemId
            ? {
              ...timelineItem,
              fontFamily: normalizedFontFamily,
            }
            : timelineItem,
        ),
      );

      try {
        await timelineService.updateItem(
          itemId,
          {
            fontFamily: normalizedFontFamily,
          },
        );
      } catch (error) {
        console.error(
          "Could not update text font family:",
          error,
        );

        // Restore previous value if saving fails.
        setTimelineItems((currentItems) =>
          currentItems.map((timelineItem) =>
            timelineItem.id === itemId
              ? {
                ...timelineItem,
                fontFamily: previousFontFamily,
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

      // Update preview immediately.
      setTimelineItems((currentItems) =>
        currentItems.map((timelineItem) =>
          timelineItem.id === itemId
            ? {
              ...timelineItem,
              textColor: normalizedTextColor,
            }
            : timelineItem,
        ),
      );

      try {
        await timelineService.updateItem(
          itemId,
          {
            textColor: normalizedTextColor,
          },
        );
      } catch (error) {
        console.error(
          "Could not update text color:",
          error,
        );

        // Restore previous value if saving fails.
        setTimelineItems((currentItems) =>
          currentItems.map((timelineItem) =>
            timelineItem.id === itemId
              ? {
                ...timelineItem,
                textColor: previousTextColor,
              }
              : timelineItem,
          ),
        );
      }
    },
    [timelineItems, setTimelineItems],
  );

  const handleRemoveMedia = useCallback((fileId: string) => {
    dispatch({ type: "REMOVE_MEDIA", payload: fileId });
  }, []);

  const handleRemoveTimelineItem = useCallback(
    async (itemId: string) => {
      const item = timelineItems.find(
        (timelineItem) => timelineItem.id === itemId,
      );

      if (!item) return;

      try {
        await timelineService.removeItem(itemId);

        dispatch({
          type: "REMOVE_ITEM",
          payload: itemId,
        });
      } catch (error) {
        dispatch({
          type: "REMOVE_ITEM_ERROR",
          payload:
            error instanceof Error
              ? error.message
              : "Could not remove timeline item.",
        });
      }
    },
    [timelineItems],
  );

  const activePreviewItem = useMemo(() => {
    const trackPriority = new Map(
      tracks.map((track, index) => [track.id, index]),
    );

    return (
      timelineItems
        .filter((item) => {
          const isVisualFile =
            item.type === "media" &&
            (item.file?.type === "image" ||
              item.file?.type === "video");

          const endTime = item.startTime + item.duration;

          return (
            isVisualFile &&
            playheadTime >= item.startTime &&
            playheadTime < endTime
          );
        })
        .sort(
          (firstItem, secondItem) =>
            (trackPriority.get(firstItem.trackId) ??
              Number.MAX_SAFE_INTEGER) -
            (trackPriority.get(secondItem.trackId) ??
              Number.MAX_SAFE_INTEGER),
        )[0] ?? null
    );
  }, [playheadTime, timelineItems, tracks]);

  // Active text item at the current playhead position.
  const activeTextItem = useMemo(() => {
    return (
      timelineItems.find((item) => {
        if (item.type !== "text") {
          return false;
        }

        const endTime = item.startTime + item.duration;

        return (
          playheadTime >= item.startTime &&
          playheadTime < endTime
        );
      }) ?? null
    );
  }, [
    playheadTime,
    timelineItems,
  ]);

  const activePreviewFile =
    activePreviewItem?.file ?? null;

  const selectedMediaIds = useMemo(
    () =>
      new Set(
        timelineItems
          .filter(
            (item) =>
              item.type === "media" && item.file,
          )
          .map((item) => item.file!.id),
      ),
    [timelineItems],
  );

  return {
    timelineItems,
    setTimelineItems,
    playheadTime,
    setPlayheadTime,
    selectedMediaIds,
    activePreviewItem,
    activeTextItem,
    activePreviewFile,

    handleSelectMedia,
    handleAddText,
    handleUpdateText,
    handleUpdateTextPosition,

    handleUpdateTextFontSize,
    handleUpdateTextFontWeight,
    handleUpdateTextFontFamily,
    handleUpdateTextColor,

    handleRemoveMedia,

    addingTimelineItem: state.adding,
    timelineError: state.error,
    handleRemoveTimelineItem,
  };
}
