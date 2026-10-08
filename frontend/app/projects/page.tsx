
"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";

import { useProjectsPage } from "@/composables/useProjectsPage";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";

export default function ProjectsPage() {
  const {
    name,
    setName,
    projects,
    loading,
    creating,
    error,
    handleCreate,

    // Delete project
    projectToDelete,
    deleting,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useProjectsPage();

  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!projectToDelete) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { previousFocus?.focus(); };
  }, [projectToDelete]);

  return (
    <main className="min-h-screen bg-[#0d0f15] px-4 py-12 text-white">
      <div className="mx-auto max-w-2xl" inert={Boolean(projectToDelete)}>
        <h1 className="text-2xl font-semibold">
          Your projects
        </h1>

        <p className="mt-2 text-sm text-zinc-400">
          Create a project or continue editing one of your projects.
        </p>

        <form
          onSubmit={handleCreate}
          className="mt-8 rounded-2xl border border-white/10 bg-[#191b25] p-6"
        >
          <label
            htmlFor="project-name"
            className="block text-sm font-medium"
          >
            New project name
          </label>

          <input
            id="project-name"
            value={name}
            onChange={(event) =>
              setName(event.target.value)
            }
            maxLength={255}
            placeholder="My video project"
            className="mt-3 w-full rounded-lg border border-white/15 bg-[#101117] px-3 py-2 outline-none focus:border-purple-400"
          />

          <button
            type="submit"
            disabled={!name.trim() || creating}
            className="mt-3 rounded-lg bg-purple-600 px-4 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating
              ? "Creating..."
              : "Create project"}
          </button>
        </form>

        {error && !projectToDelete && (
          <p
            role="alert"
            className="mt-4 text-sm text-red-300"
          >
            {error}
          </p>
        )}

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">
            Existing projects
          </h2>

          {loading ? (
            <LoadingSkeleton
              variant="card"
              count={4}
            />
          ) : projects.length === 0 ? (
            <p className="text-sm text-zinc-400">
              No projects yet.
            </p>
          ) : (
            <div className="space-y-2">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#191b25] px-4 py-3"
                >
                  <Link
                    href={`/editor/${project.id}`}
                    className="min-w-0 flex-1 truncate text-sm hover:text-purple-300"
                  >
                    {project.name}
                  </Link>

                  <button
                    type="button"
                    onClick={() => requestDelete(project)}
                    disabled={deleting}
                    aria-label={`Delete ${project.name}`}
                    title="Delete project"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            ref={dialogRef}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === "Escape") { event.preventDefault(); cancelDelete(); }
              if (event.key !== "Tab") return;
              const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
              if (!buttons.length) { event.preventDefault(); event.currentTarget.focus(); return; }
              const first = buttons[0], last = buttons[buttons.length - 1];
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
            aria-describedby="delete-project-description"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#191b25] p-6 shadow-2xl"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
              <Trash2
                size={24}
                className="text-red-400"
              />
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

            {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={cancelDelete}
                disabled={deleting}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
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

      {loading && (
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
