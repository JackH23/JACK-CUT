"use client";

import { useRef, useState, type CSSProperties } from "react";
import textLayout from "@/lib/textLayout.json";
import type { TextStyle } from "@/types/timeline";
import { useEditableTextDrag } from "@/composables/useEditableTextDrag";
import { useEditableTextResize } from "@/composables/useEditableTextResize";

type EditableTextOverlayProps = {
  animationStyle?: CSSProperties;
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

export default function EditableTextOverlay({
  text,
  animationStyle,
  textStyle = "subtitle",

  x,
  y,

  fontSize,
  fontWeight,
  fontFamily = textLayout.fontFamily,
  textColor = textLayout.textColor,

  onTextChange,
  onPositionChange,
  onFontSizeChange,
  onSnapGuideChange,
}: EditableTextOverlayProps) {
  const [selected, setSelected] =
    useState(false);

  const [draftText, setDraftText] = useState(text);
  const editingSessionRef = useRef(false);

  const [editing, setEditing] =
    useState(false);

  const finishEditing = (finalDraft: string) => {
    if (!editingSessionRef.current) return;

    // Enter/Escape and blur can finish the same edit; commit it only once.
    editingSessionRef.current = false;
    if (finalDraft !== text) {
      onTextChange(finalDraft);
    }
    setEditing(false);
  };

  /*
   * Use the saved font size when available.
   * Otherwise use the default for the preset.
   */
  const actualFontSize =
    fontSize ??
    textLayout.presets[textStyle].fontSize;

  const actualFontWeight =
    fontWeight ??
    textLayout.presets[textStyle].fontWeight;

  // The @container in VideoCanvas is the reference for cqw units.
  // Saved font sizes are reference-canvas units, never screen pixels.
  const previewFontSize = `${actualFontSize / textLayout.referenceWidth * 100}cqw`;

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

        editingSessionRef.current = true;
        setDraftText(text);
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
          value={draftText}
          style={{
            fontSize: previewFontSize,
            fontWeight:
              actualFontWeight,
            fontFamily,
            color: textColor,
            lineHeight: 1.1,
          }}
          onChange={(event) =>
            setDraftText(event.target.value)
          }
          onBlur={(event) => finishEditing(event.currentTarget.value)}
          onKeyDown={(event) => {
            event.stopPropagation();

            if (
              !event.nativeEvent.isComposing &&
              (event.key === "Enter" || event.key === "Escape")
            ) {
              event.preventDefault();
              finishEditing(event.currentTarget.value);
            }
          }}
          onKeyUp={(event) => event.stopPropagation()}
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
            fontSize: previewFontSize,
            fontWeight:
              actualFontWeight,
            fontFamily,
            color: textColor,
            lineHeight: 1.1,
            ...animationStyle,
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