"use client";

import type { ReactNode } from "react";


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

  showVerticalGuide = false,
  showHorizontalGuide = false,
}: VideoCanvasProps) {
  return (
    <div
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#050609] p-6"
    >

      {showVerticalGuide && (
        <div className="pointer-events-none absolute bottom-0 left-1/2 top-0 z-20 w-px -translate-x-1/2 bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
      )}

      {showHorizontalGuide && (
        <div className="pointer-events-none absolute left-0 right-0 top-1/2 z-20 h-px -translate-y-1/2 bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
      )}
      <div
        className="relative w-[70%] max-w-[746px] shrink-0"
        style={{
          aspectRatio,

        }}
      >
        <div className="@container relative h-full w-full overflow-hidden bg-black shadow-2xl">
          {children}
        </div>


      </div>
    </div>
  );
}
