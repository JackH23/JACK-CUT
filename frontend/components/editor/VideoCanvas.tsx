"use client";

import type { ReactNode } from "react";
import { useVideoCanvasResize } from "@/composables/useVideoCanvasResize";

type VideoCanvasProps = {
  children: ReactNode;
  aspectRatio?: number;
  minimumWidth?: number;
};

export default function VideoCanvas({
  children,
  aspectRatio = 16 / 9,
  minimumWidth = 180,
}: VideoCanvasProps) {
  const {
    canvasAreaRef,
    canvasRef,
    canvasWidth,
    handleResizeStart,
    handleResizeMove,
    handleResizeEnd,
  } = useVideoCanvasResize({
    aspectRatio,
    minimumWidth,
  });

  const resizeHandles = [
    ["top-left", "-left-2 -top-2 cursor-nwse-resize"],
    ["top-right", "-right-2 -top-2 cursor-nesw-resize"],
    ["bottom-left", "-bottom-2 -left-2 cursor-nesw-resize"],
    ["bottom-right", "-bottom-2 -right-2 cursor-nwse-resize"],
  ] as const;

  return (
    <div
      ref={canvasAreaRef}
      className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#050609] p-6"
    >
      <div
        ref={canvasRef}
        className="relative w-[70%] max-w-[746px] shrink-0"
        style={{
          aspectRatio,
          ...(canvasWidth !== null
            ? {
                width: `${canvasWidth}px`,
                maxWidth: "none",
              }
            : {}),
        }}
      >
        <div className="@container relative h-full w-full overflow-hidden bg-black shadow-2xl">
          {children}
        </div>

        {resizeHandles.map(([corner, position]) => (
          <button
            key={corner}
            type="button"
            aria-label={`Resize canvas from ${corner}`}
            className={`absolute z-30 h-4 w-4 touch-none rounded-full border-2 border-purple-300 bg-white shadow-md ${position}`}
            onPointerDown={(event) => handleResizeStart(event, corner)}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
          />
        ))}
      </div>
    </div>
  );
}
