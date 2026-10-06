"use client";

import {
  useRef,
  type Dispatch,
  type PointerEvent,
  type SetStateAction,
} from "react";

const SNAP_THRESHOLD = 2;

type UseEditableTextDragOptions = {
  x: number;
  y: number;
  editing: boolean;

  setSelected: Dispatch<
    SetStateAction<boolean>
  >;

  onPositionChange: (
    x: number,
    y: number,
  ) => void;

  onSnapGuideChange?: (
    vertical: boolean,
    horizontal: boolean,
  ) => void;
};

export function useEditableTextDrag({
  x,
  y,
  editing,
  setSelected,
  onPositionChange,
  onSnapGuideChange,
}: UseEditableTextDragOptions) {
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originalX: number;
    originalY: number;
  } | null>(null);

  const handlePointerDown = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    if (editing) return;

    event.preventDefault();
    event.stopPropagation();

    setSelected(true);

    event.currentTarget.setPointerCapture(
      event.pointerId,
    );

    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originalX: x,
      originalY: y,
    };
  };

  const handlePointerMove = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    if (!dragRef.current || editing) {
      return;
    }

    const parent =
      event.currentTarget.parentElement;

    if (!parent) return;

    const rect =
      parent.getBoundingClientRect();

    const deltaX =
      ((event.clientX -
        dragRef.current.startX) /
        rect.width) *
      100;

    const deltaY =
      ((event.clientY -
        dragRef.current.startY) /
        rect.height) *
      100;

    let nextX =
      dragRef.current.originalX +
      deltaX;

    let nextY =
      dragRef.current.originalY +
      deltaY;

    const overlayRect =
      event.currentTarget.getBoundingClientRect();

    const halfWidthPercent =
      (overlayRect.width /
        2 /
        rect.width) *
      100;

    const halfHeightPercent =
      (overlayRect.height /
        2 /
        rect.height) *
      100;

    const minX = halfWidthPercent;
    const maxX =
      100 - halfWidthPercent;

    const minY = halfHeightPercent;
    const maxY =
      100 - halfHeightPercent;

    nextX = Math.max(
      minX,
      Math.min(maxX, nextX),
    );

    nextY = Math.max(
      minY,
      Math.min(maxY, nextY),
    );

    const snapToCenterX =
      Math.abs(nextX - 50) <=
      SNAP_THRESHOLD;

    const snapToCenterY =
      Math.abs(nextY - 50) <=
      SNAP_THRESHOLD;

    if (snapToCenterX) {
      nextX = 50;
    }

    if (snapToCenterY) {
      nextY = 50;
    }

    onSnapGuideChange?.(
      snapToCenterX,
      snapToCenterY,
    );

    onPositionChange(nextX, nextY);
  };

  const handlePointerUp = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    dragRef.current = null;

    onSnapGuideChange?.(
      false,
      false,
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
  };

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}