
"use client";

import {
  useCallback,
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

  const [dismissedExportId, setDismissedExportId] = useState<string | null>(null);
  const showExportSuccess = Boolean(
    exportJob?.status === "completed" && downloadUrl && exportJob.id !== dismissedExportId,
  );

  const handleExport = useCallback(() => {
    setDismissedExportId(exportJob?.id ?? null);
    void startExport(projectId);
  }, [
    projectId,
    startExport,
    exportJob?.id,
  ]);

  const handleCancelExport = useCallback(() => {
    void cancelExport();
  }, [cancelExport]);

  const closeExportSuccess =
    useCallback(() => {
      setDismissedExportId(exportJob?.id ?? null);
    }, [exportJob?.id]);

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
