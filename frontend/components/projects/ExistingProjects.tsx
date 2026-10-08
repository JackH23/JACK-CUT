"use client";

import Link from "next/link";
import {
  ArrowRight,
  Clapperboard,
  Plus,
  Trash2,
  Video,
} from "lucide-react";

type Project = {
  id: string;
  name: string;
};

type ExistingProjectsProps = {
  projects: Project[];
  loading: boolean;
  deleting: boolean;
  onRequestDelete: (project: Project) => void;
};

export default function ExistingProjects({
  projects,
  loading,
  deleting,
  onRequestDelete,
}: ExistingProjectsProps) {
  return (
    <section id="existing-projects">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="existing-projects-title"
            className="text-xl font-semibold outline-none sm:text-2xl"
          >
            Existing Projects
          </h2>

          <p className="mt-1 text-sm text-zinc-400">
            Pick up where you left off.
          </p>
        </div>

        <span className="rounded-full border border-white/10 bg-[#191b25] px-4 py-2 text-xs text-zinc-300">
          {loading
            ? "Loading..."
            : `${projects.length} projects`}
        </span>
      </div>

      {projects.length === 0 ? (
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
              <Link
                href={`/editor/${project.id}`}
                aria-label={`Open ${project.name} in editor`}
                className="flex aspect-video items-center justify-center bg-gradient-to-br from-[#28213e] via-[#1a1b2b] to-[#101117]"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-purple-400/20 bg-purple-500/10 transition motion-safe:group-hover:scale-110">
                  <Clapperboard
                    size={30}
                    className="text-purple-400"
                  />
                </div>
              </Link>

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
                    onClick={() => onRequestDelete(project)}
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
  );
}