"use client";

import { Grid2X2, List, Search, SlidersHorizontal } from "lucide-react";

import type { MediaFile } from "@/lib/media";
import { useMediaSidebar } from "@/composables/useMediaSidebar";

import MediaList from "./media-sidebar/MediaList";
import MediaUploadControls from "./media-sidebar/MediaUploadControls";
import MediaTypeTabs from "./media-sidebar/MediaTypeTabs";

type MediaSidebarProps = {
  projectId: string;
  onSelectMedia: (file: MediaFile) => void;
  onRemoveMedia: (fileId: string) => void;
  selectedMediaIds: Set<string>;
};

export default function MediaSidebar({
  projectId,
  onSelectMedia,
  onRemoveMedia,
  selectedMediaIds,
}: MediaSidebarProps) {
  const {
    state,
    search,
    setSearch,
    filteredFiles,
    handleFileUpload,
    handleRemoveMedia,
  } = useMediaSidebar(projectId, onRemoveMedia);

  return (
    <aside className="flex h-full w-[400px] shrink-0 flex-col border-r border-white/10 bg-[#111218] text-white">
      <MediaTypeTabs />

      <MediaUploadControls onFileUpload={handleFileUpload} />

      {state.uploading && (
        <p className="px-2 py-1 text-sm text-zinc-400">
          Uploading media...
        </p>
      )}

      {state.error && (
        <p role="alert" className="px-2 py-1 text-sm text-red-400">
          {state.error}
        </p>
      )}

      <div className="px-2">
        <div className="flex items-center gap-2 rounded border border-white/10 bg-[#090a0f] px-3 py-2">
          <Search size={15} className="text-zinc-500" />

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search bin (${state.files.length} items)...`}
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
          />

          <SlidersHorizontal size={16} className="text-zinc-400" />
        </div>
      </div>

      <div className="flex items-center justify-between px-2 py-3">
        <div className="flex gap-3 text-sm font-semibold">
          <button className="border-b-2 border-purple-400 text-purple-200">
            Project Media ({state.files.length})
          </button>

          <button className="text-zinc-300">Stock B-Roll</button>
        </div>

        <div className="flex items-center gap-2 text-purple-300">
          <Grid2X2 size={17} />
          <List size={17} className="text-zinc-500" />
        </div>
      </div>

      <MediaList
        files={filteredFiles}
        selectedMediaIds={selectedMediaIds}
        onSelectMedia={onSelectMedia}
        onRemoveMedia={handleRemoveMedia}
      />
    </aside>
  );
}