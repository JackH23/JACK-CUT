type ClipProps = {
  name: string;
  duration: string;
  className: string;
  selected?: boolean;
};

export default function Clip({
  name,
  duration,
  className,
  selected = false,
}: ClipProps) {
  return (
    <div
      className={`absolute inset-y-1 overflow-hidden rounded border px-2 py-1 ${
        selected
          ? "border-2 border-purple-200 shadow-[0_0_8px_rgba(216,180,254,0.5)]"
          : "border-white/10"
      } ${className}`}
    >
      <div className="flex justify-between gap-2 text-[11px] font-semibold">
        <span className="truncate">{name}</span>

        <span className="shrink-0 font-mono">
          {duration}
        </span>
      </div>

      <div className="mt-1 h-2 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.08)_0_30px,transparent_30px_36px)]" />
    </div>
  );
}