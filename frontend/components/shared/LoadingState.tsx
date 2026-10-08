
import { LoaderCircle } from "lucide-react";

type LoadingStateProps = {
  message?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  fullScreen?: boolean;
  overlay?: boolean;
};

const loadingSizes = {
  sm: {
    icon: 16,
    text: "text-xs",
    gap: "gap-2",
  },
  md: {
    icon: 24,
    text: "text-sm",
    gap: "gap-3",
  },
  lg: {
    icon: 36,
    text: "text-base",
    gap: "gap-4",
  },
};

export default function LoadingState({
  message = "Loading...",
  className = "",
  size = "sm",
  fullScreen = false,
  overlay = false,
}: LoadingStateProps) {
  const config = loadingSizes[size];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={message || "Loading"}
      className={[
        "flex items-center justify-center",
        "text-zinc-400",
        config.gap,
        config.text,
        overlay
          ? "fixed inset-0 z-[9999] bg-[#0d0f15]/40 backdrop-blur-md"
          : fullScreen
            ? "min-h-screen"
            : "py-4",
        className,
      ].join(" ")}
    >
      <div
        className={
          overlay
            ? "flex flex-col items-center gap-4"
            : "flex items-center gap-2"
        }
      >
        <LoaderCircle
          size={config.icon}
          className="shrink-0 animate-spin text-purple-500"
          aria-hidden="true"
        />

        {message && (
          <span className="font-medium text-zinc-300">
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
