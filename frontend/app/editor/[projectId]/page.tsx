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
    handleUpdateEffect,
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
  const [mobilePanel, setMobilePanel] = useState<
    "timeline" | "media" | "settings"
  >("timeline");
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const currentError = exportError || timelineError;
  const selectedEffectItem =
    selectedTimelineItem?.type === "media" &&
    (
      selectedTimelineItem.file?.type === "image" ||
      selectedTimelineItem.file?.type === "video"
    )
      ? selectedTimelineItem
      : null;

  return (
    <div className="editor-shell flex h-dvh min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[#0d0f15]">

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

      <div className="flex shrink-0 items-center justify-between gap-3 bg-[#15171e] px-3 py-2 text-xs text-white sm:px-4 sm:text-sm">
        <span className="min-w-0 flex-1 truncate" title={project.name}>
          Project: {project.name}
        </span>

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

      <div className="editor-body flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* Desktop toolbar */}
        <div className="hidden shrink-0 xl:flex">
          <EditorToolbar />
        </div>

        <div className="editor-workspace flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <main className="editor-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden xl:flex-row">
            {/* Desktop media sidebar */}
            <div className="hidden min-h-0 shrink-0 overflow-hidden xl:flex">
              <MediaSidebar
                projectId={project.id}
                onSelectMedia={handleSelectMedia}
                onAddText={handleAddText}
                onRemoveMedia={handleRemoveMedia}
                selectedMediaIds={selectedMediaIds}
                selectedEffectId={
                  selectedEffectItem
                    ? selectedEffectItem.effectPreset ?? "none"
                    : null
                }
                onSelectEffect={
                  selectedEffectItem
                    ? (effect) => {
                        void handleUpdateEffect(
                          selectedEffectItem.id,
                          effect.id,
                        );
                      }
                    : undefined
                }
              />
            </div>

            {/* One persistent preview at every screen size */}
            <div className="editor-preview flex min-h-0 min-w-0 flex-1 overflow-hidden">
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
            </div>

            {/* Desktop settings */}
            <div className="hidden min-h-0 shrink-0 overflow-hidden xl:flex">
              <SettingsPanel
                onRemoveItem={handleRemoveTimelineItem}
                onUpdateMediaTransform={handleUpdateMediaTransform}
                activeItem={selectedTimelineItem ?? activeTextItem}
                onDuplicate={handleDuplicate}
                canDuplicate={
                  selectedTimelineItem !== null && !isDuplicating
                }
                onUpdateTextFontSize={handleUpdateTextFontSize}
                onUpdateTextFontWeight={handleUpdateTextFontWeight}
                onUpdateTextFontFamily={handleUpdateTextFontFamily}
                onUpdateTextColor={handleUpdateTextColor}
                onUpdateAnimation={handleUpdateAnimation}
              />
            </div>
          </main>

          {/* Mobile/tablet panel navigation */}
          <nav
            aria-label="Editor panels"
            className="editor-panel-nav grid shrink-0 grid-cols-3 gap-1 border-y border-white/10 bg-[#15171e] p-1 xl:hidden"
          >
            {(["timeline", "media", "settings"] as const).map(
              (panel) => (
                <button
                  key={panel}
                  type="button"
                  aria-pressed={mobilePanel === panel}
                  onClick={() => setMobilePanel(panel)}
                  className={`min-h-11 rounded-md px-2 text-sm capitalize transition ${
                    mobilePanel === panel
                      ? "bg-purple-500/20 text-purple-200"
                      : "text-zinc-400 hover:bg-white/5"
                  }`}
                >
                  {panel}
                </button>
              ),
            )}
          </nav>

          {timelineError && (
            <p
              role="alert"
              className="shrink-0 bg-red-950 px-3 py-2 text-xs text-red-200"
            >
              {timelineError}
            </p>
          )}

          {/* Mobile media panel */}
          <div
            className={`editor-mobile-panel h-[38dvh] min-h-0 shrink-0 overflow-auto xl:hidden ${
              mobilePanel === "media" ? "flex" : "hidden"
            } [&>*]:!w-full [&>*]:!min-w-0 [&>*]:!max-w-none [&>*]:flex-1`}
          >
            <MediaSidebar
              projectId={project.id}
              onSelectMedia={handleSelectMedia}
              onAddText={handleAddText}
              onRemoveMedia={handleRemoveMedia}
              selectedMediaIds={selectedMediaIds}
              selectedEffectId={
                selectedEffectItem
                  ? selectedEffectItem.effectPreset ?? "none"
                  : null
              }
              onSelectEffect={
                selectedEffectItem
                  ? (effect) => {
                      void handleUpdateEffect(
                        selectedEffectItem.id,
                        effect.id,
                      );
                    }
                  : undefined
              }
            />
          </div>

          {/* Mobile settings panel */}
          <div
            className={`editor-mobile-panel h-[38dvh] min-h-0 shrink-0 overflow-auto xl:hidden ${
              mobilePanel === "settings" ? "flex" : "hidden"
            } [&>*]:!w-full [&>*]:!min-w-0 [&>*]:!max-w-none [&>*]:flex-1`}
          >
            <SettingsPanel
              onRemoveItem={handleRemoveTimelineItem}
              onUpdateMediaTransform={handleUpdateMediaTransform}
              activeItem={selectedTimelineItem ?? activeTextItem}
              onDuplicate={handleDuplicate}
              canDuplicate={
                selectedTimelineItem !== null && !isDuplicating
              }
              onUpdateTextFontSize={handleUpdateTextFontSize}
              onUpdateTextFontWeight={handleUpdateTextFontWeight}
              onUpdateTextFontFamily={handleUpdateTextFontFamily}
              onUpdateTextColor={handleUpdateTextColor}
              onUpdateAnimation={handleUpdateAnimation}
            />
          </div>

          {/* Timeline stays mounted when another panel is opened */}
          <div
            className={`editor-timeline min-h-0 min-w-0 shrink-0 overflow-hidden xl:block xl:h-auto ${
              mobilePanel === "timeline"
                ? "flex h-[42dvh] flex-col"
                : "hidden"
            } [&>*]:min-h-0 [&>*]:min-w-0 [&>*]:flex-1`}
          >
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
    </div>
  );
}
