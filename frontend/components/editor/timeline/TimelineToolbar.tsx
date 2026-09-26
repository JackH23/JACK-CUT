import type { ReactNode } from "react";
import {
  Bookmark,
  Link,
  MousePointer2,
  Scissors,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

export default function TimelineToolbar() {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 bg-[#171920] px-3">
      {/* Editing tools */}
      <div className="flex items-center gap-1">
        <ToolbarButton label="Select">
          <MousePointer2 size={17} />
        </ToolbarButton>

        <ToolbarButton label="Split clip" active>
          <Scissors size={17} />
        </ToolbarButton>

        <button
          type="button"
          className="ml-2 rounded bg-purple-950/70 px-3 py-1.5 text-xs font-semibold text-purple-200"
        >
          Snap On
        </button>

        <ToolbarButton label="Bookmark">
          <Bookmark size={16} />
        </ToolbarButton>

        <ToolbarButton label="Link clips">
          <Link size={16} />
        </ToolbarButton>
      </div>

      {/* Timeline information */}
      <div className="hidden items-center gap-4 font-mono text-xs lg:flex">
        <span className="text-zinc-400">
          IN: <strong className="text-white">00:01:00:00</strong>
        </span>

        <span className="text-zinc-400">
          OUT: <strong className="text-white">00:02:45:12</strong>
        </span>

        <span className="text-zinc-400">
          DUR:{" "}
          <strong className="text-purple-300">
            00:01:45:12
          </strong>
        </span>
      </div>

      {/* Zoom controls */}
      <div className="flex items-center gap-2">
        <ZoomOut size={16} />

        <input
          type="range"
          min="20"
          max="100"
          defaultValue="55"
          aria-label="Timeline zoom"
          className="h-1 w-28 accent-purple-300"
        />

        <ZoomIn size={16} />

        <button
          type="button"
          className="rounded bg-[#24262e] px-2 py-1 text-xs font-semibold"
        >
          Fit
        </button>
      </div>
    </header>
  );
}

function ToolbarButton({
  label,
  active = false,
  children,
}: {
  label: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`rounded p-2 transition ${
        active
          ? "bg-purple-300 text-purple-950"
          : "text-zinc-300 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}