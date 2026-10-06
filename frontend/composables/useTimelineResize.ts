"use client";

import {
    useRef,
    useState,
    type Dispatch,
    type PointerEvent,
    type SetStateAction,
} from "react";

import { timelineService } from "@/services/timelineService";
import type { TimelineItem } from "@/types/timeline";
import {
  calculateLeftResize,
  calculateRightResize,
  PIXELS_PER_SECOND,
  type ResizeTrackItem,
} from "@/lib/timelineResizeUtils";

type ResizeEdge = "left" | "right";

type ResizeState = {
  itemId: string;
  edge: ResizeEdge;
  startClientX: number;
  startTime: number;
  duration: number;
  sourceStart: number;
  trackItems: ResizeTrackItem[];
  snapEdges: number[];
};

type UseTimelineResizeOptions = {
    items: TimelineItem[];
    displayDuration: number;
    onItemsChange: Dispatch<
        SetStateAction<TimelineItem[]>
    >;
};

export function useTimelineResize({
    items,
    displayDuration,
    onItemsChange,
}: UseTimelineResizeOptions) {
    const resizeStateRef =
        useRef<ResizeState | null>(null);

    const resizeUpdatesRef = useRef(
        new Map<
            string,
            {
                startTime: number;
                duration: number;
                trackId: string;
            }
        >(),
    );

    const [
        resizeSnapLinePosition,
        setResizeSnapLinePosition,
    ] = useState<number | null>(null);

    const handleResizeStart = (
        event: PointerEvent<HTMLButtonElement>,
        item: TimelineItem,
        edge: ResizeEdge,
    ) => {
        event.preventDefault();
        event.stopPropagation();

        resizeUpdatesRef.current.clear();

        resizeStateRef.current = {
            itemId: item.id,
            edge,
            startClientX: event.clientX,
            startTime: item.startTime,
            duration: item.duration,
            sourceStart: item.sourceStart ?? 0,
            trackItems: items
                .filter(
                    (other) => other.id !== item.id && other.trackId === item.trackId,
                )
                .map((other) => ({
                    id: other.id,
                    startTime: other.startTime,
                    duration: other.duration,
                    trackId: other.trackId,
                })),
            snapEdges: items
                .filter((other) => other.id !== item.id)
                .flatMap((other) => [
                    other.startTime,
                    other.startTime + other.duration,
                ]),
        };

        setResizeSnapLinePosition(null);
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handleResizeMove = (
        event: PointerEvent<HTMLButtonElement>,
    ) => {
        const state = resizeStateRef.current;
        if (!state) return;

        event.preventDefault();
        event.stopPropagation();

        const resizedItem = items.find(
            (item) => item.id === state.itemId,
        );

        if (!resizedItem) return;

        const movementSeconds =
            (event.clientX - state.startClientX) /
            PIXELS_PER_SECOND;

        const originalStart = state.startTime;
        const originalEnd =
            state.startTime + state.duration;

        let nextStart = originalStart;
        let nextEnd = originalEnd;
        let guideTime: number | null = null;

        let shiftedStarts =
            new Map<string, number>();

        if (state.edge === "right") {
            const result =
                calculateRightResize({
                    originalStart,
                    originalEnd,
                    movementSeconds,
                    sourceStart:
                        state.sourceStart,

                    itemType:
                        resizedItem.type,

                    mediaType:
                        resizedItem.type === "media"
                            ? resizedItem.file?.type
                            : undefined,

                    sourceDuration:
                        resizedItem.type === "media"
                            ? resizedItem.file
                                ?.durationSeconds
                            : undefined,

                    trackItems:
                        state.trackItems,

                    snapEdges:
                        state.snapEdges,
                });

            nextEnd =
                result.nextEnd;

            guideTime =
                result.guideTime;

            shiftedStarts =
                result.shiftedStarts;
        } else {
            const result =
                calculateLeftResize({
                    originalStart,
                    originalEnd,
                    movementSeconds,
                    sourceStart:
                        state.sourceStart,

                    itemType:
                        resizedItem.type,

                    mediaType:
                        resizedItem.type === "media"
                            ? resizedItem.file?.type
                            : undefined,

                    trackItems:
                        state.trackItems,

                    snapEdges:
                        state.snapEdges,
                });

            nextStart =
                result.nextStart;

            guideTime =
                result.guideTime;
        }

        const nextDuration =
            nextEnd - nextStart;

        /*
         * Only media needs sourceStart
         * adjustment.
         *
         * Text always keeps sourceStart at 0.
         */
        const nextSourceStart =
            resizedItem.type === "media" &&
                state.edge === "left"
                ? Math.max(
                    0,
                    state.sourceStart +
                    nextStart -
                    originalStart,
                )
                : state.sourceStart;

        setResizeSnapLinePosition(
            guideTime === null
                ? null
                : (guideTime / displayDuration) * 100,
        );

        const updates = new Map<
            string,
            {
                startTime: number;
                duration: number;
                trackId: string;
            }
        >();

        updates.set(state.itemId, {
            startTime: nextStart,
            duration: nextDuration,
            trackId: resizedItem.trackId,
        });

        for (const other of state.trackItems) {
            updates.set(other.id, {
                startTime:
                    shiftedStarts.get(other.id) ??
                    other.startTime,
                duration: other.duration,
                trackId: other.trackId,
            });
        }

        resizeUpdatesRef.current = updates;

        onItemsChange((currentItems) =>
            currentItems.map((item) => {
                if (item.id === state.itemId) {
                    return {
                        ...item,
                        startTime: nextStart,
                        duration: nextDuration,
                        sourceStart: nextSourceStart,
                    };
                }

                const original =
                    state.trackItems.find(
                        (other) =>
                            other.id === item.id,
                    );

                if (original) {
                    return {
                        ...item,
                        startTime:
                            shiftedStarts.get(item.id) ??
                            original.startTime,
                    };
                }

                return item;
            }),
        );
    };

    const handleResizeEnd = (event: PointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();

        if (!resizeStateRef.current) return;

        resizeStateRef.current = null;
        setResizeSnapLinePosition(null);

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }

        const updates =
            [...resizeUpdatesRef.current.entries()]
                .filter(
                    ([id]) =>
                        !id.startsWith("local-"),
                );
        resizeUpdatesRef.current.clear();

        void Promise.all(
            updates.map(([id, values]) => timelineService.updateItem(id, values)),
        ).catch((error) => {
            console.error("Could not save timeline resize:", error);
            window.alert(
                "Could not save the resize. Reload the page to restore saved values.",
            );
        });
    };

    return {
        resizeSnapLinePosition,
        handleResizeStart,
        handleResizeMove,
        handleResizeEnd,
    };
}