"use client";

import type { ReactNode } from "react";
import { useVideoCanvasResize } from "@/composables/useVideoCanvasResize";

type VideoCanvasProps = {
  children: ReactNode;
  aspectRatio?: number;
  minimumWidth?: number;

  showVerticalGuide?: boolean;
  showHorizontalGuide?: boolean;
};

export default function VideoCanvas({
  children,
  aspectRatio = 16 / 9,
  minimumWidth = 180,
  showVerticalGuide = false,
  showHorizontalGuide = false,
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
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#050609] p-6"
    >

      {showVerticalGuide && (
        <div className="pointer-events-none absolute bottom-0 left-1/2 top-0 z-20 w-px -translate-x-1/2 bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
      )}

      {showHorizontalGuide && (
        <div className="pointer-events-none absolute left-0 right-0 top-1/2 z-20 h-px -translate-y-1/2 bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
      )}
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
