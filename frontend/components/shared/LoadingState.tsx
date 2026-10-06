import { LoaderCircle } from "lucide-react";

type LoadingStateProps = {
  message?: string;
  className?: string;
};

export default function LoadingState({
  message = "Loading...",
  className = "",
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`
        flex
        items-center
        justify-center
        gap-2
        py-4
        text-xs
        text-zinc-400
        ${className}
      `}
    >
      <LoaderCircle
        size={16}
        className="animate-spin"
        aria-hidden="true"
      />

      <span>{message}</span>
    </div>
  );
}