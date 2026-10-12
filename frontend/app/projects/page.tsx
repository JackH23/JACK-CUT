"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { useProjectsPage } from "@/composables/useProjectsPage";

import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import Pagination from "@/components/shared/Pagination";
import ProjectsHeader from "@/components/projects/ProjectsHeader";
import CreateProject from "@/components/projects/CreateProject";
import ExistingProjects from "@/components/projects/ExistingProjects";
import DeleteProjectModal from "@/components/projects/DeleteProjectModal";

function FocusCreateProject({ ready }: { ready: boolean }) {
  const searchParams = useSearchParams();
  const focusCreate = searchParams.get("focus") === "create";

  useEffect(() => {
    if (ready && focusCreate) {
      document.getElementById("project-name")?.focus();
    }
  }, [ready, focusCreate]);

  return null;
}

export default function ProjectsPage() {
  const {
    name,
    setName,
    projects,
    total,
    page,
    totalPages,
    loading,
    creating,
    error,
    nextPage,
    previousPage,
    handleCreate,
    projectToDelete,
    deleting,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useProjectsPage();

  return (
    <main className="projects-page min-h-screen bg-[#0d0f15] text-white">
      <Suspense fallback={null}>
        <FocusCreateProject ready={!loading} />
      </Suspense>

      <div
        className="mx-auto w-full max-w-[1440px] px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12"
        inert={Boolean(projectToDelete)}
      >
        <ProjectsHeader
          totalProjects={total}
          loading={loading}
        />

        <CreateProject
          name={name}
          setName={setName}
          creating={creating}
          handleCreate={handleCreate}
        />

        {error && !projectToDelete && (
          <p
            role="alert"
            className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300"
          >
            {error}
          </p>
        )}

        <div aria-busy={loading}>
          {loading ? (
            <LoadingSkeleton variant="projects" count={4} />
          ) : (
            <ExistingProjects
              projects={projects}
              total={total}
              loading={loading}
              deleting={deleting}
              onRequestDelete={requestDelete}
            />
          )}
        </div>

        <div inert={loading || deleting}>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPrevious={previousPage}
            onNext={nextPage}
            className={`mt-8 ${
              loading || deleting ? "opacity-50" : ""
            }`}
          />
        </div>
      </div>

      <DeleteProjectModal
        project={projectToDelete}
        deleting={deleting}
        error={error}
        onCancel={cancelDelete}
        onConfirm={confirmDelete}
      />
    </main>
  );
}