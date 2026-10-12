"use client";

import type { ChangeEvent } from "react";
import { AudioLines, Search } from "lucide-react";

import type { MediaFile } from "@/lib/media";
import LoadingState from "@/components/shared/LoadingState";
import MediaList from "./MediaList";

type AudioPanelProps = {
  files: MediaFile[];
  totalFiles: number;
  search: string;
  onSearchChange: (value: string) => void;
  uploading: boolean;
  error?: string | null;
  onFileUpload: (
    event: ChangeEvent<HTMLInputElement>,
  ) => void | Promise<void>;
  selectedMediaIds: Set<string>;
  onSelectMedia: (file: MediaFile) => void | Promise<void>;
  onRemoveMedia: (file: MediaFile) => void | Promise<void>;
  addingMediaId?: string | null;
  removingMediaId?: string | null;
};

export default function AudioPanel({
  files,
  totalFiles,
  search,
  onSearchChange,
  uploading,
  error,
  onFileUpload,
  selectedMediaIds,
  onSelectMedia,
  onRemoveMedia,
  addingMediaId = null,
  removingMediaId = null,
}: AudioPanelProps) {
  const audioFiles = files.filter((file) => file.type === "audio");

  return (
    <>
      <div className="px-2 py-3">
        <label
          className={`flex items-center justify-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition ${
            uploading
              ? "cursor-wait opacity-60"
              : "cursor-pointer hover:bg-purple-500"
          }`}
        >
          <AudioLines size={18} />
          <span>Import Audio</span>

          <input
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
            disabled={uploading}
            className="hidden"
            onChange={onFileUpload}
          />
        </label>
      </div>

      {error && (
        <p
          role="alert"
          className="px-2 py-1 text-sm text-red-400"
        >
          {error}
        </p>
      )}

      <div className="px-2">
        <div className="flex items-center gap-2 rounded border border-white/10 bg-[#090a0f] px-3 py-2">
          <Search size={15} className="text-zinc-500" />

          <input
            value={search}
            onChange={(event) =>
              onSearchChange(event.target.value)
            }
            aria-label="Search project audio"
            placeholder="Search audio..."
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
          />
        </div>
      </div>

      <div className="px-2 py-3 text-sm font-semibold text-purple-200">
        Project Audio ({totalFiles})
      </div>

      {uploading ? (
        <div className="flex min-h-[200px] flex-1 items-center justify-center">
          <LoadingState
            message="Uploading audio..."
            size="md"
          />
        </div>
      ) : audioFiles.length > 0 ? (
        <MediaList
          files={audioFiles}
          selectedMediaIds={selectedMediaIds}
          onSelectMedia={onSelectMedia}
          onRemoveMedia={onRemoveMedia}
          addingMediaId={addingMediaId}
          removingMediaId={removingMediaId}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center text-zinc-500">
          <AudioLines size={35} />

          <p className="mt-3 text-sm">
            {search.trim()
              ? "No matching audio"
              : "No audio uploaded"}
          </p>

          <p className="mt-1 text-xs">
            {search.trim()
              ? "Try another search"
              : "Click Import Audio to begin"}
          </p>
        </div>
      )}
    </>
  );
}