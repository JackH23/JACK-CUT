"use client";

import { useEffect, useRef } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";

type Project = {
  id: string;
  name: string;
};

type DeleteProjectModalProps = {
  project: Project | null;
  deleting: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function DeleteProjectModal({
  project,
  deleting,
  error,
  onCancel,
  onConfirm,
}: DeleteProjectModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!project) return;

    const previousFocus =
      document.activeElement as HTMLElement | null;

    dialogRef.current
      ?.querySelector<HTMLButtonElement>("button")
      ?.focus();

    return () => {
      previousFocus?.focus();
    };
  }, [project]);

  if (!project) return null;

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === "Escape" && !deleting) {
      event.preventDefault();
      onCancel();
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
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-project-title"
        aria-describedby="delete-project-description"
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#191b25] p-6 shadow-2xl"
      >
        {/* Icon */}
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
          <Trash2
            size={24}
            className="text-red-400"
          />
        </div>

        {/* Title */}
        <h2
          id="delete-project-title"
          className="text-xl font-semibold"
        >
          Delete project?
        </h2>

        {/* Description */}
        <p
          id="delete-project-description"
          className="mt-3 text-sm leading-6 text-zinc-400"
        >
          Are you sure you want to delete{" "}
          <span className="font-semibold text-white">
            {project.name}
          </span>
          ? This will permanently delete the project
          and its timeline. This action cannot be undone.
        </p>

        {/* Error */}
        {error && (
          <p
            role="alert"
            className="mt-4 text-sm text-red-300"
          >
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
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
  );
}