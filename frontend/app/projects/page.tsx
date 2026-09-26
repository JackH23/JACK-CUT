"use client";

import Link from "next/link";
import { useProjectsPage } from "@/composables/useProjectsPage";

export default function ProjectsPage() {
  const {
    name,
    setName,
    projects,
    loading,
    creating,
    error,
    handleCreate,
  } = useProjectsPage();

  return (
    <main className="min-h-screen bg-[#0d0f15] px-4 py-12 text-white">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold">Your projects</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Create a project or continue editing one of your projects.
        </p>

        <form
          onSubmit={handleCreate}
          className="mt-8 rounded-2xl border border-white/10 bg-[#191b25] p-6"
        >
          <label htmlFor="project-name" className="block text-sm font-medium">
            New project name
          </label>

          <input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={255}
            placeholder="My video project"
            className="mt-3 w-full rounded-lg border border-white/15 bg-[#101117] px-3 py-2 outline-none focus:border-purple-400"
          />

          <button
            type="submit"
            disabled={!name.trim() || creating}
            className="mt-3 rounded-lg bg-purple-600 px-4 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create project"}
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-300">
            {error}
          </p>
        )}

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Existing projects</h2>

          {loading ? (
            <p role="status" className="text-sm text-zinc-400">
              Loading projects...
            </p>
          ) : projects.length === 0 ? (
            <p className="text-sm text-zinc-400">No projects yet.</p>
          ) : (
            <div className="space-y-2">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/editor/${project.id}`}
                  className="block rounded-lg border border-white/10 bg-[#191b25] px-4 py-3 text-sm hover:bg-white/10"
                >
                  {project.name}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}