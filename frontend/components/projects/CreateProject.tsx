
"use client";

import type {
  Dispatch,
  FormEventHandler,
  SetStateAction,
} from "react";

import { LoaderCircle, Plus } from "lucide-react";

type CreateProjectProps = {
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  creating: boolean;
  handleCreate: FormEventHandler<HTMLFormElement>;
};

export default function CreateProject({
  name,
  setName,
  creating,
  handleCreate,
}: CreateProjectProps) {
  return (
    <section
      id="create-project"
      className="mb-14 scroll-mt-8 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#232034] via-[#191b25] to-[#151720] shadow-xl shadow-black/10"
    >
      {/* Header */}
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
              Give your next story a name. Your editing
              workspace is one click away.
            </p>
          </div>
        </div>
      </div>

      {/* Create form */}
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
            name="projectName"
            type="text"
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
  );
}
