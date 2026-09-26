"use client";

import { AudioLines, CheckCircle2, Video, X } from "lucide-react";
import type { MediaFile } from "@/lib/media";

type MediaListProps = {
  files: MediaFile[];
  selectedMediaIds: Set<string>;
  onSelectMedia: (file: MediaFile) => void;
  onRemoveMedia: (file: MediaFile) => void;
};

export default function MediaList({
  files,
  selectedMediaIds,
  onSelectMedia,
  onRemoveMedia,
}: MediaListProps) {
  return (
    <div className="media-scrollbar grid flex-1 auto-rows-min grid-cols-3 gap-2 overflow-y-auto px-2 pb-4 pr-1">
      {files.map((file) => (
        <article
          key={file.id}
          onClick={() => onSelectMedia(file)}
          className={`group h-fit cursor-pointer overflow-hidden rounded border bg-[#24262e] transition ${
            selectedMediaIds.has(file.id)
              ? "border-purple-400 ring-1 ring-purple-400"
              : "border-white/10 hover:border-white/30"
          }`}
        >
          <div className="relative aspect-video bg-[#171820]">
            {file.type === "image" && (
              <img
                src={file.url}
                alt={file.name}
                className="h-full w-full object-cover"
              />
            )}

            {file.type === "video" && (
              <video
                src={file.url}
                muted
                className="h-full w-full object-cover"
              />
            )}

            {file.type === "audio" && (
              <div className="flex h-full items-center justify-center">
                <AudioLines size={52} className="text-sky-400" />
              </div>
            )}

            <button
              type="button"
              title="Remove uploaded media"
              aria-label={`Remove ${file.name}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRemoveMedia(file);
              }}
              className="absolute right-1 top-1 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-black/75 text-white opacity-0 transition hover:bg-red-500 group-hover:opacity-100"
            >
              <X size={13} />
            </button>

            {selectedMediaIds.has(file.id) && (
              <CheckCircle2
                size={20}
                className="absolute right-7 top-1 z-10 rounded-full bg-purple-500 text-white"
              />
            )}

            <span className="absolute left-1 top-1 rounded bg-black/75 px-1 text-[10px] font-semibold">
              {file.type.toUpperCase()}
            </span>
          </div>

          <div className="p-2">
            <p className="truncate text-sm font-medium" title={file.name}>
              {file.name}
            </p>

            <div className="mt-1 flex justify-between text-xs text-zinc-400">
              <span>{file.type}</span>
              <span>{(file.size / 1024 / 1024).toFixed(1)} MB</span>
            </div>
          </div>
        </article>
      ))}

      {files.length === 0 && (
        <div className="col-span-full flex flex-col items-center justify-center py-16 text-center text-zinc-500">
          <Video size={35} />

          <p className="mt-3 text-sm">No media uploaded</p>

          <p className="mt-1 text-xs">Click Import Media to begin</p>
        </div>
      )}
    </div>
  );
}
