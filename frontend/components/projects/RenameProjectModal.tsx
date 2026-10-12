"use client";

import {
  useEffect,
  useId,
  useRef,
  type FormEvent,
} from "react";
import { Loader2, X } from "lucide-react";

import type { Project } from "@/lib/project";

type RenameProjectModalProps = {
  project: Project | null;
  name: string;
  setName: (name: string) => void;
  renaming: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export default function RenameProjectModal({
  project,
  name,
  setName,
  renaming,
  error,
  onCancel,
  onSubmit,
}: RenameProjectModalProps) {
  const titleId = useId();
  const inputId = useId();
  const errorId = useId();

  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const projectId = project?.id;

  useEffect(() => {
    if (!projectId) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const previouslyFocused = document.activeElement;

    if (!dialog.open) {
      dialog.showModal();
    }

    inputRef.current?.focus();
    inputRef.current?.select();

    return () => {
      dialog.close();

      if (
        previouslyFocused instanceof HTMLElement &&
        previouslyFocused.isConnected
      ) {
        previouslyFocused.focus();
      }
    };
  }, [projectId]);

  if (!project) return null;

  const validName =
    name.trim().length > 0 &&
    name.trim().length <= 255;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={error ? errorId : undefined}
      aria-busy={renaming}
      onCancel={(event) => {
        event.preventDefault();

        if (!renaming) {
          onCancel();
        }
      }}
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-white/10 bg-[#141620] p-6 text-white shadow-2xl backdrop:bg-black/70"
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2
          id={titleId}
          className="text-lg font-semibold"
        >
          Rename project
        </h2>

        <button
          type="button"
          onClick={onCancel}
          disabled={renaming}
          aria-label="Close rename dialog"
          className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X size={18} />
        </button>
      </div>

      <form onSubmit={onSubmit}>
        <label
          htmlFor={inputId}
          className="mb-2 block text-sm text-zinc-300"
        >
          Project name
        </label>

        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={renaming}
          required
          maxLength={255}
          autoComplete="off"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className="w-full rounded-xl border border-white/10 bg-[#0d0f15] px-4 py-3 text-sm outline-none transition focus:border-violet-500 disabled:opacity-60"
        />

        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-3 text-sm text-red-300"
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={renaming}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={renaming || !validName}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {renaming && (
              <Loader2
                size={16}
                aria-hidden="true"
                className="animate-spin"
              />
            )}

            {renaming ? "Saving..." : "Save name"}
          </button>
        </div>
      </form>
    </dialog>
  );
}