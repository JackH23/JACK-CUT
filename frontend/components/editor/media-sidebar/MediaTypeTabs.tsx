import {
  AudioLines,
  ImageIcon,
  Sparkles,
  Type,
} from "lucide-react";

export default function MediaTypeTabs() {
  return (
    <div className="flex h-12 items-center gap-1 border-b border-white/10 px-2">
      <button className="flex items-center gap-1.5 rounded bg-purple-300 px-2.5 py-2 text-sm font-semibold text-purple-950">
        <ImageIcon size={16} />
        Media
      </button>

      <button className="flex items-center gap-1.5 rounded px-2 py-2 text-sm hover:bg-white/10">
        <AudioLines size={16} className="text-purple-300" />
        Audio
      </button>

      <button className="flex items-center gap-1.5 rounded px-2 py-2 text-sm hover:bg-white/10">
        <Type size={16} className="text-purple-300" />
        Text
      </button>

      <button className="flex items-center gap-1.5 rounded px-2 py-2 text-sm hover:bg-white/10">
        <Sparkles size={16} className="text-purple-300" />
        FX
      </button>
    </div>
  );
}