"use client";

import {
  useRef,
  useState,
  type PointerEvent,
} from "react";

type EditableTextOverlayProps = {
  text: string;
  x: number;
  y: number;
  onTextChange: (text: string) => void;
  onPositionChange: (x: number, y: number) => void;
};

export default function EditableTextOverlay({
  text,
  x,
  y,
  onTextChange,
  onPositionChange,
}: EditableTextOverlayProps) {
  const [selected, setSelected] = useState(false);
  const [editing, setEditing] = useState(false);

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
    if (!dragRef.current || editing) return;

    const parent =
      event.currentTarget.parentElement;

    if (!parent) return;

    const rect = parent.getBoundingClientRect();

    const deltaX =
      ((event.clientX - dragRef.current.startX) /
        rect.width) *
      100;

    const deltaY =
      ((event.clientY - dragRef.current.startY) /
        rect.height) *
      100;

    const nextX = Math.max(
      0,
      Math.min(
        100,
        dragRef.current.originalX + deltaX,
      ),
    );

    const nextY = Math.max(
      0,
      Math.min(
        100,
        dragRef.current.originalY + deltaY,
      ),
    );

    onPositionChange(nextX, nextY);
  };

  const handlePointerUp = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    dragRef.current = null;

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
        transform: "translate(-50%, -50%)",
      }}
      className={`absolute z-20 cursor-move select-none ${
        selected
          ? "outline outline-2 outline-purple-400"
          : ""
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={(event) => {
        event.stopPropagation();
        setEditing(true);
        setSelected(true);
      }}
    >
      {editing ? (
        <input
          autoFocus
          value={text}
          onChange={(event) =>
            onTextChange(event.target.value)
          }
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              setEditing(false);
            }

            if (event.key === "Escape") {
              setEditing(false);
            }
          }}
          className="min-w-32 bg-black/60 px-2 py-1 text-center text-3xl font-semibold text-white outline-none"
          onPointerDown={(event) =>
            event.stopPropagation()
          }
        />
      ) : (
        <div className="whitespace-nowrap px-2 py-1 text-3xl font-semibold text-white drop-shadow-lg">
          {text}
        </div>
      )}
    </div>
  );
}