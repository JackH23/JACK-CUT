"use client";

import { useEffect, useState } from "react";
import ExportSuccessModal from "@/components/editor/ExportSuccessModal";
import EditorToolbar from "@/components/editor/EditorToolbar";
import MediaSidebar from "@/components/editor/MediaSidebar";
import PreviewMonitor from "@/components/editor/PreviewMonitor";
import SettingsPanel from "@/components/editor/SettingsPanel";
import Timeline from "@/components/editor/Timeline";
import Navbar from "@/components/layout/Navbar";
import ProjectModal from "@/components/projects/ProjectModal";

import { useEditorTimeline } from "@/composables/useEditorTimeline";
import { useTimelineDuration } from "@/composables/useTimelineDuration";
import { useExportVideo } from "@/composables/useExportVideo";
import type { Project } from "@/services/projectService";

export default function Home() {
  const [project, setProject] = useState<Project | null>(null);

  if (!project) {
    return <ProjectModal onSelectProject={setProject} />;
  }

  return (
    <EditorWorkspace
      key={project.id}
      project={project}
      onChangeProject={() => setProject(null)}
    />
  );
}

function EditorWorkspace({
  project,
  onChangeProject,
}: {
  project: Project;
  onChangeProject: () => void;
}) {
  const {
    timelineItems,
    setTimelineItems,
    playheadPosition,
    setPlayheadPosition,
    activePreviewFile,
    activePreviewItem,
    selectedMediaIds,
    handleSelectMedia,
    handleRemoveTimelineItem,
    handleRemoveMedia,
    timelineError,
  } = useEditorTimeline(project.id);

  const timelineDuration = useTimelineDuration(timelineItems);

  const { startExport, exportJob, exporting, exportError, downloadUrl } =
    useExportVideo();

  const [showExportSuccess, setShowExportSuccess] = useState(false);

  useEffect(() => {
    if (exportJob?.status === "completed" && downloadUrl) {
      setShowExportSuccess(true);
    }
  }, [exportJob?.id, exportJob?.status, downloadUrl]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0d0f15]">
      {showExportSuccess && downloadUrl && (
        <ExportSuccessModal
          downloadUrl={downloadUrl}
          onClose={() => setShowExportSuccess(false)}
        />
      )}

      <Navbar
        onExport={() => void startExport(project.id)}
        exporting={exporting}
      />

      <div className="flex items-center justify-between bg-[#15171e] px-4 py-2 text-sm text-white">
        <span className="truncate">Project: {project.name}</span>
        <button
          type="button"
          onClick={onChangeProject}
          className="shrink-0 text-purple-300 hover:underline"
        >
          Change project
        </button>
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
              onRemoveMedia={handleRemoveMedia}
              selectedMediaIds={selectedMediaIds}
            />

            <PreviewMonitor
              file={activePreviewFile}
              activeItem={activePreviewItem}
              playheadPosition={playheadPosition}
              onPlayheadPositionChange={setPlayheadPosition}
              duration={timelineDuration}
            />

            <SettingsPanel />
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
            items={timelineItems}
            onItemsChange={setTimelineItems}
            onRemoveItem={handleRemoveTimelineItem}
            playheadPosition={playheadPosition}
            onPlayheadPositionChange={setPlayheadPosition}
          />
        </div>
      </div>
    </div>
  );
}
