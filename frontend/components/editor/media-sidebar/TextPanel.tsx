"use client";

import { Plus, Type } from "lucide-react";
import type { TextStyle } from "@/types/timeline";

type TextPanelProps = {
  onAddText: (style: TextStyle) => void;
};

export default function TextPanel({
  onAddText,
}: TextPanelProps) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-b border-white/10 p-4">
        <div className="flex items-center gap-2">
          <Type
            size={18}
            className="text-purple-300"
          />

          <h2 className="font-semibold text-white">
            Text
          </h2>
        </div>

        <p className="mt-1 text-xs text-zinc-400">
          Add text and titles to your video.
        </p>
      </div>

      {/* Add text */}
      <div className="p-4">
        <button
          type="button"
          onClick={() => onAddText("title")}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-purple-400 px-4 py-3 font-semibold text-purple-950 transition hover:bg-purple-300"
        >
          <Plus size={18} />
          Add Text
        </button>
      </div>

      {/* Presets */}
      <div className="px-4">
        <h3 className="mb-3 text-sm font-semibold text-zinc-200">
          Text Presets
        </h3>

        <div className="grid grid-cols-2 gap-2">
          {/* Heading */}
          <button
            type="button"
            onClick={() => onAddText("heading")}
            className="rounded-md border border-white/10 bg-[#1a1b22] p-4 text-center transition hover:border-purple-400 hover:bg-[#20212a]"
          >
            <span className="text-xl font-bold">
              Heading
            </span>
          </button>

          {/* Subtitle */}
          <button
            type="button"
            onClick={() => onAddText("subtitle")}
            className="rounded-md border border-white/10 bg-[#1a1b22] p-4 text-center transition hover:border-purple-400 hover:bg-[#20212a]"
          >
            <span className="text-sm">
              Subtitle
            </span>
          </button>

          {/* Title */}
          <button
            type="button"
            onClick={() => onAddText("title")}
            className="rounded-md border border-white/10 bg-[#1a1b22] p-4 text-center transition hover:border-purple-400 hover:bg-[#20212a]"
          >
            <span className="text-lg font-semibold">
              Title
            </span>
          </button>

          {/* Caption */}
          <button
            type="button"
            onClick={() => onAddText("caption")}
            className="rounded-md border border-white/10 bg-[#1a1b22] p-4 text-center transition hover:border-purple-400 hover:bg-[#20212a]"
          >
            <span className="text-xs uppercase tracking-wider">
              Caption
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}