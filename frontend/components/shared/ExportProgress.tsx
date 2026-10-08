
"use client";

import {
  Film,
  LoaderCircle,
  X,
} from "lucide-react";

type ExportProgressProps = {
  progress?: number | null;
  message?: string;
  overlay?: boolean;

  // Cancel export
  cancelling?: boolean;
  onCancel?: () => void;
};

export default function ExportProgress({
  progress = null,
  message = "Rendering video...",
  overlay = true,
  cancelling = false,
  onCancel,
}: ExportProgressProps) {
  const hasProgress =
    typeof progress === "number" &&
    Number.isFinite(progress);

  const percentage = hasProgress
    ? Math.min(100, Math.max(0, progress))
    : 0;

  const content = (
    <div
      role="status"
      aria-live="polite"
      className="w-full max-w-md rounded-2xl border border-white/10 bg-[#191b25] p-6 text-white shadow-2xl"
    >
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-xl bg-purple-500/10 p-3">
          <Film
            size={24}
            className="text-purple-400"
          />
        </div>

        <div className="flex-1">
          <h2 className="text-lg font-semibold">
            {cancelling
              ? "Cancelling export"
              : "Exporting video"}
          </h2>

          <p className="text-xs text-zinc-400">
            {cancelling
              ? "Waiting for the rendering process to stop."
              : "Please wait while we render your video."}
          </p>
        </div>

        <LoaderCircle
          size={22}
          className="animate-spin text-purple-400"
        />
      </div>

      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm text-zinc-400">
          {message}
        </span>

        <span className="text-xl font-semibold text-purple-400">
          {hasProgress
            ? `${Math.round(percentage)}%`
            : "—"}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label="Video export progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={
          hasProgress ? percentage : undefined
        }
        className="h-3 overflow-hidden rounded-full bg-white/10"
      >
        {hasProgress ? (
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple-700 to-purple-400 transition-[width] duration-500"
            style={{
              width: `${percentage}%`,
            }}
          />
        ) : (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-purple-500" />
        )}
      </div>

      <div className="mt-3 flex justify-between text-xs text-zinc-500">
        <span className="text-purple-400">
          {hasProgress ? `${Math.round(percentage)}%` : "0%"}
        </span>
        <span>100%</span>
      </div>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cancelling ? (
            <LoaderCircle
              size={16}
              className="animate-spin"
            />
          ) : (
            <X size={16} />
          )}

          {cancelling
            ? "Cancelling..."
            : "Cancel Export"}
        </button>
      )}
    </div>
  );

  if (!overlay) return content;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0d0f15]/50 p-4 backdrop-blur-md">
      {content}
    </div>
  );
}
