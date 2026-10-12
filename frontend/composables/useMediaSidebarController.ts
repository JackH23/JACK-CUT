"use client";

import { useRef, useState } from "react";

import type { MediaFile } from "@/lib/media";
import { useMediaSidebar } from "@/composables/useMediaSidebar";

export type SidebarTab = "media" | "audio" | "text" | "fx";

type UseMediaSidebarControllerProps = {
  projectId: string;
  onSelectMedia: (file: MediaFile) => void | Promise<void>;
  onRemoveMedia: (fileId: string) => void | Promise<void>;
};

export function useMediaSidebarController({
  projectId,
  onSelectMedia,
  onRemoveMedia,
}: UseMediaSidebarControllerProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("media");
  const [addingMediaId, setAddingMediaId] = useState<string | null>(null);
  const [removingMediaId, setRemovingMediaId] = useState<string | null>(null);

  // A shared lock prevents overlapping add/remove actions.
  const actionRef = useRef(false);

  const {
    state,
    search,
    setSearch,
    filteredFiles,
    handleFileUpload,
    handleRemoveMedia,
  } = useMediaSidebar(projectId, onRemoveMedia);

  const handleRemoveMediaWithLoading = async (file: MediaFile) => {
    if (actionRef.current) return;

    actionRef.current = true;
    setRemovingMediaId(file.id);

    try {
      await handleRemoveMedia(file);
    } catch (error) {
      console.error("Failed to remove media from project:", error);
    } finally {
      actionRef.current = false;
      setRemovingMediaId(null);
    }
  };

  const handleSelectMedia = async (file: MediaFile) => {
    if (actionRef.current) return;

    actionRef.current = true;
    setAddingMediaId(file.id);

    try {
      await onSelectMedia(file);
    } catch (error) {
      console.error("Failed to add media to timeline:", error);
    } finally {
      actionRef.current = false;
      setAddingMediaId(null);
    }
  };

  const totalAudioFiles = state.files.filter(
    (file) => file.type === "audio",
  ).length;

  return {
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
  };
}