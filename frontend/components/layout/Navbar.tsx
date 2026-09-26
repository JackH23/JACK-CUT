"use client";

import {
  ChevronDown,
  Cloud,
  Eye,
  Keyboard,
  Redo2,
  Settings,
  Share2,
  Undo2,
  Video,
} from "lucide-react";

const navigationItems = [
  "Edit",
  "Color",
  "Audio",
  "Effects",
  "Deliver",
];

type NavbarProps = {
  onExport: () => void;
  exporting: boolean;
};

export default function Navbar({ onExport, exporting }: NavbarProps) {
  return (
    <header className="h-16 border-b border-white/10 bg-[#090a0f] px-3 text-white">
      <nav className="flex h-full items-center justify-between gap-4">
        {/* Left section */}
        <div className="flex min-w-0 items-center gap-3">
          {/* Logo */}
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 shadow-lg shadow-purple-950/40">
              <Video size={21} fill="currentColor" />
            </div>

            <span className="text-lg font-bold tracking-tight">
              JackCut
            </span>

            <span className="rounded border border-white/10 bg-white/10 px-2 py-1 text-xs font-semibold tracking-wider text-purple-200">
              STUDIO
            </span>
          </div>

          <div className="h-6 w-px bg-white/10" />

          {/* Undo and redo */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Undo"
              className="rounded-md p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
            >
              <Undo2 size={18} />
            </button>

            <button
              type="button"
              aria-label="Redo"
              className="rounded-md p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
            >
              <Redo2 size={18} />
            </button>
          </div>

          {/* Project information */}
          <button
            type="button"
            className="hidden min-w-0 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm lg:flex"
          >
            <Video size={16} className="shrink-0 text-purple-300" />

            <span className="max-w-56 truncate font-semibold">
              Cinematic_Vlog_Final_Cut
            </span>

            <span className="text-zinc-500">•••</span>

            <span className="flex shrink-0 items-center gap-1 text-xs text-zinc-400">
              <Cloud size={13} className="text-sky-400" />
              Saved to Cloud
            </span>
          </button>
        </div>

        {/* Center navigation */}
        <div className="hidden h-full items-center xl:flex">
          {navigationItems.map((item) => {
            const isActive = item === "Edit";

            return (
              <button
                key={item}
                type="button"
                className={`relative flex h-full items-center px-4 text-sm font-semibold transition ${
                  isActive
                    ? "bg-white/[0.06] text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {item}

                {isActive && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-purple-400" />
                )}
              </button>
            );
          })}
        </div>

        {/* Right section */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="hidden items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-zinc-200 md:flex"
          >
            <Eye size={17} className="text-zinc-400" />
            <span>1080p Full</span>
            <ChevronDown size={15} />
          </button>

          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            aria-label={exporting ? "Exporting video" : "Export video"}
            className="flex items-center gap-2 rounded-md bg-gradient-to-r from-purple-700 to-fuchsia-600 px-4 py-2 text-sm font-semibold shadow-lg shadow-purple-950/40 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Share2 size={17} />
            <span className="hidden sm:inline">
              {exporting ? "Exporting..." : "Export Video"}
            </span>
          </button>

          <div className="hidden h-6 w-px bg-white/10 md:block" />

          <button
            type="button"
            aria-label="Settings"
            className="hidden rounded-md p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white md:block"
          >
            <Settings size={19} />
          </button>

          <button
            type="button"
            aria-label="Keyboard shortcuts"
            className="hidden rounded-md p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white lg:block"
          >
            <Keyboard size={19} />
          </button>

          {/* User avatar */}
          <button
            type="button"
            aria-label="User profile"
            className="relative ml-1 h-10 w-10 rounded-full border-2 border-zinc-700 bg-gradient-to-br from-orange-400 to-purple-600"
          >
            <span className="text-sm font-bold">J</span>

            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#090a0f] bg-sky-400" />
          </button>
        </div>
      </nav>
    </header>
  );
}