"use client";

import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

export type ResizeCorner =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

type UseVideoCanvasResizeOptions = {
  aspectRatio: number;
  minimumWidth: number;
};

export function useVideoCanvasResize({
  aspectRatio,
  minimumWidth,
}: UseVideoCanvasResizeOptions) {
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const resizeRef = useRef<{
    corner: ResizeCorner;
    startX: number;
    startY: number;
    startWidth: number;
  } | null>(null);

  const [canvasWidth, setCanvasWidth] = useState<number | null>(
    null,
  );

  const handleResizeStart = (
    event: ReactPointerEvent<HTMLButtonElement>,
    corner: ResizeCorner,
  ) => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    event.preventDefault();
    event.stopPropagation();

    resizeRef.current = {
      corner,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: canvas.getBoundingClientRect().width,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizeMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const resize = resizeRef.current;
    const canvasArea = canvasAreaRef.current;

    if (!resize || !canvasArea) return;

    event.preventDefault();

    const movesFromLeft =
      resize.corner === "top-left" ||
      resize.corner === "bottom-left";

    const movesFromTop =
      resize.corner === "top-left" ||
      resize.corner === "top-right";

    const horizontalMovement =
      (event.clientX - resize.startX) *
      (movesFromLeft ? -2 : 2);

    const verticalMovement =
      (event.clientY - resize.startY) *
      (movesFromTop ? -2 : 2) *
      aspectRatio;

    const movement =
      Math.abs(horizontalMovement) > Math.abs(verticalMovement)
        ? horizontalMovement
        : verticalMovement;

    const areaStyles = window.getComputedStyle(canvasArea);

    const horizontalPadding =
      Number.parseFloat(areaStyles.paddingLeft) +
      Number.parseFloat(areaStyles.paddingRight);

    const verticalPadding =
      Number.parseFloat(areaStyles.paddingTop) +
      Number.parseFloat(areaStyles.paddingBottom);

    const maximumWidth = Math.max(
      minimumWidth,
      Math.min(
        canvasArea.clientWidth - horizontalPadding,
        (canvasArea.clientHeight - verticalPadding) * aspectRatio,
      ),
    );

    const nextWidth = Math.min(
      Math.max(
        resize.startWidth + movement,
        minimumWidth,
      ),
      maximumWidth,
    );

    setCanvasWidth(nextWidth);
  };

  const handleResizeEnd = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    resizeRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return {
    canvasAreaRef,
    canvasRef,
    canvasWidth,
    handleResizeStart,
    handleResizeMove,
    handleResizeEnd,
  };
}