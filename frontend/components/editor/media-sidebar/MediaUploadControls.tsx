"use client";

import {
  useRef,
  type ChangeEventHandler,
} from "react";
import {
  FolderPlus,
  Mic,
  Upload,
} from "lucide-react";

type MediaUploadControlsProps = {
  onFileUpload: ChangeEventHandler<HTMLInputElement>;
};

export default function MediaUploadControls({
  onFileUpload,
}: MediaUploadControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex gap-2 p-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,audio/*,image/*"
        multiple
        className="hidden"
        onChange={onFileUpload}
      />

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex flex-1 items-center justify-center gap-2 rounded bg-purple-500 py-2 text-sm font-semibold text-purple-950 transition hover:bg-purple-400"
      >
        <Upload size={17} />
        Import Media
      </button>

      <button
        type="button"
        aria-label="Record audio"
        className="rounded border border-white/10 bg-[#181a21] p-2.5 text-zinc-200 hover:bg-white/10"
      >
        <Mic size={18} />
      </button>

      <button
        type="button"
        aria-label="Create folder"
        className="rounded border border-white/10 bg-[#181a21] p-2.5 text-zinc-200 hover:bg-white/10"
      >
        <FolderPlus size={18} />
      </button>
    </div>
  );
}