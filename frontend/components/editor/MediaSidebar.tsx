"use client";

import { useRef, useState } from "react";
import {
  Grid2X2,
  List,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import type {
  TextStyle,
} from "@/types/timeline";

import type { MediaFile } from "@/lib/media";
import { useMediaSidebar } from "@/composables/useMediaSidebar";
import LoadingState from "@/components/shared/LoadingState";

import MediaList from "./media-sidebar/MediaList";
import MediaUploadControls from "./media-sidebar/MediaUploadControls";
import MediaTypeTabs from "./media-sidebar/MediaTypeTabs";
import TextPanel from "./media-sidebar/TextPanel";

type MediaSidebarProps = {
  projectId: string;
  onSelectMedia: (file: MediaFile) => void | Promise<void>;
  onAddText: (style: TextStyle) => void;
  onRemoveMedia: (fileId: string) => void | Promise<void>;
  selectedMediaIds: Set<string>;
};

export type SidebarTab = "media" | "audio" | "text" | "fx";

export default function MediaSidebar({
  projectId,
  onSelectMedia,
  onAddText,
  onRemoveMedia,
  selectedMediaIds,
}: MediaSidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("media");

  const [addingMediaId, setAddingMediaId] =
    useState<string | null>(null);

  const [removingMediaId, setRemovingMediaId] =
    useState<string | null>(null);

  const addingRef = useRef(false);
  const removingRef = useRef(false);

  const {
    state,
    search,
    setSearch,
    filteredFiles,
    handleFileUpload,
    handleRemoveMedia,
  } = useMediaSidebar(projectId, onRemoveMedia);

  const handleRemoveMediaWithLoading = async (
    file: MediaFile,
  ) => {
    if (removingRef.current || addingRef.current) return;

    removingRef.current = true;
    setRemovingMediaId(file.id);

    try {
      await handleRemoveMedia(file);
    } catch (error) {
      console.error(
        "Failed to remove media from project:",
        error,
      );
    } finally {
      removingRef.current = false;
      setRemovingMediaId(null);
    }
  };

  const handleSelectMedia = async (file: MediaFile) => {
    if (addingRef.current || removingRef.current) return;

    addingRef.current = true;
    setAddingMediaId(file.id);

    try {
      await onSelectMedia(file);
    } catch (error) {
      console.error(
        "Failed to add media to timeline:",
        error,
      );
    } finally {
      addingRef.current = false;
      setAddingMediaId(null);
    }
  };

  return (
    <aside className="flex h-full w-[400px] shrink-0 flex-col border-r border-white/10 bg-[#111218] text-white">
      <MediaTypeTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* TEXT PANEL */}
      {activeTab === "text" && (
        <TextPanel onAddText={onAddText} />
      )}

      {/* MEDIA PANEL */}
      {activeTab === "media" && (
        <>
          <MediaUploadControls onFileUpload={handleFileUpload} />

          {state.error && (
            <p
              role="alert"
              className="px-2 py-1 text-sm text-red-400"
            >
              {state.error}
            </p>
          )}

          <div className="px-2">
            <div className="flex items-center gap-2 rounded border border-white/10 bg-[#090a0f] px-3 py-2">
              <Search
                size={15}
                className="text-zinc-500"
              />

              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder={`Search bin (${state.files.length} items)...`}
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
              <button className="border-b-2 border-purple-400 text-purple-200">
                Project Media ({state.files.length})
              </button>

              <button className="text-zinc-300">
                Stock B-Roll
              </button>
            </div>

            <div className="flex items-center gap-2 text-purple-300">
              <Grid2X2 size={17} />

              <List
                size={17}
                className="text-zinc-500"
              />
            </div>
          </div>

          {state.uploading ? (
            <div className="flex min-h-[200px] flex-1 items-center justify-center">
              <LoadingState
                message="Uploading media..."
                size="md"
              />
            </div>
          ) : (
            <MediaList
              files={filteredFiles}
              selectedMediaIds={selectedMediaIds}
              onSelectMedia={handleSelectMedia}
              onRemoveMedia={handleRemoveMediaWithLoading}
              addingMediaId={addingMediaId}
              removingMediaId={removingMediaId}
            />
          )}
        </>
      )}

      {/* AUDIO */}
      {activeTab === "audio" && (
        <div className="p-4 text-sm text-zinc-400">
          Audio tools coming soon.
        </div>
      )}

      {/* FX */}
      {activeTab === "fx" && (
        <div className="p-4 text-sm text-zinc-400">
          Effects tools coming soon.
        </div>
      )}
    </aside>
  );
}