
"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Clapperboard,
  FolderOpen,
  LoaderCircle,
  Plus,
  Trash2,
  Video,
} from "lucide-react";

import { useProjectsPage } from "@/composables/useProjectsPage";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { useSearchParams } from "next/navigation";

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
    loading,
    creating,
    error,
    handleCreate,
    projectToDelete,
    deleting,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useProjectsPage();

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectToDelete) return;

    const previousFocus =
      document.activeElement as HTMLElement | null;

    dialogRef.current
      ?.querySelector<HTMLButtonElement>("button")
      ?.focus();

    return () => {
      previousFocus?.focus();
    };
  }, [projectToDelete]);

  return (
    <main className="projects-page min-h-screen bg-[#0d0f15] text-white">
      <Suspense fallback={null}>
        <FocusCreateProject ready={!loading} />
      </Suspense>
      <div
        className="mx-auto w-full max-w-[1440px] px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12"
        inert={Boolean(projectToDelete)}
      >
        <Link
          href="/home"
          className="sticky top-4 z-20 mb-8 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-[#191b25] px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft size={17} aria-hidden="true" />
          Back to Home
        </Link>
        {/* Page header */}
        <header className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-purple-400">
              <Clapperboard size={18} />
              JACKCUT WORKSPACE
            </div>

            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Your Projects
            </h1>

            <p className="mt-3 text-sm text-zinc-400 sm:text-base">
              Create a new video project or continue editing
              your existing work.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#191b25] px-5 py-3">
            <FolderOpen size={21} className="text-purple-400" />

            <div>
              <p className="text-xs text-zinc-400">
                Total Projects
              </p>
              <p className="text-xl font-bold">
                {loading ? "—" : projects.length}
              </p>
            </div>
          </div>
        </header>

        {/* Create project */}
        <section
          id="create-project"
          className="mb-14 scroll-mt-8 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#232034] via-[#191b25] to-[#151720] shadow-xl shadow-black/10"
        >
          <div className="border-b border-white/10 px-6 py-6 sm:px-8 sm:py-7">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10">
                <Plus size={23} className="text-purple-400" />
              </div>

              <div>
                <h2 className="text-lg font-semibold">
                  Create New Project
                </h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Give your next story a name. Your editing workspace is one click away.
                </p>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleCreate}
            className="p-6 sm:p-8"
          >
            <label
              htmlFor="project-name"
              className="mb-3 block text-sm font-medium text-zinc-300"
            >
              Project Name
            </label>

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="project-name"
                value={name}
                onChange={(event) =>
                  setName(event.target.value)
                }
                maxLength={255}
                placeholder="Enter your project name..."
                disabled={creating}
                className="min-h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#101117] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 disabled:opacity-60"
              />

              <button
                type="submit"
                disabled={!name.trim() || creating}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-purple-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? (
                  <>
                    <LoaderCircle
                      size={18}
                      className="animate-spin"
                    />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus size={18} />
                    Create Project
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {error && !projectToDelete && (
          <p
            role="alert"
            className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300"
          >
            {error}
          </p>
        )}

        {/* Existing projects */}
        <section id="existing-projects">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="existing-projects-title" className="text-xl font-semibold sm:text-2xl outline-none">
                Existing Projects
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Pick up where you left off.
              </p>
            </div>

            <span className="rounded-full border border-white/10 bg-[#191b25] px-4 py-2 text-xs text-zinc-300">
              {loading ? "Loading..." : `${projects.length} projects`}
            </span>
          </div>

          {loading ? (
            <div>
              <LoadingSkeleton
                className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                variant="card"
                count={4}
              />
            </div>
          ) : projects.length === 0 ? (
            <div className="flex min-h-88 flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-gradient-to-b from-[#191b25] to-[#12141c] px-6 py-16 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500/10">
                <Video size={30} className="text-purple-400" />
              </div>

              <h3 className="text-xl font-semibold">
                No projects yet
              </h3>

              <p className="mt-3 max-w-md text-sm leading-6 text-zinc-400">
                Your creative workspace is ready.
                Create your first project to start editing videos.
              </p>

              <button
                type="button"
                onClick={() =>
                  document.getElementById("project-name")?.focus()
                }
                className="mt-6 flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-sm font-semibold transition hover:bg-purple-500"
              >
                <Plus size={17} />
                Create Your First Project
              </button>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {projects.map((project) => (
                <article
                  key={project.id}
                  className="group min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#191b25] transition duration-200 motion-safe:hover:-translate-y-1 hover:border-purple-400/40 hover:shadow-xl hover:shadow-purple-950/20"
                >
                  {/* Project visual */}
              <Link
                href={`/editor/${project.id}`}
                aria-label={`Open ${project.name} in editor`} className="flex aspect-video items-center justify-center bg-gradient-to-br from-[#28213e] via-[#1a1b2b] to-[#101117]"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-purple-400/20 bg-purple-500/10 transition motion-safe:group-hover:scale-110">
                  <Clapperboard
                    size={30}
                    className="text-purple-400"
                  />
                </div>
              </Link>

              {/* Project information */}
              <div className="p-4">
                <Link
                  href={`/editor/${project.id}`}
                  className="block truncate text-base font-semibold transition hover:text-purple-300"
                  title={project.name}
                >
                  {project.name}
                </Link>

                <p className="mt-1 text-xs text-zinc-500">
                  Video editing project
                </p>

                <div className="mt-5 flex items-center justify-between gap-2 border-t border-white/10 pt-4">
                  <Link
                    href={`/editor/${project.id}`}
                    className="inline-flex items-center gap-2 text-sm font-medium text-purple-400 transition hover:text-purple-300"
                  >
                    Open Editor
                    <ArrowRight size={16} />
                  </Link>

                  <button
                    type="button"
                    onClick={() => requestDelete(project)}
                    disabled={deleting}
                    aria-label={`Delete ${project.name}`}
                    title="Delete project"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
      </div>

      {/* Delete confirmation modal */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            ref={dialogRef}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !deleting) {
                event.preventDefault();
                cancelDelete();
              }

              if (event.key !== "Tab") return;

              const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button:not(:disabled)",
                ),
              );

              if (!buttons.length) {
                event.preventDefault();
                event.currentTarget.focus();
                return;
              }

              const first = buttons[0];
              const last = buttons[buttons.length - 1];

              if (
                event.shiftKey &&
                document.activeElement === first
              ) {
                event.preventDefault();
                last.focus();
              } else if (
                !event.shiftKey &&
                document.activeElement === last
              ) {
                event.preventDefault();
                first.focus();
              }
            }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
            aria-describedby="delete-project-description"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#191b25] p-6 shadow-2xl"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
              <Trash2 size={24} className="text-red-400" />
            </div>

            <h2
              id="delete-project-title"
              className="text-xl font-semibold"
            >
              Delete project?
            </h2>

            <p
              id="delete-project-description"
              className="mt-3 text-sm leading-6 text-zinc-400"
            >
              Are you sure you want to delete{" "}
              <span className="font-semibold text-white">
                {projectToDelete.name}
              </span>
              ? This will permanently delete the project
              and its timeline. This action cannot be undone.
            </p>

            {error && (
              <p role="alert" className="mt-4 text-sm text-red-300">
                {error}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={cancelDelete}
                disabled={deleting}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <LoaderCircle
                      size={16}
                      className="animate-spin"
                    />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Delete Project
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && !projectToDelete && (
        <LoadingSkeleton
          variant="card"
          count={0}
          withOverlay
          message="Loading projects..."
        />
      )}
    </main>
  );
}
