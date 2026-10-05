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

    onPositionChange: (
        x: number,
        y: number,
    ) => void;

    onSnapGuideChange?: (
        vertical: boolean,
        horizontal: boolean,
    ) => void;
};

const SNAP_THRESHOLD = 2;

export default function EditableTextOverlay({
    text,
    x,
    y,
    onTextChange,
    onPositionChange,
    onSnapGuideChange,
}: EditableTextOverlayProps) {
    const [selected, setSelected] =
        useState(false);

    const [editing, setEditing] =
        useState(false);

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

        // Size of the text overlay.
        const overlayRect =
            event.currentTarget.getBoundingClientRect();

        // Convert half of the text size into
        // percentage values relative to the preview.
        const halfWidthPercent =
            (overlayRect.width / 2 / rect.width) *
            100;

        const halfHeightPercent =
            (overlayRect.height / 2 / rect.height) *
            100;

        // Keep the ENTIRE text box inside the preview.
        const minX = halfWidthPercent;
        const maxX = 100 - halfWidthPercent;

        const minY = halfHeightPercent;
        const maxY = 100 - halfHeightPercent;

        nextX = Math.max(
            minX,
            Math.min(maxX, nextX),
        );

        nextY = Math.max(
            minY,
            Math.min(maxY, nextY),
        );

        // Detect vertical center.
        const snapToCenterX =
            Math.abs(nextX - 50) <=
            SNAP_THRESHOLD;

        // Detect horizontal center.
        const snapToCenterY =
            Math.abs(nextY - 50) <=
            SNAP_THRESHOLD;

        // Snap to exact center.
        if (snapToCenterX) {
            nextX = 50;
        }

        if (snapToCenterY) {
            nextY = 50;
        }

        // Tell PreviewMonitor / VideoCanvas
        // which guide lines should be visible.
        onSnapGuideChange?.(
            snapToCenterX,
            snapToCenterY,
        );

        onPositionChange(
            nextX,
            nextY,
        );
    };

    const handlePointerUp = (
        event: PointerEvent<HTMLDivElement>,
    ) => {
        dragRef.current = null;

        // Hide guide lines after drag ends.
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

    return (
        <div
            style={{
                left: `${x}%`,
                top: `${y}%`,
                transform:
                    "translate(-50%, -50%)",
            }}
            className={`absolute z-40 touch-none cursor-move select-none ${selected
                    ? "outline outline-2 outline-purple-400"
                    : ""
                }`}
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
            text-3xl
            font-semibold
            text-white
            outline-none
          "
                    onPointerDown={(event) =>
                        event.stopPropagation()
                    }
                />
            ) : (
                <div
                    className="
            whitespace-nowrap
            px-2
            py-1
            text-3xl
            font-semibold
            text-white
            drop-shadow-lg
          "
                >
                    {text}
                </div>
            )}
        </div>
    );
}