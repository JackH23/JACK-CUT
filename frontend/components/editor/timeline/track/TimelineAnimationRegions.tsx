import {
  useRef,
  type PointerEvent,
} from "react";

import type { TimelineItem } from "@/types/timeline";

type AnimationPhase = "in" | "out";

type TimelineAnimationRegionsProps = {
  item: TimelineItem;

  onDurationChange?: (
    itemId: string,
    phase: AnimationPhase,
    duration: number,
    persist: boolean,
  ) => void;
};

type AnimationDragState = {
  phase: AnimationPhase;
  pointerId: number;
  startX: number;
  startDuration: number;
  clipWidth: number;
};

// Percentages follow the current clip duration
// without changing saved settings.
function regionWidth(
  preset: string | null | undefined,
  duration: number | null | undefined,
  clipDuration: number,
) {
  if (
    !preset ||
    preset === "none" ||
    !Number.isFinite(duration) ||
    !Number.isFinite(clipDuration) ||
    clipDuration <= 0
  ) {
    return 0;
  }

  return (
    Math.min(
      1,
      Math.max(
        0,
        (duration ?? 0) / clipDuration,
      ),
    ) * 100
  );
}

export default function TimelineAnimationRegions({
  item,
  onDurationChange,
}: TimelineAnimationRegionsProps) {
  const dragRef =
    useRef<AnimationDragState | null>(null);

  const handlePointerDown = (
    event: PointerEvent<HTMLButtonElement>,
    phase: AnimationPhase,
    duration: number,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const clipElement =
      event.currentTarget.closest(
        "[data-timeline-clip]",
      ) as HTMLElement | null;

    if (!clipElement) return;

    const clipWidth =
      clipElement.getBoundingClientRect().width;

    if (clipWidth <= 0) return;

    dragRef.current = {
      phase,
      pointerId: event.pointerId,
      startX: event.clientX,
      startDuration: duration,
      clipWidth,
    };

    event.currentTarget.setPointerCapture(
      event.pointerId,
    );
  };

  const calculateDuration = (
    event: PointerEvent<HTMLButtonElement>,
    drag: AnimationDragState,
  ) => {
    const deltaX =
      event.clientX - drag.startX;

    const deltaDuration =
      (deltaX / drag.clipWidth) *
      item.duration;

    const nextDuration =
      drag.phase === "in"
        ? drag.startDuration +
          deltaDuration
        : drag.startDuration -
          deltaDuration;

    return Math.max(
      0,
      Math.min(
        item.duration,
        nextDuration,
      ),
    );
  };

  const handlePointerMove = (
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    const drag = dragRef.current;

    if (
      !drag ||
      drag.pointerId !== event.pointerId
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const duration =
      calculateDuration(event, drag);

    onDurationChange?.(
      item.id,
      drag.phase,
      duration,
      false,
    );
  };

  const handlePointerUp = (
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    const drag = dragRef.current;

    if (
      !drag ||
      drag.pointerId !== event.pointerId
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const duration =
      calculateDuration(event, drag);

    onDurationChange?.(
      item.id,
      drag.phase,
      duration,
      true,
    );

    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId,
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId,
      );
    }

    dragRef.current = null;
  };

  const isSupportedItem =
    item.type === "text" ||
    item.file?.type === "image" ||
    item.file?.type === "video";

  if (!isSupportedItem) {
    return null;
  }

  const regions = [
    {
      phase: "in" as const,
      label: "IN",
      preset: item.animationInPreset,
      duration: item.animationInDuration,
      width: regionWidth(
        item.animationInPreset,
        item.animationInDuration,
        item.duration,
      ),
    },
    {
      phase: "out" as const,
      label: "OUT",
      preset: item.animationOutPreset,
      duration: item.animationOutDuration,
      width: regionWidth(
        item.animationOutPreset,
        item.animationOutDuration,
        item.duration,
      ),
    },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {regions
        .filter((region) => region.width > 0)
        .map((region) => (
          <div
            key={region.phase}
            data-animation-region={
              region.phase
            }
            title={`Animation ${region.label}: ${Math.min(
              region.duration ?? 0,
              item.duration,
            )}s (${region.preset})`}
            style={{
              width: `${region.width}%`,
            }}
            className={`absolute overflow-visible [container-type:inline-size] ${
              region.phase === "in"
                ? "inset-y-0 left-0 border-r-2 border-purple-300/90 bg-purple-500/20"
                : "inset-y-0 right-0 border-l-2 border-pink-300/90 bg-pink-500/20"
            }`}
          >
            <span
              className={`pointer-events-none absolute hidden rounded bg-black/60 px-1 text-[9px] font-bold leading-4 @[32px]:block ${
                region.phase === "in"
                  ? "left-2 top-1 text-purple-200"
                  : "right-2 top-1 text-pink-200"
              }`}
            >
              {region.label}
            </span>

            <button
              type="button"
              draggable={false}
              aria-label={`Resize animation ${region.label} duration`}
              onPointerDown={(event) =>
                handlePointerDown(
                  event,
                  region.phase,
                  region.duration ?? 0,
                )
              }
              onPointerMove={
                handlePointerMove
              }
              onPointerUp={handlePointerUp}
              onPointerCancel={
                handlePointerUp
              }
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              className={`pointer-events-auto absolute inset-y-0 z-20 w-2 touch-none cursor-ew-resize ${
                region.phase === "in"
                  ? "-right-1"
                  : "-left-1"
              }`}
            />
          </div>
        ))}
    </div>
  );
}