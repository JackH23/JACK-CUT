
"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { useEditorTimeline } from "@/composables/useEditorTimeline";
import { useTimelineDuration } from "@/composables/useTimelineDuration";
import { useExportVideo } from "@/composables/useExportVideo";

export function useEditorWorkspace(
  projectId: string,
) {
  const {
    selectedItemId,
    selectedTimelineItem,
    handleSelectTimelineItem,
    handleDuplicate,
    isDuplicating,
    timelineItems,
    setTimelineItems,
    playheadTime,
    setPlayheadTime,
    activePreviewFile,
    activePreviewItem,
    activeTextItem,
    selectedMediaIds,

    handleUpdateAnimation,
    handleUpdateMediaTransform,

    handleSelectMedia,
    handleAddText,
    handleUpdateText,
    handleUpdateTextPosition,

    // Text styling
    handleUpdateTextFontSize,
    handleUpdateTextFontWeight,
    handleUpdateTextFontFamily,
    handleUpdateTextColor,

    handleRemoveTimelineItem,
    handleRemoveMedia,

    timelineError,
  } = useEditorTimeline(projectId);

  const timelineDuration =
    useTimelineDuration(timelineItems);

  const {
    startExport,
    cancelExport,
    exportJob,
    exporting,
    cancelling,
    exportError,
    downloadUrl,
  } = useExportVideo();

  const [
    showExportSuccess,
    setShowExportSuccess,
  ] = useState(false);

  useEffect(() => {
    if (
      exportJob?.status === "completed" &&
      downloadUrl
    ) {
      setShowExportSuccess(true);
    }
  }, [
    exportJob?.status,
    downloadUrl,
  ]);

  const handleExport = useCallback(() => {
    setShowExportSuccess(false);
    void startExport(projectId);
  }, [
    projectId,
    startExport,
  ]);

  const handleCancelExport = useCallback(() => {
    void cancelExport();
  }, [cancelExport]);

  const closeExportSuccess =
    useCallback(() => {
      setShowExportSuccess(false);
    }, []);

  return {
    selectedItemId,
    selectedTimelineItem,
    handleSelectTimelineItem,
    handleDuplicate,
    isDuplicating,
    timelineItems,
    setTimelineItems,
    playheadTime,
    setPlayheadTime,
    activePreviewFile,
    activePreviewItem,
    activeTextItem,
    selectedMediaIds,

    handleSelectMedia,
    handleAddText,
    handleUpdateText,
    handleUpdateTextPosition,

    handleUpdateAnimation,
    handleUpdateMediaTransform,

    // Text styling
    handleUpdateTextFontSize,
    handleUpdateTextFontWeight,
    handleUpdateTextFontFamily,
    handleUpdateTextColor,

    handleRemoveTimelineItem,
    handleRemoveMedia,

    timelineError,
    timelineDuration,

    exportJob,
    exporting,
    cancelling,
    exportError,
    downloadUrl,
    showExportSuccess,

    handleExport,
    handleCancelExport,
    closeExportSuccess,
  };
}
