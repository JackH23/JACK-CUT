"use client";

import {
  useRef,
  type Dispatch,
  type PointerEvent,
  type SetStateAction,
} from "react";

import textLayout from "@/lib/textLayout.json";

type UseEditableTextResizeOptions = {
  fontSize: number;

  setSelected: Dispatch<
    SetStateAction<boolean>
  >;

  onFontSizeChange: (
    fontSize: number,
  ) => void;
};

export function useEditableTextResize({
  fontSize,
  setSelected,
  onFontSizeChange,
}: UseEditableTextResizeOptions) {
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    startFontSize: number;
    previewScale: number;
  } | null>(null);

  const handleResizePointerDown = (
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    setSelected(true);

    event.currentTarget.setPointerCapture(
      event.pointerId,
    );

    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startFontSize: fontSize,
      previewScale: Math.max(
        1,
        event.currentTarget.parentElement?.parentElement?.getBoundingClientRect().width
          ?? textLayout.referenceWidth,
      ) / textLayout.referenceWidth,
    };
  };

  const handleResizePointerMove = (
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    if (!resizeRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const deltaX =
      event.clientX -
      resizeRef.current.startX;

    const deltaY =
      event.clientY -
      resizeRef.current.startY;

    const delta =
      (deltaX + deltaY) / 2;

    const nextFontSize = Math.max(
      8,
      Math.min(
        200,
        resizeRef.current
          .startFontSize +
          delta / resizeRef.current.previewScale * 0.25,
      ),
    );

    onFontSizeChange(
      Math.round(nextFontSize),
    );
  };

  const handleResizePointerUp = (
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    resizeRef.current = null;

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
    handleResizePointerDown,
    handleResizePointerMove,
    handleResizePointerUp,
  };
}