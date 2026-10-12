"use client";

import type { TextStyle } from "@/types/timeline";
import type { MediaFile } from "@/lib/media";
import { useMediaSidebarController } from "@/composables/useMediaSidebarController";

import MediaPanel from "./media-sidebar/MediaPanel";
import MediaTypeTabs from "./media-sidebar/MediaTypeTabs";
import TextPanel from "./media-sidebar/TextPanel";
import AudioPanel from "./media-sidebar/AudioPanel";

// Keeps existing SidebarTab imports working.
export type { SidebarTab } from "@/composables/useMediaSidebarController";

type MediaSidebarProps = {
  projectId: string;
  onSelectMedia: (file: MediaFile) => void | Promise<void>;
  onAddText: (style: TextStyle) => void;
  onRemoveMedia: (fileId: string) => void | Promise<void>;
  selectedMediaIds: Set<string>;
};

export default function MediaSidebar({
  projectId,
  onSelectMedia,
  onAddText,
  onRemoveMedia,
  selectedMediaIds,
}: MediaSidebarProps) {
  const {
    activeTab,
    setActiveTab,
    state,
    search,
    setSearch,
    filteredFiles,
    totalAudioFiles,
    addingMediaId,
    removingMediaId,
    handleFileUpload,
    handleSelectMedia,
    handleRemoveMediaWithLoading,
  } = useMediaSidebarController({
    projectId,
    onSelectMedia,
    onRemoveMedia,
  });

  const sharedPanelProps = {
    files: filteredFiles,
    search,
    onSearchChange: setSearch,
    uploading: state.uploading,
    error: state.error,
    onFileUpload: handleFileUpload,
    selectedMediaIds,
    onSelectMedia: handleSelectMedia,
    onRemoveMedia: handleRemoveMediaWithLoading,
    addingMediaId,
    removingMediaId,
  };

  return (
    <aside className="flex h-full w-[400px] shrink-0 flex-col border-r border-white/10 bg-[#111218] text-white">
      <MediaTypeTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {activeTab === "text" && (
        <TextPanel onAddText={onAddText} />
      )}

      {activeTab === "media" && (
        <MediaPanel
          {...sharedPanelProps}
          totalFiles={state.files.length}
        />
      )}

      {activeTab === "audio" && (
        <AudioPanel
          {...sharedPanelProps}
          totalFiles={totalAudioFiles}
        />
      )}

      {activeTab === "fx" && (
        <div className="p-4 text-sm text-zinc-400">
          Effects tools coming soon.
        </div>
      )}
    </aside>
  );
}