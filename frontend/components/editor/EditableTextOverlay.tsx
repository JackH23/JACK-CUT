"use client";

import {
  useRef,
  useState,
  type PointerEvent,
} from "react";

import type { TextStyle } from "@/types/timeline";

type EditableTextOverlayProps = {
  text: string;
  textStyle?: TextStyle;

  x: number;
  y: number;

  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  textColor?: string;

  onTextChange: (text: string) => void;

  onPositionChange: (
    x: number,
    y: number,
  ) => void;

  onFontSizeChange: (
    fontSize: number,
  ) => void;

  onSnapGuideChange?: (
    vertical: boolean,
    horizontal: boolean,
  ) => void;
};

const SNAP_THRESHOLD = 2;

const getDefaultFontSize = (
  textStyle: TextStyle,
) => {
  switch (textStyle) {
    case "heading":
      return 48;

    case "title":
      return 36;

    case "subtitle":
      return 30;

    case "caption":
      return 20;

    default:
      return 30;
  }
};

const getDefaultFontWeight = (
  textStyle: TextStyle,
) => {
  switch (textStyle) {
    case "heading":
    case "title":
      return 700;

    case "subtitle":
      return 600;

    case "caption":
      return 500;

    default:
      return 600;
  }
};

export default function EditableTextOverlay({
  text,
  textStyle = "subtitle",

  x,
  y,

  fontSize,
  fontWeight,
  fontFamily = "Arial",
  textColor = "#ffffff",

  onTextChange,
  onPositionChange,
  onFontSizeChange,
  onSnapGuideChange,
}: EditableTextOverlayProps) {
  const [selected, setSelected] =
    useState(false);

  const [editing, setEditing] =
    useState(false);

  /*
   * Use the saved font size when available.
   * Otherwise use the default for the preset.
   */
  const actualFontSize =
    fontSize ??
    getDefaultFontSize(textStyle);

  const actualFontWeight =
    fontWeight ??
    getDefaultFontWeight(textStyle);

  /*
   * Moving text
   */
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originalX: number;
    originalY: number;
  } | null>(null);

  /*
   * Resizing text
   */
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    startFontSize: number;
  } | null>(null);

  /*
   * Start moving
   */
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

  /*
   * Move text
   */
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

    /*
     * Measure the text box so the entire
     * text stays inside the preview.
     */
    const overlayRect =
      event.currentTarget.getBoundingClientRect();

    const halfWidthPercent =
      (overlayRect.width / 2 / rect.width) *
      100;

    const halfHeightPercent =
      (overlayRect.height / 2 / rect.height) *
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

    /*
     * Center snapping
     */
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

    onPositionChange(
      nextX,
      nextY,
    );
  };

  /*
   * Finish moving
   */
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

  /*
   * Start resizing
   */
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
      startFontSize: actualFontSize,
    };
  };

  /*
   * Resize text
   */
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

    /*
     * Dragging right/down makes text larger.
     * Dragging left/up makes text smaller.
     */
    const delta =
      (deltaX + deltaY) / 2;

    const nextFontSize =
      Math.max(
        8,
        Math.min(
          200,
          resizeRef.current
            .startFontSize +
            delta * 0.25,
        ),
      );

    onFontSizeChange(
      Math.round(nextFontSize),
    );
  };

  /*
   * Finish resizing
   */
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

  return (
    <div
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform:
          "translate(-50%, -50%)",
      }}
      className={`
        absolute
        z-40
        touch-none
        cursor-move
        select-none
        ${
          selected
            ? "outline outline-2 outline-purple-400"
            : ""
        }
      `}
      onPointerDown={
        handlePointerDown
      }
      onPointerMove={
        handlePointerMove
      }
      onPointerUp={
        handlePointerUp
      }
      onPointerCancel={
        handlePointerUp
      }
      onDoubleClick={(event) => {
        event.stopPropagation();

        setEditing(true);
        setSelected(true);

        onSnapGuideChange?.(
          false,
          false,
        );
      }}
    >
      {editing ? (
        <input
          autoFocus
          value={text}
          style={{
            fontSize: `${actualFontSize}px`,
            fontWeight:
              actualFontWeight,
            fontFamily,
            color: textColor,
            lineHeight: 1.1,
          }}
          onChange={(event) =>
            onTextChange(
              event.target.value,
            )
          }
          onBlur={() =>
            setEditing(false)
          }
          onKeyDown={(event) => {
            if (
              event.key === "Enter"
            ) {
              setEditing(false);
            }

            if (
              event.key === "Escape"
            ) {
              setEditing(false);
            }
          }}
          className="
            min-w-32
            bg-black/60
            px-2
            py-1
            text-center
            outline-none
          "
          onPointerDown={(event) =>
            event.stopPropagation()
          }
        />
      ) : (
        <div
          style={{
            fontSize: `${actualFontSize}px`,
            fontWeight:
              actualFontWeight,
            fontFamily,
            color: textColor,
            lineHeight: 1.1,
          }}
          className="
            whitespace-nowrap
            px-2
            py-1
            drop-shadow-lg
          "
        >
          {text}
        </div>
      )}

      {/* Text resize handle */}
      {selected && !editing && (
        <button
          type="button"
          aria-label="Resize text"
          className="
            absolute
            -bottom-2
            -right-2
            z-50
            h-4
            w-4
            touch-none
            cursor-nwse-resize
            rounded-full
            border-2
            border-purple-400
            bg-white
            shadow-md
          "
          onPointerDown={
            handleResizePointerDown
          }
          onPointerMove={
            handleResizePointerMove
          }
          onPointerUp={
            handleResizePointerUp
          }
          onPointerCancel={
            handleResizePointerUp
          }
        />
      )}
    </div>
  );
}