"use client";

import { useState } from "react";
import {
  AudioLines,
  Bookmark,
  CircleHelp,
  History,
  ImageIcon,
  MousePointer2,
  QrCode,
  Sparkles,
  Type,
} from "lucide-react";

const tools = [
  {
    id: "media",
    label: "Media",
    icon: ImageIcon,
  },
  {
    id: "effects",
    label: "Effects",
    icon: Sparkles,
  },
  {
    id: "text",
    label: "Text",
    icon: Type,
  },
  {
    id: "audio",
    label: "Audio",
    icon: AudioLines,
  },
  {
    id: "bookmarks",
    label: "Bookmarks",
    icon: Bookmark,
  },
];

export default function EditorToolbar() {
  const [activeTool, setActiveTool] = useState("media");

  return (
    <aside className="flex w-12 shrink-0 flex-col border-r border-white/10 bg-[#08090d] text-zinc-300">
      {/* Main editor tools */}
      <div className="flex flex-col items-center gap-2 py-3">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;

          return (
            <button
              key={tool.id}
              type="button"
              title={tool.label}
              aria-label={tool.label}
              onClick={() => setActiveTool(tool.id)}
              className={`relative flex h-9 w-9 items-center justify-center rounded-md transition ${
                isActive
                  ? "bg-purple-500/20 text-purple-300"
                  : "hover:bg-white/10 hover:text-white"
              }`}
            >
              {isActive && (
                <span className="absolute -left-1.5 h-6 w-0.5 rounded-r bg-purple-400" />
              )}

              <Icon size={18} />
            </button>
          );
        })}
      </div>

      {/* Empty flexible space */}
      <div className="flex-1" />

      {/* Bottom tools */}
      <div className="flex flex-col items-center gap-2 border-t border-white/5 py-3">
        <button
          type="button"
          title="Selection tool"
          aria-label="Selection tool"
          className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/10 hover:text-white"
        >
          <MousePointer2 size={18} />
        </button>

        <button
          type="button"
          title="QR code"
          aria-label="QR code"
          className="flex h-9 w-9 items-center justify-center rounded-md text-purple-300 hover:bg-white/10"
        >
          <QrCode size={18} />
        </button>

        <button
          type="button"
          title="History"
          aria-label="History"
          className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/10 hover:text-white"
        >
          <History size={18} />
        </button>

        <button
          type="button"
          title="Help"
          aria-label="Help"
          className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/10 hover:text-white"
        >
          <CircleHelp size={18} />
        </button>
      </div>
    </aside>
  );
}