import { Eye, Lock } from "lucide-react";

type TrackHeaderProps = {
  name: string;
  color: string;
  isAudio: boolean;
};

export default function TrackHeader({
  name,
  color,
  isAudio,
}: TrackHeaderProps) {
  return (
    <div data-track-header className="flex h-14 min-w-0 flex-col justify-center gap-1 border-b border-white/5 px-2 sm:flex-row sm:items-center sm:gap-2 sm:px-3">
      <div className="flex min-w-0 items-center gap-1.5 sm:flex-1">
        <span
          aria-hidden="true"
          className={`h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5 ${color}`}
        />

        <span
          title={name}
          className="min-w-0 flex-1 truncate text-[10px] font-semibold sm:text-xs"
        >
          {name}
        </span>
      </div>

      {isAudio ? (
        <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
          {["M", "S"].map((action) => (
            <button
              key={action}
              type="button"
              aria-label={`${
                action === "M" ? "Mute" : "Solo"
              } ${name}`}
              title={`${
                action === "M" ? "Mute" : "Solo"
              } ${name}`}
              className="flex h-6 w-6 items-center justify-center rounded bg-[#292b33] text-[9px] hover:bg-[#393c47] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
            >
              {action}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2 self-end text-zinc-400 sm:self-auto">
          <Eye
            size={13}
            aria-hidden="true"
            className="text-purple-300"
          />
          <Lock size={12} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}