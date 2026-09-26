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
    <div className="flex h-14 items-center gap-2 border-b border-white/5 px-3">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />

      <span className="flex-1 text-xs font-semibold">
        {name}
      </span>

      {isAudio ? (
        <div className="flex gap-1">
          {["M", "S"].map((action) => (
            <button
              key={action}
              type="button"
              aria-label={`${action} ${name}`}
              className="rounded bg-[#292b33] px-1.5 py-1 text-[9px]"
            >
              {action}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Eye size={14} className="text-purple-300" />
          <Lock size={13} />
        </div>
      )}
    </div>
  );
}