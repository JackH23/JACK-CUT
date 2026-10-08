
"use client";

import {
  AudioLines,
  CheckCircle2,
  Video,
  X,
} from "lucide-react";

import type { MediaFile } from "@/lib/media";
import LoadingState from "@/components/shared/LoadingState";

type MediaListProps = {
  files: MediaFile[];
  selectedMediaIds: Set<string>;
  onSelectMedia: (file: MediaFile) => void | Promise<void>;
  onRemoveMedia: (file: MediaFile) => void | Promise<void>;
  addingMediaId?: string | null;
  removingMediaId?: string | null;
};

export default function MediaList({
  files,
  selectedMediaIds,
  onSelectMedia,
  onRemoveMedia,
  addingMediaId = null,
  removingMediaId = null,
}: MediaListProps) {
  const isBusy =
    addingMediaId !== null ||
    removingMediaId !== null;

  return (
    <div className="media-scrollbar grid flex-1 auto-rows-min grid-cols-3 gap-2 overflow-y-auto px-2 pb-4 pr-1">
      {files.map((file) => {
        const adding = addingMediaId === file.id;
        const removing = removingMediaId === file.id;
        const busy = adding || removing;
        const selected = selectedMediaIds.has(file.id);

        return (
          <article
            key={file.id}
            aria-busy={busy}
            onClick={() => {
              if (!isBusy) {
                void onSelectMedia(file);
              }
            }}
            className={`group relative h-fit overflow-hidden rounded border bg-[#24262e] transition ${
              isBusy
                ? "cursor-wait"
                : "cursor-pointer"
            } ${
              selected
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
                  <AudioLines
                    size={52}
                    className="text-sky-400"
                  />
                </div>
              )}

              <button
                type="button"
                title="Remove uploaded media"
                aria-label={`Remove ${file.name}`}
                disabled={isBusy}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();

                  if (!isBusy) {
                    void onRemoveMedia(file);
                  }
                }}
                className="absolute right-1 top-1 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-black/75 text-white opacity-0 transition hover:bg-red-500 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <X size={13} />
              </button>

              {selected && !busy && (
                <CheckCircle2
                  size={20}
                  className="absolute right-7 top-1 z-10 rounded-full bg-purple-500 text-white"
                />
              )}

              <span className="absolute left-1 top-1 rounded bg-black/75 px-1 text-[10px] font-semibold">
                {file.type.toUpperCase()}
              </span>

              {busy && (
                <div
                  role="status"
                  aria-label={
                    removing
                      ? `Removing ${file.name}`
                      : `Adding ${file.name}`
                  }
                  className="absolute inset-0 z-30 flex items-center justify-center bg-black/80"
                  onClick={(event) => event.stopPropagation()}
                >
                  <LoadingState
                    message={
                      removing
                        ? "Removing..."
                        : "Adding..."
                    }
                    size="sm"
                    className="!py-0 [&_span]:!text-white [&_svg]:!text-purple-400"
                  />
                </div>
              )}
            </div>

            <div className="p-2">
              <p
                className="truncate text-sm font-medium"
                title={file.name}
              >
                {file.name}
              </p>

              <div className="mt-1 flex justify-between text-xs text-zinc-400">
                <span>{file.type}</span>
                <span>
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </span>
              </div>
            </div>
          </article>
        );
      })}

      {files.length === 0 && (
        <div className="col-span-full flex flex-col items-center justify-center py-16 text-center text-zinc-500">
          <Video size={35} />
          <p className="mt-3 text-sm">
            No media uploaded
          </p>
          <p className="mt-1 text-xs">
            Click Import Media to begin
          </p>
        </div>
      )}
    </div>
  );
}
