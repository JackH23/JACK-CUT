"use client";

import type { ChangeEvent } from "react";
import {
  Grid2X2,
  List,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import type { MediaFile } from "@/lib/media";
import LoadingState from "@/components/shared/LoadingState";

import MediaList from "./MediaList";
import MediaUploadControls from "./MediaUploadControls";

type MediaPanelProps = {
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

export default function MediaPanel({
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
}: MediaPanelProps) {
  return (
    <>
      <MediaUploadControls onFileUpload={onFileUpload} />

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
            aria-label="Search project media"
            placeholder={`Search bin (${totalFiles} items)...`}
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
          />

          <SlidersHorizontal
            size={16}
            className="text-zinc-400"
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-2 py-3">
        <div className="flex gap-3 text-sm font-semibold">
          <button
            type="button"
            className="border-b-2 border-purple-400 text-purple-200"
          >
            Project Media ({totalFiles})
          </button>

          <button type="button" className="text-zinc-300">
            Stock B-Roll
          </button>
        </div>

        <div className="flex items-center gap-2 text-purple-300">
          <Grid2X2 size={17} />
          <List size={17} className="text-zinc-500" />
        </div>
      </div>

      {uploading ? (
        <div className="flex min-h-[200px] flex-1 items-center justify-center">
          <LoadingState
            message="Uploading media..."
            size="md"
          />
        </div>
      ) : (
        <MediaList
          files={files}
          selectedMediaIds={selectedMediaIds}
          onSelectMedia={onSelectMedia}
          onRemoveMedia={onRemoveMedia}
          addingMediaId={addingMediaId}
          removingMediaId={removingMediaId}
        />
      )}
    </>
  );
}