"use client";

import { useState } from "react";
import type { TextStyle } from "@/types/timeline";
import { useEditableTextDrag } from "@/composables/useEditableTextDrag";
import { useEditableTextResize } from "@/composables/useEditableTextResize";

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
  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useEditableTextDrag({
    x,
    y,
    editing,
    setSelected,
    onPositionChange,
    onSnapGuideChange,
  });

  /*
   * Resizing text
   */
  const {
    handleResizePointerDown,
    handleResizePointerMove,
    handleResizePointerUp,
  } = useEditableTextResize({
    fontSize: actualFontSize,
    setSelected,
    onFontSizeChange,
  });

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
        ${selected
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