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
      <p role="status" className="min-h-screen bg-[#0d0f15] p-6 text-white">
        Loading project...
      </p>
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
    handleRemoveTimelineItem,
    handleRemoveMedia,

    timelineError,
    timelineDuration,
    exportJob,
    exporting,
    exportError,
    downloadUrl,
    showExportSuccess,
    handleExport,
    closeExportSuccess,
  } = useEditorWorkspace(project.id);

  const [isPlaying, setIsPlaying] = useState(false);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const currentError = exportError || timelineError;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0d0f15]">
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

      {(exportJob?.status === "processing" || downloadUrl || exportError) && (
        <div className="flex items-center gap-3 bg-[#15171e] px-4 py-2 text-sm">
          {exportJob?.status === "processing" && (
            <span role="status" className="text-zinc-300">
              Rendering video...
            </span>
          )}

          {downloadUrl && (
            <a
              href={downloadUrl}
              download
              className="text-purple-300 underline"
            >
              Download MP4
            </a>
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
              activeItem={selectedTimelineItem ?? activeTextItem}
              onDuplicate={handleDuplicate}
              canDuplicate={selectedTimelineItem !== null && !isDuplicating}
              onUpdateTextFontSize={handleUpdateTextFontSize}
              onUpdateTextFontWeight={handleUpdateTextFontWeight}
              onUpdateTextFontFamily={handleUpdateTextFontFamily}
              onUpdateTextColor={handleUpdateTextColor}
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
            playheadTime={playheadTime}
            isPlaying={isPlaying}
            onPlayheadTimeChange={setPlayheadTime}
          />
        </div>
      </div>
    </div>
  );
}
