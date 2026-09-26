"use client";

import Link from "next/link";

type ErrorModalProps = {
  message: string;
  onClose?: () => void;
  actionHref?: string;
  actionLabel?: string;
};

export default function ErrorModal({
  message,
  onClose,
  actionHref,
  actionLabel,
}: ErrorModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="error-modal-title"
        aria-describedby="error-modal-message"
        className="w-full max-w-sm rounded-2xl border border-red-400/20 bg-[#191b25] p-6 text-center text-white shadow-2xl"
      >
        <h2 id="error-modal-title" className="text-xl font-semibold">
          Something went wrong
        </h2>

        <p id="error-modal-message" className="mt-3 text-sm text-zinc-300">
          {message}
        </p>

        <div className="mt-6 flex justify-center gap-3">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/15 px-4 py-2 hover:bg-white/10"
            >
              Close
            </button>
          )}

          {actionHref && actionLabel && (
            <Link
              href={actionHref}
              className="rounded-lg bg-purple-600 px-4 py-2 font-semibold hover:bg-purple-500"
            >
              {actionLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}