"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  projectService,
  type Project,
} from "@/services/projectService";

type ProjectModalProps = {
  onSelectProject: (project: Project) => void;
};

export default function ProjectModal({
  onSelectProject,
}: ProjectModalProps) {
  const [name, setName] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    projectService
      .getAll()
      .then((result) => {
        if (active) setProjects(result);
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Could not load projects.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName || creating) return;

    setError("");
    setCreating(true);

    try {
      const project = await projectService.create(trimmedName);
      onSelectProject(project);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create project.",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-dialog-title"
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#191b25] p-6 text-white shadow-2xl"
      >
        <h1 id="project-dialog-title" className="text-xl font-semibold">
          Open a project
        </h1>

        <p className="mt-1 text-sm text-zinc-400">
          Create a project or continue editing an existing one.
        </p>

        <form onSubmit={handleCreate} className="mt-6 space-y-3">
          <label htmlFor="project-name" className="block text-sm font-medium">
            New project name
          </label>

          <input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={255}
            placeholder="My video project"
            className="w-full rounded-lg border border-white/15 bg-[#101117] px-3 py-2 outline-none focus:border-purple-400"
          />

          <button
            type="submit"
            disabled={!name.trim() || creating}
            className="w-full rounded-lg bg-purple-600 px-4 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create project"}
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="mt-6 border-t border-white/10 pt-4">
          <h2 className="mb-3 text-sm font-semibold">Existing projects</h2>

          {loading ? (
            <p className="text-sm text-zinc-400">Loading projects...</p>
          ) : projects.length === 0 ? (
            <p className="text-sm text-zinc-400">No projects yet.</p>
          ) : (
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onSelectProject(project)}
                  className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm hover:bg-white/10"
                >
                  {project.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}