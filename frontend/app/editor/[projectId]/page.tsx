"use client";

import Link from "next/link";
import { use, useState } from "react";
import ErrorModal from "@/components/shared/ErrorModal";
import ExportSuccessModal from "@/components/shared/ExportSuccessModal";
import EditorToolbar from "@/components/editor/EditorToolbar";
import MediaSidebar from "@/components/editor/MediaSidebar";
import PreviewMonitor from "@/components/editor/PreviewMonitor";
import SettingsPanel from "@/components/editor/SettingsPanel";
import Timeline from "@/components/editor/Timeline";
import Navbar from "@/components/layout/Navbar";
import { useEditorProject } from "@/composables/useEditorProject";
import { useEditorWorkspace } from "@/composables/useEditorWorkspace";
import type { Project } from "@/lib/project";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { exportStageLabel } from "@/lib/export";
import ExportProgress from "@/components/shared/ExportProgress";

type EditorPageProps = {
  params: Promise<{ projectId: string }>;
};

export default function EditorPage({ params }: EditorPageProps) {
  const { projectId } = use(params);
  const { project, error } = useEditorProject(projectId);

  if (error) {
    return (
      <div className="min-h-screen bg-[#0d0f15] p-6 text-white">
        <p role="alert" className="text-red-300">
          {error}
        </p>
        <Link
          href="/projects"
          className="mt-4 inline-block text-purple-300 underline"
        >
          Back to projects
        </Link>
      </div>
    );
  }

  if (!project || project.id !== projectId) {
    return (
      <LoadingSkeleton
        variant="editor"
        withOverlay
        message="Loading project..."
      />
    );
  }

  return <EditorWorkspace key={project.id} project={project} />;
}

function EditorWorkspace({ project }: { project: Project }) {
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

    handleSelectMedia,
    handleAddText,
    handleUpdateText,
    handleUpdateTextPosition,
    handleUpdateTextFontSize,
    handleUpdateTextFontWeight,
    handleUpdateTextFontFamily,
    handleUpdateTextColor,

    handleUpdateAnimation,
    handleUpdateMediaTransform,

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
  } = useEditorWorkspace(project.id);

  const [isPlaying, setIsPlaying] = useState(false);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const currentError = exportError || timelineError;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0d0f15]">

      {exportJob?.status === "processing" && exporting && (
        <ExportProgress
          progress={exportJob.progress}
          message={
            cancelling
              ? "Cancelling export..."
              : exportStageLabel(exportJob.stage)
          }
          cancelling={cancelling || exportJob.cancelRequested}
          onCancel={handleCancelExport}
          overlay
        />
      )}

      {currentError && currentError !== dismissedError && (
        <ErrorModal
          message={currentError}
          onClose={() => setDismissedError(currentError)}
        />
      )}

      {showExportSuccess && downloadUrl && (
        <ExportSuccessModal
          downloadUrl={downloadUrl}
          onClose={closeExportSuccess}
        />
      )}

      <Navbar onExport={handleExport} exporting={exporting} />

      <div className="flex items-center justify-between bg-[#15171e] px-4 py-2 text-sm text-white">
        <span className="truncate">Project: {project.name}</span>
        <Link
          href="/projects"
          className="shrink-0 text-purple-300 hover:underline"
        >
          Change project
        </Link>
      </div>


      {(downloadUrl || exportError || exportJob?.status === "cancelled") && (
        <div className="flex items-center gap-3 bg-[#15171e] px-4 py-2 text-sm">
          {downloadUrl && (
            <a
              href={downloadUrl}
              download
              className="text-purple-300 underline"
            >
              Download MP4
            </a>
          )}

          {exportJob?.status === "cancelled" && (
            <span role="status" className="text-gray-300">Export cancelled</span>
          )}

          {exportError && (
            <span role="alert" className="text-red-300">
              {exportError}
            </span>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <EditorToolbar />

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex min-h-0 flex-1">
            <MediaSidebar
              projectId={project.id}
              onSelectMedia={handleSelectMedia}
              onAddText={handleAddText}
              onRemoveMedia={handleRemoveMedia}
              selectedMediaIds={selectedMediaIds}
            />

            <PreviewMonitor
              selectedItemId={selectedItemId}
              onSelectItem={handleSelectTimelineItem}
              onUpdateMediaTransform={handleUpdateMediaTransform}
              file={activePreviewFile}
              activeItem={activePreviewItem}
              items={timelineItems}
              playheadTime={playheadTime}
              onPlayheadTimeChange={setPlayheadTime}
              onPlayingChange={setIsPlaying}
              onUpdateText={handleUpdateText}
              onUpdateTextPosition={handleUpdateTextPosition}
              onUpdateTextFontSize={handleUpdateTextFontSize}
              duration={timelineDuration}
            />

            <SettingsPanel
              onRemoveItem={handleRemoveTimelineItem}
              onUpdateMediaTransform={handleUpdateMediaTransform}
              activeItem={
                selectedTimelineItem ??
                activeTextItem
              }
              onDuplicate={handleDuplicate}
              canDuplicate={
                selectedTimelineItem !== null &&
                !isDuplicating
              }
              onUpdateTextFontSize={
                handleUpdateTextFontSize
              }
              onUpdateTextFontWeight={
                handleUpdateTextFontWeight
              }
              onUpdateTextFontFamily={
                handleUpdateTextFontFamily
              }
              onUpdateTextColor={
                handleUpdateTextColor
              }
              onUpdateAnimation={handleUpdateAnimation}
            />
          </main>

          {timelineError && (
            <p
              role="alert"
              className="bg-red-950 px-4 py-2 text-sm text-red-200"
            >
              {timelineError}
            </p>
          )}

          <Timeline
            selectedItemId={selectedItemId}
            onSelectItem={handleSelectTimelineItem}
            items={timelineItems}
            onItemsChange={setTimelineItems}
            onRemoveItem={handleRemoveTimelineItem}
            onUpdateText={handleUpdateText}
            onUpdateAnimation={handleUpdateAnimation}
            playheadTime={playheadTime}
            isPlaying={isPlaying}
            onPlayheadTimeChange={setPlayheadTime}
          />
        </div>
      </div>
    </div>
  );
}
