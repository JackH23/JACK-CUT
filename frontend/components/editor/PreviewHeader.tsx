"use client";

import {
  BarChart3,
  ChevronDown,
  Expand,
  Maximize,
  Search,
} from "lucide-react";

type PreviewHeaderProps = {
  title: string;
  colorSpace?: string;
  resolution?: string;
  zoomLabel?: string;
  indicatorClassName?: string;
  onZoomClick?: () => void;
  onSafeMarginsClick?: () => void;
  onStatisticsClick?: () => void;
  onFullscreenClick?: () => void;
};

export default function PreviewHeader({
  title,
  colorSpace,
  resolution,
  zoomLabel = "Fit to Window",
  indicatorClassName = "bg-purple-400",
  onZoomClick,
  onSafeMarginsClick,
  onStatisticsClick,
  onFullscreenClick,
}: PreviewHeaderProps) {
  return (
    <header className="flex h-12 items-center justify-between border-b border-white/10 bg-[#15171e] px-4">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${indicatorClassName}`}
          />
          <span className="truncate text-sm font-semibold">{title}</span>
        </div>

        {colorSpace && (
          <span className="hidden text-xs text-zinc-400 lg:block">
            {colorSpace}
          </span>
        )}

        {resolution && (
          <span className="hidden text-xs text-zinc-400 lg:block">
            {resolution}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onZoomClick}
          className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white/10"
        >
          <Search size={15} />
          <span className="hidden md:inline">{zoomLabel}</span>
          <ChevronDown size={14} />
        </button>

        <button
          type="button"
          aria-label="Safe margins"
          onClick={onSafeMarginsClick}
          className="rounded p-2 text-purple-300 hover:bg-white/10"
        >
          <Maximize size={17} />
        </button>

        <button
          type="button"
          aria-label="Preview statistics"
          onClick={onStatisticsClick}
          className="rounded p-2 text-zinc-300 hover:bg-white/10"
        >
          <BarChart3 size={17} />
        </button>

        <button
          type="button"
          aria-label="Fullscreen preview"
          onClick={onFullscreenClick}
          className="rounded p-2 text-zinc-300 hover:bg-white/10"
        >
          <Expand size={17} />
        </button>
      </div>
    </header>
  );
}
